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
// Quando o próprio código deste ecrã falha (04/11/2026), diz ao servidor onde
// e de que tipo foi o erro, e a versão do ecrã, para se corrigir — nunca a
// mensagem do erro nem nada da conversa (falhas.js).
//
// Nada desta conversa fica guardado (19/11/2026, pedido do Pedro: «A conversa
// privada não deve conseguir nunca ser gravada»): vive em memória enquanto o
// ecrã está aberto. De 22/10 a 19/11/2026 havia um histórico cifrado, à
// escolha da pessoa (historico.js e cofre.js), que saiu; o que ele deixou
// neste aparelho apaga-se ao abrir (esquecerOHistorico).
//
// Fechar o ecrã a meio de uma resposta não a interrompe (28/10/2026, pedido do
// Pedro): o servidor continua a recebê-la, cifrada, e quem volta a este
// browser (ou telemóvel) tem-na lá (espera.js e oae.js).
//
// O modelo (só o GLM-5.3 da Privatemode), o nível de pensamento e as rondas
// da pesquisa na web estão em pesquisa.js: cada pesquisa que o modelo pede só
// sai daqui depois de a pessoa a confirmar, e só sai a frase (ou o endereço).
//
// Os ficheiros (27/10/2026, decisão do Pedro: «mesmo código»): Word, Excel,
// PowerPoint, PDF, CSV e texto, feitos neste ecrã pelo mesmo código Python do
// chat do Recato, a correr no Pyodide (python.js).
// Cada ficheiro guarda a sua fonte com a conversa e volta a fazer-se quando
// se descarrega.
//
// Os documentos anexados (27/10/2026, decisão do Pedro): PDF, Word, Excel,
// PowerPoint e texto, lidos e editados neste ecrã pelo mesmo código do chat
// (anexos.js); o texto deles vai com a mensagem à caixa-forte, e os
// originais ficam em memória (e, os que couberem, com uma resposta à espera).
import { PrivatemodeAI } from 'privatemode-ai';

import {
  comOsAnexos, deBase64, eDocumento, fazerFichas, ferramentaDosAnexos, ficheirosParaLer, LIMITES_DOS_ANEXOS,
  lerAnexos, lerAsPaginas, MAX_TOKENS_DAS_FICHAS, originaisParaGuardar, REGRA_DAS_FICHAS, temFichas, textoDosAnexos,
  textoDosAnexosComFicha,
} from './anexos.js';
import { b64, de64 } from './bytes.js';
import { criarEsperas, fluxoGuardado, quandoAVista } from './espera.js';
import { avisos, eDaRede } from './falhas.js';
import { REGRAS_DOS_FICHEIROS } from './ficheiros.js';
import { MAX_IMAGENS_POR_PEDIDO, paraOModelo, prepararImagem } from './imagens.js';
import { desenharPaginas } from './paginas.js';
import { armazemIndexedDB, enderecoDoRecato, linguaDaLigacao } from './navegador.js';
import {
  blocoDaData, comTentativas, confirmacaoDaConversa, desistiuEmBaixo, eSaldoEmUso, esperarComSinal, lerFluxo, MODELO,
  MODELO_DAS_IMAGENS, nivelDa, NIVEL_MAXIMO, NIVEL_NORMAL, REGRAS_DA_PESQUISA, responder, RespostaParada,
  RespostaSemSaldo,
} from './pesquisa.js';
import { criarPlataforma } from './plataforma.js';
import { criarPython } from './python.js';
import { criarServidor } from './servidor.js';
import { teclaDaCaixa } from './teclas.js';
import { formatar } from './texto.js';
import { TEXTOS, TEXTOS_DO_BROWSER } from './textos.js';

// Os erros deste ecrã que ninguém apanhar, desde já: saem quando houver sessão (arrancar).
avisos.escutar();

// Impressão SHA-256 do privatemode.wasm, posta pela compilação
// (scripts/construir_privada.mjs): o SDK recusa outro ficheiro.
/* global __WASM_SHA256__ */
const WASM_SHA256 = __WASM_SHA256__;
const RENOVAR_ANTES_S = 3600;

// A língua é a da conta no Recato de onde a pessoa veio, que vem na ligação
// — na página web, na extensão e na app (26/10/2026: o Pedro, com o Recato em
// português e o browser em inglês, via a página em inglês); sem ela (um
// Recato ou uma app antigos), a do browser ou do telemóvel.
const PT = /^pt\b/i.test(linguaDaLigacao() || navigator.language || '');
const plataforma = criarPlataforma();
const t = (chave) => ((plataforma.onde !== 'app' && TEXTOS_DO_BROWSER[chave]) || TEXTOS[chave])[PT ? 0 : 1];
const LINGUA = PT ? 'pt' : 'en';

const SISTEMA = PT
  ? 'Tu és o Recato, um assistente de IA de uma empresa portuguesa, numa conversa privada: '
    + 'o que o utilizador escreve só é lido dentro de uma caixa-forte verificável. Responde em '
    + 'português de Portugal (nunca do Brasil), salvo pedido noutra língua. Sê claro e direto. '
    + 'Vês as imagens que o utilizador juntar e lês os documentos que ele anexar (PDF, Word, Excel, PowerPoint e '
    + 'texto: vão com a mensagem dele, em ANEXOS DO UTILIZADOR). Podes devolver '
    + 'ficheiros Word, Excel, PowerPoint, PDF, CSV ou texto (ver FICHEIROS). Tens '
    + 'pesquisa na web (ver PESQUISA NA WEB), mas '
    + 'cada pesquisa e cada página só saem da caixa-forte depois de o utilizador as confirmar no '
    + 'ecrã: pede só as que fazem falta e, se ele não as autorizar, responde sem elas e di-lo. '
    // Imagens e vídeos novos (21/11/2026, pedido do Pedro): quem os cria fica fora da caixa-forte, por isso aqui
    // não há essa função — o modelo di-lo e diz como a ter, em vez de prometer o que não pode fazer.
    + 'Não crias imagens nem vídeos: essa função não existe na conversa privada, porque levaria o pedido para fora '
    + 'da caixa-forte. Se to pedirem, diz numa frase que ela não existe aqui e que, para a ter, o utilizador pode '
    + 'fechar este ecrã e pedir numa conversa normal do Recato; depois ajuda no que der sem ela. '
    + 'Nunca inventes factos, números, leis ou citações; quando não tens certeza, di-lo. '
    // Quem é (14/11/2026): sem isto, perguntado, o modelo dizia que empresa o treinou — como no chat do Recato,
    // diz só que é um modelo aberto, na caixa-forte, na União Europeia.
    + 'Se te perguntarem que modelo és, quem te criou ou quem te fez, diz só que és o Recato e que corres sobre '
    + 'um modelo aberto, dentro da caixa-forte, em servidores na União Europeia; não digas que empresa criou o '
    + 'modelo nem que empresa o aloja, mesmo que insistam.'
  : 'You are Recato, an AI assistant from a Portuguese company, in a private chat: what the user '
    + 'writes is only read inside a verifiable secure enclave. Reply in the user\'s language. Be '
    + 'clear and direct. You can see the images the user adds and read the documents they attach (PDF, Word, '
    + 'Excel, PowerPoint and text: they come with their message, under ANEXOS DO UTILIZADOR). You '
    + 'can return Word, Excel, PowerPoint, PDF, CSV or text files (see FICHEIROS, in Portuguese). '
    + 'You can search the web (see PESQUISA '
    + 'NA WEB, in Portuguese), but each search and each page only leaves the secure enclave after the '
    + 'user confirms it on screen: ask only for those you need and, if the user declines, answer '
    + 'without them and say so. You do not create images or videos: that function does not exist in the private '
    + 'chat, because it would take the request out of the secure enclave. If asked, say in one sentence that it '
    + 'does not exist here and that, to get it, the user can close this screen and ask in a normal Recato '
    + 'conversation; then help as far as you can without it. Never make up facts, numbers, laws or quotes; say so when you are '
    + 'not sure. If you are asked which model you are, who created you or who made you, say only that you '
    + 'are Recato and that you run on an open model, inside the secure enclave, on servers in the European '
    + 'Union; do not say which company created the model or which company hosts it, even if pressed.';

/** As instruções do modelo, com a data e a hora de agora e as regras da
 *  pesquisa na web e dos ficheiros do chat do Recato; numa conversa com anexos
 *  com ficha, a regra da procura neles (como no chat). */
const instrucoes = (conversa) => SISTEMA + blocoDaData() + REGRAS_DA_PESQUISA + REGRAS_DOS_FICHEIROS
  + (temFichas(conversa.mensagens) ? REGRA_DAS_FICHAS : '');

const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('[data-texto]')) el.textContent = t(el.dataset.texto);
for (const el of document.querySelectorAll('[data-placeholder]')) el.placeholder = t(el.dataset.placeholder);
for (const el of document.querySelectorAll('[data-titulo]')) el.title = t(el.dataset.titulo);
for (const el of document.querySelectorAll('[data-rotulo]')) el.setAttribute('aria-label', t(el.dataset.rotulo));
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

// O Markdown do modelo (negrito, títulos e tabelas) vem de texto.js, que
// escapa tudo antes: nenhum HTML do modelo entra.
function mostrar(caixa, texto) {
  if (caixa.classList.contains('recato')) caixa.innerHTML = formatar(texto);
  else caixa.textContent = texto;
}

/** Uma mensagem na conversa; as da pessoa podem levar imagens (data URLs) e
 *  os documentos que juntou (pelo nome); as do Recato, os ficheiros que fez
 *  (para descarregar). */
function mensagem(quem, texto, { imagens = [], ficheiros = [], anexos = [] } = {}) {
  const caixa = el('div', { classe: `msg ${quem}` });
  mostrar(caixa, texto);
  if (ficheiros.length) caixa.append(el('div', { classe: 'ficheiros' }, ...ficheiros.map(botaoDoFicheiro)));
  if (anexos.length) {
    caixa.append(el('div', { classe: 'documentos' }, ...anexos.map((a) => el('span', { classe: 'documento' },
      `📎 ${a.nome}`))));
  }
  if (imagens.length) {
    caixa.prepend(el('div', { classe: 'miniaturas' },
      ...imagens.map((url) => el('img', { classe: 'miniatura', src: url, alt: '' }))));
  }
  $('mensagens').appendChild(caixa);
  caixa.scrollIntoView({ block: 'end' });
  return caixa;
}

// ── a linha de avisos (por baixo do estado) ───────────────────────────
// Até 19/11/2026 era também a do histórico, que abria um painel à parte.

function linha(texto, botoes = []) {
  const caixa = $('linha');
  caixa.replaceChildren(...(texto ? [el('span', {}, texto),
    ...botoes.map(([rotulo, acao]) => botao(rotulo, acao, 'pequeno'))] : []));
  caixa.hidden = !texto;
}

// ── a sessão, o servidor e a caixa-forte ─────────────────────────────

let sessao = null;
let expira = 0;
let servidor = null;
let cliente = null;
/** O segredo de cifra do SDK, de cada vez que ele o faz (onSecretUpdate): é com ele que uma resposta guardada se
 *  abre (oae.js). Pedi-lo ao SDK antes de ele o ter (exportSecret) mata o SDK. */
let ultimoSegredo = null;

async function renovarSePreciso() {
  if (Date.now() / 1000 < expira - RENOVAR_ANTES_S) return;
  const dados = await servidor.renovar().catch(() => null);
  if (dados) {
    sessao = dados.sessao;
    expira = Date.now() / 1000 + dados.prazo;
  }
}

// ── a conversa ───────────────────────────────────────────────────────

let atual = { mensagens: [], nivelMaximo: false };
/** O «sim/não» de um pedido de pesquisa à espera da pessoa. */
let confirmacaoPendente = null;

function mostrarConversa(conversa) {
  // Trocar de conversa com uma pesquisa por confirmar é um «não»: a resposta
  // da outra conversa acaba sem ela e o «Enviar» volta.
  confirmacaoPendente?.(false);
  atual = conversa;
  $('mensagens').replaceChildren(el('p', { classe: 'aviso' }, t('aviso')));
  for (const m of conversa.mensagens) {
    mensagem(m.papel, m.texto, { imagens: m.imagens || [], ficheiros: m.ficheiros || [], anexos: m.anexos || [] });
  }
  mostrarNivel();
  mostrarWebSemPerguntar();
}

/** A caixa de escrita só abre com a caixa-forte verificada (pronta) e não
 *  envia enquanto uma resposta vem a caminho (aResponder). */
let pronta = false;
let aResponder = false;

/** A resposta em curso e o seu «Parar» (28/10/2026, pedido do Pedro: só o
 *  «Parar» a para; fechar o ecrã ou a app não). */
let paragem = null;

/** O «Parar»: o botão do ecrã ou, na app, o da notificação (o evento
 *  privada:parar). Uma pesquisa à espera do «sim» fica sem ele. */
function pararResposta() {
  if (!paragem) return;
  confirmacaoPendente?.(false);
  // O servidor também deixa de receber a resposta (com o ecrã fechado, ela continuava).
  esperaAtual?.parar();
  paragem.abort();
}

/** O fim do trabalho: na app, deixa de ficar à frente do resto (com a app
 *  fechada, avisa que a resposta está pronta). */
function trabalhoAcabou() {
  if (!paragem) plataforma.avisarTrabalho?.(false);
}

// ── os ficheiros (python.js e ficheiros.js, 27/10/2026) ────────────────
// O Python só arranca no primeiro ficheiro (uns segundos); os bytes do que
// se acabou de fazer ficam em memória, e o resto refaz-se da fonte.

const python = criarPython({
  criarTrabalhador: () => new Worker(new URL('./python_trabalhador.js', location.href), { type: 'module' }),
  // A extensão, se a houver, confere também os ficheiros que o worker carregou.
  aoPronto: () => document.dispatchEvent(new CustomEvent('privada:python')),
});
const bytesFeitos = new Map();
const chaveDosBytes = (ficheiro) => `${ficheiro.id}:${JSON.stringify(ficheiro.fonte)}`;

/** O Python dos ficheiros de uma conversa, com os números dos ficheiros dela. */
function ficheirosDaConversa(conversa) {
  return {
    novoId: () => {
      conversa.ficheiroSeguinte = (conversa.ficheiroSeguinte || 0) + 1;
      return conversa.ficheiroSeguinte;
    },
    criar: python.criar,
    acrescentar: python.acrescentar,
    entrega: python.entrega,
    // O Python arranca já quando a resposta pode estar a anunciar um ficheiro: a entrega confirma-se no fim.
    aquecer: () => python.carregar(null).catch(() => {}),
  };
}

function guardarBytes(ficheiro, dados) {
  if (!(dados instanceof Uint8Array)) return;
  bytesFeitos.set(chaveDosBytes(ficheiro), dados);
  // Só os mais recentes ficam em memória.
  while (bytesFeitos.size > 20) bytesFeitos.delete(bytesFeitos.keys().next().value);
}

// ── os documentos anexados (anexos.js, 27/10/2026) ──────────────────
// Os originais de cada conversa ficam em memória enquanto o ecrã está aberto;
// os que couberem vão com uma resposta à espera (conversa.originais, em
// base64; ver instantaneo).

const memoriaDosAnexos = new WeakMap();

function bytesDosAnexos(conversa) {
  if (!memoriaDosAnexos.has(conversa)) memoriaDosAnexos.set(conversa, new Map());
  return memoriaDosAnexos.get(conversa);
}

/** Os bytes de um ficheiro da conversa: um anexo (da memória ou do que ficou
 *  guardado) ou um ficheiro feito nela (refeito da fonte); null sem eles. */
async function bytesDoFicheiro(conversa, id) {
  const memoria = bytesDosAnexos(conversa);
  if (memoria.has(id)) return memoria.get(id);
  if (conversa.originais?.[id]) {
    const dados = deBase64(conversa.originais[id]);
    memoria.set(id, dados);
    return dados;
  }
  const feito = conversa.mensagens.flatMap((m) => m.ficheiros || []).find((f) => f.id === id);
  if (!feito) return null;
  const dados = bytesFeitos.get(chaveDosBytes(feito)) || await gerarDaFonte(conversa, feito.fonte, feito.id);
  guardarBytes(feito, dados);
  return dados;
}

/** Os bytes de um ficheiro feito, da fonte: a do create_file (python.js) ou, a
 *  de uma cópia editada, o edit_document outra vez sobre o original. */
async function gerarDaFonte(conversa, fonte, id = null) {
  if (!fonte?.edicao) return python.gerar(fonte);
  const { argumentos, autor } = fonte.edicao;
  const r = await ferramentaDosAnexos('edit_document', argumentos, { python,
    ficheiros: ficheirosParaLer(conversa.mensagens),
    bytesDe: (outro) => bytesDoFicheiro(conversa, outro), novoId: () => id, autor });
  if (!r.ficheiro) throw new Error('a cópia editada não se refez');
  return r.ficheiro.dados;
}

/** Quem assina as alterações controladas de um edit_document: no chat é o
 *  nome da pessoa; este ecrã não o sabe, e assina o Recato. */
const AUTOR_DAS_EDICOES = 'Recato';

/** read_document, edit_document e procurar_nos_anexos de uma conversa, para
 *  a resposta (pesquisa.js). */
function anexosDaConversa(conversa, aoEtapa) {
  return {
    autor: AUTOR_DAS_EDICOES,
    comFichas: temFichas(conversa.mensagens),
    executar: (nome, argumentos) => ferramentaDosAnexos(nome, argumentos, {
      python, ficheiros: ficheirosParaLer(conversa.mensagens), bytesDe: (id) => bytesDoFicheiro(conversa, id),
      contexto: textoDosAnexosComFicha(conversa.mensagens), novoId: ficheirosDaConversa(conversa).novoId,
      autor: AUTOR_DAS_EDICOES, lingua: LINGUA, etapa: aoEtapa }),
  };
}

/** Os modelos que leem os anexos grandes para as fichas, pela ordem: os das
 *  fichas do chat, ambos da caixa-forte. */
const MODELOS_DAS_FICHAS = [MODELO, MODELO_DAS_IMAGENS];

/** Uma chamada ao modelo sem ferramentas, para as fichas dos anexos grandes:
 *  se o primeiro modelo falhar, o seguinte. Com a rede ou o servidor em
 *  baixo, cada um volta a tentar; o «Parar» (*sinal*) acaba com tudo. */
async function chamarParaAsFichas(mensagens, sinal = null) {
  let ultimoErro = null;
  for (const modelo of MODELOS_DAS_FICHAS) {
    try {
      return await comTentativas(async () => {
        const fluxo = await pedirAoModelo({ model: modelo, messages: mensagens, max_tokens: MAX_TOKENS_DAS_FICHAS,
          reasoning_effort: NIVEL_NORMAL, stream: true, stream_options: { include_usage: true } }, { signal: sinal });
        const { texto, usage } = await lerFluxo(fluxo);
        if (usage) servidor.consumo(usage, 0, fluxo.pedidoDoCarteiro ?? null).catch(() => {});
        return texto;
      }, { sinal });
    } catch (e) {
      if (String(e?.status) === '402' || e instanceof RespostaParada) throw e;
      ultimoErro = e;
    }
  }
  throw ultimoErro || new Error('sem modelo');
}

/** Os bytes das imagens de um pedido (o servidor tira-os da estimativa da cobrança, como nas do chat). */
const bytesDasImagens = (mensagens) => mensagens.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
  .reduce((soma, bloco) => soma + (bloco?.type === 'image_url' ? String(bloco.image_url?.url || '').length : 0), 0);

/** Um lote de páginas digitalizadas (lerAsPaginas): o pedido que o chat faria (_transcrever_lote), ao modelo das
 *  imagens da caixa-forte, com o nível de raciocínio e o teto que ele pede. Com a rede ou o servidor em baixo volta a
 *  tentar; o «Parar» (*sinal*) acaba com tudo. Devolve {texto, cortada}. A falha de quando se desistiu com eles em
 *  baixo leva `emBaixo`: o chat não parte esse lote em metades, que voltavam a tentar cada uma (lerAsPaginas). */
async function chamarParaAsPaginas(pedido, sinal) {
  try {
    return await comTentativas(async () => {
      const fluxo = await pedirAoModelo({ model: MODELO_DAS_IMAGENS, messages: pedido.messages, stream: true,
        stream_options: { include_usage: true }, ...(pedido.esforco ? { reasoning_effort: pedido.esforco } : {}),
        ...(pedido.max_tokens ? { max_tokens: pedido.max_tokens } : {}) }, { signal: sinal });
      const { texto, usage, fim } = await lerFluxo(fluxo);
      if (usage) servidor.consumo(usage, bytesDasImagens(pedido.messages), fluxo.pedidoDoCarteiro ?? null).catch(() => {});
      return { texto, cortada: fim === 'length' };
    }, { sinal });
  } catch (e) {
    if (e && typeof e === 'object' && desistiuEmBaixo(e, globalThis.navigator?.onLine === false)) e.emBaixo = true;
    throw e;
  }
}

/** O botão que descarrega um ficheiro feito na conversa. */
function botaoDoFicheiro(ficheiro) {
  const rotulo = `📄 ${ficheiro.nome}`;
  const b = el('button', { type: 'button', classe: 'ficheiro', title: t('descarregar').replace('%s', ficheiro.nome) },
    rotulo);
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    b.disabled = true;
    b.textContent = t('a_preparar_ficheiro');
    try {
      const dados = bytesFeitos.get(chaveDosBytes(ficheiro)) || await gerarDaFonte(atual, ficheiro.fonte, ficheiro.id);
      guardarBytes(ficheiro, dados);
      await plataforma.guardarFicheiro(ficheiro.nome, ficheiro.mime, dados);
    } catch {
      linha(t('erro_descarregar'), [['OK', () => linha(null)]]);
    } finally {
      b.disabled = false;
      b.textContent = rotulo;
    }
  });
  return b;
}

/** Um pedido ao modelo pela caixa-forte, com o número que o carteiro lhe deu
 *  (X-Recato-Pedido) preso ao fluxo, para o consumo ir ao pedido certo. Com
 *  *numero* (X-Recato-Resposta), o carteiro guarda a resposta e, se este ecrã
 *  fechar, ela fica à espera (espera.js). */
async function pedirAoModelo(pedido, { numero = null, ...opcoes } = {}) {
  await renovarSePreciso();
  const { data, response } = await cliente.chat.completions.create(pedido,
    numero ? { ...opcoes, headers: { 'X-Recato-Resposta': numero } } : opcoes).withResponse();
  data.pedidoDoCarteiro = response.headers.get('x-recato-pedido');
  return data;
}

// ── as respostas à espera (espera.js, 28/10/2026) ────────────────────
// Antes de cada pedido sair, fica guardado neste aparelho (cifrado) o que é
// preciso para continuar a resposta se o ecrã fechar: a conversa, a ronda em
// curso e o segredo do SDK com que ela se abre. Apaga-se quando a resposta
// fica mostrada.

let esperas = null;
/** A espera da resposta em curso: o «Parar» também a para no servidor. */
let esperaAtual = null;

/** O que uma resposta à espera guarda da conversa (espera.js), para a
 *  retomar; *semAUltima*: sem a mensagem que a pessoa acabou de escrever
 *  (volta a enviar-se). */
function instantaneo(conversa, { semAUltima = false } = {}) {
  const emMemoria = bytesDosAnexos(conversa);
  const mensagens = semAUltima ? conversa.mensagens.slice(0, -1) : conversa.mensagens;
  return { mensagens, nivelMaximo: !!conversa.nivelMaximo, pesquisaSemPerguntar: !!conversa.pesquisaSemPerguntar,
    ficheiroSeguinte: conversa.ficheiroSeguinte || 0,
    originais: originaisParaGuardar(mensagens, (id) => emMemoria.get(id) || conversa.originais?.[id] || null) };
}

/**
 * A espera de uma resposta: o pedir() do responder (pesquisa.js) com um número
 * novo em cada ronda, guardada neste aparelho antes de o pedido sair. Uma nova
 * tentativa da mesma ronda (a rede caiu a meio) lê primeiro a resposta que o
 * servidor guardou: não se pede outra ao modelo. *retomar*: a ronda que ficou
 * à espera ({numero, segredo, mensagens}), que se lê do servidor.
 */
function criarEspera(conversa, { id = crypto.randomUUID(), ficheiros, retomar = null } = {}) {
  const numeros = [];
  let ronda = retomar ? { ...retomar, pedido: null } : null;
  let primeira = !!retomar;
  const espera = {
    id,
    bytesImagens: 0,
    async gravar(fase, extra = {}) {
      try {
        await esperas?.guardar({ id, criado: Date.now(), fase, bytesImagens: espera.bytesImagens,
          ficheiros: [...ficheiros.values()], ...extra });
      } catch {
        // Sem onde guardar (o browser não deixa): a resposta continua, só não fica à espera.
      }
    },
    /** Antes de ler os documentos e de o 1.º pedido sair: quem volta manda a mensagem outra vez. */
    preparar: (pedido) => espera.gravar('preparar', { conversa: instantaneo(conversa, { semAUltima: true }), pedido }),
    async pedir(pedido, sinal) {
      if (ronda && (primeira || ronda.pedido === pedido)) {
        primeira = false;
        ronda.pedido = pedido;
        try {
          return await fluxoGuardado({ servidor, numero: ronda.numero, segredo: ronda.segredo, sinal,
            esperar: esperarComSinal });
        } catch (e) {
          // O servidor não a tem (não chegou a sair, ou já passou o prazo) ou ficou cortada: pede-se outra vez.
          if (e?.status !== 404 && e?.codigo !== 'cortada' && e?.codigo !== 'segredo') throw e;
        }
      }
      const numero = crypto.randomUUID();
      // Antes do 1.º pedido da sessão o SDK ainda não fez o segredo: fica o que ele der para este pedido (abaixo).
      const segredo = ultimoSegredo;
      ronda = { pedido, numero, segredo };
      numeros.push(numero);
      const registar = (s) => espera.gravar('ronda', { conversa: instantaneo(conversa),
        ronda: { numero, segredo: s, mensagens: pedido.messages } });
      await registar(segredo);
      const fluxo = await pedirAoModelo(pedido, { signal: sinal, numero });
      // O SDK faz (ou troca) o segredo antes de o pedido sair: fica o que serviu.
      if (ultimoSegredo?.data !== segredo?.data) {
        ronda.segredo = ultimoSegredo;
        await registar(ultimoSegredo);
      }
      return fluxo;
    },
    parar() {
      if (ronda?.numero) servidor.pararResposta(ronda.numero).catch(() => {});
    },
    /** A resposta ficou mostrada: já não espera por ninguém. */
    async acabar() {
      await esperas?.apagar(id).catch(() => {});
      for (const numero of new Set([...numeros, ...(retomar ? [retomar.numero] : [])])) {
        servidor.apagarResposta(numero).catch(() => {});
      }
    },
  };
  return espera;
}

/** *fazer()* com o trinco da espera *id*: outro separador aberto no mesmo browser não pega nela ao mesmo tempo (se
 *  ele a tem, espera-se que a largue). */
async function comTrinco(id, fazer) {
  if (!navigator.locks?.request) return fazer();
  return navigator.locks.request(`privada.espera.${id}`, () => fazer());
}

/** A caixa de escrita: só com a caixa-forte verificada, e sem enviar
 *  enquanto uma resposta vem a caminho. */
function aplicarCaixa() {
  $('texto').disabled = !pronta;
  $('enviar').disabled = !pronta || aResponder;
  // Enquanto responde, o «Enviar» dá lugar ao «Parar».
  $('enviar').hidden = aResponder;
  $('parar').hidden = !aResponder;
  // Na página e na extensão, enquanto responde, a nota diz que se pode fechar o separador: a resposta continua e
  // fica à espera neste browser (pedidos do Pedro, 28/10/2026).
  $('nota-trabalho').hidden = !aResponder || plataforma.onde === 'app';
  $('anexar').disabled = !pronta;
  $('nivel').disabled = !pronta;
}

// ── as imagens por enviar (lê-as o GLM-5.3-Flash; ver imagens.js) e os
// documentos (lê-os o Python do ecrã, como o chat; ver anexos.js) ──────

let porEnviar = [];
let documentosPorEnviar = [];

function botaoDeTirar(rotulo, lista, i) {
  return el('button', { type: 'button', classe: 'tirar', 'aria-label': rotulo, title: rotulo, onclick: () => {
    lista.splice(i, 1);
    mostrarPorEnviar();
  } }, '×');
}

function mostrarPorEnviar() {
  $('anexos').replaceChildren(
    ...porEnviar.map((url, i) => el('div', { classe: 'anexo' }, el('img', { src: url, alt: '' }),
      botaoDeTirar(t('tirar_imagem'), porEnviar, i))),
    ...documentosPorEnviar.map((documento, i) => el('div', { classe: 'anexo documento' },
      el('span', { classe: 'nome' }, `📎 ${documento.nome}`), botaoDeTirar(t('tirar_ficheiro'), documentosPorEnviar, i))));
  $('anexos').hidden = !porEnviar.length && !documentosPorEnviar.length;
}

async function juntarFicheiros(ficheiros) {
  $('aviso-anexos').textContent = '';
  for (const ficheiro of ficheiros) {
    if (eDocumento(ficheiro)) {
      if (documentosPorEnviar.length >= LIMITES_DOS_ANEXOS.MAX_ATTACHMENTS) {
        $('aviso-anexos').textContent = t('demasiados_ficheiros');
        break;
      }
      documentosPorEnviar.push({ nome: ficheiro.name, mime: ficheiro.type || 'application/octet-stream',
        dados: new Uint8Array(await ficheiro.arrayBuffer()) });
      continue;
    }
    if (porEnviar.length >= MAX_IMAGENS_POR_PEDIDO) {
      $('aviso-anexos').textContent = t('demasiadas_imagens');
      break;
    }
    try {
      porEnviar.push(await prepararImagem(ficheiro));
    } catch (e) {
      avisos.seFalhar('imagens', e);
      $('aviso-anexos').textContent = t(e.codigo === 'nao_e_imagem' ? 'nao_e_imagem' : 'imagem_invalida');
    }
  }
  mostrarPorEnviar();
}

// ── quanto pensa a conversa (como no chat do Recato, 26/10/2026) ───────
// A pílula «Normal» ou «Máximo», sempre à mão, abre o menu dos dois níveis.
// Vale para a conversa toda; a resposta que já vem a caminho não muda de
// nível.

/** A pílula da conversa aberta e o ✓ do menu. */
function mostrarNivel() {
  const maximo = !!atual.nivelMaximo;
  $('nivel-texto').textContent = t(maximo ? 'maximo' : 'normal');
  $('nivel').classList.toggle('ligado', maximo);
  $('nivel-normal').setAttribute('aria-checked', String(!maximo));
  $('nivel-maximo').setAttribute('aria-checked', String(maximo));
}

function abrirMenuNivel(aberto) {
  $('menu-nivel').hidden = !aberto;
  $('nivel').setAttribute('aria-expanded', aberto ? 'true' : 'false');
}

function escolherNivel(maximo) {
  abrirMenuNivel(false);
  if (!!atual.nivelMaximo === maximo) return;
  atual.nivelMaximo = maximo;
  mostrarNivel();
}

// ── a pesquisa sem perguntar nesta conversa (opção A do Pedro, 26/10/2026) ──

/** A etiqueta «Web sem perguntar ×» da conversa aberta. */
function mostrarWebSemPerguntar() {
  $('barra-web').hidden = !atual.pesquisaSemPerguntar;
}

function voltarAPerguntar() {
  atual.pesquisaSemPerguntar = false;
  mostrarWebSemPerguntar();
}

// ── a pesquisa na web: a pessoa confirma cada uma ────────────────────

/** O que um pedido do modelo leva para fora (a frase e o site, ou o endereço). */
const oQueSai = (pedido) => (pedido.tipo === 'pagina' ? pedido.endereco
  : `«${pedido.frase}»${pedido.site ? ` (${t('no_site')} ${pedido.site})` : ''}`);

/** Pesquisa já autorizada nesta conversa: fica à vista a linha do que saiu. */
function linhaSemPerguntar(pedido, resposta) {
  if (!$('mensagens').contains(resposta)) return;
  const rotulo = pedido.tipo === 'pagina' ? t('pagina_aberta_sem_perguntar') : t('pesquisado_sem_perguntar');
  $('mensagens').insertBefore(el('p', { classe: 'pedido-web feito' }, `${rotulo} ${oQueSai(pedido)}`), resposta);
}

/** Pergunta à pessoa, por cima da resposta em curso (*resposta*), se o
 *  pedido do modelo (pesquisa.js, pedidoDaPesquisa) pode sair; devolve
 *  {sim, sempre} — sempre: «Não voltar a perguntar nesta conversa» marcado.
 *  Fica na conversa a linha do que se decidiu. */
function confirmarPesquisa(pedido, resposta) {
  // A pessoa já está noutra conversa: os pedidos seguintes da resposta
  // antiga também são «não» (e não há onde pôr o cartão).
  if (!$('mensagens').contains(resposta)) return Promise.resolve({ sim: false, sempre: false });
  const pagina = pedido.tipo === 'pagina';
  const oQue = oQueSai(pedido);
  return new Promise((resolver) => {
    const sempre = el('input', { type: 'checkbox' });
    const decidir = (sim) => {
      confirmacaoPendente = null;
      plataforma.avisarEspera?.(false);
      const linha = pagina ? (sim ? t('pagina_aberta') : t('pagina_nao_aberta'))
        : (sim ? t('pesquisado') : t('nao_pesquisado'));
      cartao.replaceWith(el('p', { classe: `pedido-web feito${sim ? '' : ' recusado'}` }, `${linha} ${oQue}`));
      resolver({ sim, sempre: sim && sempre.checked });
    };
    confirmacaoPendente = decidir;
    const cartao = el('div', { classe: 'pedido-web' },
      el('p', { classe: 'pedido-titulo' }, pagina ? t('pagina_titulo') : t('pesquisa_titulo')),
      el('p', { classe: 'pedido-frase' }, oQue),
      el('p', { classe: 'aviso' }, pagina ? t('pagina_explica') : t('pesquisa_explica')),
      el('label', { classe: 'sempre' }, sempre,
        el('span', {}, t('sempre_nesta_conversa'), el('small', {}, t('sempre_nota')))),
      el('p', { classe: 'pedido-pergunta' }, pagina ? t('pagina_pergunta') : t('pesquisa_pergunta')),
      el('div', { classe: 'botoes' },
        botao(pagina ? t('abrir_pagina') : t('pesquisar'), () => decidir(true), 'pequeno'),
        botao(pagina ? t('nao_abrir') : t('nao_pesquisar'), () => decidir(false), 'pequeno secundario')));
    $('mensagens').insertBefore(cartao, resposta);
    cartao.scrollIntoView({ block: 'end' });
    // Na app fechada, a notificação pede à pessoa que volte (decisão do Pedro, 28/10/2026: esperar e avisar).
    plataforma.avisarEspera?.(true);
  });
}

const gruposCarregados = new Set();

/** Os pacotes de um grupo (os do PDF só vêm no primeiro PDF): depois, a
 *  extensão, se a houver, confere também o que se carregou. */
async function carregarPacotes(grupo) {
  await python.carregar(grupo);
  if (gruposCarregados.has(grupo)) return;
  gruposCarregados.add(grupo);
  document.dispatchEvent(new CustomEvent('privada:python'));
}

/** Lê os documentos da mensagem *m* da pessoa como o chat (anexos.js): o texto
 *  vai com ela e, se for grande, lê-se uma vez para as fichas. Devolve o
 *  erro a mostrar, ou null; com o «Parar» (*sinal*), RespostaParada. */
async function lerOsDocumentos(conversa, m, documentos, caixa, sinal) {
  mostrar(caixa, textoDosAnexos('a_ler', LINGUA));
  const lidos = await lerAnexos(documentos, { python: { ...python, carregar: carregarPacotes },
    novoId: ficheirosDaConversa(conversa).novoId });
  if (sinal.aborted) throw new RespostaParada();
  if (lidos.erro) return lidos.erro;
  if (lidos.digitalizadas.length || lidos.imagens.length) {
    // As páginas só com imagem passam a texto já, todas, como no chat (30/10/2026, pdf.js) — e as imagens dentro
    // de um Word, PowerPoint ou Excel (02/11/2026).
    await renovarSePreciso();
    const comoLer = { python, desenhar: desenharPaginas, chamar: (pedido) => chamarParaAsPaginas(pedido, sinal),
      etapa: (etapa) => mostrar(caixa, etapa), lingua: LINGUA };
    try {
      lidos.contexto = await lerAsPaginas(lidos, documentos, comoLer);
    } catch (e) {
      if (String(e?.status) === '402' || e instanceof RespostaParada || sinal.aborted) throw e;
      // O pdf.js ou o Python falhou: as páginas ficam por ler, com o aviso do chat.
      avisos.seFalhar('paginas', e);
      lidos.contexto = await lerAsPaginas(lidos, [], comoLer);
    }
    if (sinal.aborted) throw new RespostaParada();
  }
  Object.assign(m, { anexos: lidos.anexos, contextoDosAnexos: lidos.contexto });
  const memoria = bytesDosAnexos(conversa);
  lidos.anexos.forEach((a, i) => memoria.set(a.id, documentos[i].dados));
  if (lidos.contexto.length <= LIMITES_DOS_ANEXOS.LIMIAR_FICHAS_CHARS) return null;
  // Anexo grande: lê-se por inteiro UMA vez para uma ficha por anexo, e o
  // texto deixa de ir a cada mensagem seguinte (como no chat).
  await renovarSePreciso();
  const fichas = await fazerFichas(lidos.contexto, m.texto, { python,
    chamar: (mensagens) => chamarParaAsFichas(mensagens, sinal), etapa: (etapa) => mostrar(caixa, etapa),
    lingua: LINGUA });
  if (sinal.aborted) throw new RespostaParada();
  if (fichas) {
    m.fichasDosAnexos = fichas;
    return null;
  }
  // Sem fichas, um texto deste tamanho já não vai inteiro: responder sem ele
  // era responder sem o documento.
  return lidos.contexto.length > LIMITES_DOS_ANEXOS.ANEXOS_SEM_FICHA_MAX_CHARS
    ? textoDosAnexos('erro_por_ler', LINGUA) : null;
}

async function enviar(texto, { maximo = false, imagens = [], documentos = [] } = {}) {
  const conversa = atual;
  // Os ficheiros que esta resposta fizer (create_file, append_to_file, edit_document).
  const ficheiros = new Map();
  if (maximo && !conversa.nivelMaximo) {
    conversa.nivelMaximo = true;
    mostrarNivel();
  }
  const nivel = nivelDa(conversa);
  const minha = { papel: 'eu', texto, ...(imagens.length ? { imagens } : {}) };
  conversa.mensagens.push(minha);
  mensagem('eu', texto, { imagens, anexos: documentos });
  const caixa = mensagem('recato', '…');
  const espera = criarEspera(conversa, { ficheiros });
  await correrResposta(conversa, caixa, { ficheiros, espera, preparar: async (sinal) => {
    // Se o ecrã fechar já aqui, quem volta manda a mensagem outra vez (com os documentos).
    await espera.preparar({ texto, maximo, imagens,
      documentos: documentos.map((d) => ({ nome: d.nome, mime: d.mime, dados: b64(d.dados) })) });
    if (documentos.length) {
      const erro = await lerOsDocumentos(conversa, minha, documentos, caixa, sinal);
      if (erro) return { erro };
    }
    // As imagens das últimas mensagens vão ao Flash; o pedido diz se vão. O
    // texto dos documentos vai como no chat (comOsAnexos).
    const { mensagens, bytesImagens } = paraOModelo(instrucoes(conversa), comOsAnexos(conversa.mensagens));
    mostrar(caixa, bytesImagens ? t('a_ver_imagens') : nivel === NIVEL_MAXIMO ? t('a_pensar_maximo') : '…');
    return { mensagens, bytesImagens };
  } });
}

/**
 * Uma resposta, do 1.º pedido ao fim, com o «Parar»: *preparar(sinal)* devolve
 * {mensagens, bytesImagens} para o modelo (ou {erro}, a mostrar); *espera* é a
 * dela (criarEspera). Acabada — mostrada, parada ou falhada de vez —, deixa de
 * esperar por quem fechou o ecrã. *trincada*: quem chama já tem o trinco dela.
 */
async function correrResposta(conversa, caixa, { ficheiros, espera, preparar, trincada = false }) {
  aResponder = true;
  paragem = new AbortController();
  esperaAtual = espera;
  const { signal: sinal } = paragem;
  aplicarCaixa();
  // Na app: daqui até ao fim, a resposta continua com a app fechada ou o ecrã desligado. Na página e na extensão, o
  // servidor continua-a se o separador fechar (espera.js).
  plataforma.avisarTrabalho?.(true);
  let bytesImagens = 0;
  const correr = async () => {
    try {
      const preparado = await preparar(sinal);
      if (preparado.erro) {
        conversa.mensagens.pop();
        mostrar(caixa, preparado.erro);
        return;
      }
      ({ bytesImagens } = preparado);
      espera.bytesImagens = bytesImagens;
      await renovarSePreciso();
      const resposta = await responder({
        mensagens: preparado.mensagens,
        nivel: nivelDa(conversa),
        pedir: espera.pedir,
        sinal,
        // Com o saldo todo reservado por outras respostas (429), não é a rede: diz-se que espera por elas.
        aoSemRede: (_tentativa, erro) => mostrar(caixa, t(eSaldoEmUso(erro) ? 'saldo_em_uso_espera' : 'sem_rede')),
        // Um fluxo que acaba sem o fim: o servidor diz se foi o saldo a cortá-lo (14/11/2026).
        corte: (fluxo) => servidor.corteDoFluxo(fluxo),
        confirmar: confirmacaoDaConversa(conversa, {
          perguntar: (pedido) => confirmarPesquisa(pedido, caixa),
          semPerguntar: (pedido) => linhaSemPerguntar(pedido, caixa),
          aoMudar: () => {
            if (conversa === atual) mostrarWebSemPerguntar();
          },
        }),
        pesquisar: async (nome, argumentos) => {
          mostrar(caixa, t('a_pesquisar'));
          await renovarSePreciso();
          return servidor.pesquisar(nome, argumentos);
        },
        aoEscrever: (parcial) => mostrar(caixa, parcial),
        aoGastar: (usage, pedido) => servidor.consumo(usage, bytesImagens, pedido).catch(() => {}),
        ficheiros: ficheirosDaConversa(conversa),
        aoFicheiro: (ficheiro, dados) => {
          ficheiros.set(ficheiro.id, { ...ficheiro });
          guardarBytes(ficheiro, dados);
        },
        anexos: anexosDaConversa(conversa, (etapa) => mostrar(caixa, etapa)),
        lingua: LINGUA,
        aoEtapa: (etapa) => mostrar(caixa, etapa),
        // Os formatos que a pessoa pediu e os ficheiros que a resposta já fez antes de o ecrã fechar: a entrega.
        pedidoDaPessoa: conversa.mensagens.findLast((m) => m.papel === 'eu')?.texto || '',
        jaEntregues: [...ficheiros.values()],
      });
      mostrar(caixa, resposta);
      const feitos = [...ficheiros.values()];
      if (feitos.length) caixa.append(el('div', { classe: 'ficheiros' }, ...feitos.map(botaoDoFicheiro)));
      conversa.mensagens.push({ papel: 'recato', texto: resposta, ...(feitos.length ? { ficheiros: feitos } : {}) });
    } catch (e) {
      if (e instanceof RespostaParada || sinal.aborted) {
        // Parada no «Parar», como no chat do Recato: fica o que já tinha
        // escrito, e os ficheiros que já fez, com a nota; a pergunta também.
        const parcial = (e?.texto || '').trim();
        const parada = parcial ? `${parcial}\n\n${t('interrompida')}` : t('interrompida');
        mostrar(caixa, parada);
        const feitos = [...ficheiros.values()];
        if (feitos.length) caixa.append(el('div', { classe: 'ficheiros' }, ...feitos.map(botaoDoFicheiro)));
        conversa.mensagens.push({ papel: 'recato', texto: parada, ...(feitos.length ? { ficheiros: feitos } : {}) });
      } else if (e instanceof RespostaSemSaldo) {
        // Cortada a meio pelo saldo (14/11/2026), como no chat do Recato: fica o que já tinha escrito, e os ficheiros
        // que já fez, com a nota de porquê — o saldo acabou, ou o que resta está reservado por outras respostas em
        // curso (pede-se «continua» quando acabarem). A pergunta também fica.
        const parcial = (e.texto || '').trim();
        const nota = t(e.motivo === 'saldo_em_uso' ? 'saldo_em_uso_a_meio' : 'sem_saldo_a_meio');
        const cortada = parcial ? `${parcial}\n\n${nota}` : nota;
        mostrar(caixa, cortada);
        const feitos = [...ficheiros.values()];
        if (feitos.length) caixa.append(el('div', { classe: 'ficheiros' }, ...feitos.map(botaoDoFicheiro)));
        conversa.mensagens.push({ papel: 'recato', texto: cortada, ...(feitos.length ? { ficheiros: feitos } : {}) });
      } else {
        conversa.mensagens.pop();
        // Em ciclo (pesquisa.js, RespostaEmCiclo), o carteiro também para: cortar a leitura não chega, ele
        // continuava a receber e a guardar a resposta até ao teto (30/10/2026: 25 min e 43 MB de «!!!!»).
        if (e?.codigo === 'ciclo') esperaAtual?.parar();
        avisos.seFalhar('responder', e);
        // Sem recurso: se o Flash (ou o GLM-5.3) falha, a resposta falha.
        caixa.textContent = String(e?.status) === '402' ? t('sem_saldo') : t(bytesImagens ? 'erro_imagens' : 'erro');
      }
    } finally {
      aResponder = false;
      paragem = null;
      esperaAtual = null;
      aplicarCaixa();
      trabalhoAcabou();
      // Mostrada à pessoa, já não espera por ninguém: com o ecrã escondido (no Android, o separador fechado fica
      // vivo uns segundos e acaba-a sozinho) fica à espera até ele voltar à vista — e, se morrer antes, quem voltar
      // tem-na lá (30/10/2026). Até 19/11/2026, com o histórico aberto, acabava logo que a conversa ficava gravada.
      quandoAVista(document, () => espera.acabar());
    }
  };
  if (trincada) await correr();
  else await comTrinco(espera.id, correr);
}

/** Continua a resposta que ficou à espera neste aparelho (*registo*, espera.js):
 *  mostra a conversa dela e lê do servidor a ronda que estava a chegar, ou
 *  manda outra vez a mensagem que nem chegou a sair. */
async function retomar(registo) {
  const conversa = { ...registo.conversa, mensagens: [...registo.conversa.mensagens] };
  mostrarConversa(conversa);
  if (registo.fase === 'preparar') {
    await esperas.apagar(registo.id).catch(() => {});
    const p = registo.pedido;
    await enviar(p.texto, { maximo: p.maximo, imagens: p.imagens || [],
      documentos: (p.documentos || []).map((d) => ({ ...d, dados: de64(d.dados) })) });
    return;
  }
  const ficheiros = new Map((registo.ficheiros || []).map((f) => [f.id, f]));
  const caixa = mensagem('recato', '…');
  const espera = criarEspera(conversa, { id: registo.id, ficheiros, retomar: registo.ronda });
  await correrResposta(conversa, caixa, { ficheiros, espera, trincada: true,
    preparar: async () => ({ mensagens: registo.ronda.mensagens, bytesImagens: registo.bytesImagens || 0 }) });
}

/** As respostas que ficaram à espera neste aparelho (o ecrã fechou a meio): uma de cada vez. Se outro separador está
 *  com ela (no Android, também o que se fechou e ainda está vivo), espera-se que ele a largue, e só se continua se ela
 *  ainda estiver à espera — ele pode já a ter mostrado à pessoa (30/10/2026). */
async function retomarEsperas() {
  let registos;
  try {
    registos = await esperas.lista();
  } catch {
    return;
  }
  for (const { id } of registos) {
    if (aResponder) return;
    await comTrinco(id, async () => {
      const registo = aResponder ? null : (await esperas.lista().catch(() => [])).find((r) => r.id === id);
      if (registo) await retomar(registo);
    });
  }
}

// ── o histórico que saiu (19/11/2026) ─────────────────────────────────

/** De 22/10 a 19/11/2026, quem guardava as conversas privadas tinha neste
 *  aparelho a cópia da chave do histórico (fechada pelo chip do telemóvel ou
 *  pela chave do browser) e, quem disse «Agora não», essa resposta. O
 *  histórico saiu e as conversas guardadas apagaram-se no servidor
 *  (fs_chat_autonomo, migração 1.0.59.0): o que ficou aqui apaga-se, e quem
 *  o tinha ligado vê o aviso uma vez. */
function esquecerOHistorico() {
  let tinha = false;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const nome = localStorage.key(i);
      if (nome === 'privada.recusou_o_historico' || nome?.startsWith('privada.chave.')) {
        tinha ||= nome.startsWith('privada.chave.');
        localStorage.removeItem(nome);
      }
    }
  } catch {
    // Sem armazenamento: não há nada para apagar.
  }
  // Quem o tinha ligado neste aparelho fica a saber, uma vez, porque já não vê as conversas.
  if (tinha) linha(t('historico_apagado'), [['OK', () => linha(null)]]);
}

// ── o arranque ───────────────────────────────────────────────────────

async function arrancar() {
  esquecerOHistorico();
  // Na página web não há prova de que o código é o publicado: diz-se às
  // claras (a extensão, se a pessoa a tiver, confere-a e muda a faixa).
  $('faixa').hidden = plataforma.onde !== 'web';
  // «Voltar ao Recato» (pedido do Pedro, 27/10/2026): no browser, o mesmo
  // separador volta às conversas normais da conta. Na app não aparece: o
  // «voltar» do Android fecha este ecrã, e uma ligação para fora abria o browser.
  $('voltar-ao-recato').href = enderecoDoRecato(null);
  $('voltar-ao-recato').hidden = plataforma.onde === 'app';
  // A sessão e o endereço do carteiro vêm do Recato aberto com a conta
  // (/fs_chat/privada/sessao), pela app, pela extensão ou pela ligação.
  let dados;
  try {
    dados = await plataforma.pedirSessao();
  } catch {
    estado(t('sem_sessao'), 'erro');
    return;
  }
  $('voltar-ao-recato').href = enderecoDoRecato(dados.carteiro);
  sessao = dados.sessao;
  expira = Date.now() / 1000 + (dados.prazo || 0);
  servidor = criarServidor(dados.carteiro, () => sessao);
  avisos.ligar((campos) => servidor.avisarFalha(campos));
  cliente = new PrivatemodeAI({
    auth: () => ({ type: 'apiKey', value: sessao }),
    apiBaseURL: dados.carteiro,
    dangerouslyAllowBrowser: true,
    browserWasmURL: './privatemode.wasm',
    wasmURL: './privatemode.wasm',
    expectedWasmHash: WASM_SHA256,
    enableWasmLogging: false,
    onSecretUpdate: (segredo) => {
      ultimoSegredo = segredo;
    },
  });
  try {
    await cliente.verify();
  } catch (e) {
    // Sem rede, ou o servidor a recusar, é do ambiente; o resto (a prova da caixa-forte que não confere, um
    // defeito) tem de chegar a quem mantém o ecrã: sem ela ninguém consegue conversar.
    if (!eDaRede(e) && e?.status === undefined && navigator.onLine !== false) avisos.avisar('verificar', 'acao', e);
    estado(t('falhou'), 'erro');
    return;
  }
  // O segredo de cifra já agora, e não só no 1.º pedido (29/10/2026): quem fecha logo a seguir a enviar tem a
  // resposta guardada à espera, e ela abre-se com ele (espera.js). Se falhar, o SDK fá-lo no 1.º pedido.
  await cliente.refreshSecret().catch(() => {});
  // As respostas à espera (espera.js) antes de se poder enviar (30/10/2026, achado no Chrome do Android: quem
  // enviava logo, antes de elas estarem prontas, ficava sem a espera guardada e, ao fechar, sem a resposta).
  esperas = criarEsperas({ armazem: armazemIndexedDB(), fechar: plataforma.fechar, abrir: plataforma.abrir,
    conta: dados.carteiro });
  estado(t('verificada'), 'ok');
  pronta = true;
  aplicarCaixa();
  const enviarOTexto = (opcoes = {}) => {
    abrirMenuNivel(false);
    const texto = $('texto').value.trim();
    if ((!texto && !porEnviar.length && !documentosPorEnviar.length) || $('enviar').disabled) return;
    $('texto').value = '';
    const imagens = porEnviar;
    const documentos = documentosPorEnviar;
    porEnviar = [];
    documentosPorEnviar = [];
    mostrarPorEnviar();
    $('aviso-anexos').textContent = '';
    enviar(texto, { ...opcoes, imagens, documentos });
  };
  $('anexar').addEventListener('click', () => $('ficheiros').click());
  $('ficheiros').addEventListener('change', async () => {
    // O campo só se limpa depois de os ficheiros estarem lidos (e assim o
    // mesmo pode voltar a ser escolhido).
    await juntarFicheiros([...$('ficheiros').files]);
    $('ficheiros').value = '';
  });
  $('caixa').addEventListener('submit', (evento) => {
    evento.preventDefault();
    enviarOTexto();
  });
  $('parar').addEventListener('click', pararResposta);
  // Na app, o «Parar» da notificação de quando a app está fechada (TrabalhoPrivadoServico).
  document.addEventListener('privada:parar', pararResposta);
  // Como no chat do Recato e no Recato Code (23/11/2026, pedido do Pedro): o
  // Enter envia e o Shift+Enter muda de linha; o Ctrl/Cmd+Enter também envia
  // e, com Shift, a pensar ao máximo (a conversa fica no «Máximo»).
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const comTeclado = !matchMedia('(pointer: coarse)').matches;
  $('texto').addEventListener('keydown', (evento) => {
    const tecla = teclaDaCaixa(evento, { comTeclado });
    if (!tecla) return;
    evento.preventDefault();
    enviarOTexto({ maximo: tecla === 'maximo' });
  });
  // A dica da pílula diz a tecla, só com teclado (no telemóvel não há).
  $('nivel').title = comTeclado ? t('nivel_dica').replace('%s', `${mac ? 'Cmd' : 'Ctrl'}+Shift+Enter`)
    : t('nivel_titulo');
  $('nivel').addEventListener('click', () => abrirMenuNivel($('menu-nivel').hidden));
  $('nivel-normal').addEventListener('click', () => escolherNivel(false));
  $('nivel-maximo').addEventListener('click', () => escolherNivel(true));
  $('tirar-web').addEventListener('click', voltarAPerguntar);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') abrirMenuNivel(false);
  });
  document.addEventListener('click', (evento) => {
    if (!evento.target.closest?.('.nivel')) abrirMenuNivel(false);
  });
  // A resposta que ficou a meio quando o ecrã fechou (28/10/2026): continua aqui.
  await retomarEsperas();
}

arrancar();
