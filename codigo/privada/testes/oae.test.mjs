// Testes de privada/oae.js (28/10/2026): abrir uma resposta guardada da
// caixa-forte como o SDK da Privatemode a abre. A resposta de ensaio é selada
// aqui com o crypto do Node (HKDF e AES-256-GCM, uma implementação à parte da
// do browser), à maneira da Privatemode (internal/oss/oae: SealMessage,
// InitializeResponder); e uma resposta verdadeira da caixa-forte, apanhada ao
// passar pelo carteiro de ensaio (dados/resposta_da_caixa_forte.json), tem de
// abrir com o texto que o SDK leu. Correm com: npm test
import assert from 'node:assert/strict';
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  bytesDoCabecalho, chaveDaResposta, criarAbridor, dadosDoEvento, lerQuadros, pedacosDaResposta,
} from '../oae.js';

const cabecalho = (bytes) => `:${Buffer.from(bytes).toString('base64')}:`;

/** O lado da caixa-forte: a chave da resposta e as mensagens seladas pela ordem, em quadros. */
function caixaForte(segredo, salDoPedido) {
  const salDaResposta = randomBytes(32);
  const info = Buffer.concat([Buffer.from('privatemode oae response key\0'), salDaResposta]);
  const chave = Buffer.from(hkdfSync('sha256', segredo, salDoPedido, info, 32));
  let ordem = 0;
  return {
    cabecalhoDaResposta: cabecalho(salDaResposta),
    quadro(texto, final = false) {
      const iv = randomBytes(12);
      const aad = Buffer.alloc(5);
      aad.writeUInt32BE(ordem);
      aad[4] = final ? 1 : 0;
      const cifra = createCipheriv('aes-256-gcm', chave, iv);
      cifra.setAAD(aad);
      const selada = Buffer.concat([Buffer.from([final ? 1 : 0]), iv, cifra.update(Buffer.from(texto)), cifra.final(),
        cifra.getAuthTag()]);
      ordem += 1;
      const tamanho = Buffer.alloc(4);
      tamanho.writeUInt32BE(selada.length);
      return Buffer.concat([tamanho, selada]);
    },
  };
}

const evento = (pedaco) => `data: ${JSON.stringify(pedaco)}\n\n`;
const pedaco = (texto) => ({ choices: [{ index: 0, delta: { content: texto } }] });

/** Uma resposta inteira: o cabeçalho da aplicação, os eventos e a mensagem final (vazia). */
function respostaDeEnsaio(textos, { final = true } = {}) {
  const segredo = randomBytes(32);
  const salDoPedido = randomBytes(32);
  const forte = caixaForte(segredo, salDoPedido);
  const quadros = [forte.quadro(JSON.stringify({ content_type: 'text/event-stream' })),
    ...textos.map((t) => forte.quadro(evento(pedaco(t)))),
    forte.quadro(evento({ choices: [], usage: { prompt_tokens: 10, completion_tokens: textos.length } })),
    forte.quadro('data: [DONE]\n\n')];
  if (final) quadros.push(forte.quadro('', true));
  return { segredo: new Uint8Array(segredo), cabecalhoDoPedido: cabecalho(salDoPedido),
    cabecalhoDaResposta: forte.cabecalhoDaResposta, corpo: new Uint8Array(Buffer.concat(quadros)) };
}

async function* aosBocados(bytes, tamanho) {
  for (let i = 0; i < bytes.length; i += tamanho) yield bytes.slice(i, i + tamanho);
}

async function todos(iteravel) {
  const lidos = [];
  for await (const x of iteravel) lidos.push(x);
  return lidos;
}

test('abre a resposta guardada como o SDK: os pedaços do modelo, pela ordem, e o consumo', async () => {
  const r = respostaDeEnsaio(['Olá', ', ', 'tudo bem?']);
  const pedacos = await todos(pedacosDaResposta({ ...r, bytes: aosBocados(r.corpo, 1 << 20) }));
  assert.deepEqual(pedacos.map((p) => p.choices[0]?.delta?.content).filter(Boolean), ['Olá', ', ', 'tudo bem?']);
  assert.deepEqual(pedacos.at(-1).usage, { prompt_tokens: 10, completion_tokens: 3 });
});

test('os bytes podem chegar aos bocados, cortados em qualquer sítio', async () => {
  const r = respostaDeEnsaio(['a', 'b', 'c', 'd']);
  for (const tamanho of [1, 3, 7, 64]) {
    const pedacos = await todos(pedacosDaResposta({ ...r, bytes: aosBocados(r.corpo, tamanho) }));
    assert.equal(pedacos.map((p) => p.choices[0]?.delta?.content || '').join(''), 'abcd', `aos bocados de ${tamanho}`);
  }
});

test('uma resposta sem a mensagem final está cortada: não passa por inteira', async () => {
  const r = respostaDeEnsaio(['meia', ' resposta'], { final: false });
  const lidos = [];
  await assert.rejects(async () => {
    for await (const p of pedacosDaResposta({ ...r, bytes: aosBocados(r.corpo, 50) })) lidos.push(p);
  }, { codigo: 'cortada' });
  assert.equal(lidos.length, 3, 'O que chegou antes do corte lê-se (os dois textos e o consumo).');
});

test('com outro segredo, ou com quadros trocados ou mexidos, não abre', async () => {
  const r = respostaDeEnsaio(['x', 'y']);
  const outro = { ...r, segredo: new Uint8Array(randomBytes(32)) };
  await assert.rejects(todos(pedacosDaResposta({ ...outro, bytes: aosBocados(r.corpo, 1 << 20) })),
    { codigo: 'autenticacao' });
  const { quadros } = lerQuadros(r.corpo);
  const comPrefixo = (q) => {
    const b = new Uint8Array(4 + q.length);
    new DataView(b.buffer).setUint32(0, q.length);
    b.set(q, 4);
    return b;
  };
  const trocados = [quadros[0], quadros[2], quadros[1], ...quadros.slice(3)].map(comPrefixo);
  await assert.rejects(todos(pedacosDaResposta({ ...r, bytes: (async function* () { yield* trocados; })() })),
    { codigo: 'autenticacao' }, 'Fora da ordem.');
  const mexido = r.corpo.slice();
  mexido[mexido.length - 20] ^= 1;
  await assert.rejects(todos(pedacosDaResposta({ ...r, bytes: aosBocados(mexido, 1 << 20) })),
    { codigo: 'autenticacao' });
});

test('depois da mensagem final, nada mais abre', async () => {
  const segredo = randomBytes(32);
  const salDoPedido = randomBytes(32);
  const forte = caixaForte(segredo, salDoPedido);
  const fim = lerQuadros(new Uint8Array(forte.quadro('', true))).quadros[0];
  const chave = await chaveDaResposta(new Uint8Array(segredo), new Uint8Array(salDoPedido),
    bytesDoCabecalho(forte.cabecalhoDaResposta));
  const abridor = criarAbridor(chave);
  assert.deepEqual(await abridor.abrir(fim), { texto: new Uint8Array(0), final: true });
  assert.equal(abridor.fechada, true);
  await assert.rejects(abridor.abrir(fim), { codigo: 'depois_do_fim' });
});

test('uma resposta verdadeira da caixa-forte abre com o texto que o SDK leu', async () => {
  const dados = JSON.parse(readFileSync(new URL('./dados/resposta_da_caixa_forte.json', import.meta.url), 'utf8'));
  const pedacos = await todos(pedacosDaResposta({
    segredo: new Uint8Array(Buffer.from(dados.segredo, 'base64')), cabecalhoDoPedido: dados.cabecalhoDoPedido,
    cabecalhoDaResposta: dados.cabecalhoDaResposta, bytes: aosBocados(new Uint8Array(Buffer.from(dados.corpo, 'base64')), 500),
  }));
  assert.equal(pedacos.map((p) => p.choices?.[0]?.delta?.content || '').join(''), dados.texto);
  assert.ok(pedacos.at(-1).usage?.completion_tokens > 0, 'O consumo vem no fim, como no fluxo do SDK.');
});

test('os cabeçalhos OAE: «:base64:» com 32 bytes, e nada mais', () => {
  const sal = randomBytes(32);
  assert.deepEqual(bytesDoCabecalho(cabecalho(sal)), new Uint8Array(sal));
  for (const mau of ['', 'abc', `:${Buffer.from(randomBytes(31)).toString('base64')}:`, Buffer.from(sal).toString('base64')]) {
    assert.throws(() => bytesDoCabecalho(mau), { codigo: 'cabecalho' }, mau);
  }
});

test('os dados de um evento SSE: as linhas «data:», juntas', () => {
  assert.equal(dadosDoEvento('data: {"a":1}\n\n'), '{"a":1}');
  assert.equal(dadosDoEvento('event: x\ndata: um\ndata: dois'), 'um\ndois');
  assert.equal(dadosDoEvento(': comentário\n\n'), null);
});

test('os quadros que ainda não chegaram inteiros ficam para depois', () => {
  const r = respostaDeEnsaio(['z']);
  const { quadros, resto } = lerQuadros(r.corpo.subarray(0, r.corpo.length - 3));
  assert.equal(quadros.length, 4);
  assert.equal(resto.length, r.corpo.length - 3 - quadros.reduce((n, q) => n + 4 + q.length, 0));
});
