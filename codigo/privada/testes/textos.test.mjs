// Testes dos textos do ecrã da conversa privada (privada/textos.js).
// Correm com: npm test
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { TEXTOS, TEXTOS_DO_BROWSER } from '../textos.js';

test('cada texto pedido pelo ecrã existe, e cada texto daqui é usado no ecrã', () => {
  // As chaves do index.html (data-texto, data-titulo, data-rotulo, data-placeholder) e as do código (t('…')). Um
  // botão que sai do ecrã leva os textos com ele (26/10/2026: a seta do Enviar deu lugar à pílula «Normal / Máximo»).
  const pasta = new URL('../', import.meta.url);
  const html = readFileSync(new URL('index.html', pasta), 'utf8');
  const codigo = readdirSync(pasta).filter((f) => f.endsWith('.js') && f !== 'textos.js')
    .map((f) => readFileSync(new URL(f, pasta), 'utf8')).join('\n');
  const doHtml = [...html.matchAll(/data-(?:texto|titulo|rotulo|placeholder)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(doHtml.length > 10, 'a leitura do index.html partiu-se');
  for (const chave of doHtml) assert.ok(TEXTOS[chave], `«${chave}» do index.html sem texto`);
  for (const chave of Object.keys(TEXTOS)) {
    assert.ok(doHtml.includes(chave) || new RegExp(`['"\`]${chave}['"\`]`).test(codigo), `«${chave}» sem uso no ecrã`);
  }
});

test('quanto pensa a conversa: «Normal» ou «Máximo», com o que custa, como no chat do Recato', () => {
  assert.deepEqual(TEXTOS.nivel_titulo, ['Pensar, nesta conversa', 'Thinking, in this chat']);
  assert.deepEqual(TEXTOS.normal, ['Normal', 'Normal']);
  assert.deepEqual(TEXTOS.maximo, ['Máximo', 'Max']);
  assert.equal(TEXTOS.normal_nota[0], 'Pensa o necessário · responde mais depressa');
  assert.equal(TEXTOS.maximo_nota[0], 'Melhor nos pedidos difíceis · até 1–2 min · gasta mais saldo');
  // A dica leva a tecla de enviar a pensar ao máximo no lugar do %s.
  for (const dica of TEXTOS.nivel_dica) assert.equal(dica.split('%s').length, 2, dica);
});

test('cada texto existe em português e em inglês', () => {
  for (const [chave, valor] of Object.entries({ ...TEXTOS, ...TEXTOS_DO_BROWSER })) {
    assert.ok(Array.isArray(valor) && valor.length === 2, chave);
    assert.ok(valor.every((texto) => typeof texto === 'string' && texto.trim()), chave);
  }
  for (const chave of Object.keys(TEXTOS_DO_BROWSER)) assert.ok(TEXTOS[chave], `${chave} só no browser`);
});

test('antes de pesquisar: avisa que a conversa fica menos privada, diz porquê e pergunta', () => {
  // Pedido do Pedro (26/10/2026).
  for (const tipo of ['pesquisa', 'pagina']) {
    const [titulo, explica, pergunta] = ['titulo', 'explica', 'pergunta'].map((p) => TEXTOS[`${tipo}_${p}`]);
    assert.match(titulo[0], /menos privada/);
    assert.match(titulo[1], /less private/);
    assert.match(explica[0], /^Porquê:/);
    assert.match(explica[1], /^Why:/);
    assert.match(explica[0], /servidor do Recato e pelo motor de pesquisa/);
    assert.match(explica[0], /O resto da conversa continua cifrado/);
    assert.match(pergunta[0], /mesmo assim\?$/);
    assert.match(pergunta[1], /still want .*\?$/);
  }
  assert.deepEqual(TEXTOS.pesquisar, ['Sim, pesquisar', 'Yes, search']);
  assert.deepEqual(TEXTOS.nao_pesquisar, ['Não pesquisar', 'Don\'t search']);
});

test('o aviso do topo fala das imagens, dos documentos e da pesquisa, no telemóvel e no browser', () => {
  for (const textos of [TEXTOS, TEXTOS_DO_BROWSER]) {
    assert.match(textos.aviso[0], /imagens e os documentos que juntares/);
    assert.match(textos.aviso[1], /images and documents you add/);
    assert.match(textos.aviso[0], /menos privada/);
    assert.match(textos.aviso[1], /less private/);
  }
});

test('a autorização vale só para esta conversa, e diz-se', () => {
  assert.deepEqual(TEXTOS.sempre_nesta_conversa, ['Não voltar a perguntar nesta conversa', 'Don\'t ask again in this chat']);
  assert.match(TEXTOS.sempre_nota[0], /conversa nova volta a perguntar/);
  assert.match(TEXTOS.pesquisado_sem_perguntar[0], /sem perguntar/);
  assert.match(TEXTOS.voltar_a_perguntar[0], /Voltar a perguntar/);
});

