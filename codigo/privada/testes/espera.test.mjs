// Testes de privada/espera.js (28/10/2026, pedido do Pedro: fechar o separador
// não interrompe a resposta): o que fica guardado neste aparelho, cifrado, e a
// resposta que o carteiro guardou, lida aos bocados e aberta como o SDK a
// abre (com a resposta verdadeira da caixa-forte de dados/). Correm com: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { aleatorio } from '../cofre.js';
import { bytesDaResposta, criarEsperas, fluxoGuardado, INTERVALO_MS, PRAZO_DIAS, quandoAVista } from '../espera.js';
import { criarChaveDoNavegador } from '../navegador.js';
import { RespostaParada } from '../pesquisa.js';

/** O IndexedDB a fingir: o que lá fica guardado vê-se, para conferir que vai cifrado. */
function armazem() {
  const dados = new Map();
  return {
    dados,
    ler: async (nome) => dados.get(nome),
    gravar: async (nome, valor) => { dados.set(nome, valor); },
    apagar: async (nome) => { dados.delete(nome); },
    nomes: async () => [...dados.keys()],
  };
}

/** As esperas de uma conta, com a chave do browser (WebCrypto, não exportável) no mesmo armazém. */
function esperasDe(a, conta = 'https://acme.recato.ai') {
  const chave = criarChaveDoNavegador({ ler: a.ler, gravar: a.gravar });
  return criarEsperas({ armazem: a, fechar: chave.fechar, abrir: chave.abrir, conta });
}

test('a espera fica guardada cifrada, só desta conta, e apaga-se quando a resposta fica mostrada', async () => {
  const a = armazem();
  const esperas = esperasDe(a);
  const registo = { id: 'r1', criado: Date.now(), fase: 'ronda', conversa: { mensagens: [{ papel: 'eu', texto: 'segredo da Ana' }] },
    ronda: { numero: 'n1', segredo: { id: 's', data: 'AAAA' }, mensagens: [] } };
  await esperas.guardar(registo);
  const guardado = JSON.stringify([...a.dados.values()]);
  assert.ok(!guardado.includes('segredo da Ana'), 'Nada da conversa fica em claro.');
  assert.deepEqual(await esperas.lista(), [registo]);
  assert.deepEqual(await esperasDe(a, 'https://outra.recato.ai').lista(), [], 'Cada conta tem as suas.');
  await esperas.apagar('r1');
  assert.deepEqual(await esperas.lista(), []);
});

test('pela ordem em que ficaram; as que passaram dos 7 dias, ou já não abrem, apagam-se', async () => {
  assert.equal(PRAZO_DIAS, 7, 'O mesmo prazo do servidor (decisão do Pedro, 28/10/2026).');
  const a = armazem();
  const esperas = esperasDe(a);
  const agora = Date.now();
  await esperas.guardar({ id: 'nova', criado: agora - 1000 });
  await esperas.guardar({ id: 'velha', criado: agora - 8 * 86400_000 });
  await esperas.guardar({ id: 'antiga', criado: agora - 5000 });
  a.dados.set('privada.espera.https://acme.recato.ai.estragada', { iv: 'AAAAAAAAAAAAAAAA', dados: 'AAAA' });
  assert.deepEqual((await esperas.lista(agora)).map((r) => r.id), ['antiga', 'nova']);
  assert.deepEqual([...a.dados.keys()].filter((n) => !n.includes('chave') && n !== 'dispositivo').sort(),
    ['privada.espera.https://acme.recato.ai.antiga', 'privada.espera.https://acme.recato.ai.nova']);
});

test('noutro browser (outra chave do browser), as esperas deste não abrem', async () => {
  const a = armazem();
  await esperasDe(a).guardar({ id: 'r1', criado: Date.now() });
  a.dados.delete('dispositivo');
  assert.deepEqual(await esperasDe(a).lista(), []);
});

/** O carteiro a fingir: a resposta guardada vai chegando (*leituras*, uma por pergunta). */
function servidorCom(leituras) {
  const pedidos = [];
  return {
    pedidos,
    async lerResposta(numero, desde) {
      pedidos.push({ numero, desde });
      const lida = leituras.shift();
      if (!lida) throw Object.assign(new Error('HTTP 404'), { status: 404 });
      return { estado_http: 200, cabecalho_pedido: ':x:', cabecalho_resposta: ':y:', pedido: 7, mais: false, ...lida };
    },
  };
}

const base64 = (texto) => Buffer.from(texto).toString('base64');

async function todos(iteravel) {
  const lidos = [];
  for await (const x of iteravel) lidos.push(x);
  return lidos;
}

test('a resposta que ainda está a chegar lê-se aos bocados, a perguntar de segundo a segundo, até ao fim', async () => {
  const servidor = servidorCom([
    { estado: 'a_receber', bocados: [base64('um')], seguinte: 1 },
    { estado: 'a_receber', bocados: [], seguinte: 1 },
    { estado: 'a_receber', bocados: [base64('dois'), base64('três')], seguinte: 3, mais: true },
    { estado: 'completa', bocados: [base64('quatro')], seguinte: 4 },
  ]);
  const esperas = [];
  let primeira = null;
  const bocados = await todos(bytesDaResposta(servidor, 'n1', { esperar: async (ms) => esperas.push(ms),
    aoComecar: (l) => { primeira = l; } }));
  assert.deepEqual(bocados.map((b) => Buffer.from(b).toString()), ['um', 'dois', 'três', 'quatro']);
  assert.deepEqual(servidor.pedidos.map((p) => p.desde), [0, 1, 1, 3], 'Só pede o que ainda não tem.');
  assert.deepEqual(esperas, [INTERVALO_MS, INTERVALO_MS], 'Com «mais», pede logo o resto, sem esperar.');
  assert.equal(primeira.pedido, 7);
});

test('sem a resposta no servidor, com erro da caixa-forte, cortada ou parada: cada uma diz o seu', async () => {
  const semEspera = { esperar: async () => {} };
  await assert.rejects(todos(bytesDaResposta(servidorCom([]), 'n1', semEspera)), { status: 404 });
  await assert.rejects(todos(bytesDaResposta(servidorCom([{ estado: 'completa', estado_http: 500, bocados: [],
    seguinte: 0 }]), 'n1', semEspera)), { status: 500 });
  await assert.rejects(todos(bytesDaResposta(servidorCom([{ estado: 'cortada', bocados: [base64('x')], seguinte: 1 }]),
    'n1', semEspera)), { codigo: 'cortada' });
  const lidos = [];
  await assert.rejects(async () => {
    for await (const b of bytesDaResposta(servidorCom([{ estado: 'parada', bocados: [base64('meia')], seguinte: 1 }]),
      'n1', semEspera)) lidos.push(b);
  }, RespostaParada);
  assert.equal(lidos.length, 1, 'Parada no «Parar»: o que chegou fica.');
  const paragem = new AbortController();
  paragem.abort();
  await assert.rejects(todos(bytesDaResposta(servidorCom([]), 'n1', { ...semEspera, sinal: paragem.signal })),
    RespostaParada);
});

test('o fluxo guardado abre-se como o do SDK, com o número do pedido para o consumo', async () => {
  const dados = JSON.parse(readFileSync(new URL('./dados/resposta_da_caixa_forte.json', import.meta.url), 'utf8'));
  const corpo = Buffer.from(dados.corpo, 'base64');
  const metade = Math.floor(corpo.length / 2);
  const servidor = servidorCom([
    { estado: 'a_receber', bocados: [corpo.subarray(0, metade).toString('base64')], seguinte: 1,
      cabecalho_pedido: dados.cabecalhoDoPedido, cabecalho_resposta: dados.cabecalhoDaResposta, pedido: 42 },
    { estado: 'completa', bocados: [corpo.subarray(metade).toString('base64')], seguinte: 2,
      cabecalho_pedido: dados.cabecalhoDoPedido, cabecalho_resposta: dados.cabecalhoDaResposta, pedido: 42 },
  ]);
  const fluxo = await fluxoGuardado({ servidor, numero: 'n1', segredo: { id: 's', data: dados.segredo },
    esperar: async () => {} });
  assert.equal(fluxo.pedidoDoCarteiro, 42);
  assert.equal(fluxo.gastoContado, false, 'Ninguém disse ainda o consumo: quem a lê di-lo.');
  const pedacos = await todos(fluxo);
  assert.equal(pedacos.map((p) => p.choices?.[0]?.delta?.content || '').join(''), dados.texto);
});

test('o fluxo guardado diz se o consumo dele já foi dito (o ecrã de antes de fechar, ou a estimativa)', async () => {
  const dados = JSON.parse(readFileSync(new URL('./dados/resposta_da_caixa_forte.json', import.meta.url), 'utf8'));
  const servidor = servidorCom([{ estado: 'completa', bocados: [dados.corpo], seguinte: 1, gasto_contado: true,
    cabecalho_pedido: dados.cabecalhoDoPedido, cabecalho_resposta: dados.cabecalhoDaResposta, pedido: 42 }]);
  const fluxo = await fluxoGuardado({ servidor, numero: 'n1', segredo: { id: 's', data: dados.segredo },
    esperar: async () => {} });
  assert.equal(fluxo.gastoContado, true);
  assert.equal((await todos(fluxo)).map((p) => p.choices?.[0]?.delta?.content || '').join(''), dados.texto);
});

test('sem o segredo, ou sem a resposta no servidor, o fluxo guardado falha logo (pede-se outra vez)', async () => {
  await assert.rejects(fluxoGuardado({ servidor: servidorCom([]), numero: 'n1', segredo: null, esperar: async () => {} }),
    { codigo: 'segredo' });
  await assert.rejects(fluxoGuardado({ servidor: servidorCom([]), numero: 'n1',
    segredo: { data: Buffer.from(aleatorio(32)).toString('base64') }, esperar: async () => {} }), { status: 404 });
});

test('a espera só se dá por acabada com o ecrã à vista: escondido (o separador fechado ainda vivo), quando voltar', () => {
  // Achado no Chrome do Android (30/10/2026): o separador fechado fica vivo uns segundos e acabava a resposta sozinho.
  const documento = new EventTarget();
  documento.visibilityState = 'visible';
  const feitos = [];
  quandoAVista(documento, () => feitos.push('à vista'));
  assert.deepEqual(feitos, ['à vista'], 'À vista: já.');
  documento.visibilityState = 'hidden';
  quandoAVista(documento, () => feitos.push('depois'));
  documento.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(feitos, ['à vista'], 'Escondido: ainda não.');
  documento.visibilityState = 'visible';
  documento.dispatchEvent(new Event('visibilitychange'));
  documento.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(feitos, ['à vista', 'depois'], 'De volta à vista: uma vez só.');
});
