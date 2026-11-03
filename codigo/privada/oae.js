// Abrir uma resposta guardada da caixa-forte (28/10/2026, pedido do Pedro:
// fechar o separador não interrompe a resposta — quem volta tem-na lá).
//
// O servidor do Recato continua a receber a resposta depois de o ecrã fechar
// e guarda-a tal como vem, cifrada; não a consegue ler. Quem a abre é este
// código, quando a pessoa volta, com o segredo que só este ecrã tem (o do SDK
// da Privatemode, que ele dá a cada segredo novo: onSecretUpdate) e os dois
// sais que viajam em claro nos cabeçalhos do pedido e da resposta.
//
// A cifra é a da Privatemode, «Online Authenticated Encryption» (código aberto,
// MIT: github.com/edgelesssys/privatemode-public, internal/oss/oae e
// internal/oss/encbody), a mesma que o SDK usa lá dentro:
// * a chave da resposta = HKDF-SHA256 (sal = o sal do pedido, segredo = o do
//   SDK) expandida com «privatemode oae response key\0» + o sal da resposta;
// * o corpo são quadros [tamanho u32 big-endian][mensagem selada]; cada
//   mensagem é [1 byte: final][IV de 12 bytes][AES-256-GCM com a etiqueta], e
//   autentica-se contra o seu número de ordem e o byte final (AAD), por isso
//   uma resposta cortada, trocada ou repetida não abre;
// * o 1.º quadro é o cabeçalho da aplicação (JSON), os seguintes um evento
//   SSE cada (os pedaços do modelo, como no fluxo do SDK) e o último, vazio,
//   fecha a resposta.

const INFO_DA_RESPOSTA = 'privatemode oae response key\0';
const TAMANHO_DO_SAL = 32;
const TAMANHO_DO_SEGREDO = 32;
const IV = 12;
const ETIQUETA = 16;
/** O mais pequeno que uma mensagem selada pode ser (o byte final, o IV e a etiqueta). */
export const SOBRA_DA_MENSAGEM = 1 + IV + ETIQUETA;
/** Um quadro maior do que isto não é uma resposta do modelo: pára-se. */
const MAX_QUADRO = 16 * 1024 * 1024;

function erro(codigo) {
  return Object.assign(new Error(`oae: ${codigo}`), { codigo });
}

/** Os bytes de um cabeçalho OAE («:<base64>:», RFC 9651). */
export function bytesDoCabecalho(valor) {
  const texto = String(valor || '').trim();
  if (texto.length < 2 || !texto.startsWith(':') || !texto.endsWith(':')) throw erro('cabecalho');
  const binario = atob(texto.slice(1, -1));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  if (bytes.length !== TAMANHO_DO_SAL) throw erro('cabecalho');
  return bytes;
}

/** A chave AES-GCM da resposta: só decifra, e não se tira deste ecrã. */
export async function chaveDaResposta(segredo, salDoPedido, salDaResposta) {
  if (!(segredo instanceof Uint8Array) || segredo.length !== TAMANHO_DO_SEGREDO) throw erro('segredo');
  const prefixo = new TextEncoder().encode(INFO_DA_RESPOSTA);
  const info = new Uint8Array(prefixo.length + salDaResposta.length);
  info.set(prefixo);
  info.set(salDaResposta, prefixo.length);
  const base = await crypto.subtle.importKey('raw', segredo, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salDoPedido, info }, base,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

/** O AAD da mensagem número *ordem*: a ordem (u32 big-endian) e o byte final. */
function aad(ordem, final) {
  const bytes = new Uint8Array(5);
  new DataView(bytes.buffer).setUint32(0, ordem);
  bytes[4] = final;
  return bytes;
}

/** Abre as mensagens da resposta pela ordem: cada uma só abre no seu lugar, e
 *  depois da final não há mais. */
export function criarAbridor(chave) {
  let ordem = 0;
  let fechada = false;
  return {
    get fechada() {
      return fechada;
    },
    /** {texto (bytes), final} da mensagem selada seguinte. */
    async abrir(selada) {
      if (fechada) throw erro('depois_do_fim');
      if (selada.length < SOBRA_DA_MENSAGEM) throw erro('mensagem');
      const final = selada[0];
      if (final !== 0 && final !== 1) throw erro('mensagem');
      let texto;
      try {
        texto = new Uint8Array(await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: selada.subarray(1, 1 + IV), additionalData: aad(ordem, final) },
          chave, selada.subarray(1 + IV)));
      } catch {
        throw erro('autenticacao');
      }
      ordem += 1;
      if (final === 1) fechada = true;
      return { texto, final: final === 1 };
    },
  };
}

/** Os quadros completos que já chegaram (*bytes*): {quadros, resto} — o resto
 *  é o começo do quadro seguinte, que ainda vem a caminho. */
export function lerQuadros(bytes) {
  const quadros = [];
  let i = 0;
  while (bytes.length - i >= 4) {
    const tamanho = new DataView(bytes.buffer, bytes.byteOffset + i, 4).getUint32(0);
    if (tamanho > MAX_QUADRO) throw erro('quadro');
    if (bytes.length - i - 4 < tamanho) break;
    quadros.push(bytes.subarray(i + 4, i + 4 + tamanho));
    i += 4 + tamanho;
  }
  return { quadros, resto: bytes.subarray(i) };
}

/** Os dados de um evento SSE (as linhas «data:»), ou null se não tiver. */
export function dadosDoEvento(evento) {
  const linhas = evento.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, ''));
  return linhas.length ? linhas.join('\n') : null;
}

function juntar(a, b) {
  if (!a.length) return b;
  const tudo = new Uint8Array(a.length + b.length);
  tudo.set(a);
  tudo.set(b, a.length);
  return tudo;
}

/**
 * Os pedaços do modelo (como os do fluxo do SDK) de uma resposta guardada.
 *
 * - *segredo*: os bytes do segredo do SDK com que o pedido se fez;
 * - *cabecalhoDoPedido* e *cabecalhoDaResposta*: os valores de
 *   Privatemode-OAE-Request-Header e Privatemode-OAE-Response-Header;
 * - *bytes*: os bytes cifrados, aos bocados, como chegam (async iterable).
 *
 * Acaba em erro 'cortada' se os bytes acabarem antes da mensagem final.
 */
export async function* pedacosDaResposta({ segredo, cabecalhoDoPedido, cabecalhoDaResposta, bytes }) {
  const chave = await chaveDaResposta(segredo, bytesDoCabecalho(cabecalhoDoPedido),
    bytesDoCabecalho(cabecalhoDaResposta));
  const abridor = criarAbridor(chave);
  const texto = new TextDecoder();
  let resto = new Uint8Array(0);
  let cabecalho = true;
  for await (const bocado of bytes) {
    const lidos = lerQuadros(juntar(resto, bocado));
    resto = lidos.resto.slice();
    for (const quadro of lidos.quadros) {
      const { texto: aberto, final } = await abridor.abrir(quadro);
      if (cabecalho) {
        // O cabeçalho da aplicação (o tipo do conteúdo): não leva nada do modelo.
        cabecalho = false;
      } else if (aberto.length) {
        const dados = dadosDoEvento(texto.decode(aberto));
        if (dados && dados !== '[DONE]') yield JSON.parse(dados);
      }
      if (final) return;
    }
  }
  throw erro('cortada');
}
