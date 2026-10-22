// Testes da compilação da conversa privada (scripts/construir_privada.mjs):
// repetível, com as impressões digitais certas dentro da página, e a extensão
// bem formada para os dois browsers. Correm com: npm test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { construir } from '../construir_privada.mjs';

const sha256 = (dados) => createHash('sha256').update(dados).digest('hex');
const sri = (dados) => `sha384-${createHash('sha384').update(dados).digest('base64')}`;
const temporaria = () => fs.mkdtempSync(path.join(os.tmpdir(), 'privada-'));

test('duas compilações dão exatamente os mesmos ficheiros', async () => {
  const [a, b] = [temporaria(), temporaria()];
  try {
    const primeira = await construir({ dist: a, app: false });
    const segunda = await construir({ dist: b, app: false });
    assert.deepEqual(primeira, segunda);
    assert.equal(fs.readFileSync(path.join(a, 'manifesto.json'), 'utf8'),
      fs.readFileSync(path.join(b, 'manifesto.json'), 'utf8'));
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

test('a página, a web e as duas extensões trazem o MESMO ecrã, preso pelas impressões digitais', async () => {
  const dist = temporaria();
  try {
    const manifesto = await construir({ dist, app: false });
    const web = (f) => fs.readFileSync(path.join(dist, 'web', f));
    const pagina = web('index.html').toString();
    assert.ok(pagina.includes(`src="privada.js" integrity="${sri(web('privada.js'))}"`));
    assert.ok(pagina.includes(`href="estilo.css" integrity="${sri(web('estilo.css'))}"`));
    assert.ok(web('privada.js').toString().includes(sha256(web('privatemode.wasm'))),
      'O privada.js traz a impressão digital do módulo da caixa-forte.');
    for (const ficheiro of ['index.html', 'estilo.css', 'privada.js', 'privatemode.wasm', 'licencas.txt']) {
      const impressao = manifesto.web[ficheiro];
      assert.equal(impressao, sha256(web(ficheiro)));
      assert.equal(manifesto.app[`assets/privada/${ficheiro}`], impressao, `app: ${ficheiro}`);
      assert.equal(manifesto.extensao.chrome[`privada/${ficheiro}`], impressao, `chrome: ${ficheiro}`);
      assert.equal(manifesto.extensao.firefox[`privada/${ficheiro}`], impressao, `firefox: ${ficheiro}`);
    }
    const confirmar = web('confirmar.html').toString();
    assert.ok(confirmar.includes(manifesto.web['privada.js']), '«Como confirmar» mostra as impressões digitais.');
    assert.ok(!confirmar.includes('{{'), 'Sem marcas por preencher.');
    const licencas = web('licencas.txt').toString();
    for (const aviso of ['Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda', 'Edgeless Systems GmbH',
      'The Go Authors', 'Apache License']) {
      assert.ok(licencas.includes(aviso), `As licenças falam de ${aviso}.`);
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('a extensão: Chrome com service worker, Firefox a ler os bytes ao passarem', async () => {
  const dist = temporaria();
  try {
    await construir({ dist, app: false });
    const ler = (navegador) => JSON.parse(fs.readFileSync(path.join(dist, `extensao-${navegador}`, 'manifest.json')));
    const chrome = ler('chrome');
    const firefox = ler('firefox');
    assert.equal(chrome.manifest_version, 3);
    assert.equal(chrome.version, JSON.parse(fs.readFileSync(new URL('../../privada/package.json', import.meta.url))).version);
    assert.deepEqual(chrome.background, { service_worker: 'fundo.js', type: 'module' });
    assert.deepEqual(chrome.permissions, ['storage'], 'No Chrome não pede mais do que precisa.');
    assert.deepEqual(firefox.background, { scripts: ['fundo.js'], type: 'module' });
    assert.ok(firefox.permissions.includes('webRequestFilterResponse'));
    assert.equal(firefox.browser_specific_settings.gecko.id, 'conversa-privada@recato.ai');
    for (const m of [chrome, firefox]) {
      assert.deepEqual(m.host_permissions, ['https://recato.ai/*', 'https://*.recato.ai/*']);
      assert.ok(m.content_security_policy.extension_pages.includes("'wasm-unsafe-eval'"));
      assert.deepEqual(m.content_scripts.map((c) => c.js[0]), ['recato.js', 'conferir.js']);
      assert.deepEqual(m.content_scripts[0].exclude_matches, ['https://privada.recato.ai/*']);
    }
    const fundo = fs.readFileSync(path.join(dist, 'extensao-chrome', 'fundo.js'), 'utf8');
    assert.ok(fundo.includes('https://publico.recato.test/manifestos.json'), 'O sítio público das impressões digitais.');
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('produção aponta para o repositório público; sem endereços não se compila', async () => {
  const enderecos = JSON.parse(fs.readFileSync(new URL('../../privada/publicacao.json', import.meta.url)));
  assert.deepEqual(enderecos.producao, {
    manifestos: 'https://raw.githubusercontent.com/Forsnaps/recato-private-chat/main/manifestos.json',
    repositorio: 'https://github.com/Forsnaps/recato-private-chat',
  });
  const dist = temporaria();
  try {
    await assert.rejects(construir({ publicacao: 'inexistente', dist, app: false }), /publicacao\.json/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
