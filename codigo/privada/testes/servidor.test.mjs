// Testes de privada/servidor.js (30/10/2026): o consumo de uma resposta, com
// o servidor do Recato a fingir (o fetch). Correm com: npm test
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { criarServidor, ESPERAS_DO_CONSUMO_MS } from '../servidor.js';

const fetchVerdadeiro = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchVerdadeiro;
});

/** O servidor a fingir: responde por ordem (*respostas*: [status, corpo]) e guarda os pedidos. */
function servidorQueResponde(...respostas) {
  const pedidos = [];
  globalThis.fetch = async (endereco, opcoes) => {
    pedidos.push({ endereco, corpo: JSON.parse(opcoes.body), autorizacao: opcoes.headers.Authorization });
    const [status, corpo] = respostas.shift();
    return { ok: status < 400, status, json: async () => corpo };
  };
  return pedidos;
}

const usage = { prompt_tokens: 1228, completion_tokens: 610 };

test('o consumo vai com o número do pedido e a sessão; dito uma vez, chega', async () => {
  const pedidos = servidorQueResponde([200, { estado: 'cobrado' }]);
  const esperas = [];
  const servidor = criarServidor('https://acme.recato.ai', () => 'sessao-1', { esperar: async (ms) => esperas.push(ms) });
  assert.deepEqual(await servidor.consumo(usage, 300, '42'), { estado: 'cobrado' });
  assert.deepEqual(pedidos, [{ endereco: 'https://acme.recato.ai/fs_chat/privada/consumo',
    corpo: { entrada: 1228, saida: 610, imagens: 300, pedido: 42 }, autorizacao: 'Bearer sessao-1' }]);
  assert.deepEqual(esperas, []);
});

test('com o pedido ainda «a_correr» no carteiro, volta a dizê-lo, com esperas maiores, até ele acabar', async () => {
  // Achado no ensaio de 29/10/2026: a resposta chega inteira ao ecrã antes de o carteiro dar o pedido por acabado.
  const pedidos = servidorQueResponde([200, { estado: 'a_correr' }], [200, { estado: 'a_correr' }],
    [200, { estado: 'cobrado' }]);
  const esperas = [];
  const servidor = criarServidor('https://acme.recato.ai', () => 's', { esperar: async (ms) => esperas.push(ms) });
  assert.deepEqual(await servidor.consumo(usage, 0, 7), { estado: 'cobrado' });
  assert.equal(pedidos.length, 3);
  assert.deepEqual(esperas, ESPERAS_DO_CONSUMO_MS.slice(0, 2));
});

test('se o carteiro nunca acaba, desiste ao fim das esperas (fica a estimativa do servidor)', async () => {
  const pedidos = servidorQueResponde(...Array.from({ length: ESPERAS_DO_CONSUMO_MS.length + 1 },
    () => [200, { estado: 'a_correr' }]));
  const esperas = [];
  const servidor = criarServidor('https://acme.recato.ai', () => 's', { esperar: async (ms) => esperas.push(ms) });
  assert.deepEqual(await servidor.consumo(usage, 0, 7), { estado: 'a_correr' });
  assert.equal(pedidos.length, ESPERAS_DO_CONSUMO_MS.length + 1);
  assert.deepEqual(esperas, ESPERAS_DO_CONSUMO_MS);
});

test('um erro do servidor chega a quem chama com o estado, sem voltar a tentar', async () => {
  const pedidos = servidorQueResponde([404, { erro: 'sem_pedido' }]);
  const servidor = criarServidor('https://acme.recato.ai', () => 's', { esperar: async () => assert.fail('sem esperas') });
  await assert.rejects(servidor.consumo(usage), { status: 404, codigo: 'sem_pedido' });
  assert.equal(pedidos.length, 1);
  assert.equal('pedido' in pedidos[0].corpo, false, 'Sem número, o servidor junta-o ao pedido mais antigo.');
});

test('o aviso de uma falha do ecrã vai com a sessão e só com os códigos (04/11/2026)', async () => {
  const pedidos = servidorQueResponde([200, { ok: true }]);
  const servidor = criarServidor('https://acme.recato.ai', () => 'sessao-1');
  const campos = { onde: 'responder', motivo: 'acao', versao: '1.0.4', tipo: 'TypeError', sitio: 'privada.js:120:7' };
  assert.deepEqual(await servidor.avisarFalha(campos), { ok: true });
  assert.deepEqual(pedidos, [{ endereco: 'https://acme.recato.ai/fs_chat/privada/falha', corpo: campos,
    autorizacao: 'Bearer sessao-1' }]);
});
