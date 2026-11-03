// Testes do pedido ao modelo e da pesquisa na web da conversa privada
// (privada/pesquisa.js), com o SDK da Privatemode e o servidor do Recato a
// fingir. Correm com: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import {
  blocoDaData, cicloNoFim, comTentativas, degenerado, desistiuEmBaixo, ESPERAS_S, esperarComSinal, FERRAMENTAS, lerFluxo,
  levaImagens,
  MAX_RONDAS, MAX_TOKENS, MODELO, MODELO_DAS_IMAGENS, NIVEL_MAXIMO, NIVEL_NORMAL, nivelDa, NOMES_PARA_O_MODELO,
  comNomesDoModelo, PRAZO_DAS_TENTATIVAS_S,
  pedidoAoModelo, pedidoDaPesquisa, PESQUISA_FALHADA, PESQUISA_RECUSADA, REGRAS_DA_PESQUISA, responder,
  RespostaEmCiclo, RespostaParada, TENTATIVAS_SEM_ESTADO, tentarOutraVez,
} from '../pesquisa.js';

const PASTA = new URL('..', import.meta.url).pathname;

/** Um fluxo de streaming do SDK com estes pedaços. */
async function* fluxo(...pedacos) {
  for (const pedaco of pedacos) yield pedaco;
}

const texto = (conteudo) => ({ choices: [{ delta: { content: conteudo } }] });
const consumo = (entrada, saida) => ({ choices: [], usage: { prompt_tokens: entrada, completion_tokens: saida } });
/** Um pedido de ferramenta partido em pedaços, como o modelo o manda. */
const ferramenta = (index, id, nome, argumentos) => [
  { choices: [{ delta: { tool_calls: [{ index, id, type: 'function', function: { name: nome, arguments: '' } }] } }] },
  { choices: [{ delta: { tool_calls: [{ index, function: { arguments: argumentos.slice(0, 7) } }] } }] },
  { choices: [{ delta: { tool_calls: [{ index, function: { arguments: argumentos.slice(7) } }] } }] },
];

/** O modelo a fingir: responde com as rondas dadas, por ordem, e guarda os pedidos. */
function modeloFalso(...rondas) {
  const pedidos = [];
  return {
    pedidos,
    pedir: async (pedido) => {
      pedidos.push(structuredClone(pedido));
      return fluxo(...rondas[pedidos.length - 1]);
    },
  };
}

test('o modelo é sempre o GLM-5.3 da Privatemode, em «high» ou, ao máximo, em «max»', () => {
  assert.equal(MODELO, 'glm-5.3');
  assert.equal(pedidoAoModelo([]).model, 'glm-5.3');
  assert.equal(pedidoAoModelo([]).reasoning_effort, 'high', 'Sem nada dito, o nível do chat do Recato.');
  assert.equal(pedidoAoModelo([], { nivel: NIVEL_MAXIMO }).reasoning_effort, 'max');
  assert.equal(pedidoAoModelo([], { nivel: 'low' }).reasoning_effort, 'high', 'Só há «high» e «max».');
  assert.equal(nivelDa({ mensagens: [] }), NIVEL_NORMAL);
  assert.equal(nivelDa({ mensagens: [], nivelMaximo: true }), NIVEL_MAXIMO);
  const pedido = pedidoAoModelo([{ role: 'user', content: 'olá' }]);
  assert.equal(pedido.stream, true);
  assert.deepEqual(pedido.stream_options, { include_usage: true }, 'Sem o consumo, o saldo não se acerta.');
  assert.deepEqual(pedido.tools, comNomesDoModelo({ tools: FERRAMENTAS }).tools,
    'As da pesquisa do chat, com os nomes do pedido.');
  assert.equal(pedido.max_tokens, MAX_TOKENS);
  assert.equal(MAX_TOKENS, 128000, 'O teto de saída do chat.');
  assert.equal(pedidoAoModelo([], { ultima: true }).tools, undefined, 'Na última ronda tem de responder.');
});

test('com imagens o pedido vai ao Flash da Privatemode em «max»; sem elas, ao GLM-5.3', () => {
  const imagem = { role: 'user', content: [{ type: 'text', text: 'O que diz?' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }] };
  assert.equal(MODELO_DAS_IMAGENS, 'glm-5.3-flash');
  assert.ok(levaImagens([imagem]));
  assert.ok(!levaImagens([{ role: 'user', content: 'olá' }, { role: 'user', content: [{ type: 'text', text: 'x' }] }]));
  const comImagem = pedidoAoModelo([{ role: 'system', content: 'S' }, imagem]);
  assert.deepEqual([comImagem.model, comImagem.reasoning_effort], ['glm-5.3-flash', 'max'],
    'Com imagens, sempre em «max» (em «high» o Flash lia pior).');
  assert.deepEqual(comImagem.tools, comNomesDoModelo({ tools: FERRAMENTAS }).tools,
    'O Flash também pede pesquisas (sonda de 26/10/2026).');
  const imagemAntes = pedidoAoModelo([imagem, { role: 'assistant', content: 'Diz 466,79 €.' },
    { role: 'user', content: 'E o IVA?' }]);
  assert.equal(imagemAntes.model, 'glm-5.3-flash', 'A imagem de uma mensagem anterior ainda vai: continua o Flash.');
  assert.equal(pedidoAoModelo([{ role: 'user', content: 'olá' }]).model, 'glm-5.3');
});

test('nenhum outro modelo nem fornecedor aparece no código do ecrã', () => {
  // O carteiro recusa outros modelos; o ecrã nem os pede (25 e 26/10/2026).
  const codigo = fs.readdirSync(PASTA).filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(PASTA + f, 'utf8')).join('\n');
  for (const proibido of ['gpt-oss', 'deepseek', 'qwen', 'kimi', 'minimax', 'whisper', 'voxtral',
    'hostyourai', 'openai.com', 'anthropic', 'linkup.so']) {
    assert.ok(!codigo.toLowerCase().includes(proibido), `«${proibido}» no código do ecrã`);
  }
  // Só três sítios escolhem o modelo: a conversa (pedidoAoModelo), as fichas
  // dos anexos grandes (privada.js, 27/10/2026), que só o tiram da lista
  // MODELOS_DAS_FICHAS (o GLM-5.3 e o Flash), e as páginas digitalizadas dos
  // PDF (30/10/2026), que vão só ao Flash, como as imagens.
  const escolhas = codigo.match(/model: [^,\n]+/g) || [];
  assert.deepEqual(escolhas.sort(), ['model: MODELO_DAS_IMAGENS', 'model: imagens ? MODELO_DAS_IMAGENS : MODELO',
    'model: modelo']);
  assert.match(fs.readFileSync(`${PASTA}privada.js`, 'utf8'),
    /const MODELOS_DAS_FICHAS = \[MODELO, MODELO_DAS_IMAGENS\];[\s\S]*for \(const modelo of MODELOS_DAS_FICHAS\)/);
  const modelos = new Set(codigo.match(/'glm-[0-9a-z.-]+'/g));
  assert.deepEqual([...modelos].sort(), ["'glm-5.3'", "'glm-5.3-flash'"], 'Só estes dois nomes de modelos.');
});

test('as ferramentas e as regras são as da pesquisa do chat', () => {
  assert.deepEqual(FERRAMENTAS.map((f) => f.function.name), ['web_search', 'fetch_page']);
  assert.ok(REGRAS_DA_PESQUISA.includes('PESQUISA NA WEB:'));
  assert.ok(REGRAS_DA_PESQUISA.includes('Fontes:'));
  assert.ok(REGRAS_DA_PESQUISA.includes('fonte de referência ou oficial'));
});

test('o bloco da data diz o dia e a hora de agora, como o do chat', () => {
  const bloco = blocoDaData(new Date(2026, 9, 25, 23, 5), 'Europe/Lisbon');
  assert.ok(bloco.startsWith('\n\nDATA E HORA ATUAIS: domingo, 25 de outubro de 2026, 23:05 (hora de Lisboa).\n'));
  assert.ok(bloco.includes('Esta é a única referência de «hoje»'));
  assert.ok(blocoDaData(new Date(2026, 9, 25, 9, 0), 'Atlantic/Azores').includes('(fuso Atlantic/Azores)'));
});

test('lerFluxo junta o texto, os pedidos de ferramentas partidos em pedaços e o consumo', async () => {
  const escritos = [];
  const lido = await lerFluxo(fluxo(texto('Vou '), texto('ver.'),
    ...ferramenta(0, 'c1', 'web_search', '{"query":"salário mínimo 2026"}'),
    ...ferramenta(1, 'c2', 'fetch_page', '{"url":"https://dre.pt/x"}'), consumo(100, 20)),
  (t) => escritos.push(t));
  assert.equal(lido.texto, 'Vou ver.');
  assert.deepEqual(escritos, ['Vou ', 'Vou ver.']);
  assert.deepEqual(lido.chamadas.map((c) => [c.id, c.function.name, JSON.parse(c.function.arguments)]), [
    ['c1', 'web_search', { query: 'salário mínimo 2026' }], ['c2', 'fetch_page', { url: 'https://dre.pt/x' }]]);
  assert.deepEqual(lido.usage, { prompt_tokens: 100, completion_tokens: 20 });
  assert.equal(lido.fim, null);
  // Cortada pelo teto de saída (as páginas digitalizadas pedem outra vez a que ficou a meio).
  const cortada = await lerFluxo(fluxo(texto('=== Página 1 ==='), { choices: [{ delta: {}, finish_reason: 'length' }] },
    consumo(10, 8192)));
  assert.equal(cortada.fim, 'length');
});

test('a pesquisa vai ao modelo como pesquisar_na_web e volta a ser web_search (30/10/2026)', async () => {
  // Com o nome web_search o GLM-5.3-Flash degenerou em «!!!!…» no raciocínio (25 min sem resposta); com outro
  // nome respondeu em 5 s. O nome muda só no pedido, como no chat (_NOMES_PARA_O_MODELO).
  assert.deepEqual(NOMES_PARA_O_MODELO, { web_search: 'pesquisar_na_web' });
  const pedido = pedidoAoModelo([{ role: 'system', content: REGRAS_DA_PESQUISA }, { role: 'assistant', content: '',
    tool_calls: [{ id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{}' } }] }]);
  assert.ok(!JSON.stringify(pedido).includes('web_search'), 'Nem nas ferramentas, nem nos textos, nem nas chamadas.');
  assert.equal(pedido.messages[1].tool_calls[0].function.name, 'pesquisar_na_web');
  const url = `data:image/jpeg;base64,${Buffer.from('web_search'.repeat(20)).toString('base64')}`;
  const comImagem = { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }] };
  assert.equal(comNomesDoModelo(comImagem), comImagem, 'Sem o nome, o pedido fica como estava (a imagem nunca muda).');
  const lido = await lerFluxo(fluxo(...ferramenta(0, 'c1', 'pesquisar_na_web', '{"query":"IVA"}')));
  assert.equal(lido.chamadas[0].function.name, 'web_search');
});

test('uma resposta em ciclo ou degenerada para logo e não se volta a pedir sozinha (30/10/2026)', async () => {
  // As regras do chat (respostas_em_ciclo.py): o Flash escreveu «!!!!…» no raciocínio durante 25 min.
  const pensar = (t) => ({ choices: [{ delta: { reasoning: t } }] });
  let parado = false;
  const degenerada = Object.assign(fluxo(...Array.from({ length: 100 }, () => pensar('!'.repeat(40))), texto('Nunca.')),
    { controller: { abort: () => { parado = true; } } });
  await assert.rejects(lerFluxo(degenerada), (e) => e instanceof RespostaEmCiclo && e.codigo === 'ciclo' && e.bloco === 1);
  assert.ok(parado, 'O fluxo para: a caixa-forte deixa de gerar.');
  const paragrafo = 'Primeiro vejo o pedido e depois respondo com cuidado à pessoa. ';
  await assert.rejects(lerFluxo(fluxo(...Array.from({ length: 40 }, () => texto(paragrafo)))), RespostaEmCiclo);
  assert.equal(cicloNoFim(paragrafo.repeat(40)), paragrafo.length);
  // Repetições normais: uma tabela em branco e linhas separadoras compridas.
  for (const normal of [`| Nome | Data |\n|---|---|\n${'|  |  |\n'.repeat(400)}`,
    `${'—'.repeat(3000)}\n${'='.repeat(3000)}`]) {
    const lido = await lerFluxo(fluxo(...normal.match(/[\s\S]{1,40}/g).map(texto)));
    assert.equal(lido.texto, normal);
  }
  assert.ok(degenerado('!'.repeat(400)) && !degenerado('!'.repeat(399)));
  assert.ok(!degenerado('='.repeat(3000)) && degenerado('='.repeat(7000)), 'Os separadores só muito mais à frente.');
  assert.equal(tentarOutraVez(new RespostaEmCiclo(1), 0), false, 'Repetia-se: a pessoa decide se volta a pedir.');
});

test('o que se mostra à pessoa: a frase (e o site) ou o endereço; nada de pedidos inválidos', () => {
  assert.deepEqual(pedidoDaPesquisa('web_search', { query: '  salário   mínimo ', site: 'gov.pt' }),
    { tipo: 'pesquisa', frase: 'salário mínimo', site: 'gov.pt' });
  assert.deepEqual(pedidoDaPesquisa('web_search', { query: 'x', site: '' }), { tipo: 'pesquisa', frase: 'x', site: null });
  assert.deepEqual(pedidoDaPesquisa('fetch_page', { url: ' https://dre.pt/a?b=1 ' }),
    { tipo: 'pagina', endereco: 'https://dre.pt/a?b=1' });
  assert.equal(pedidoDaPesquisa('web_search', { query: '  ' }), null);
  assert.equal(pedidoDaPesquisa('fetch_page', { url: 'javascript:alert(1)' }), null);
  assert.equal(pedidoDaPesquisa('fetch_page', { url: 'file:///etc/passwd' }), null);
  assert.equal(pedidoDaPesquisa('create_file', { query: 'x' }), null, 'Só as ferramentas da pesquisa.');
});

test('a pesquisa confirmada sai, o resultado volta ao modelo e a resposta acaba com o texto final', async () => {
  const modelo = modeloFalso(
    [...ferramenta(0, 'c1', 'web_search', '{"query":"salário mínimo 2026","site":"gov.pt"}'), consumo(900, 30)],
    [texto('São 920 €.\n\nFontes: [gov.pt](https://www.gov.pt)'), consumo(4000, 60)],
  );
  const confirmados = [];
  const pesquisados = [];
  const gastos = [];
  const resposta = await responder({
    mensagens: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Qual é o salário mínimo?' }],
    nivel: NIVEL_NORMAL,
    pedir: modelo.pedir,
    confirmar: async (pedido) => { confirmados.push(pedido); return true; },
    pesquisar: async (nome, argumentos) => { pesquisados.push([nome, argumentos]); return '{"results":[]}'; },
    aoGastar: (usage) => gastos.push(usage.prompt_tokens),
  });
  assert.equal(resposta, 'São 920 €.\n\nFontes: [gov.pt](https://www.gov.pt)');
  assert.deepEqual(confirmados, [{ tipo: 'pesquisa', frase: 'salário mínimo 2026', site: 'gov.pt' }]);
  assert.deepEqual(pesquisados, [['web_search', { query: 'salário mínimo 2026', site: 'gov.pt' }]]);
  assert.deepEqual(gastos, [900, 4000], 'O consumo de cada ronda vai ao saldo.');
  assert.equal(modelo.pedidos.length, 2);
  assert.ok(modelo.pedidos.every((p) => p.model === 'glm-5.3' && p.reasoning_effort === 'high'));
  const segunda = modelo.pedidos[1].messages;
  assert.deepEqual(segunda.at(-2).tool_calls.map((c) => c.id), ['c1']);
  assert.deepEqual(segunda.at(-1), { role: 'tool', tool_call_id: 'c1', content: '{"results":[]}' });
});

test('recusada pela pessoa, a pesquisa não sai e o modelo sabe que não pesquisou', async () => {
  const modelo = modeloFalso(
    [...ferramenta(0, 'c1', 'fetch_page', '{"url":"https://exemplo.pt/privado"}')],
    [texto('Não pesquisei, mas…')],
  );
  let pesquisas = 0;
  const resposta = await responder({
    mensagens: [{ role: 'user', content: 'Lê isto' }],
    pedir: modelo.pedir,
    confirmar: async () => false,
    pesquisar: async () => { pesquisas += 1; return '{}'; },
  });
  assert.equal(pesquisas, 0, 'Sem o «sim», nada sai para o servidor.');
  assert.equal(resposta, 'Não pesquisei, mas…');
  assert.deepEqual(JSON.parse(modelo.pedidos[1].messages.at(-1).content), { error: PESQUISA_RECUSADA });
});

test('pedido inválido não chega à pessoa nem ao servidor; pesquisa falhada continua a resposta', async () => {
  const modelo = modeloFalso(
    [...ferramenta(0, 'c1', 'create_file', '{"name":"x.docx"}'),
      ...ferramenta(1, 'c2', 'web_search', '{"query":"preço'), // JSON partido
      ...ferramenta(2, 'c3', 'web_search', '{"query":"preço do gasóleo"}')],
    [texto('Resposta sem a web.')],
  );
  const confirmados = [];
  const resposta = await responder({
    mensagens: [{ role: 'user', content: '?' }],
    pedir: modelo.pedir,
    confirmar: async (pedido) => { confirmados.push(pedido.frase); return true; },
    pesquisar: async () => { throw Object.assign(new Error('HTTP 503'), { status: 503 }); },
  });
  assert.deepEqual(confirmados, ['preço do gasóleo']);
  const resultados = modelo.pedidos[1].messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content).error);
  assert.ok(resultados[0].startsWith('pedido inválido'));
  assert.ok(resultados[1].startsWith('argumentos inválidos'));
  assert.equal(resultados[2], PESQUISA_FALHADA);
  assert.equal(resposta, 'Resposta sem a web.');
});

test('sem saldo para a pesquisa, a resposta para (o ecrã diz porquê)', async () => {
  const modelo = modeloFalso([...ferramenta(0, 'c1', 'web_search', '{"query":"x"}')]);
  await assert.rejects(responder({
    mensagens: [], pedir: modelo.pedir, confirmar: async () => true,
    pesquisar: async () => { throw Object.assign(new Error('sem_saldo'), { status: 402 }); },
  }), (e) => e.status === 402);
});

test('ao máximo, todas as rondas vão em «max»; depois de MAX_RONDAS o modelo responde sem ferramentas', async () => {
  const rondas = Array.from({ length: MAX_RONDAS }, (_, i) => ferramenta(0, `c${i}`, 'web_search', `{"query":"q${i}"}`));
  const modelo = modeloFalso(...rondas, [texto('Fim.')]);
  const resposta = await responder({
    mensagens: [], nivel: NIVEL_MAXIMO, pedir: modelo.pedir, confirmar: async () => true, pesquisar: async () => '{}',
  });
  assert.equal(resposta, 'Fim.');
  assert.equal(modelo.pedidos.length, MAX_RONDAS + 1);
  assert.ok(modelo.pedidos.every((p) => p.reasoning_effort === 'max'));
  assert.ok(modelo.pedidos.slice(0, -1).every((p) => p.tools));
  assert.equal(modelo.pedidos.at(-1).tools, undefined);
});

test('um pedido de ferramenta sem id leva um, e o resultado volta com o mesmo', async () => {
  const modelo = modeloFalso([...ferramenta(0, '', 'web_search', '{"query":"x"}')], [texto('ok')]);
  await responder({ mensagens: [], pedir: modelo.pedir, confirmar: async () => true, pesquisar: async () => '{}' });
  const [assistente, resultado] = modelo.pedidos[1].messages.slice(-2);
  assert.equal(assistente.tool_calls[0].id, 'chamada_0_0');
  assert.equal(resultado.tool_call_id, 'chamada_0_0');
});

test('«Não voltar a perguntar nesta conversa»: as pesquisas seguintes dela já não perguntam', async () => {
  const { confirmacaoDaConversa } = await import('../pesquisa.js');
  const perguntas = [];
  const linhas = [];
  let guardada = 0;
  const conversa = { mensagens: [] };
  const respostas = [{ sim: true, sempre: true }];
  const confirmar = confirmacaoDaConversa(conversa, {
    perguntar: async (pedido) => { perguntas.push(pedido.frase); return respostas.shift(); },
    semPerguntar: (pedido) => linhas.push(pedido.frase),
    aoMudar: () => { guardada += 1; },
  });
  assert.equal(await confirmar({ tipo: 'pesquisa', frase: 'a' }), true);
  assert.equal(conversa.pesquisaSemPerguntar, true);
  assert.equal(guardada, 1, 'A escolha guarda-se com a conversa.');
  assert.equal(await confirmar({ tipo: 'pesquisa', frase: 'b' }), true);
  assert.equal(await confirmar({ tipo: 'pagina', endereco: 'https://a.pt' }), true);
  assert.deepEqual(perguntas, ['a'], 'Só a primeira perguntou.');
  assert.deepEqual(linhas, ['b', undefined], 'As seguintes deixam a linha do que saiu.');

  const outra = { mensagens: [] };
  const naOutra = [];
  await confirmacaoDaConversa(outra, { perguntar: async (p) => { naOutra.push(p.frase); return { sim: true, sempre: false }; } })({ frase: 'c' });
  assert.deepEqual(naOutra, ['c'], 'Numa conversa nova volta a perguntar.');
  assert.ok(!outra.pesquisaSemPerguntar);
});

test('a caixa marcada com «Não pesquisar» não autoriza nada; desligar volta a perguntar', async () => {
  const { confirmacaoDaConversa } = await import('../pesquisa.js');
  const conversa = { mensagens: [] };
  let perguntas = 0;
  const confirmar = confirmacaoDaConversa(conversa, { perguntar: async () => { perguntas += 1; return { sim: false, sempre: false }; } });
  assert.equal(await confirmar({ frase: 'x' }), false);
  assert.ok(!conversa.pesquisaSemPerguntar);
  conversa.pesquisaSemPerguntar = true;
  assert.equal(await confirmar({ frase: 'y' }), true);
  conversa.pesquisaSemPerguntar = false; // a etiqueta «×»
  await confirmar({ frase: 'z' });
  assert.equal(perguntas, 2);
});

test('o consumo de cada ronda vai com o número do pedido do carteiro, quando o fluxo o traz', async () => {
  const gastos = [];
  let n = 0;
  await responder({ mensagens: [], pedir: async () => {
    n += 1;
    return Object.assign(fluxo(texto('ok'), consumo(3, 1)), { pedidoDoCarteiro: `p${n}` });
  }, confirmar: async () => true, pesquisar: async () => '{}', aoGastar: (usage, pedido) => gastos.push(pedido) });
  assert.deepEqual(gastos, ['p1']);
});

test('uma ronda guardada com o consumo já dito (lida outra vez por quem volta) não o diz outra vez', async () => {
  // Achado no ensaio de 29/10/2026: a ronda da pesquisa tinha o consumo dito antes de o ecrã fechar à espera do
  // «sim»; quem voltava lia-a outra vez e dizia-o de novo (o servidor recusava: um erro na consola).
  const gastos = [];
  const rondas = [
    Object.assign(fluxo(...ferramenta(0, 'c1', 'web_search', '{"query":"população"}'), consumo(5, 2)),
      { pedidoDoCarteiro: 'p1', gastoContado: true }),
    Object.assign(fluxo(texto('São 10,7 milhões.'), consumo(9, 4)), { pedidoDoCarteiro: 'p2' }),
  ];
  const final = await responder({ mensagens: [], pedir: async () => rondas.shift(), confirmar: async () => true,
    pesquisar: async () => '{}', aoGastar: (usage, pedido) => gastos.push(pedido) });
  assert.equal(final, 'São 10,7 milhões.');
  assert.deepEqual(gastos, ['p2'], 'Só a ronda nova diz o consumo.');
});

// ── o «Parar» e as falhas que passam (28/10/2026, pedido do Pedro: só o «Parar» para a resposta) ──

/** Um fluxo que escreve *antes* e fica à espera do «Parar»; como o SDK, acaba em AbortError. */
function fluxoAtePararem(sinal, ...antes) {
  return (async function* () {
    for (const pedaco of antes) yield pedaco;
    await new Promise((_, rejeitar) => {
      const parar = () => rejeitar(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' }));
      if (sinal.aborted) parar();
      else sinal.addEventListener('abort', parar, { once: true });
    });
  })();
}

test('o «Parar» a meio da resposta: acaba com o que já tinha escrito, e sem mais pedidos', async () => {
  const paragem = new AbortController();
  const sinais = [];
  await assert.rejects(responder({
    mensagens: [{ role: 'user', content: 'Conta-me uma história.' }],
    pedir: async (pedido, sinal) => {
      sinais.push(sinal);
      return fluxoAtePararem(sinal, texto('Era uma vez'), texto(' um rei'));
    },
    aoEscrever: (parcial) => {
      if (parcial.endsWith('rei')) paragem.abort();
    },
    sinal: paragem.signal,
  }), (e) => e instanceof RespostaParada && e.texto === 'Era uma vez um rei');
  assert.deepEqual(sinais, [paragem.signal], 'Um só pedido, e com o «Parar» dentro dele (o SDK corta o fluxo).');
});

test('o «Parar» com o fluxo a acabar sem erro, como o do SDK: é parada, não é a resposta inteira', async () => {
  // Achado no ensaio do Chromium (28/10/2026): o fluxo do SDK, parado, acaba calado (engole o AbortError).
  const paragem = new AbortController();
  await assert.rejects(responder({
    mensagens: [{ role: 'user', content: 'Conta-me uma história.' }],
    pedir: async (pedido, sinal) => (async function* () {
      yield texto('Era uma vez');
      paragem.abort();
      if (sinal.aborted) return;
      yield texto(' um rei que nunca devia aparecer');
    })(),
    sinal: paragem.signal,
  }), (e) => e instanceof RespostaParada && e.texto === 'Era uma vez');
});

test('o «Parar» com uma ferramenta a correr: a ronda seguinte já não sai', async () => {
  const paragem = new AbortController();
  const modelo = modeloFalso([texto('Vou pesquisar.'), ...ferramenta(0, 'c1', 'web_search', '{"query":"x"}')],
    [texto('nunca')]);
  await assert.rejects(responder({
    mensagens: [], pedir: modelo.pedir, sinal: paragem.signal, confirmar: async () => true,
    pesquisar: async () => {
      paragem.abort();
      return '{"results":[]}';
    },
  }), (e) => e instanceof RespostaParada && e.texto === 'Vou pesquisar.');
  assert.equal(modelo.pedidos.length, 1);
});

test('o «Parar» com uma pesquisa à espera do «sim»: a pesquisa não sai e não se pede mais nada', async () => {
  const paragem = new AbortController();
  const modelo = modeloFalso([...ferramenta(0, 'c1', 'web_search', '{"query":"x"}')], [texto('nunca')]);
  let pesquisas = 0;
  await assert.rejects(responder({
    mensagens: [], pedir: modelo.pedir, sinal: paragem.signal,
    // Como o ecrã (pararResposta): o «Parar» responde «não» à pergunta que estava à espera.
    confirmar: () => new Promise((resolve) => {
      paragem.signal.addEventListener('abort', () => resolve(false));
      paragem.abort();
    }),
    pesquisar: async () => {
      pesquisas += 1;
      return '{}';
    },
  }), RespostaParada);
  assert.equal(pesquisas, 0);
  assert.equal(modelo.pedidos.length, 1);
});

test('a rede que cai a meio da resposta: a ronda volta a pedir-se, depois de esperar, e a resposta acaba', async () => {
  const esperas = [];
  const avisos = [];
  const escritos = [];
  let pedidos = 0;
  const resposta = await responder({
    mensagens: [{ role: 'user', content: 'Olá' }],
    pedir: async () => {
      pedidos += 1;
      if (pedidos > 1) return fluxo(texto('Olá! Em que posso ajudar?'));
      return (async function* () {
        yield texto('Ol');
        throw new TypeError('Failed to fetch');
      })();
    },
    aoEscrever: (parcial) => escritos.push(parcial),
    esperar: async (ms) => {
      esperas.push(ms);
    },
    semRede: () => false,
    aoSemRede: (tentativa) => avisos.push(tentativa),
  });
  assert.equal(resposta, 'Olá! Em que posso ajudar?');
  assert.equal(pedidos, 2);
  assert.deepEqual(esperas, [ESPERAS_S[0] * 1000]);
  assert.deepEqual(avisos, [1], 'O ecrã diz que volta a tentar.');
  assert.deepEqual(escritos, ['Ol', 'Olá! Em que posso ajudar?']);
});

test('volta a tentar com o servidor ou a rede em baixo; sem saldo, sem sessão ou com o pedido recusado, não', () => {
  for (const estado of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(tentarOutraVez({ status: estado }, 40), true, estado);
  }
  for (const estado of [400, 401, 402, 403, 404, 413, 422]) {
    assert.equal(tentarOutraVez({ status: estado }, 0, true), false, estado);
  }
  // Sem estado HTTP e com rede pode ser do próprio ecrã: só umas vezes. Sem rede, até ao prazo.
  const semLigacao = new TypeError('Failed to fetch');
  assert.equal(tentarOutraVez(semLigacao, TENTATIVAS_SEM_ESTADO - 1), true);
  assert.equal(tentarOutraVez(semLigacao, TENTATIVAS_SEM_ESTADO), false);
  assert.equal(tentarOutraVez(semLigacao, 50, true), true);
});

test('desistiu com eles em baixo: o servidor, o fornecedor ou a rede; o pedido recusado ou o próprio ecrã, não', () => {
  // 31/10/2026: a leitura das páginas digitalizadas não parte o lote em metades com eles em baixo (lerAsPaginas).
  for (const estado of [408, 425, 429, 500, 503]) assert.equal(desistiuEmBaixo({ status: estado }), true, estado);
  for (const estado of [400, 401, 403, 413]) assert.equal(desistiuEmBaixo({ status: estado }, true), false, estado);
  const semLigacao = new TypeError('Failed to fetch');
  assert.equal(desistiuEmBaixo(semLigacao), false, 'Com rede, gastas as tentativas, pode ser do próprio ecrã.');
  assert.equal(desistiuEmBaixo(semLigacao, true), true, 'Sem rede.');
  assert.equal(desistiuEmBaixo(new RespostaEmCiclo(1)), false, 'Uma resposta em ciclo não é estar em baixo.');
});

test('comTentativas: esperas cada vez maiores até ao prazo; sem saldo, logo; o «Parar» na espera acaba já', async () => {
  const esperas = [];
  const emBaixo = Object.assign(new Error('HTTP 503'), { status: 503 });
  await assert.rejects(comTentativas(async () => { throw emBaixo; }, {
    esperar: async (ms) => {
      esperas.push(ms / 1000);
    },
  }), (e) => e === emBaixo);
  assert.deepEqual(esperas.slice(0, ESPERAS_S.length), ESPERAS_S);
  assert.ok(esperas.slice(ESPERAS_S.length).every((s) => s === ESPERAS_S.at(-1)));
  const total = esperas.reduce((a, b) => a + b, 0);
  assert.ok(total <= PRAZO_DAS_TENTATIVAS_S && total > PRAZO_DAS_TENTATIVAS_S - ESPERAS_S.at(-1),
    'Espera até ao prazo, e não mais.');
  let vezes = 0;
  await assert.rejects(comTentativas(async () => {
    vezes += 1;
    throw Object.assign(new Error('sem_saldo'), { status: 402 });
  }, { esperar: async () => { throw new Error('não devia esperar'); } }), (e) => e.status === 402);
  assert.equal(vezes, 1, 'Sem saldo não passa por esperar.');
  const paragem = new AbortController();
  await assert.rejects(comTentativas(async () => { throw emBaixo; }, {
    sinal: paragem.signal,
    texto: () => 'a meio',
    esperar: (ms, sinal) => {
      paragem.abort();
      return esperarComSinal(ms, sinal);
    },
  }), (e) => e instanceof RespostaParada && e.texto === 'a meio');
});

test('esperarComSinal: espera o tempo pedido, ou acaba logo com o «Parar»', async () => {
  const antes = Date.now();
  await esperarComSinal(20);
  assert.ok(Date.now() - antes >= 15);
  const paragem = new AbortController();
  const espera = esperarComSinal(60_000, paragem.signal);
  paragem.abort();
  await assert.rejects(espera, RespostaParada);
  await assert.rejects(esperarComSinal(10, paragem.signal), RespostaParada, 'Já parado: nem começa.');
});

// ── a entrega dos ficheiros (30/10/2026, pedido do Pedro: «corrige», como no chat) ──

/** O Python do ecrã a fingir: faz os ficheiros e confere a entrega com regras simples (as verdadeiras, as do chat,
 *  conferem-se em python.test.mjs). */
function ficheirosFalsos({ falha = false } = {}) {
  const chamadas = { entrega: [], aquecer: 0 };
  let id = 0;
  const formatosDe = (texto) => [[/\bword\b/i, 'docx'], [/\bpdf\b/i, 'pdf'], [/\bexcel\b/i, 'xlsx']]
    .filter(([padrao]) => padrao.test(texto)).map(([, formato]) => formato);
  return {
    chamadas,
    novoId: () => { id += 1; return id; },
    criar: async (argumentos, n) => ({ nome: `${argumentos.name}.${argumentos.format}`, formato: argumentos.format,
      mime: 'application/octet-stream', fonte: argumentos, dados: new Uint8Array([1]),
      saida: JSON.stringify({ attachment_id: n }) }),
    entrega: async (texto, pedido, entregues) => {
      chamadas.entrega.push({ texto, pedido, entregues });
      if (falha) throw new Error('python');
      return { anuncia: /pronto|em anexo|aqui está/i.test(texto),
        em_falta: formatosDe(pedido).filter((f) => !entregues.includes(f)) };
    },
    aquecer: () => { chamadas.aquecer += 1; },
  };
}

const nomesDasFerramentas = (pedido) => (pedido.tools || []).map((f) => f.function.name).sort();

test('anunciado sem o fazer: UMA ronda de reparação, só com as ferramentas dos ficheiros, e o texto passa a ser o dela', async () => {
  // A validação de 24/09/2026 do chat: «Está pronto o contrato em Word», sem create_file.
  const modelo = modeloFalso(
    [texto('Está pronto o contrato em Word.')],
    [...ferramenta(0, 'c1', 'create_file', '{"name":"contrato","format":"docx","content":"# Contrato"}')],
    [texto('Aqui está o contrato em Word, pronto a descarregar.')],
  );
  const ficheiros = ficheirosFalsos();
  const feitos = [];
  const etapas = [];
  const final = await responder({ mensagens: [{ role: 'user', content: 'Faz o contrato em Word' }], pedir: modelo.pedir,
    confirmar: async () => true, pesquisar: async () => '{}', ficheiros, pedidoDaPessoa: 'Faz o contrato em Word',
    aoFicheiro: (f) => feitos.push(f.nome), aoEtapa: (e) => etapas.push(e) });
  assert.equal(final, 'Aqui está o contrato em Word, pronto a descarregar.');
  assert.deepEqual(feitos, ['contrato.docx']);
  assert.equal(modelo.pedidos.length, 3);
  assert.deepEqual(nomesDasFerramentas(modelo.pedidos[1]),
    ['append_to_file', 'create_file', 'edit_document', 'read_document'], 'Na reparação, só as dos ficheiros.');
  const ordem = modelo.pedidos[1].messages.at(-1);
  assert.equal(ordem.role, 'system');
  assert.match(ordem.content, /^ENTREGA POR CONFIRMAR: não chegou nenhum ficheiro no formato pedido \(docx\)\. /);
  assert.deepEqual(modelo.pedidos[1].messages.at(-2), { role: 'assistant', content: 'Está pronto o contrato em Word.' });
  assert.ok(etapas.includes('A confirmar o ficheiro…'));
  assert.equal(ficheiros.chamadas.entrega.at(-1).entregues.join(), 'docx', 'Confere-se outra vez, com o que se fez.');
});

test('se nem a reparação o faz, fica o texto que o anunciava com o aviso — e não há segunda reparação', async () => {
  const modelo = modeloFalso([texto('Segue em anexo o relatório.')], [texto('Peço desculpa, segue em anexo.')]);
  const escritos = [];
  const final = await responder({ mensagens: [], pedir: modelo.pedir, confirmar: async () => true,
    pesquisar: async () => '{}', ficheiros: ficheirosFalsos(), pedidoDaPessoa: 'Faz um relatório',
    aoEscrever: (t) => escritos.push(t), lingua: 'pt' });
  assert.equal(final, 'Segue em anexo o relatório.\n\n⚠️ Não conseguimos gerar o documento pedido. Pedimos desculpa '
    + 'pelo incómodo. Volta a tentar mais tarde.');
  assert.equal(modelo.pedidos.length, 2, 'Uma só ronda de reparação.');
  assert.equal(escritos.at(-1), final, 'O ecrã mostra o texto que fica.');
  assert.doesNotMatch(final, /comunicado/, 'O ecrã não comunica erros a ninguém.');
});

test('com um ficheiro feito, mas não no formato pedido: a reparação pede só o que falta', async () => {
  const modelo = modeloFalso(
    [...ferramenta(0, 'c1', 'create_file', '{"name":"relatorio","format":"docx","content":"x"}')],
    [texto('Segue em anexo o relatório em Word e em PDF.')],
    [...ferramenta(0, 'c2', 'create_file', '{"name":"relatorio","format":"pdf","content":"x"}')],
    [texto('Aqui está também o PDF.')],
  );
  const feitos = [];
  const final = await responder({ mensagens: [], pedir: modelo.pedir, confirmar: async () => true,
    pesquisar: async () => '{}', ficheiros: ficheirosFalsos(), pedidoDaPessoa: 'Faz o relatório em Word e PDF',
    aoFicheiro: (f) => feitos.push(f.nome) });
  assert.equal(final, 'Aqui está também o PDF.');
  assert.deepEqual(feitos, ['relatorio.docx', 'relatorio.pdf']);
  assert.match(modelo.pedidos[2].messages.at(-1).content,
    /no formato pedido \(pdf\)\. .* nem voltes a criar os ficheiros já confirmados: relatorio\.docx\./);
});

test('sem anúncio nem ficheiro, nada se confere (nem arranca o Python); entregue, nada se repara', async () => {
  const sem = ficheirosFalsos();
  assert.equal(await responder({ mensagens: [], pedir: modeloFalso([texto('O prazo é de 30 dias.')]).pedir,
    confirmar: async () => true, pesquisar: async () => '{}', ficheiros: sem }), 'O prazo é de 30 dias.');
  assert.deepEqual([sem.chamadas.entrega.length, sem.chamadas.aquecer], [0, 0]);
  const com = ficheirosFalsos();
  const modelo = modeloFalso(
    [...ferramenta(0, 'c1', 'create_file', '{"name":"lista","format":"docx","content":"x"}')],
    [texto('O Word está pronto.')],
  );
  assert.equal(await responder({ mensagens: [], pedir: modelo.pedir, confirmar: async () => true,
    pesquisar: async () => '{}', ficheiros: com, pedidoDaPessoa: 'Faz uma lista em Word' }), 'O Word está pronto.');
  assert.equal(modelo.pedidos.length, 2, 'Entregue: sem reparação.');
  assert.ok(com.chamadas.aquecer >= 1, 'O Python arrancou enquanto a resposta chegava.');
});

test('a resposta retomada conta os ficheiros de antes de o ecrã fechar; com o Python em falha, fica como veio', async () => {
  const modelo = modeloFalso([texto('O Excel está pronto, em anexo.')]);
  assert.equal(await responder({ mensagens: [], pedir: modelo.pedir, confirmar: async () => true,
    pesquisar: async () => '{}', ficheiros: ficheirosFalsos(), pedidoDaPessoa: 'Faz a tabela em Excel',
    jaEntregues: [{ id: 3, nome: 'tabela.xlsx', formato: 'xlsx' }] }), 'O Excel está pronto, em anexo.');
  assert.equal(modelo.pedidos.length, 1);
  const outro = modeloFalso([texto('Está pronto o contrato em Word.')]);
  assert.equal(await responder({ mensagens: [], pedir: outro.pedir, confirmar: async () => true,
    pesquisar: async () => '{}', ficheiros: ficheirosFalsos({ falha: true }), pedidoDaPessoa: 'em Word' }),
  'Está pronto o contrato em Word.');
  assert.equal(outro.pedidos.length, 1);
});
