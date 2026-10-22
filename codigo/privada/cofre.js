// A cifra do histórico da conversa privada (22/10/2026). Só WebCrypto, sem
// ecrã: corre igual no telemóvel e nos testes (privada/testes/cofre.test.mjs).
//
// Cada pessoa tem uma chave mestra aleatória, criada no telemóvel, que cifra
// as conversas (AES-GCM). Há duas cópias FECHADAS dela:
//
// * a de cada telemóvel, fechada pela chave do chip de segurança dele, que
//   só esta app pode usar e nunca sai de lá (ConversaPrivadaActivity); fica
//   só no telemóvel e abre o histórico sem pedir nada;
// * a do servidor, fechada com o código de recuperação: 25 letras aleatórias
//   (125 bits) que só a pessoa vê, passadas por PBKDF2. É a que abre o
//   histórico num telemóvel novo.
//
// Sem o telemóvel ou o código, as cópias e as conversas são ilegíveis — para
// o Recato também.

const TEXTO = new TextEncoder();
const DE_TEXTO = new TextDecoder();
const PBKDF2_VOLTAS = 310000;
// Base32 de Crockford: sem I, L, O nem U, para não se confundirem ao copiar.
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LETRAS_DO_CODIGO = 25;

export const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const de64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
export const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

export function gerarChaveMestra() {
  return aleatorio(32);
}

async function chaveAes(bytes) {
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function fechar(chave, bytes) {
  const iv = aleatorio(12);
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, bytes);
  return { iv: b64(iv), chave: b64(cifrado) };
}

async function abrir(chave, embrulho) {
  const aberto = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: de64(embrulho.iv) }, chave, de64(embrulho.chave));
  return new Uint8Array(aberto);
}

async function chaveDoCodigo(codigo, sal) {
  const base = await crypto.subtle.importKey('raw', TEXTO.encode(normalizarCodigo(codigo)), 'PBKDF2', false,
    ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: PBKDF2_VOLTAS },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** 25 letras aleatórias em 5 grupos: ABCDE-FGHJK-… */
export function gerarCodigo() {
  const letras = Array.from(aleatorio(LETRAS_DO_CODIGO), (b) => ALFABETO[b & 31]).join('');
  return letras.match(/.{5}/g).join('-');
}

/** O código como a pessoa o escrever: sem espaços nem traços, e as letras
 *  que se confundem trocadas pelas certas (O→0, I e L→1). */
export function normalizarCodigo(texto) {
  return String(texto || '').toUpperCase().replace(/[\s-]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function codigoValido(texto) {
  const limpo = normalizarCodigo(texto);
  return limpo.length === LETRAS_DO_CODIGO && [...limpo].every((c) => ALFABETO.includes(c));
}

/** A cópia da chave mestra fechada com o código de recuperação. */
export async function fecharComCodigo(mestra, codigo) {
  const sal = aleatorio(16);
  return { tipo: 'recuperacao', sal: b64(sal), ...(await fechar(await chaveDoCodigo(codigo, sal), mestra)) };
}

export async function abrirComCodigo(embrulho, codigo) {
  return abrir(await chaveDoCodigo(codigo, de64(embrulho.sal)), embrulho);
}

/** Cifra um objeto (uma conversa, um título) com a chave mestra. */
export async function cifrar(mestra, objeto) {
  const { iv, chave } = await fechar(await chaveAes(mestra), TEXTO.encode(JSON.stringify(objeto)));
  return { iv, dados: chave };
}

export async function decifrar(mestra, { iv, dados }) {
  return JSON.parse(DE_TEXTO.decode(await abrir(await chaveAes(mestra), { iv, chave: dados })));
}
