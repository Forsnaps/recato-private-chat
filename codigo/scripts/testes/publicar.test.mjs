// Testes da publicação da conversa privada (scripts/publicar_privada.mjs).
// Correm com: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { versoesPublicadas } from '../../extensao/conferencia.js';
import { juntarVersao, publicar } from '../publicar_privada.mjs';

const M1 = { versao: '1.0.0', web: { 'index.html': 'a'.repeat(64) } };

test('uma versão publicada nunca muda', () => {
  const publicadas = { versoes: [] };
  assert.equal(juntarVersao(publicadas, M1, '2026-10-22T10:00:00Z'), true);
  assert.equal(juntarVersao(publicadas, structuredClone(M1), '2026-10-23T10:00:00Z'), false, 'Igual: nada muda.');
  assert.deepEqual(publicadas.versoes, [{ ...M1, publicada: '2026-10-22T10:00:00Z' }]);
  assert.throws(() => juntarVersao(publicadas, { ...M1, web: { 'index.html': 'b'.repeat(64) } }, 'x'),
    /já foi publicada com outros ficheiros/);
});

test('publicar: compila duas vezes, junta a versão ao manifestos.json e copia o código', async () => {
  const repositorio = fs.mkdtempSync(path.join(os.tmpdir(), 'privada-publico-'));
  try {
    const primeira = await publicar({ repositorio, quando: '2026-10-22T10:00:00Z' });
    assert.equal(primeira.nova, true);
    const publicadas = JSON.parse(fs.readFileSync(path.join(repositorio, 'manifestos.json'), 'utf8'));
    assert.equal(versoesPublicadas(publicadas).length, 1, 'A extensão aceita o que se publica.');
    assert.ok(fs.existsSync(path.join(repositorio, 'versoes', `${primeira.versao}.json`)));
    for (const parte of ['privada/privada.js', 'extensao/fundo.js', 'scripts/construir_privada.mjs', 'package-lock.json']) {
      assert.ok(fs.existsSync(path.join(repositorio, 'codigo', parte)), parte);
    }
    assert.ok(!fs.existsSync(path.join(repositorio, 'codigo', 'privada', 'node_modules')));
    const segunda = await publicar({ repositorio, quando: '2026-10-23T10:00:00Z' });
    assert.equal(segunda.nova, false, 'Publicar outra vez a mesma versão não a duplica.');
  } finally {
    fs.rmSync(repositorio, { recursive: true, force: true });
  }
});
