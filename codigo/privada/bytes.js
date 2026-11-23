// Bytes ↔ base64 e bytes aleatórios, para o resto do ecrã (as respostas à
// espera, a chave do browser, a parte nativa da app, as páginas dos PDF). Só
// WebCrypto e btoa/atob: corre igual no telemóvel e nos testes
// (privada/testes/bytes.test.mjs). Até 19/11/2026 viviam no cofre.js, com a
// cifra do histórico da conversa privada, que saiu nesse dia.

/** Bytes → base64. Aos bocados: `String.fromCharCode(...bytes)` de uma vez
 *  rebenta a pilha a partir de ≈150 KB (medido a 27/10/2026 no Chromium 130:
 *  «Maximum call stack size exceeded»). */
export function b64(bytes) {
  const lista = new Uint8Array(bytes);
  let texto = '';
  for (let i = 0; i < lista.length; i += 0x8000) texto += String.fromCharCode(...lista.subarray(i, i + 0x8000));
  return btoa(texto);
}
export const de64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
export const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));
