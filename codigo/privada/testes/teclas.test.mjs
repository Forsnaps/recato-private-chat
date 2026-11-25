// Testes da tecla de enviar na caixa de escrita da conversa privada (privada/teclas.js, 23/11/2026): o Enter envia e o
// Shift+Enter muda de linha, como no chat do Recato e no Recato Code. Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { teclaDaCaixa } from '../teclas.js';

const enter = (teclas = {}) => ({ key: 'Enter', ...teclas });
const comTeclado = { comTeclado: true };

test('com teclado, o Enter envia e o Shift+Enter muda de linha', () => {
  assert.equal(teclaDaCaixa(enter(), comTeclado), 'enviar');
  assert.equal(teclaDaCaixa(enter({ shiftKey: true }), comTeclado), null, 'A linha nova fica para o browser.');
  assert.equal(teclaDaCaixa(enter({ altKey: true }), comTeclado), null);
});

test('o Ctrl/Cmd+Enter também envia e, com Shift, a pensar ao máximo', () => {
  assert.equal(teclaDaCaixa(enter({ ctrlKey: true }), comTeclado), 'enviar');
  assert.equal(teclaDaCaixa(enter({ metaKey: true }), comTeclado), 'enviar');
  assert.equal(teclaDaCaixa(enter({ ctrlKey: true, shiftKey: true }), comTeclado), 'maximo');
  assert.equal(teclaDaCaixa(enter({ metaKey: true, shiftKey: true }), comTeclado), 'maximo');
});

test('a meio de um acento ou de um teclado asiático o Enter é da composição', () => {
  assert.equal(teclaDaCaixa(enter({ isComposing: true }), comTeclado), null);
  assert.equal(teclaDaCaixa(enter({ keyCode: 229 }), comTeclado), null, 'O Safari só o diz pelo keyCode 229.');
  assert.equal(teclaDaCaixa(enter({ ctrlKey: true, isComposing: true }), comTeclado), null);
});

test('no telemóvel o Enter do teclado do ecrã muda de linha; envia o botão', () => {
  assert.equal(teclaDaCaixa(enter(), { comTeclado: false }), null);
  assert.equal(teclaDaCaixa(enter({ shiftKey: true }), { comTeclado: false }), null);
});

test('as outras teclas ficam para o browser', () => {
  assert.equal(teclaDaCaixa({ key: 'a' }, comTeclado), null);
  assert.equal(teclaDaCaixa({ key: 'Tab', ctrlKey: true }, comTeclado), null);
});
