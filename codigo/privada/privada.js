// Conversa privada do Recato (fase 2, 22/10/2026).
//
// Este ecrã vem DENTRO da app instalada e da extensão do browser, e é também
// a página privada.recato.ai — os mesmos ficheiros, publicados, nos três
// sítios (plataforma.js): é este código, e só ele, que vê o texto. O texto sai daqui cifrado para a caixa-forte da
// Privatemode — o SDK verifica antes, pela atestação, que do outro lado está
// o código publicado — e o servidor do Recato só faz de carteiro: troca a
// sessão pela chave da API e passa bytes cifrados (fs_chat_autonomo,
// controllers/privada.py). O consumo de tokens também chega cifrado: é este
// código que o diz ao servidor, para o saldo.
//
// O histórico, se a pessoa o quiser, é cifrado aqui com uma chave que neste
// telemóvel (ou browser) abre sozinha e, noutro, só com o código de
// recuperação (historico.js).
import { PrivatemodeAI } from 'privatemode-ai';

import { codigoValido } from './cofre.js';
import { criarHistorico } from './historico.js';
import { criarPlataforma } from './plataforma.js';
import { criarServidor } from './servidor.js';
import { formatar } from './texto.js';

// Impressão SHA-256 do privatemode.wasm, posta pela compilação
// (scripts/construir_privada.mjs): o SDK recusa outro ficheiro.
/* global __WASM_SHA256__ */
const WASM_SHA256 = __WASM_SHA256__;
const MODELO = 'glm-5.3';
// O mesmo nível do chat do Recato na Privatemode (decisão de 22/10/2026).
const NIVEL = 'high';
const RENOVAR_ANTES_S = 3600;
const RECUSOU_O_HISTORICO = 'privada.recusou_o_historico';

const PT = /^pt\b/i.test(navigator.language || '');
const TEXTOS = {
  titulo: ['Conversa privada', 'Private chat'],
  a_verificar: ['A verificar a caixa-forte…', 'Checking the secure enclave…'],
  verificada: ['Caixa-forte verificada: só ela lê o que escreves.',
               'Secure enclave verified: only it can read what you write.'],
  falhou: ['Não foi possível verificar a caixa-forte. Nada foi enviado.',
           'Could not verify the secure enclave. Nothing was sent.'],
  aviso: ['O que escreves aqui é cifrado no teu telemóvel e só é lido dentro da caixa-forte. Nem o Recato o consegue ler.',
          'What you write here is encrypted on your phone and only read inside the secure enclave. Not even Recato can read it.'],
  placeholder: ['Escreve aqui…', 'Type here…'],
  enviar: ['Enviar', 'Send'],
  sem_saldo: ['Não tens saldo para continuar.', 'You have no balance left.'],
  erro: ['A resposta falhou. Tenta outra vez.', 'The answer failed. Please try again.'],
  conversas: ['Conversas', 'Chats'],
  nova_conversa: ['Nova conversa', 'New chat'],
  sem_conversas: ['Ainda não tens conversas guardadas.', 'You have no saved chats yet.'],
  sem_titulo: ['(sem título)', '(untitled)'],
  apagar: ['Apagar', 'Delete'],
  confirmar_apagar: ['Apagar mesmo?', 'Really delete?'],
  voltar: ['Voltar', 'Back'],
  oferta: ['Queres guardar as conversas privadas? Ficam cifradas com uma chave guardada no chip de segurança deste telemóvel: nem o Recato as consegue ler.',
           'Keep your private chats? They are encrypted with a key kept in this phone\'s security chip: not even Recato can read them.'],
  guardar: ['Guardar', 'Keep them'],
  agora_nao: ['Agora não', 'Not now'],
  codigo_titulo: ['O teu código de recuperação', 'Your recovery code'],
  codigo_explica: ['Neste telemóvel as conversas abrem sozinhas. Num telemóvel novo, ou se apagares a app, só este código as abre. Guarda-o num sítio seguro: o Recato não o tem e não o consegue recuperar.',
                   'On this phone your chats open by themselves. On a new phone, or if you delete the app, only this code opens them. Keep it somewhere safe: Recato does not have it and cannot recover it.'],
  copiar: ['Copiar', 'Copy'],
  copiado: ['Copiado', 'Copied'],
  guardei: ['Já guardei o código', 'I saved the code'],
  erro_ativar: ['Não foi possível guardar o histórico. Tenta outra vez.', 'Could not set up your history. Please try again.'],
  fechado: ['O histórico está fechado: esta conversa não fica guardada.',
            'Your history is locked: this chat will not be saved.'],
  abrir: ['Abrir', 'Unlock'],
  usar_codigo: ['Usar o código', 'Use the code'],
  codigo_pedir: ['Escreve o teu código de recuperação.', 'Enter your recovery code.'],
  codigo_errado: ['Esse código não abre o histórico.', 'That code does not unlock your history.'],
  codigo_incompleto: ['O código tem 25 letras e números.', 'The code has 25 letters and numbers.'],
  cancelar: ['Cancelar', 'Cancel'],
  erro_guardar: ['Esta conversa não foi guardada. Tenta outra vez mais tarde.',
                 'This chat was not saved. Please try again later.'],
  sem_historico: ['Não foi possível ler o histórico: esta conversa não fica guardada.',
                  'Could not read your history: this chat will not be saved.'],
  erro_abrir: ['Não foi possível abrir esta conversa.', 'Could not open this chat.'],
  codigo_novo: ['Código novo', 'New code'],
  codigo_novo_pergunta: ['Perdeste o código de recuperação? Cria um novo: o antigo deixa de abrir as tuas conversas.',
                         'Lost your recovery code? Create a new one: the old one stops opening your chats.'],
  confirma: ['Confirma que és tu', 'Confirm it\'s you'],
  sem_bloqueio: ['Para criares um código novo, o telemóvel tem de ter bloqueio de ecrã (impressão digital ou PIN).',
                 'To create a new code, your phone needs a screen lock (fingerprint or PIN).'],
  codigo_novo_titulo: ['O teu código de recuperação novo', 'Your new recovery code'],
  codigo_novo_explica: ['O código antigo deixa de abrir as tuas conversas. Num telemóvel novo, ou se apagares a app, só este as abre. Guarda-o num sítio seguro: o Recato não o tem e não o consegue recuperar.',
                        'Your old code stops opening your chats. On a new phone, or if you delete the app, only this one opens them. Keep it somewhere safe: Recato does not have it and cannot recover it.'],
  codigo_novo_guardado: ['Código novo guardado: o antigo já não abre as tuas conversas.',
                         'New code saved: the old one no longer opens your chats.'],
  codigo_mudado: ['O código foi mudado noutro telemóvel entretanto. Tenta outra vez.',
                  'The code was changed on another phone in the meantime. Please try again.'],
  erro_codigo_novo: ['Não foi possível guardar o código novo: o antigo continua a valer.',
                     'Could not save the new code: the old one still works.'],
  sem_sessao: ['Abre a conversa privada a partir do Recato: botão «Privada», na caixa de escrita.',
               'Open the private chat from Recato: the «Private» button in the message box.'],
  faixa_web: ['Esta página vem do servidor do Recato: sem a extensão (ou a app) não consegues confirmar que é a publicada.',
              'This page comes from Recato\'s server: without the extension (or the app) you cannot confirm it is the published one.'],
  como_confirmar: ['Como confirmar', 'How to check'],
};
// Fora da app (extensão e página web) o que fica guardado é deste browser.
const TEXTOS_DO_BROWSER = {
  aviso: ['O que escreves aqui é cifrado neste browser e só é lido dentro da caixa-forte. Nem o Recato o consegue ler.',
          'What you write here is encrypted in this browser and only read inside the secure enclave. Not even Recato can read it.'],
  oferta: ['Queres guardar as conversas privadas? Ficam cifradas com uma chave guardada neste browser, que não se deixa copiar: nem o Recato as consegue ler.',
           'Keep your private chats? They are encrypted with a key kept in this browser that cannot be copied: not even Recato can read them.'],
  codigo_explica: ['Neste browser as conversas abrem sozinhas. Noutro computador ou browser, ou se limpares os dados do browser, só este código as abre. Guarda-o num sítio seguro: o Recato não o tem e não o consegue recuperar.',
                   'In this browser your chats open by themselves. On another computer or browser, or if you clear the browser data, only this code opens them. Keep it somewhere safe: Recato does not have it and cannot recover it.'],
  codigo_novo_pergunta: ['Perdeste o código de recuperação? Cria um novo na app do Recato, no telemóvel.',
                         'Lost your recovery code? Create a new one in the Recato app on your phone.'],
};
const plataforma = criarPlataforma();
const t = (chave) => ((plataforma.onde !== 'app' && TEXTOS_DO_BROWSER[chave]) || TEXTOS[chave])[PT ? 0 : 1];

const SISTEMA = PT
  ? 'Tu és o Recato, um assistente de IA de uma empresa portuguesa, numa conversa privada: '
    + 'o que o utilizador escreve só é lido dentro de uma caixa-forte verificável. Responde em '
    + 'português de Portugal (nunca do Brasil), salvo pedido noutra língua. Sê claro e direto. '
    + 'Não tens acesso à internet nem a ficheiros nesta conversa. Nunca inventes factos, números, '
    + 'leis ou citações; quando não tens certeza, di-lo.'
  : 'You are Recato, an AI assistant from a Portuguese company, in a private chat: what the user '
    + 'writes is only read inside a verifiable secure enclave. Reply in the user\'s language. Be '
    + 'clear and direct. You have no internet or file access in this chat. Never make up facts, '
    + 'numbers, laws or quotes; say so when you are not sure.';

const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('[data-texto]')) el.textContent = t(el.dataset.texto);
for (const el of document.querySelectorAll('[data-placeholder]')) el.placeholder = t(el.dataset.placeholder);
document.documentElement.lang = PT ? 'pt-PT' : 'en';
// «Como confirmar» tem uma página por língua.
if (!PT) $('como-confirmar').href = 'confirm.html';

function estado(texto, classe) {
  const el = $('estado');
  el.textContent = texto;
  el.className = `estado ${classe || ''}`;
}

/** Um elemento com texto (nunca HTML) e atributos; on* são eventos. */
function el(etiqueta, atributos, ...filhos) {
  const elemento = document.createElement(etiqueta);
  for (const [nome, valor] of Object.entries(atributos || {})) {
    if (nome.startsWith('on')) elemento.addEventListener(nome.slice(2), valor);
    else if (nome === 'classe') elemento.className = valor;
    else elemento.setAttribute(nome, valor);
  }
  elemento.append(...filhos.filter((f) => f !== null && f !== undefined && f !== false));
  return elemento;
}

const botao = (texto, acao, classe = '') => el('button', { type: 'button', classe: `botao ${classe}`, onclick: acao },
  texto);

/** Um botão que pede confirmação nele próprio (a janela da app não mostra
 *  as caixas de confirmação do browser): o 1.º toque troca o texto, o 2.º faz. */
function botaoComConfirmacao(texto, confirmar, acao, classe = '') {
  const b = botao(texto, () => {
    if (b.dataset.perguntado) {
      acao();
      return;
    }
    b.dataset.perguntado = '1';
    b.textContent = confirmar;
    b.classList.add('perigo');
  }, classe);
  return b;
}

// O Markdown do modelo (negrito, títulos e tabelas) vem de texto.js, que
// escapa tudo antes: nenhum HTML do modelo entra.
function mostrar(caixa, texto) {
  if (caixa.classList.contains('recato')) caixa.innerHTML = formatar(texto);
  else caixa.textContent = texto;
}

function mensagem(quem, texto) {
  const caixa = el('div', { classe: `msg ${quem}` });
  mostrar(caixa, texto);
  $('mensagens').appendChild(caixa);
  caixa.scrollIntoView({ block: 'end' });
  return caixa;
}

// ── a linha do histórico (por baixo do estado) e o painel ─────────────

function linha(texto, botoes = []) {
  const caixa = $('historico');
  caixa.replaceChildren(...(texto ? [el('span', {}, texto),
    ...botoes.map(([rotulo, acao]) => botao(rotulo, acao, 'pequeno'))] : []));
  caixa.hidden = !texto;
}

function mostrarPainel(...filhos) {
  $('painel').replaceChildren(...filhos);
  $('painel').hidden = false;
  $('mensagens').hidden = true;
  $('caixa').hidden = true;
  $('painel').scrollTop = 0;
}

function fecharPainel() {
  $('painel').hidden = true;
  $('mensagens').hidden = false;
  $('caixa').hidden = false;
}

// ── a sessão, o servidor e a caixa-forte ─────────────────────────────

let sessao = null;
let expira = 0;
let servidor = null;
let cliente = null;
let historico = null;

async function renovarSePreciso() {
  if (Date.now() / 1000 < expira - RENOVAR_ANTES_S) return;
  const dados = await servidor.renovar().catch(() => null);
  if (dados) {
    sessao = dados.sessao;
    expira = Date.now() / 1000 + dados.prazo;
  }
}

// ── a conversa ───────────────────────────────────────────────────────

let atual = { id: null, versao: null, mensagens: [] };
let gravacoes = Promise.resolve();

/** Grava a conversa cifrada, se o histórico estiver aberto. Uma de cada
 *  vez, pela ordem das respostas. */
function guardar(conversa) {
  if (historico?.estado !== 'aberto' || !conversa.mensagens.length) return;
  gravacoes = gravacoes.then(async () => {
    try {
      const gravada = await historico.guardar(conversa);
      Object.assign(conversa, { id: gravada.id, versao: gravada.versao, titulo: gravada.titulo });
    } catch {
      linha(t('erro_guardar'));
    }
  });
}

function mostrarConversa(conversa) {
  atual = conversa;
  $('mensagens').replaceChildren(el('p', { classe: 'aviso' }, t('aviso')));
  for (const m of conversa.mensagens) mensagem(m.papel, m.texto);
  fecharPainel();
}

const mensagensDoModelo = (conversa) => [{ role: 'system', content: SISTEMA },
  ...conversa.mensagens.map((m) => ({ role: m.papel === 'eu' ? 'user' : 'assistant', content: m.texto }))];

async function enviar(texto) {
  const conversa = atual;
  conversa.mensagens.push({ papel: 'eu', texto });
  mensagem('eu', texto);
  const caixa = mensagem('recato', '…');
  $('enviar').disabled = true;
  try {
    await renovarSePreciso();
    const fluxo = await cliente.chat.completions.create({
      model: MODELO, reasoning_effort: NIVEL, stream: true, stream_options: { include_usage: true },
      messages: mensagensDoModelo(conversa),
    });
    let resposta = '';
    let usage = null;
    for await (const pedaco of fluxo) {
      const parte = pedaco.choices?.[0]?.delta?.content || '';
      if (parte) {
        resposta += parte;
        mostrar(caixa, resposta);
      }
      if (pedaco.usage) usage = pedaco.usage;
    }
    conversa.mensagens.push({ papel: 'recato', texto: resposta });
    if (usage) servidor.consumo(usage).catch(() => {});
    guardar(conversa);
  } catch (e) {
    conversa.mensagens.pop();
    caixa.textContent = String(e?.status) === '402' ? t('sem_saldo') : t('erro');
  } finally {
    $('enviar').disabled = false;
  }
}

// ── o histórico ──────────────────────────────────────────────────────

function recusouOHistorico() {
  try {
    return localStorage.getItem(RECUSOU_O_HISTORICO) === '1';
  } catch {
    return false;
  }
}

function historicoAberto() {
  linha(null);
  $('ver-conversas').hidden = false;
  guardar(atual);
}

function historicoFechado() {
  linha(t('fechado'), [[t('usar_codigo'), pedirCodigo]]);
}

function oferecerOHistorico() {
  linha(t('oferta'), [[t('guardar'), ativar], [t('agora_nao'), () => {
    try {
      localStorage.setItem(RECUSOU_O_HISTORICO, '1');
    } catch {
      // Sem armazenamento: volta a perguntar da próxima vez.
    }
    linha(null);
  }]]);
}

// A cópia da chave mestra fechada pelo chip fica no armazenamento deste ecrã,
// dentro da app: sozinha não abre nada, e se se perder pede-se o código.
const guardados = {
  ler(chave) {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  },
  gravar(chave, valor) {
    localStorage.setItem(chave, valor);
  },
  apagar(chave) {
    try {
      localStorage.removeItem(chave);
    } catch {
      // Sem armazenamento: não há nada para apagar.
    }
  },
};

async function prepararOHistorico(conta) {
  historico = criarHistorico({
    servidor, telemovel: { fechar: plataforma.fechar, abrir: plataforma.abrir }, guardados, conta,
  });
  try {
    await historico.ler();
  } catch {
    linha(t('sem_historico'));
    return;
  }
  if (historico.estado === 'aberto') {
    historicoAberto();
  } else if (historico.estado === 'fechado') {
    historicoFechado();
  } else if (!recusouOHistorico()) {
    oferecerOHistorico();
  }
}

function ativar() {
  linha(null);
  mostrarCodigo(historico.comecarAtivacao());
}

async function concluirAtivacao() {
  try {
    await historico.concluirAtivacao();
  } catch {
    fecharPainel();
    linha(t('erro_ativar'));
    return;
  }
  fecharPainel();
  historicoAberto();
}

/** O código de recuperação no ecrã: ao ativar e, com *opcoes*, no código novo. */
function mostrarCodigo(codigo, { titulo = t('codigo_titulo'), explica = t('codigo_explica'),
  guardei = concluirAtivacao, cancelar = null } = {}) {
  const copiar = botao(t('copiar'), () => {
    navigator.clipboard?.writeText(codigo).then(() => { copiar.textContent = t('copiado'); }, () => {});
  }, 'secundario');
  mostrarPainel(
    el('h2', {}, titulo),
    el('p', {}, explica),
    // Muda de linha só entre os grupos de 5.
    el('div', { classe: 'codigo' }, ...codigo.split('-').map((grupo, i, todos) => el('span', {},
      i < todos.length - 1 ? `${grupo}-` : grupo))),
    el('div', { classe: 'botoes' }, copiar, botao(t('guardei'), guardei),
      cancelar && botao(t('cancelar'), cancelar, 'secundario')),
  );
}

/** Código novo: o telemóvel confirma primeiro que é a pessoa (quem pegasse
 *  no telemóvel desbloqueado não levava um código para abrir as conversas
 *  noutro); só depois o código aparece. */
async function pedirCodigoNovo(aviso) {
  try {
    await plataforma.confirmarAPessoa(t('codigo_novo'), t('confirma'));
  } catch (e) {
    aviso.textContent = e.codigo === 'sem_bloqueio' ? t('sem_bloqueio') : '';
    return;
  }
  mostrarCodigo(historico.comecarCodigoNovo(), {
    titulo: t('codigo_novo_titulo'), explica: t('codigo_novo_explica'),
    guardei: concluirCodigoNovo, cancelar: mostrarConversas,
  });
}

async function concluirCodigoNovo() {
  try {
    await historico.concluirCodigoNovo();
  } catch (e) {
    fecharPainel();
    if (e.codigo === 'versao') {
      await historico.ler().catch(() => {});
      linha(t('codigo_mudado'));
    } else {
      linha(t('erro_codigo_novo'));
    }
    return;
  }
  fecharPainel();
  linha(t('codigo_novo_guardado'), [['OK', () => linha(null)]]);
}

function pedirCodigo() {
  const campo = el('input', { type: 'text', classe: 'campo-codigo', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: 'false', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' });
  const erro = el('p', { classe: 'erro' });
  const abrir = botao(t('abrir'), async () => {
    if (!codigoValido(campo.value)) {
      erro.textContent = t('codigo_incompleto');
      return;
    }
    abrir.disabled = true;
    erro.textContent = '';
    const aberto = await historico.abrirComCodigo(campo.value);
    abrir.disabled = false;
    if (!aberto) {
      erro.textContent = t('codigo_errado');
      return;
    }
    fecharPainel();
    historicoAberto();
  });
  mostrarPainel(
    el('h2', {}, t('usar_codigo')),
    el('p', {}, t('codigo_pedir')),
    campo,
    erro,
    el('div', { classe: 'botoes' }, abrir, botao(t('cancelar'), fecharPainel, 'secundario')),
  );
  campo.focus();
}

function dataCurta(utc) {
  const data = new Date(`${utc.replace(' ', 'T')}Z`);
  return data.toLocaleDateString(PT ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short' });
}

async function mostrarConversas() {
  const lista = el('div', { classe: 'lista' });
  const aviso = el('p', { classe: 'erro' });
  mostrarPainel(
    el('div', { classe: 'botoes' },
      botao(t('nova_conversa'), () => mostrarConversa({ id: null, versao: null, mensagens: [] })),
      botao(t('voltar'), fecharPainel, 'secundario')),
    el('h2', {}, t('conversas')),
    lista,
    el('div', { classe: 'codigo-novo' },
      el('p', { classe: 'aviso' }, t('codigo_novo_pergunta')),
      plataforma.confirmarAPessoa && botao(t('codigo_novo'), () => pedirCodigoNovo(aviso), 'pequeno secundario'),
      aviso),
  );
  let conversas;
  try {
    conversas = await historico.lista();
  } catch {
    lista.append(el('p', { classe: 'erro' }, t('sem_historico')));
    return;
  }
  if (!conversas.length) lista.append(el('p', { classe: 'aviso' }, t('sem_conversas')));
  for (const c of conversas) {
    lista.append(el('div', { classe: 'item' },
      el('button', { type: 'button', classe: 'abrir-conversa', onclick: () => abrirConversa(c.id) },
        el('span', { classe: 'item-titulo' }, c.titulo || t('sem_titulo')),
        el('span', { classe: 'item-data' }, dataCurta(c.atualizada))),
      botaoComConfirmacao(t('apagar'), t('confirmar_apagar'), () => apagarConversa(c.id), 'pequeno secundario')));
  }
}

async function abrirConversa(id) {
  try {
    mostrarConversa(await historico.abrir(id));
  } catch {
    fecharPainel();
    linha(t('erro_abrir'));
  }
}

async function apagarConversa(id) {
  try {
    await historico.apagar(id);
  } catch {
    // Volta a aparecer na lista: tenta-se outra vez.
  }
  if (atual.id === id) mostrarConversa({ id: null, versao: null, mensagens: [] });
  await mostrarConversas();
}

// ── o arranque ───────────────────────────────────────────────────────

async function arrancar() {
  // Na página web não há prova de que o código é o publicado: diz-se às
  // claras (a extensão, se a pessoa a tiver, confere-a e muda a faixa).
  $('faixa').hidden = plataforma.onde !== 'web';
  // A sessão e o endereço do carteiro vêm do Recato aberto com a conta
  // (/fs_chat/privada/sessao), pela app, pela extensão ou pela ligação.
  let dados;
  try {
    dados = await plataforma.pedirSessao();
  } catch {
    estado(t('sem_sessao'), 'erro');
    return;
  }
  sessao = dados.sessao;
  expira = Date.now() / 1000 + (dados.prazo || 0);
  servidor = criarServidor(dados.carteiro, () => sessao);
  cliente = new PrivatemodeAI({
    auth: () => ({ type: 'apiKey', value: sessao }),
    apiBaseURL: dados.carteiro,
    dangerouslyAllowBrowser: true,
    browserWasmURL: './privatemode.wasm',
    wasmURL: './privatemode.wasm',
    expectedWasmHash: WASM_SHA256,
    enableWasmLogging: false,
  });
  try {
    await cliente.verify();
  } catch (e) {
    estado(t('falhou'), 'erro');
    return;
  }
  estado(t('verificada'), 'ok');
  $('texto').disabled = false;
  $('enviar').disabled = false;
  $('caixa').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const texto = $('texto').value.trim();
    if (!texto) return;
    $('texto').value = '';
    enviar(texto);
  });
  $('ver-conversas').addEventListener('click', mostrarConversas);
  await prepararOHistorico(dados.carteiro);
}

arrancar();
