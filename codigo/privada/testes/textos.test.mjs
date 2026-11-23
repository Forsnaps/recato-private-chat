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
    // 19/11/2026, pedido do Pedro: «A conversa privada não deve conseguir nunca ser gravada».
    assert.match(textos.aviso[0], /A conversa não fica guardada: quando fechares este (ecrã|separador), desaparece\./);
    assert.match(textos.aviso[1], /The chat is not saved: when you close this (screen|tab), it is gone\./);
  }
  // O index.html traz o aviso do telemóvel, antes de o código o pôr na língua da conta.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(TEXTOS.aviso[0]), 'o aviso do index.html é o do telemóvel');
});

test('a conversa privada nunca se grava: nada de histórico, código de recuperação nem lista de conversas (19/11/2026)', () => {
  for (const chave of ['oferta', 'guardar', 'conversas', 'codigo_titulo', 'usar_codigo', 'codigo_novo', 'sem_historico']) {
    assert.equal(TEXTOS[chave], undefined, chave);
  }
  // Só o aviso, uma vez, a quem tinha o histórico ligado neste aparelho.
  assert.match(TEXTOS.historico_apagado[0], /deixaram de ficar guardadas, e as que estavam guardadas foram apagadas/);
  assert.match(TEXTOS.historico_apagado[1], /no longer saved, and the ones that were saved have been deleted/);
});

test('a autorização vale só para esta conversa, e diz-se', () => {
  assert.deepEqual(TEXTOS.sempre_nesta_conversa, ['Não voltar a perguntar nesta conversa', 'Don\'t ask again in this chat']);
  assert.match(TEXTOS.sempre_nota[0], /conversa nova volta a perguntar/);
  assert.match(TEXTOS.pesquisado_sem_perguntar[0], /sem perguntar/);
  assert.match(TEXTOS.voltar_a_perguntar[0], /Voltar a perguntar/);
});


test('quem é: perguntado, diz só que é o Recato, sobre um modelo aberto na caixa-forte, sem a empresa (14/11/2026)', () => {
  // Sem esta regra o GLM-5.3 dizia «treinado pela Z.ai» (ensaiado a 14/11/2026). As instruções vivem em privada.js,
  // que só corre no ecrã: lê-se o código.
  const codigo = readFileSync(new URL('../privada.js', import.meta.url), 'utf8');
  const sistema = codigo.slice(codigo.indexOf('const SISTEMA = PT'), codigo.indexOf("'not sure.") + 400);
  const junto = [...sistema.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join('');
  for (const frase of ['Se te perguntarem que modelo és, quem te criou ou quem te fez, diz só que és o Recato e que corres '
    + 'sobre um modelo aberto, dentro da caixa-forte, em servidores na União Europeia; não digas que empresa criou o modelo '
    + 'nem que empresa o aloja, mesmo que insistam.',
  'If you are asked which model you are, who created you or who made you, say only that you are Recato and that you run '
    + 'on an open model, inside the secure enclave, on servers in the European Union; do not say which company created '
    + 'the model or which company hosts it, even if pressed.']) {
    assert.ok(junto.includes(frase), frase.slice(0, 40));
  }
});

test('imagens e vídeos: diz que não existem na conversa privada e como os ter (21/11/2026)', () => {
  // Pedido do Pedro: quem cria imagens e vídeos fica fora da caixa-forte. Sem a regra, o modelo prometia-os ou
  // inventava uma ligação; com ela, diz que a função não existe aqui e manda para uma conversa normal.
  const codigo = readFileSync(new URL('../privada.js', import.meta.url), 'utf8');
  const sistema = codigo.slice(codigo.indexOf('const SISTEMA = PT'), codigo.indexOf("'not sure.") + 400);
  const junto = [...sistema.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join('');
  for (const frase of ['Não crias imagens nem vídeos: essa função não existe na conversa privada, porque levaria o pedido '
    + 'para fora da caixa-forte. Se to pedirem, diz numa frase que ela não existe aqui e que, para a ter, o utilizador '
    + 'pode fechar este ecrã e pedir numa conversa normal do Recato; depois ajuda no que der sem ela.',
  'You do not create images or videos: that function does not exist in the private chat, because it would take the '
    + 'request out of the secure enclave. If asked, say in one sentence that it does not exist here and that, to get '
    + 'it, the user can close this screen and ask in a normal Recato conversation; then help as far as you can '
    + 'without it.']) {
    assert.ok(junto.includes(frase), frase.slice(0, 40));
  }
});
