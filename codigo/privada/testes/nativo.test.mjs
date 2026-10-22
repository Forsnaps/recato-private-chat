// Testes da conversa com a parte nativa da app (privada/nativo.js): a sessão,
// o chip de segurança do telemóvel e a confirmação de que é a pessoa.
// Correm com: npm test
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { aleatorio, b64 } from '../cofre.js';
import { abrirNoTelemovel, confirmarAPessoa, fecharNoTelemovel, pedirSessao } from '../nativo.js';

let pedidos;

/** A ConversaPrivadaActivity a fingir: *responder* devolve a resposta a cada pedido. */
function nativo(responder) {
  pedidos = [];
  globalThis.RecatoNativo = {
    postMessage(texto) {
      const pedido = JSON.parse(texto);
      pedidos.push(pedido);
      Promise.resolve(responder(pedido)).then((dados) => {
        globalThis.RecatoNativo.onmessage({ data: JSON.stringify({ ...dados, id: pedido.id }) });
      });
    },
  };
}

beforeEach(() => {
  delete globalThis.RecatoNativo;
});

test('o chip fecha e abre os bytes que lhe mandam', async () => {
  const mestra = aleatorio(32);
  nativo((p) => ({ dados: p.tipo === 'telemovel_fechar' ? `fechado:${p.dados}` : p.dados.slice(8) }));
  const fechado = await fecharNoTelemovel(mestra);
  assert.deepEqual(pedidos[0], { tipo: 'telemovel_fechar', dados: b64(mestra), id: pedidos[0].id });
  assert.deepEqual(await abrirNoTelemovel(fechado), mestra);
  assert.deepEqual([pedidos[1].tipo, pedidos[1].dados], ['telemovel_abrir', fechado]);
});

test('erro do chip ou fora da app: erro claro', async () => {
  nativo(() => ({ erro: 'invalida' }));
  await assert.rejects(abrirNoTelemovel('xyz'), /invalida/);
  await assert.rejects(fecharNoTelemovel(aleatorio(32)), /invalida/);
  delete globalThis.RecatoNativo;
  await assert.rejects(pedirSessao(), /sem_app/);
});

test('cada resposta volta para o seu pedido, mesmo fora de ordem', async () => {
  const esperas = [];
  nativo((p) => new Promise((resolve) => esperas.push(() => resolve({ sessao: `s${p.id}` }))));
  const primeira = pedirSessao();
  const segunda = pedirSessao();
  esperas[1]();
  esperas[0]();
  const [a, b] = await Promise.all([primeira, segunda]);
  assert.deepEqual([a.sessao, b.sessao], [`s${pedidos[0].id}`, `s${pedidos[1].id}`]);
});

test('confirmar que é a pessoa: os textos vão para o telemóvel; desistir ou sem bloqueio dão erro', async () => {
  nativo(() => ({ ok: true }));
  await confirmarAPessoa('Código novo', 'Confirma que és tu');
  assert.deepEqual([pedidos[0].tipo, pedidos[0].titulo, pedidos[0].subtitulo],
    ['confirmar_pessoa', 'Código novo', 'Confirma que és tu']);
  nativo(() => ({ erro: 'cancelada' }));
  await assert.rejects(confirmarAPessoa('a', 'b'), (e) => e.codigo === 'cancelada');
  nativo(() => ({ erro: 'sem_bloqueio' }));
  await assert.rejects(confirmarAPessoa('a', 'b'), (e) => e.codigo === 'sem_bloqueio');
});
