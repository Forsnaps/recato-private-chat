// Testes do ecrã da conversa privada fora da app (privada/navegador.js e
// privada/plataforma.js): a sessão da página web e da extensão, e a chave do
// browser. Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aleatorio } from '../cofre.js';
import {
  carteiroValido, criarChaveDoNavegador, sessaoDaExtensao, sessaoDaLigacao,
} from '../navegador.js';
import { ondeCorre } from '../plataforma.js';

/** Uma janela de browser a fingir, com a ligação e o armazenamento do separador. */
function janela(ligacao) {
  const url = new URL(ligacao);
  const separador = new Map();
  const historico = [];
  return {
    historico,
    location: {
      get hash() { return url.hash; },
      get pathname() { return url.pathname; },
      get search() { return url.search; },
      protocol: url.protocol,
    },
    history: {
      replaceState(_estado, _titulo, nova) {
        historico.push(nova);
        url.hash = '';
      },
    },
    sessionStorage: {
      getItem: (k) => separador.get(k) ?? null,
      setItem: (k, v) => separador.set(k, String(v)),
    },
  };
}

test('só um Recato verdadeiro serve de carteiro', () => {
  assert.equal(carteiroValido('https://recato.ai'), 'https://recato.ai');
  assert.equal(carteiroValido('https://ana.recato.ai/'), 'https://ana.recato.ai');
  for (const mau of ['http://recato.ai', 'https://recato.ai.mau.pt', 'https://mau-recato.ai', 'https://privada.recato.ai',
    'https://recato.ai:8443', 'https://x@recato.ai', 'javascript:alert(1)', '', null]) {
    assert.equal(carteiroValido(mau), null, String(mau));
  }
});

test('página web: a sessão vem depois do «#», sai logo da ligação e fica no separador', () => {
  const j = janela('https://privada.recato.ai/?x=1#sessao=s-1&carteiro=https%3A%2F%2Fana.recato.ai&prazo=43200');
  const sessao = sessaoDaLigacao(j);
  assert.equal(sessao.sessao, 's-1');
  assert.equal(sessao.carteiro, 'https://ana.recato.ai');
  assert.ok(sessao.prazo > 43190 && sessao.prazo <= 43200);
  assert.deepEqual(j.historico, ['/?x=1'], 'A sessão saiu da ligação.');
  assert.equal(sessaoDaLigacao(j).sessao, 's-1', 'Recarregar a página: vem do separador.');
});

test('página web: sem sessão, ou com um carteiro que não é o Recato, não arranca', () => {
  assert.throws(() => sessaoDaLigacao(janela('https://privada.recato.ai/')), (e) => e.codigo === 'sem_sessao');
  const j = janela('https://privada.recato.ai/#sessao=s-1&carteiro=https%3A%2F%2Fmau.pt&prazo=60');
  assert.throws(() => sessaoDaLigacao(j), (e) => e.codigo === 'sem_sessao');
  assert.throws(() => sessaoDaLigacao(j), (e) => e.codigo === 'sem_sessao', 'E não ficou guardada.');
});

test('extensão: a sessão que o fundo guardou, pelo número da ligação', async () => {
  const api = { storage: { session: { get: async (k) => (k === 'n-1'
    ? { 'n-1': { sessao: 's-2', carteiro: 'https://recato.ai', expira: Date.now() / 1000 + 100 } } : {}) } } };
  const sessao = await sessaoDaExtensao(api, janela('chrome-extension://abc/privada/index.html#n-1'));
  assert.deepEqual([sessao.sessao, sessao.carteiro], ['s-2', 'https://recato.ai']);
  await assert.rejects(sessaoDaExtensao(api, janela('chrome-extension://abc/privada/index.html#n-9')),
    (e) => e.codigo === 'sem_sessao');
});

test('a chave do browser: não se exporta, fecha e abre, e a de outro browser não abre', async () => {
  const guardadas = new Map();
  const armazem = { ler: async (k) => guardadas.get(k), gravar: async (k, v) => guardadas.set(k, v) };
  const aqui = criarChaveDoNavegador(armazem);
  await assert.rejects(aqui.abrir('AAAA'), (e) => e.codigo === 'sem_chave');
  const mestra = aleatorio(32);
  const fechada = await aqui.fechar(mestra);
  assert.deepEqual(await aqui.abrir(fechada), mestra);
  assert.equal(guardadas.size, 1);
  const chave = [...guardadas.values()][0];
  assert.equal(chave.extractable, false, 'A chave não se pode tirar do browser.');
  await assert.rejects(crypto.subtle.exportKey('raw', chave));
  const outroBrowser = criarChaveDoNavegador({ ler: async () => undefined, gravar: async () => {} });
  await outroBrowser.fechar(aleatorio(32));
  await assert.rejects(outroBrowser.abrir(fechada));
});

test('onde corre o ecrã: app, extensão ou página web', () => {
  assert.equal(ondeCorre({ RecatoNativo: {}, location: { protocol: 'https:' } }), 'app');
  assert.equal(ondeCorre({ location: { protocol: 'chrome-extension:' } }), 'extensao');
  assert.equal(ondeCorre({ location: { protocol: 'moz-extension:' } }), 'extensao');
  assert.equal(ondeCorre({ location: { protocol: 'https:' } }), 'web');
});
