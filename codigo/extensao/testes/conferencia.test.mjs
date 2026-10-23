// Testes da conferência da página privada.recato.ai (extensao/conferencia.js).
// Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { conferir, ficheiroDe, sha256, versoesPublicadas } from '../conferencia.js';

const h = (c) => c.repeat(64);
const V1 = { versao: '1.0.0', web: { 'index.html': h('a'), 'privada.js': h('b'), 'estilo.css': h('c') } };
const V2 = { versao: '1.1.0', web: { 'index.html': h('d'), 'privada.js': h('e'), 'estilo.css': h('c') } };

test('o ficheiro publicado de cada endereço, só da página privada', () => {
  assert.equal(ficheiroDe('https://privada.recato.ai/'), 'index.html');
  assert.equal(ficheiroDe('https://privada.recato.ai/privada.js?v=1'), 'privada.js');
  assert.equal(ficheiroDe('https://privada.recato.ai/privatemode.wasm'), 'privatemode.wasm');
  assert.equal(ficheiroDe('https://recato.ai/privada.js'), null);
  assert.equal(ficheiroDe('http://privada.recato.ai/'), null);
  assert.equal(ficheiroDe('lixo'), null);
});

test('as impressões digitais SHA-256', async () => {
  assert.equal(await sha256(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('só se aceitam manifestos com a forma certa', () => {
  assert.deepEqual(versoesPublicadas({ versoes: [V1, V2] }), [V1, V2]);
  for (const mau of [null, {}, { versoes: 'x' }, { versoes: [{ versao: '1', web: {} }] },
    { versoes: [{ versao: '1', web: { 'index.html': 'curta' } }] },
    { versoes: [{ versao: 1, web: { 'index.html': h('a') } }] }]) {
    assert.throws(() => versoesPublicadas(mau), JSON.stringify(mau));
  }
});

test('conferida: tudo igual a uma das versões publicadas', () => {
  assert.deepEqual(conferir({ 'index.html': h('d'), 'privada.js': h('e'), 'estilo.css': h('c') }, [V1, V2]),
    { estado: 'conferida', versao: '1.1.0' });
  assert.deepEqual(conferir({ 'index.html': h('a') }, [V1, V2]), { estado: 'conferida', versao: '1.0.0' },
    'Só a página (o resto ainda não chegou).');
});

test('diferente: uma página que não foi publicada, ou ficheiros de outra versão', () => {
  assert.deepEqual(conferir({ 'index.html': h('f') }, [V1, V2]), { estado: 'diferente', ficheiros: ['index.html'] });
  assert.deepEqual(conferir({ 'index.html': h('a'), 'privada.js': h('e'), 'extra.js': h('9') }, [V1, V2]),
    { estado: 'diferente', ficheiros: ['extra.js', 'privada.js'] });
});

test('incompleta: sem a própria página não se pode conferir', () => {
  assert.deepEqual(conferir({ 'privada.js': h('b') }, [V1]), { estado: 'incompleta' });
});

const C1 = { versao: '1.0.0', web: { 'index.html': h('a'), 'confirmar.html': h('1'), 'confirmar.css': h('2'),
  'licencas.txt': h('3') } };
const C2 = { versao: '1.0.1', web: { 'index.html': h('d'), 'confirmar.html': h('4'), 'confirm.html': h('5'),
  'confirmar.css': h('2'), 'licencas.txt': h('3') } };

test('«Como confirmar» e as licenças conferem-se a partir delas próprias', () => {
  assert.deepEqual(conferir({ 'confirm.html': h('5'), 'confirmar.css': h('2') }, [C1, C2], 'confirm.html'),
    { estado: 'conferida', versao: '1.0.1' });
  assert.deepEqual(conferir({ 'confirmar.html': h('1'), 'confirmar.css': h('2') }, [C1, C2], 'confirmar.html'),
    { estado: 'conferida', versao: '1.0.0' });
  assert.deepEqual(conferir({ 'licencas.txt': h('3') }, [C1, C2], 'licencas.txt'), { estado: 'conferida', versao: '1.0.1' },
    'Igual nas duas versões: diz a mais recente.');
  assert.deepEqual(conferir({ 'confirm.html': h('9'), 'confirmar.css': h('2') }, [C1, C2], 'confirm.html'),
    { estado: 'diferente', ficheiros: ['confirm.html'] });
  assert.deepEqual(conferir({ 'confirm.html': h('5'), 'index.html': h('a') }, [C1, C2], 'confirm.html'),
    { estado: 'diferente', ficheiros: ['index.html'] }, 'Tudo o que chegou tem de ser da mesma versão.');
  assert.deepEqual(conferir({ 'confirm.html': h('5') }, [C1], 'confirm.html'), { estado: 'incompleta' },
    'Um nome que nunca se publicou não diz nada.');
  assert.deepEqual(conferir({ 'confirmar.css': h('2') }, [C1, C2], 'confirm.html'), { estado: 'incompleta' });
});
