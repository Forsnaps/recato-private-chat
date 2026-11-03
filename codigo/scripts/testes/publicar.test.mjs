// Testes da publicação da conversa privada (scripts/publicar_privada.mjs).
// Correm com: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { versoesPublicadas } from '../../extensao/conferencia.js';
import { comAExcecao, EXCECAO_DA_LICENCA, juntarVersao, publicar } from '../publicar_privada.mjs';

const M1 = { versao: '1.0.0', web: { 'index.html': 'a'.repeat(64) } };

test('uma versão publicada nunca muda', () => {
  const publicadas = { versoes: [] };
  assert.equal(juntarVersao(publicadas, M1, '2026-10-22T10:00:00Z'), true);
  assert.equal(juntarVersao(publicadas, structuredClone(M1), '2026-10-23T10:00:00Z'), false, 'Igual: nada muda.');
  assert.deepEqual(publicadas.versoes, [{ ...M1, publicada: '2026-10-22T10:00:00Z' }]);
  assert.throws(() => juntarVersao(publicadas, { ...M1, web: { 'index.html': 'b'.repeat(64) } }, 'x'),
    /já foi publicada com outros ficheiros/);
});

const MIT = 'MIT License\n\nCopyright (c) 2026 Forsnaps AI\n\nTHE SOFTWARE IS PROVIDED "AS IS".\n';

test('o LICENSE do repositório público leva a exceção do código do chat: uma só vez, e a de agora', () => {
  const com = comAExcecao(MIT);
  assert.equal(com, `${MIT.trimEnd()}\n\n${EXCECAO_DA_LICENCA}`);
  assert.equal(comAExcecao(com), com, 'Outra vez: fica igual.');
  assert.equal(comAExcecao(com.replace('apenas para verificação', 'texto antigo')), com,
    'Uma exceção antiga dá lugar à de agora.');
  assert.match(EXCECAO_DA_LICENCA, /todos os direitos reservados/);
  assert.match(EXCECAO_DA_LICENCA, /codigo\/privada\/licencas\.txt/);
});

test('publicar: compila duas vezes, junta a versão ao manifestos.json e copia o código', async () => {
  const repositorio = fs.mkdtempSync(path.join(os.tmpdir(), 'privada-publico-'));
  const licenca = path.join(repositorio, 'LICENSE');
  fs.writeFileSync(licenca, MIT);
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
    assert.match(fs.readFileSync(path.join(repositorio, 'codigo', 'privada', 'python', 'privada_anexos.py'), 'utf8'),
      /^# Copyright \(c\) 2026 Forsnaps AI[^\n]*\n# Todos os direitos reservados/);
    assert.equal(fs.readFileSync(licenca, 'utf8'), comAExcecao(MIT));
    const segunda = await publicar({ repositorio, quando: '2026-10-23T10:00:00Z' });
    assert.equal(segunda.nova, false, 'Publicar outra vez a mesma versão não a duplica.');
    assert.equal(fs.readFileSync(licenca, 'utf8'), comAExcecao(MIT), 'Nem a exceção do LICENSE.');
  } finally {
    fs.rmSync(repositorio, { recursive: true, force: true });
  }
});
