// Testes dos bytes do ecrã da conversa privada (privada/bytes.js).
// Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aleatorio, b64, de64 } from '../bytes.js';

test('base64 de ida e volta, também com muitos bytes, sem rebentar a pilha', () => {
  assert.equal(b64(new Uint8Array([0, 255, 128])), 'AP+A');
  assert.deepEqual(de64('AP+A'), new Uint8Array([0, 255, 128]));
  const bytes = new Uint8Array(400000).map((_v, i) => i % 256);
  assert.deepEqual(de64(b64(bytes)), bytes);
  assert.equal(b64(new Uint8Array(0)), '');
});

test('os bytes aleatórios têm o tamanho pedido e não se repetem', () => {
  assert.equal(aleatorio(32).length, 32);
  const vistos = new Set(Array.from({ length: 200 }, () => b64(aleatorio(16))));
  assert.equal(vistos.size, 200);
});
