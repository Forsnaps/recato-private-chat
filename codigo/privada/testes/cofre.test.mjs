// Testes da cifra do histórico da conversa privada (privada/cofre.js).
// Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  abrirComCodigo, cifrar, codigoValido, de64, decifrar, fecharComCodigo, gerarChaveMestra, gerarCodigo,
  normalizarCodigo,
} from '../cofre.js';

test('o código de recuperação: formato, como se escreve e só ele abre', async () => {
  const codigo = gerarCodigo();
  assert.match(codigo, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  assert.ok(codigoValido(codigo));
  assert.ok(codigoValido(codigo.toLowerCase().replace(/-/g, ' ')), 'Em minúsculas e com espaços.');
  assert.equal(normalizarCodigo('o0 il-1'), '00111');
  assert.ok(!codigoValido('ABC'));
  const mestra = gerarChaveMestra();
  const embrulho = await fecharComCodigo(mestra, codigo);
  assert.equal(embrulho.tipo, 'recuperacao');
  assert.deepEqual(await abrirComCodigo(embrulho, ` ${codigo.toLowerCase()} `), mestra);
  await assert.rejects(abrirComCodigo(embrulho, gerarCodigo()), 'Outro código não abre.');
  assert.notDeepEqual(de64(embrulho.chave).slice(0, 32), mestra, 'A cópia vai fechada.');
});

test('dois códigos gerados nunca são iguais', () => {
  const vistos = new Set(Array.from({ length: 200 }, gerarCodigo));
  assert.equal(vistos.size, 200);
});

test('as conversas cifradas só se leem com a chave mestra e não se alteram', async () => {
  const mestra = gerarChaveMestra();
  const conversa = { titulo: 'Jantares rápidos', mensagens: [{ papel: 'eu', texto: 'Olá «Recato» 😊' }] };
  const a = await cifrar(mestra, conversa);
  const b = await cifrar(mestra, conversa);
  assert.notEqual(a.iv, b.iv, 'Cada vez com um IV novo.');
  assert.notEqual(a.dados, b.dados);
  assert.deepEqual(await decifrar(mestra, a), conversa);
  await assert.rejects(decifrar(gerarChaveMestra(), a), 'Outra chave não lê.');
  const estragado = de64(a.dados);
  estragado[0] ^= 1;
  await assert.rejects(decifrar(mestra, { iv: a.iv, dados: Buffer.from(estragado).toString('base64') }),
    'Um byte mudado é recusado.');
});
