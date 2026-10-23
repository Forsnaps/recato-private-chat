// Testes das regras do fundo da extensão (extensao/fundo_regras.js), com a
// API do browser a fingir. Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  abrirConversa, conferirSeparador, obterVersoes, PAGINA_DA_EXTENSAO, separadorFechado,
} from '../fundo_regras.js';

const h = (c) => c.repeat(64);
const V1 = { versao: '1.0.0', web: { 'index.html': h('a'), 'privada.js': h('b') } };

function apiFalsa() {
  const sessao = new Map();
  const local = new Map();
  const separadores = [];
  const icone = {};
  const loja = (mapa) => ({
    get: async (k) => (Array.isArray(k) ? Object.fromEntries(k.map((c) => [c, mapa.get(c)])) : (mapa.has(k) ? { [k]: mapa.get(k) } : {})),
    set: async (obj) => Object.entries(obj).forEach(([k, v]) => mapa.set(k, v)),
    remove: async (ks) => [].concat(ks).forEach((k) => mapa.delete(k)),
  });
  return {
    sessao, local, separadores, icone,
    storage: { session: loja(sessao), local: loja(local) },
    tabs: { update: async (id, { url }) => { separadores.push([id, url]); return { id }; } },
    runtime: { getURL: (c) => `chrome-extension://abc/${c}` },
    action: {
      setBadgeText: async ({ tabId, text }) => { icone[tabId] = { ...icone[tabId], text }; },
      setBadgeBackgroundColor: async ({ tabId, color }) => { icone[tabId] = { ...icone[tabId], color }; },
    },
  };
}

test('abrir: só o Recato da própria conta abre, no mesmo separador, e a sessão fica só em memória', async () => {
  const api = apiFalsa();
  const dados = { sessao: 's-1', carteiro: 'https://ana.recato.ai', prazo: 600 };
  const doRecato = { url: 'https://ana.recato.ai/odoo', tab: { id: 41 } };
  assert.deepEqual(await abrirConversa(api, dados, doRecato, 1_000_000), { aberta: true });
  assert.equal(api.separadores.length, 1);
  const [[separador, ligacao]] = api.separadores;
  assert.equal(separador, 41, 'O mesmo separador do Recato.');
  assert.ok(ligacao.startsWith(`chrome-extension://abc/${PAGINA_DA_EXTENSAO}#`), 'O ecrã que vem na extensão.');
  const numero = ligacao.split('#')[1];
  assert.deepEqual(api.sessao.get(numero), { sessao: 's-1', carteiro: 'https://ana.recato.ai', expira: 1600 });
  assert.equal(api.sessao.get('separador:41'), numero);

  // Voltou ao Recato e abriu outra vez: a sessão anterior desse separador sai.
  await abrirConversa(api, { ...dados, sessao: 's-2' }, doRecato, 1_000_000);
  assert.equal(api.sessao.has(numero), false);
  assert.equal(api.sessao.size, 2, 'Só a sessão nova e o separador.');

  for (const [mau, remetente] of [
    [dados, { url: 'https://rui.recato.ai/odoo', tab: { id: 42 } }],
    [dados, { url: 'https://mau.pt/', tab: { id: 42 } }],
    [{ ...dados, carteiro: 'https://mau.pt' }, { url: 'https://mau.pt/', tab: { id: 42 } }],
    [{ ...dados, sessao: '' }, { url: 'https://ana.recato.ai/', tab: { id: 42 } }],
    [dados, { url: 'https://ana.recato.ai/' }],
  ]) {
    assert.deepEqual(await abrirConversa(api, mau, remetente), { aberta: false }, JSON.stringify([mau, remetente]));
  }
  assert.equal(api.separadores.length, 2, 'Nenhum outro separador mudou.');

  await separadorFechado(api, 41);
  assert.equal(api.sessao.size, 0, 'Fechado o separador, a sessão apagou-se.');
});

test('as versões publicadas vêm do sítio público e guardam-se 10 minutos', async () => {
  const api = apiFalsa();
  const pedidos = [];
  const buscar = async (url, opcoes) => {
    pedidos.push([url, opcoes]);
    return { ok: true, json: async () => ({ versoes: [V1] }) };
  };
  assert.deepEqual(await obterVersoes(api, buscar, 'https://publico/manifestos.json', 0), [V1]);
  assert.deepEqual(await obterVersoes(api, buscar, 'https://publico/manifestos.json', 9 * 60 * 1000), [V1]);
  assert.equal(pedidos.length, 1);
  assert.deepEqual(pedidos[0][1], { cache: 'no-store', credentials: 'omit' });
  await obterVersoes(api, buscar, 'https://publico/manifestos.json', 11 * 60 * 1000);
  assert.equal(pedidos.length, 2);
  await assert.rejects(obterVersoes(apiFalsa(), async () => ({ ok: false, status: 404 }), 'https://x', 0), /404/);
});

test('conferir: o ícone e o popup recebem o resultado; o Firefox usa os bytes exatos', async () => {
  const api = apiFalsa();
  const versoes = async () => [V1];
  let r = await conferirSeparador(api, 7, { recebidos: { 'index.html': h('a') }, estranhos: [] }, versoes);
  assert.deepEqual(r, { estado: 'conferida', versao: '1.0.0', exato: false });
  assert.deepEqual(api.icone[7], { text: '✓', color: '#2f7d6d' });
  assert.deepEqual(api.sessao.get('conferencia:7'), r);

  // No Firefox, o que o fundo viu passar manda: a página não engana.
  api.sessao.set('recebidos:7', { 'index.html': h('f') });
  r = await conferirSeparador(api, 7, { recebidos: { 'index.html': h('a') }, estranhos: [] }, versoes);
  assert.deepEqual(r, { estado: 'diferente', ficheiros: ['index.html'], exato: true });
  assert.equal(api.icone[7].text, '!');

  r = await conferirSeparador(api, 8, { recebidos: { 'index.html': h('a') }, estranhos: ['https://outra/x.js'] },
    versoes);
  assert.deepEqual([r.estado, r.estranhos], ['interferencia', ['https://outra/x.js']]);
  r = await conferirSeparador(api, 9, { recebidos: { 'index.html': h('a') } }, async () => { throw new Error('rede'); });
  assert.deepEqual([r.estado, api.icone[9].text], ['erro', '?']);

  // «Como confirmar» confere-se a partir dela própria (antes dava sempre «?»).
  r = await conferirSeparador(api, 10, { pagina: 'confirm.html', recebidos: { 'confirm.html': h('c') }, estranhos: [] },
    async () => [{ versao: '1.0.1', web: { 'index.html': h('a'), 'confirm.html': h('c') } }]);
  assert.deepEqual([r.estado, r.versao, api.icone[10].text], ['conferida', '1.0.1', '✓']);
});

test('Firefox: as impressões digitais dos bytes que passam, mesmo que o write() fique com eles', async () => {
  const { capturarAoPassar } = await import('../fundo_regras.js');
  const { sha256 } = await import('../conferencia.js');
  const api = apiFalsa();
  let ouvinte;
  let filtro;
  api.webRequest = {
    onBeforeRequest: { addListener: (f, filtros, extra) => { ouvinte = f; assert.deepEqual([filtros.urls, extra], [['https://privada.recato.ai/*'], ['blocking']]); } },
    filterResponseData: () => {
      filtro = { escrito: [], write(dados) { this.escrito.push(structuredClone(dados, { transfer: [dados] })); }, close() {} };
      return filtro;
    },
  };
  capturarAoPassar(api);
  const pagina = new TextEncoder().encode('<!doctype html><p>olá</p>');
  ouvinte({ url: 'https://privada.recato.ai/', tabId: 5, requestId: 'r1', type: 'main_frame' });
  filtro.ondata({ data: pagina.slice(0, 10).buffer });
  filtro.ondata({ data: pagina.slice(10).buffer });
  await filtro.onstop();
  assert.equal(Buffer.concat(filtro.escrito.map((b) => Buffer.from(b))).toString(), '<!doctype html><p>olá</p>',
    'A página recebe tudo.');
  assert.deepEqual(api.sessao.get('recebidos:5'), { 'index.html': await sha256(pagina) });
  ouvinte({ url: 'https://recato.ai/x', tabId: 5, requestId: 'r2', type: 'script' });
  ouvinte({ url: 'https://privada.recato.ai/x.js', tabId: -1, requestId: 'r3', type: 'script' });
  ouvinte({ url: 'https://privada.recato.ai/', tabId: 5, requestId: 'r4', type: 'xmlhttprequest',
    originUrl: 'moz-extension://abc/conferir.js' });
  assert.equal(filtro.escrito.length, 2, 'Outros sítios, pedidos sem separador e os da extensão não se tocam.');
});

test('Firefox: o ícone que o browser pede sozinho não conta; um documento com esse nome conta', async () => {
  const { capturarAoPassar } = await import('../fundo_regras.js');
  const api = apiFalsa();
  let ouvinte;
  const filtrados = [];
  api.webRequest = {
    onBeforeRequest: { addListener: (f) => { ouvinte = f; } },
    filterResponseData: (id) => { filtrados.push(id); return { write() {}, close() {} }; },
  };
  capturarAoPassar(api);
  ouvinte({ url: 'https://privada.recato.ai/favicon.ico', tabId: 5, requestId: 'icone', type: 'image' });
  ouvinte({ url: 'https://privada.recato.ai/favicon.ico', tabId: 5, requestId: 'documento', type: 'main_frame' });
  ouvinte({ url: 'https://privada.recato.ai/outra.png', tabId: 5, requestId: 'imagem', type: 'image' });
  assert.deepEqual(filtrados, ['documento', 'imagem']);
});
