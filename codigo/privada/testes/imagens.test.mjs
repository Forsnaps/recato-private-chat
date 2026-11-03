// Testes das imagens da conversa privada (privada/imagens.js): as regras do
// chat do Recato — janela das 3 últimas mensagens, 8 imagens, 3 MB, as mais
// recentes primeiro — e o que fica no histórico. Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bytesDe, bytesDescodificados, dimensoesReduzidas, reducoes, LADO_MAXIMO, MAX_BYTES_GUARDADOS, MAX_BYTES_POR_PEDIDO, MAX_IMAGENS_POR_PEDIDO,
  MENSAGENS_COM_IMAGENS, paraGuardar, paraOModelo, vaiTalComoEsta,
} from '../imagens.js';
import { levaImagens, pedidoAoModelo } from '../pesquisa.js';

/** Uma imagem a fingir com *n* bytes em base64. */
const imagem = (n, marca = 'A') => `data:image/jpeg;base64,${marca.repeat(n - 23)}`;
const eu = (texto, imagens) => ({ papel: 'eu', texto, ...(imagens ? { imagens } : {}) });
const recato = (texto) => ({ papel: 'recato', texto });
const imagensDe = (mensagem) => (Array.isArray(mensagem.content)
  ? mensagem.content.filter((b) => b.type === 'image_url').map((b) => b.image_url.url) : []);

test('as regras são as do chat do Recato', () => {
  assert.equal(LADO_MAXIMO, 2000);
  assert.equal(MAX_IMAGENS_POR_PEDIDO, 8);
  assert.equal(MAX_BYTES_POR_PEDIDO, 3 * 1024 * 1024);
  assert.equal(MENSAGENS_COM_IMAGENS, 3);
  assert.equal(bytesDe(imagem(100)), 100);
});

test('redução: a 2000 píxeis pelo lado maior, sem aumentar as pequenas', () => {
  assert.deepEqual(dimensoesReduzidas(4032, 3024), { largura: 2000, altura: 1500 });
  assert.deepEqual(dimensoesReduzidas(1080, 2400), { largura: 900, altura: 2000 });
  assert.deepEqual(dimensoesReduzidas(800, 600), { largura: 800, altura: 600 });
  assert.ok(vaiTalComoEsta('image/png', 300000, 1200, 900));
  assert.ok(!vaiTalComoEsta('image/png', 2 * 1024 * 1024, 1200, 900), 'Mais de 1 MB: reduz-se.');
  assert.ok(!vaiTalComoEsta('image/jpeg', 300000, 4032, 3024), 'Mais de 2000 píxeis: reduz-se.');
  assert.ok(!vaiTalComoEsta('image/heic', 300000, 800, 600), 'Formato que o modelo não lê: converte-se.');
});

test('a mensagem com imagens vai em blocos de texto e imagem; sem imagens, só texto', () => {
  const { mensagens, bytesImagens } = paraOModelo('S', [eu('Qual é o total?', [imagem(500)])]);
  assert.deepEqual(mensagens[0], { role: 'system', content: 'S' });
  assert.deepEqual(mensagens[1], { role: 'user', content: [{ type: 'text', text: 'Qual é o total?' },
    { type: 'image_url', image_url: { url: imagem(500) } }] });
  assert.equal(bytesImagens, 500);
  assert.equal(pedidoAoModelo(mensagens).model, 'glm-5.3-flash');
  const soImagem = paraOModelo('S', [eu('', [imagem(50)])]).mensagens[1];
  assert.deepEqual(soImagem.content, [{ type: 'image_url', image_url: { url: imagem(50) } }]);
  const semImagens = paraOModelo('S', [eu('olá'), recato('Olá!'), eu('tudo bem?')]);
  assert.deepEqual(semImagens.mensagens.slice(1).map((m) => m.content), ['olá', 'Olá!', 'tudo bem?']);
  assert.equal(semImagens.bytesImagens, 0);
  assert.ok(!levaImagens(semImagens.mensagens));
});

test('depois de 3 mensagens só de texto, a imagem deixa de ir e volta o GLM-5.3', () => {
  const conversa = [eu('Lê isto', [imagem(500)]), recato('466,79 €'), eu('E o IVA?'), recato('87,29 €')];
  assert.equal(pedidoAoModelo(paraOModelo('S', conversa).mensagens).model, 'glm-5.3-flash',
    'Na mensagem seguinte a imagem ainda vai (perguntas de seguimento).');
  conversa.push(eu('E sem IVA?'));
  assert.equal(pedidoAoModelo(paraOModelo('S', conversa).mensagens).model, 'glm-5.3-flash');
  conversa.push(recato('379,50 €'), eu('Obrigado. Agora outra coisa: um poema.'));
  const { mensagens, bytesImagens } = paraOModelo('S', conversa);
  assert.equal(bytesImagens, 0);
  assert.equal(mensagens[1].content, 'Lê isto', 'A mensagem antiga fica, só sem a imagem.');
  assert.equal(pedidoAoModelo(mensagens).model, 'glm-5.3');
});

test('no máximo 8 imagens e 3 MB por pedido, as mais recentes primeiro', () => {
  const antigas = Array.from({ length: 6 }, (_, i) => imagem(100, String.fromCharCode(66 + i)));
  const novas = Array.from({ length: 5 }, (_, i) => imagem(100, String.fromCharCode(80 + i)));
  const { mensagens } = paraOModelo('S', [eu('a', antigas), recato('ok'), eu('b', novas)]);
  assert.deepEqual(imagensDe(mensagens[3]), novas, 'As da última mensagem vão todas.');
  assert.deepEqual(imagensDe(mensagens[1]), antigas.slice(-3), 'Das anteriores, as mais recentes até 8.');
  const grandes = [imagem(1.4 * 1024 * 1024, 'X'), imagem(1.4 * 1024 * 1024, 'Y'), imagem(1.4 * 1024 * 1024, 'Z')];
  const porBytes = paraOModelo('S', [eu('c', grandes)]);
  assert.deepEqual(imagensDe(porBytes.mensagens[1]), grandes.slice(1), 'Três de 1,4 MB não cabem nos 3 MB.');
  assert.ok(porBytes.bytesImagens <= MAX_BYTES_POR_PEDIDO);
});

test('no histórico ficam as imagens mais recentes que cabem; as outras ficam contadas', () => {
  const grande = (marca) => imagem(1024 * 1024, marca);
  const mensagens = [eu('1', [grande('B'), grande('C')]), recato('ok'), eu('2', [grande('D')]), eu('3', [grande('E')])];
  const guardadas = paraGuardar(mensagens);
  assert.deepEqual(guardadas[3].imagens, [grande('E')]);
  assert.deepEqual(guardadas[2].imagens, [grande('D')]);
  assert.equal(guardadas[0].imagens, undefined);
  assert.equal(guardadas[0].imagensNaoGuardadas, 2);
  assert.equal(guardadas[0].texto, '1', 'O texto fica sempre.');
  const total = guardadas.flatMap((m) => m.imagens || []).reduce((n, url) => n + bytesDe(url), 0);
  assert.ok(total <= MAX_BYTES_GUARDADOS);
  assert.equal(mensagens[0].imagens.length, 2, 'A conversa aberta não perde nada.');
  assert.deepEqual(paraGuardar([eu('a'), recato('b')]), [eu('a'), recato('b')]);
});

test('uma imagem muito detalhada tenta menos qualidade e depois menos píxeis, até caber', () => {
  const tentativas = reducoes(4032, 3024);
  assert.deepEqual(tentativas[0], { largura: 2000, altura: 1500, qualidade: 0.85 }, 'Primeiro, a redução do chat.');
  assert.deepEqual(tentativas.slice(0, 3).map((t) => t.qualidade), [0.85, 0.7, 0.55]);
  assert.deepEqual(tentativas[3], { largura: 1500, altura: 1125, qualidade: 0.85 });
  assert.ok(tentativas.at(-1).largura < 1000, 'No fim já é pequena (cabe sempre em 1 MB).');
  assert.equal(bytesDescodificados(`data:image/jpeg;base64,${'A'.repeat(400)}`), 300);
});


test('paraGuardar aceita um teto mais pequeno (uma conversa com muito texto ou documentos)', () => {
  const imagem = (n) => `data:image/jpeg;base64,${'A'.repeat(n)}`;
  const mensagens = [{ papel: 'eu', texto: 'a', imagens: [imagem(100), imagem(200)] }];
  assert.deepEqual(paraGuardar(mensagens, 250)[0], { papel: 'eu', texto: 'a', imagens: [imagem(200)],
    imagensNaoGuardadas: 1 });
  assert.deepEqual(paraGuardar(mensagens, 0)[0], { papel: 'eu', texto: 'a', imagensNaoGuardadas: 2 });
});
