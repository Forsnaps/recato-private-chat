// O pedido ao modelo e a pesquisa na web da conversa privada (25/10/2026),
// sem ecrã (o ecrã é o privada.js), para os testes (privada/testes/pesquisa.test.mjs).
//
// Os modelos são só os da Privatemode, e o carteiro do servidor recusa
// qualquer outro: o GLM-5.3 para o texto e, quando o pedido leva imagens, o
// GLM-5.3-Flash, que as lê (26/10/2026; ver imagens.js). Se o Flash falhar, a
// resposta falha: não há recurso. O nível de pensamento é o do chat do
// Recato: o GLM-5.3 em «high» e, com a conversa no «Máximo» (a pílula «Normal /
// Máximo» da caixa de escrita), em «max» (25–26/10/2026); o Flash com imagens
// sempre em «max» (ensaio de 22/10/2026: em «high» lia pior do que o K3).
//
// A pesquisa (decisão do Pedro, 25/10/2026: «com confirmação»): é o modelo, na
// caixa-forte, que pede uma pesquisa ou uma página; o ecrã mostra à pessoa a
// frase (ou o endereço) e só com o «sim» dela a manda ao servidor do Recato,
// que a faz com o código da pesquisa do chat e devolve o texto das páginas
// (fs_chat_autonomo, rota /fs_chat/privada/pesquisa). A conversa nunca sai
// cifrada para lá. As ferramentas e as regras são as do chat, copiadas do
// servidor para pesquisa.json (scripts/pesquisa_do_chat.py; um teste do
// servidor confere que são iguais).
//
// Os ficheiros e os documentos anexados (27/10/2026): create_file,
// append_to_file, read_document e edit_document, como no
// chat, e procurar_nos_anexos quando a conversa tem anexos com ficha
// (anexos.js).
import { COM_OS_DOCUMENTOS, FERRAMENTA_PROCURAR, ficheiroEditado, MAX_TOKENS_DAS_FICHAS } from './anexos.js';
import {
  aConfirmarOFicheiro, avisoDaEntrega, ENTREGAM, FAZEM_FICHEIROS, FERRAMENTAS_DE_FICHEIROS, ficheiroPedido,
  ordemDaEntrega, PODE_ANUNCIAR_FICHEIRO, RONDAS_DA_REPARACAO,
} from './ficheiros.js';
import DADOS from './pesquisa.json' with { type: 'json' };

export const MODELO = 'glm-5.3';
export const MODELO_DAS_IMAGENS = 'glm-5.3-flash';
export const NIVEL_NORMAL = 'high';
export const NIVEL_MAXIMO = 'max';
export const FERRAMENTAS = DADOS.ferramentas;
export const REGRAS_DA_PESQUISA = DADOS.regras;
export const REGRAS_DA_DATA = DADOS.regras_da_data;
/** O teto de saída da resposta, o do chat (_MAX_TOKENS_CHAT, que o
 *  ficheiros.json já traz para as fichas): sem ele, uma resposta que não
 *  acaba ia até ao limite do modelo. */
export const MAX_TOKENS = MAX_TOKENS_DAS_FICHAS;
/** Rondas de ferramentas por resposta, como no chat com pesquisa
 *  (_MAX_WEB_TOOL_ITERATIONS); depois delas o modelo tem de responder. */
export const MAX_RONDAS = 6;
/** O que o modelo lê quando a pessoa não deixa sair uma pesquisa. */
export const PESQUISA_RECUSADA = 'O utilizador não autorizou esta pesquisa, por isso não foi feita. '
  + 'Não a voltes a pedir: responde com o que sabes e diz que não pesquisaste.';
export const PESQUISA_FALHADA = 'A pesquisa falhou. Responde com o que sabes e diz que não a conseguiste fazer.';

const NOMES = new Set(FERRAMENTAS.map((f) => f.function.name));

// ── os nomes das ferramentas no pedido (30/10/2026, como no chat:
// _NOMES_PARA_O_MODELO). Numa conversa com imagem o GLM-5.3-Flash degenerou —
// «!!!!…» no raciocínio, 25 min sem resposta — e o gatilho era a ferramenta
// chamar-se web_search, o nome da pesquisa que os GLM trazem de fábrica; com
// outro nome respondeu em 5 s. O nome muda só no pedido (nas ferramentas, nos
// textos e nas chamadas anteriores) e volta na resposta (lerFluxo): o resto
// do ecrã conhece-a por web_search.

/** {o nosso nome: o nome no pedido}, copiado do chat para pesquisa.json. */
export const NOMES_PARA_O_MODELO = DADOS.nomes_para_o_modelo;

const trocaDeNomes = (mapa) => {
  const nomes = Object.keys(mapa).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(?:${nomes.join('|')})\\b`, 'g');
  return (texto) => (nomes.length ? texto.replace(re, (nome) => mapa[nome]) : texto);
};
const nomesParaOModelo = trocaDeNomes(NOMES_PARA_O_MODELO);
/** Um texto do modelo com os nossos nomes (o contrário de comNomesDoModelo). */
export const comNomesNossos = trocaDeNomes(Object.fromEntries(
  Object.entries(NOMES_PARA_O_MODELO).map(([nosso, noPedido]) => [noPedido, nosso])));

/** *pedido* com os nomes de NOMES_PARA_O_MODELO, numa cópia; passa pelo
 *  JSON (uma imagem em base64 nunca tem «_», por isso nunca muda). */
export function comNomesDoModelo(pedido) {
  const texto = JSON.stringify(pedido);
  const trocado = nomesParaOModelo(texto);
  return trocado === texto ? pedido : JSON.parse(trocado);
}

// ── as respostas em ciclo (30/10/2026, as regras do chat:
// respostas_em_ciclo.py, com as constantes copiadas para pesquisa.json). O
// modelo que repete o mesmo bloco pelo menos MIN_COPIAS vezes no fim do texto
// (com letras no bloco: as tabelas em branco e as linhas separadoras repetem-se
// sem elas), ou que escreve uma fila de sinais sem espaços, letras nem
// algarismos (degenerado: o «!!!!…» do Flash), no texto ou no raciocínio,
// para logo: a resposta falha em vez de seguir até ao teto, e não se volta a
// pedir sozinha (tentarOutraVez).

/** As regras dos ciclos do chat. */
export const CICLOS = DADOS.ciclos;
const JANELA = CICLOS.MAX_BLOCO * CICLOS.MIN_COPIAS;
const SEPARADORES = new Set(CICLOS.SEPARADORES);

/** A resposta parou por estar em ciclo (*bloco*: o tamanho do bloco repetido; 1 num texto degenerado). */
export class RespostaEmCiclo extends Error {
  constructor(bloco) {
    super(`resposta em ciclo: o mesmo bloco de ${bloco} carateres repetido`);
    this.name = 'RespostaEmCiclo';
    this.codigo = 'ciclo';
    this.bloco = bloco;
  }
}

// As letras, os algarismos e os espaços do Python (isalnum, isspace): os do
// JavaScript não são iguais — o \s conta o U+FEFF e não conta U+001C a U+001F
// nem U+0085. As contas são em unidades do JavaScript e não em carateres,
// como no Python: só muda nos que precisam de duas (alguns emojis).
const LETRA_OU_ALGARISMO_OU_ESPACO =
  /[\p{L}\p{N}\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;

/** Se o fim de *texto* é uma fila de um ou dois sinais sem espaços, letras nem algarismos
 *  (MIN_DEGENERADO seguidos; os das linhas separadoras, SEPARADOR_DEGENERADO). */
export function degenerado(texto) {
  const fim = texto.slice(-CICLOS.MIN_DEGENERADO);
  const sinais = new Set(fim);
  if (fim.length < CICLOS.MIN_DEGENERADO || sinais.size > 2
    || [...sinais].some((c) => LETRA_OU_ALGARISMO_OU_ESPACO.test(c))) return false;
  if ([...sinais].every((c) => SEPARADORES.has(c))) {
    const longo = texto.slice(-CICLOS.SEPARADOR_DEGENERADO);
    const todos = new Set(longo);
    return longo.length >= CICLOS.SEPARADOR_DEGENERADO && todos.size === sinais.size
      && [...todos].every((c) => sinais.has(c));
  }
  return true;
}

/** O tamanho do bloco que o fim de *texto* repete em ciclo, ou 0 (o ciclo_no_fim do chat). */
export function cicloNoFim(texto) {
  if (degenerado(texto)) return 1;
  const janela = texto.slice(-JANELA);
  const n = janela.length;
  if (n < CICLOS.MIN_CARATERES) return 0;
  const sonda = janela.slice(-CICLOS.SONDA);
  const fim = n - sonda.length;
  let limite = n - 1;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    // O rfind(sonda, 0, limite) do Python: a sonda acaba antes de *limite*.
    const desde = limite - sonda.length;
    const pos = desde < 0 ? -1 : janela.lastIndexOf(sonda, desde);
    if (pos < 0) return 0;
    const bloco = fim - pos;
    if (bloco > CICLOS.MAX_BLOCO) return 0;
    const ultimo = janela.slice(-bloco);
    let copias = 1;
    while ((copias + 1) * bloco <= n && janela.slice(n - (copias + 1) * bloco, n - copias * bloco) === ultimo) {
      copias += 1;
    }
    if (copias > 1) {
      const emCiclo = copias >= CICLOS.MIN_COPIAS && copias * bloco >= CICLOS.MIN_CARATERES && /\p{L}/u.test(ultimo);
      return emCiclo ? bloco : 0;
    }
    limite = pos + sonda.length - 1;
  }
  return 0;
}

/** O fim do texto que *partes* formam (o que cicloNoFim lê), sem as juntar todas. */
export function fimDasPartes(partes) {
  const fim = [];
  let n = 0;
  for (let i = partes.length - 1; i >= 0 && n < JANELA; i -= 1) {
    fim.push(partes[i]);
    n += partes[i].length;
  }
  return fim.reverse().join('').slice(-JANELA);
}

// ── o «Parar» e as falhas que passam (28/10/2026, pedido do Pedro: «a única
// coisa que deve parar [...] é o user carregar no botão de stop, mais nada»).
// Fechar o ecrã não para (na app: TrabalhoPrivadoServico); a rede ou o
// servidor que falham a meio também não: a ronda volta a pedir-se, com esperas
// cada vez maiores. Sem saldo, sem sessão ou com o pedido recusado, a resposta
// acaba logo — isso não passa por esperar.

/** A resposta parada no «Parar»: acaba com o que já tinha escrito (*texto*). */
export class RespostaParada extends Error {
  constructor(texto = '') {
    super('parada');
    this.name = 'RespostaParada';
    this.codigo = 'parada';
    this.texto = texto;
  }
}

/** As esperas (s) antes de cada nova tentativa; da última em diante, sempre a última. */
export const ESPERAS_S = [2, 5, 10, 30, 60];
/** Uma falha sem estado HTTP, com rede: pode ser do ecrã e não passar, por isso só estas vezes. */
export const TENTATIVAS_SEM_ESTADO = 3;
/** Ao fim de tanto tempo à espera (s) a resposta falha: meia hora sem rede ou com o servidor em baixo. */
export const PRAZO_DAS_TENTATIVAS_S = 30 * 60;

/** Se vale a pena pedir outra vez depois de *erro* (a *tentativa*-ésima falha, de 0): o servidor ou o fornecedor
 *  em baixo (408, 425, 429, 5xx) e a falta de rede passam; o resto (sem saldo, sessão, pedido recusado) não. */
export function tentarOutraVez(erro, tentativa, semRede = false) {
  // Uma resposta em ciclo repetia-se: falha, e a pessoa decide se volta a pedir.
  if (erro?.codigo === 'ciclo') return false;
  const estado = Number(erro?.status);
  if (Number.isInteger(estado) && estado > 0) return estado === 408 || estado === 425 || estado === 429 || estado >= 500;
  return semRede || tentativa < TENTATIVAS_SEM_ESTADO;
}

/** Se a falha *erro*, de que comTentativas desistiu, foi o servidor ou o fornecedor em baixo (ou a falta de rede,
 *  *semRede*), que as tentativas esperavam que passasse, e não o pedido: a leitura das páginas digitalizadas não
 *  parte esse lote em metades, que voltavam a tentar cada uma (lerAsPaginas, em anexos.js). */
export const desistiuEmBaixo = (erro, semRede = false) => tentarOutraVez(erro, TENTATIVAS_SEM_ESTADO, semRede);

/** Espera *ms*; com o «Parar» a meio, acaba logo em RespostaParada. */
export function esperarComSinal(ms, sinal = null) {
  return new Promise((resolve, reject) => {
    if (sinal?.aborted) {
      reject(new RespostaParada());
      return;
    }
    const aoParar = () => {
      clearTimeout(relogio);
      reject(new RespostaParada());
    };
    const relogio = setTimeout(() => {
      sinal?.removeEventListener('abort', aoParar);
      resolve();
    }, ms);
    sinal?.addEventListener('abort', aoParar, { once: true });
  });
}

/**
 * *fazer()* até dar, enquanto as falhas passarem (tentarOutraVez) e dentro do
 * PRAZO_DAS_TENTATIVAS_S. Com o *sinal* parado, acaba em RespostaParada com
 * *texto()* (o que já se tinha escrito).
 *
 * - *esperar(ms, sinal)*: a espera entre tentativas (nos testes, sem relógio);
 * - *semRede()*: se o aparelho está sem rede (no browser, `navigator.onLine`);
 * - *aoFalhar(tentativa)*: antes de cada espera, para o ecrã dizer que volta a tentar.
 */
export async function comTentativas(fazer, { sinal = null, esperar = esperarComSinal,
  semRede = () => globalThis.navigator?.onLine === false, aoFalhar = null, texto = () => '' } = {}) {
  let esperado = 0;
  for (let tentativa = 0; ; tentativa += 1) {
    if (sinal?.aborted) throw new RespostaParada(texto());
    let feito;
    try {
      feito = await fazer();
    } catch (e) {
      if (sinal?.aborted || e instanceof RespostaParada) throw new RespostaParada(texto());
      const espera = ESPERAS_S[Math.min(tentativa, ESPERAS_S.length - 1)];
      if (!tentarOutraVez(e, tentativa, semRede()) || esperado + espera > PRAZO_DAS_TENTATIVAS_S) throw e;
      esperado += espera;
      aoFalhar?.(tentativa + 1);
      try {
        await esperar(espera * 1000, sinal);
      } catch {
        throw new RespostaParada(texto());
      }
      continue;
    }
    // Parado a meio, o SDK acaba o fluxo sem erro (o AbortError fica lá
    // dentro): o que chegou até aí não é a resposta inteira.
    if (sinal?.aborted) throw new RespostaParada(texto());
    return feito;
  }
}

/** O nível de pensamento de uma conversa. */
export const nivelDa = (conversa) => (conversa?.nivelMaximo ? NIVEL_MAXIMO : NIVEL_NORMAL);

/** Se as mensagens para o modelo levam imagens (blocos image_url). */
export const levaImagens = (mensagens) => mensagens.some((m) => Array.isArray(m.content)
  && m.content.some((bloco) => bloco?.type === 'image_url'));

/** O bloco da data de hoje, como o do chat (_date_context), pelo relógio do aparelho. */
export function blocoDaData(agora = new Date(), fuso = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const dia = agora.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hora = agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false });
  const onde = !fuso || fuso === 'Europe/Lisbon' ? 'hora de Lisboa' : `fuso ${fuso}`;
  return `\n\nDATA E HORA ATUAIS: ${dia}, ${hora} (${onde}).\n${REGRAS_DA_DATA}`;
}

/** O pedido de uma ronda: com imagens ao Flash em «max», senão ao GLM-5.3 no
 *  nível da conversa; na última ronda vai sem ferramentas, para responder.
 *  *comFicheiros*: as ferramentas dos ficheiros do chat (27/10/2026);
 *  *comFichas*: procurar_nos_anexos; *soFicheiros*: só as dos ficheiros (a
 *  ronda de reparação da entrega, ficheiros.js). Com o teto de saída do chat
 *  e os nomes das ferramentas do pedido (comNomesDoModelo). */
export function pedidoAoModelo(mensagens, { nivel = NIVEL_NORMAL, ultima = false, comFicheiros = false,
  comFichas = false, soFicheiros = false } = {}) {
  const imagens = levaImagens(mensagens);
  const pedido = {
    model: imagens ? MODELO_DAS_IMAGENS : MODELO,
    reasoning_effort: imagens || nivel === NIVEL_MAXIMO ? NIVEL_MAXIMO : NIVEL_NORMAL,
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    messages: mensagens,
  };
  if (!ultima) {
    pedido.tools = soFicheiros ? [...FERRAMENTAS_DE_FICHEIROS] : [...FERRAMENTAS,
      ...(comFicheiros ? FERRAMENTAS_DE_FICHEIROS : []), ...(comFichas ? [FERRAMENTA_PROCURAR] : [])];
  }
  return comNomesDoModelo(pedido);
}

/** Junta os pedaços de uma resposta em streaming: o texto (a cada pedaço,
 *  *aoEscrever* recebe o texto até aí), os pedidos de ferramentas, o consumo
 *  e porque acabou (*fim*: «length» se o teto de saída a cortou). O texto e o
 *  raciocínio veem-se de INTERVALO em INTERVALO carateres: em ciclo, o fluxo
 *  para e a resposta falha em RespostaEmCiclo. Os nomes das ferramentas
 *  voltam a ser os nossos (comNomesNossos). */
export async function lerFluxo(fluxo, aoEscrever) {
  let texto = '';
  let usage = null;
  let fim = null;
  const chamadas = [];
  const pensado = [];
  let pensados = 0;
  let verPensadoAos = CICLOS.MIN_CARATERES;
  let verTextoAos = CICLOS.MIN_CARATERES;
  const emCiclo = (bloco) => {
    fluxo.controller?.abort();
    return new RespostaEmCiclo(bloco);
  };
  for await (const pedaco of fluxo) {
    const delta = pedaco.choices?.[0]?.delta || {};
    // A Privatemode manda o raciocínio em `reasoning`; outros, em `reasoning_content`.
    const pensou = delta.reasoning || delta.reasoning_content || '';
    if (pensou) {
      pensado.push(pensou);
      pensados += pensou.length;
      if (pensados >= verPensadoAos) {
        verPensadoAos = pensados + CICLOS.INTERVALO;
        const bloco = cicloNoFim(fimDasPartes(pensado));
        if (bloco) throw emCiclo(bloco);
      }
    }
    if (delta.content) {
      texto += delta.content;
      aoEscrever?.(texto);
      if (texto.length >= verTextoAos) {
        verTextoAos = texto.length + CICLOS.INTERVALO;
        const bloco = cicloNoFim(texto);
        if (bloco) throw emCiclo(bloco);
      }
    }
    for (const parte of delta.tool_calls || []) {
      const i = Number.isInteger(parte.index) ? parte.index : chamadas.length;
      chamadas[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
      const chamada = chamadas[i];
      if (parte.id) chamada.id = parte.id;
      if (parte.function?.name) chamada.function.name += parte.function.name;
      if (parte.function?.arguments) chamada.function.arguments += parte.function.arguments;
    }
    if (pedaco.usage) usage = pedaco.usage;
    fim = pedaco.choices?.[0]?.finish_reason || fim;
  }
  return {
    texto: comNomesNossos(texto),
    chamadas: chamadas.filter(Boolean).map((c) => ({ ...c, function: { ...c.function, name: comNomesNossos(c.function.name) } })),
    usage,
    fim,
  };
}

/** O que o ecrã mostra à pessoa antes de deixar sair um pedido do modelo:
 *  {tipo: 'pesquisa', frase, site} ou {tipo: 'pagina', endereco}; null se o
 *  pedido não é uma pesquisa válida (nesse caso não sai nada). */
export function pedidoDaPesquisa(nome, argumentos) {
  if (!NOMES.has(nome) || !argumentos || typeof argumentos !== 'object') return null;
  if (nome === 'fetch_page') {
    const endereco = typeof argumentos.url === 'string' ? argumentos.url.trim() : '';
    return /^https?:\/\/\S+$/i.test(endereco) ? { tipo: 'pagina', endereco } : null;
  }
  const frase = typeof argumentos.query === 'string' ? argumentos.query.replace(/\s+/g, ' ').trim() : '';
  if (!frase) return null;
  const site = typeof argumentos.site === 'string' && argumentos.site.trim() ? argumentos.site.trim() : null;
  return { tipo: 'pesquisa', frase, site };
}

/**
 * A confirmação das pesquisas de uma conversa (26/10/2026, decisão do Pedro).
 * Por omissão pergunta sempre: *perguntar(pedido)* mostra o aviso e devolve
 * {sim, sempre}. Com «Não voltar a perguntar nesta conversa» marcado e «Sim»,
 * a conversa fica com `pesquisaSemPerguntar` e as pesquisas seguintes dela já
 * não perguntam — *semPerguntar(pedido)* deixa à vista o que se pesquisou.
 * Numa conversa nova volta a perguntar; *aoMudar()* guarda a escolha.
 */
export function confirmacaoDaConversa(conversa, { perguntar, semPerguntar, aoMudar }) {
  return async (pedido) => {
    if (conversa.pesquisaSemPerguntar) {
      semPerguntar?.(pedido);
      return true;
    }
    const { sim, sempre } = await perguntar(pedido);
    if (sim && sempre) {
      conversa.pesquisaSemPerguntar = true;
      aoMudar?.();
    }
    return sim;
  };
}

const erro = (texto) => JSON.stringify({ error: texto });

async function resultadoDe(chamada, { confirmar, pesquisar }) {
  let argumentos;
  try {
    argumentos = JSON.parse(chamada.function.arguments || '{}');
  } catch {
    return erro('argumentos inválidos: não são JSON');
  }
  const pedido = pedidoDaPesquisa(chamada.function.name, argumentos);
  if (!pedido) return erro('pedido inválido: só há web_search(query) e fetch_page(url)');
  if (!(await confirmar(pedido))) return erro(PESQUISA_RECUSADA);
  try {
    return await pesquisar(chamada.function.name, argumentos);
  } catch (e) {
    // Sem saldo, a resposta acaba aqui (o ecrã diz porquê).
    if (String(e?.status) === '402') throw e;
    return erro(PESQUISA_FALHADA);
  }
}

/**
 * A resposta a uma conversa, com as rondas de pesquisa que o modelo pedir e
 * a pessoa confirmar. Devolve o texto final.
 *
 * - *mensagens*: as mensagens para o modelo (sistema incluído);
 * - *pedir(pedido)*: o fluxo da resposta (o SDK da Privatemode);
 * - *confirmar(pedido)*: true se a pessoa deixa sair a pesquisa (pedidoDaPesquisa);
 * - *pesquisar(nome, argumentos)*: o texto do resultado (o servidor do Recato);
 * - *aoEscrever(texto)*, *aoGastar(usage, pedido)*: o ecrã e o saldo (o consumo de cada
 *   ronda, com o número do pedido do carteiro, se o fluxo o trouxer);
 * - *ficheiros*: o Python do ecrã (python.js, com novoId), para create_file e
 *   append_to_file, e para confirmar a entrega (entrega, aquecer); *aoFicheiro(ficheiro, dados)* recebe cada
 *   ficheiro feito;
 * - *anexos*: {executar(nome, argumentos) → {saida, ficheiro}, comFichas, autor}:
 *   read_document, edit_document e, com fichas, procurar_nos_anexos;
 * - *pedidoDaPessoa*: o que a pessoa escreveu (os formatos que pediu); *jaEntregues*: os ficheiros que a resposta
 *   já tinha feito antes de o ecrã fechar (quem volta continua-a);
 * - *sinal*: o «Parar» da pessoa (AbortSignal), que também vai a *pedir(pedido, sinal)*: a resposta acaba em
 *   RespostaParada, com o texto que já tinha; *esperar*, *semRede* e *aoSemRede(tentativa)*: as novas tentativas de
 *   uma ronda que falhou pela rede ou pelo servidor (comTentativas).
 *
 * Uma resposta que anuncia um ficheiro que não fez (ou sem o formato pedido) tem uma ronda de reparação, como no
 * chat (ficheiros.js); se nem assim, acaba com o texto que o anunciava e o aviso.
 */
export async function responder({ mensagens, nivel, pedir, confirmar, pesquisar, aoEscrever, aoGastar, ficheiros,
  aoFicheiro, anexos, lingua, aoEtapa, sinal = null, esperar, semRede, aoSemRede, pedidoDaPessoa = '',
  jaEntregues = [] }) {
  const conversa = [...mensagens];
  // Os ficheiros desta resposta: o append_to_file só vale para eles.
  const feitos = [];
  // Os que ela entregou (create_file e cópias do edit_document) e se chamou alguma ferramenta que entrega.
  const entregues = new Map(jaEntregues.map((f) => [f.id, f]));
  let tentou = false;
  const aoFeito = (ficheiro, dados) => {
    entregues.set(ficheiro.id, ficheiro);
    aoFicheiro?.(ficheiro, dados);
  };
  const formatosEntregues = () => [...new Set([...entregues.values()].map((f) => f.formato).filter(Boolean))];
  // A ronda de reparação da entrega, se a houver: o texto que anunciava o ficheiro e a ronda em que acaba.
  let reparacao = null;
  // O texto que a pessoa já vê: com o «Parar», é com ele que a resposta acaba.
  let escrito = '';
  let aquecido = false;
  const aEscrever = (parcial) => {
    escrito = parcial;
    aoEscrever?.(parcial);
    // Um anúncio de ficheiro confirma-se no Python do ecrã: arranca já, enquanto a resposta chega.
    if (!aquecido && ficheiros?.aquecer && PODE_ANUNCIAR_FICHEIRO.test(parcial)) {
      aquecido = true;
      ficheiros.aquecer();
    }
  };
  /** Os formatos pedidos que faltam e se *texto* anuncia um ficheiro ({anuncia, em_falta}); null se o Python falhou. */
  const entrega = (texto) => ficheiros.entrega(texto, pedidoDaPessoa, formatosEntregues()).catch(() => null);
  const tentativas = { sinal, esperar, semRede, aoFalhar: aoSemRede, texto: () => escrito };
  for (let ronda = 0; ; ronda += 1) {
    if (sinal?.aborted) throw new RespostaParada(escrito);
    const ultima = reparacao ? ronda >= reparacao.ate : ronda >= MAX_RONDAS;
    const pedido = pedidoAoModelo(conversa, { nivel, ultima, comFicheiros: !!ficheiros,
      comFichas: !!anexos?.comFichas, soFicheiros: !!reparacao });
    const { fluxo, texto, chamadas, usage } = await comTentativas(async () => {
      const resposta = await pedir(pedido, sinal);
      return { fluxo: resposta, ...(await lerFluxo(resposta, aEscrever)) };
    }, tentativas);
    // O número do pedido do carteiro vai com o consumo: com uma resposta a
    // andar noutra conversa, os pedidos deixam de ser um de cada vez. Uma
    // ronda guardada lida outra vez (quem volta ao ecrã) já pode ter o
    // consumo dito: não se diz duas vezes (espera.js).
    if (usage && !fluxo?.gastoContado) aoGastar?.(usage, fluxo?.pedidoDoCarteiro ?? null);
    if (!chamadas.length || ultima) {
      if (reparacao) {
        const depois = entregues.size ? await entrega(texto) : null;
        if (entregues.size && !depois?.em_falta?.length) return texto;
        // Nem a reparação o fez: fica o texto que o anunciava, com o aviso (como no chat).
        const comAviso = (reparacao.texto.trim() ? `${reparacao.texto.trimEnd()}\n\n` : '')
          + avisoDaEntrega(entregues.size > 0, lingua);
        aEscrever(comAviso);
        return comAviso;
      }
      // Anunciado (ou tentado) e não entregue: UMA ronda de reparação, só com as ferramentas dos ficheiros.
      const falta = ficheiros?.entrega && (tentou || PODE_ANUNCIAR_FICHEIRO.test(texto)) ? await entrega(texto) : null;
      if (!falta || (!falta.anuncia && !tentou) || (entregues.size && !falta.em_falta.length)) return texto;
      if (sinal?.aborted) throw new RespostaParada(escrito);
      reparacao = { texto, ate: ronda + RONDAS_DA_REPARACAO };
      aoEtapa?.(aConfirmarOFicheiro(lingua));
      if (texto.trim()) conversa.push({ role: 'assistant', content: texto });
      conversa.push({ role: 'system', content: ordemDaEntrega(falta.em_falta, [...entregues.values()]) });
      continue;
    }
    // Cada pedido tem de levar o seu id de volta (o modelo pode não o dar).
    chamadas.forEach((chamada, i) => { chamada.id ||= `chamada_${ronda}_${i}`; });
    conversa.push({ role: 'assistant', content: texto || null, tool_calls: chamadas });
    for (const chamada of chamadas) {
      let conteudo;
      if (ENTREGAM.has(chamada.function.name)) tentou = true;
      if (ficheiros && FAZEM_FICHEIROS.has(chamada.function.name)) {
        let argumentos;
        try {
          argumentos = JSON.parse(chamada.function.arguments || '{}');
        } catch {
          argumentos = null;
        }
        conteudo = argumentos ? await ficheiroPedido(chamada.function.name, argumentos,
          { ficheiros, feitos, lingua, etapa: aoEtapa, aoFicheiro: aoFeito }) : erro('argumentos inválidos: não são JSON');
      } else if (anexos && (COM_OS_DOCUMENTOS.has(chamada.function.name)
        || chamada.function.name === FERRAMENTA_PROCURAR.function.name)) {
        let argumentos;
        try {
          argumentos = JSON.parse(chamada.function.arguments || '{}');
        } catch {
          argumentos = null;
        }
        if (!argumentos) {
          conteudo = erro('argumentos inválidos: não são JSON');
        } else {
          const r = await anexos.executar(chamada.function.name, argumentos);
          conteudo = r.saida;
          // A cópia editada é um ficheiro desta resposta, como os do create_file.
          if (r.ficheiro) aoFeito(ficheiroEditado(r.ficheiro, argumentos, anexos.autor), r.ficheiro.dados);
        }
      } else {
        conteudo = await resultadoDe(chamada, { confirmar, pesquisar });
      }
      // O «Parar» a meio de uma ferramenta (o Python não se interrompe): acaba aqui, sem a ronda seguinte.
      if (sinal?.aborted) throw new RespostaParada(escrito);
      conversa.push({ role: 'tool', tool_call_id: chamada.id, content: conteudo });
    }
  }
}
