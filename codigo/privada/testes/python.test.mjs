// Testes do Python da conversa privada (27/10/2026): o mesmo Pyodide e as mesmas
// rodas que o ecrã carrega (privada/python/pacotes.json, da cache de
// scripts/pacotes_python.mjs), aqui em Node, com os módulos do chat
// (python/forsnaps/addons/forsnaps_ai_chat/) e python/privada_ficheiros.py.
// Correm com: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';

import { pythonDoEcra } from '../../scripts/construir_privada.mjs';
import { PODE_ANUNCIAR_FICHEIRO } from '../ficheiros.js';
import { criarPython } from '../python.js';
import { PYTHON, pythonDoEcraEmNode } from './python_do_ecra.mjs';

let chamar;
let py;

before(async () => {
  ({ chamar, py } = await pythonDoEcraEmNode());
}, { timeout: 120000 });

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const comeca = (dados, assinatura) => assinatura.every((b, i) => dados[i] === b);
/** O texto de um ficheiro, lido como o chat lê um anexo (privada_anexos.ler). */
const textoDe = (nome, dados) => JSON.parse(chamar('privada_anexos.ler',
  JSON.stringify({ anexos: [{ nome, mime: 'application/octet-stream' }], ids: [1] }), dados)).contexto;

test('Word, PowerPoint e Markdown saem do mesmo código do chat (documentos.py)', () => {
  const docx = chamar('criar', { name: 'Relatório final', format: 'docx', content: '# Relatório\n\nTexto **forte**.' }, 3);
  assert.equal(docx.nome, 'Relatório final.docx');
  assert.equal(docx.mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(comeca(docx.dados, ZIP));
  assert.deepEqual(JSON.parse(docx.saida).attachment_id, 3);
  assert.match(JSON.parse(docx.saida).note, /^O ficheiro segue anexado à tua resposta/);
  assert.match(textoDe('r.docx', docx.dados), /Relatório[\s\S]*Texto forte\./);
  const pptx = chamar('criar', { name: 'apresentacao', format: 'pptx', content: '# Capa\n# Diapositivo\n- a' }, 4);
  assert.ok(comeca(pptx.dados, ZIP));
  const md = chamar('criar', { name: '../../x', format: 'md', content: 'olá' }, 5);
  assert.equal(md.nome, 'x.md', 'Sem caminhos no nome, como no chat.');
  assert.equal(new TextDecoder().decode(md.dados), 'olá');
});

test('Excel com colunas calculadas e totais: as fórmulas e os totais do servidor; acrescentar linhas', () => {
  const args = { name: 'orcamento', format: 'xlsx', rows: [['Artigo', 'Quantidade', 'Preço unitário (€)'],
    ['Tijolo', 100, 0.35]], computed: [{ column: 'Total (€)', formula: 'Quantidade * Preço unitário (€)' }],
  totals: ['Total (€)'] };
  const criado = chamar('criar', args, 8);
  const saida = JSON.parse(criado.saida);
  assert.deepEqual(saida.totals, [{ column: 'Total (€)', sum: '35.00', euros: true }]);
  assert.match(saida.note, /A folha tem 1 linhas de dados\. As colunas calculadas e os totais são fórmulas/);
  const mais = chamar('acrescentar', criado.fonte, { attachment_id: 8, rows: [['Cimento', 10, 7.2]] }, 8);
  assert.deepEqual(JSON.parse(mais.saida).totals, [{ column: 'Total (€)', sum: '107.00', euros: true }]);
  assert.equal(mais.fonte.rows.length, 3);
  assert.match(JSON.parse(mais.saida).note, /^Parte acrescentada/);
  assert.match(textoDe('orcamento.xlsx', chamar('gerar', mais.fonte)), /Tijolo[\s\S]*Cimento/);
});

test('PDF com o € e as letras portuguesas (o fpdf2 desenha o HTML do chat)', () => {
  const pdf = chamar('criar', { name: 'carta', format: 'pdf',
    content: '# Carta\n\nO valor é de 1 234,50 € — «ótimo».\n\n| A | B |\n|---|---|\n| ção | 2 |' }, 9);
  assert.equal(new TextDecoder().decode(pdf.dados.slice(0, 5)), '%PDF-');
  assert.ok(pdf.dados.length > 1000);
});

test('PDF com «<br>»: linha em branco sozinho e mudança de linha no texto e numa célula (28/10/2026)', () => {
  // O fpdf2 falhava com um <br> dentro de <td>: a célula leva a mudança de linha como está.
  const pdf = chamar('criar', { name: 'ata', format: 'pdf', content: 'Lida e aprovada.\n\n<br>\n\n'
    + 'Linha um<br>Linha dois\n\n| Fração | Condómino |\n|---|---|\n| A | Rui Matos<br>Presidente |' }, 10);
  assert.ok(pdf.dados, pdf.erro);
  const texto = textoDe('ata.pdf', pdf.dados);
  assert.doesNotMatch(texto, /<br/i);
  assert.match(texto, /Linha um\s*\n\s*Linha dois/);
  assert.match(texto, /Rui Matos\s*\n\s*Presidente/);
});

test('erros: os mesmos textos do chat, para o modelo', () => {
  assert.deepEqual(JSON.parse(chamar('criar', { name: 'x', format: 'exe' }, 1).erro),
    { error: "formato não suportado: 'exe' (aceites: txt, md, csv, xlsx, docx, pptx, pdf)" });
  assert.match(JSON.parse(chamar('criar', { name: 'x', format: 'xlsx' }, 1).erro).error, /csv\/xlsx precisam de/);
  assert.deepEqual(JSON.parse(chamar('acrescentar', { format: 'md', name: 'a.md', content: 'a' }, {}, 2).erro),
    { error: 'nada para acrescentar: dá o Markdown em content ou as linhas em rows' });
  assert.match(JSON.parse(chamar('acrescentar', null, { content: 'x' }, 2).erro).error, /^ficheiro não encontrado/);
});

/** À cabeça de cada .py do ecrã (python_do_chat.py DIREITOS). */
const DIREITOS = '# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.\n'
  + '# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.\n';

test('a entrega confere-se pelas regras do chat: o anúncio de um ficheiro e os formatos pedidos em falta', () => {
  // entrega_ficheiros, copiado do servidor (30/10/2026): a ronda de reparação é a do ecrã (pesquisa.js).
  assert.deepEqual(chamar('entrega', 'Está pronto o contrato em Word.', 'Faz o contrato em Word', []),
    { anuncia: true, em_falta: ['docx'] });
  assert.deepEqual(chamar('entrega', 'Aqui tens o resumo: o prazo é de 30 dias.', 'Resume o contrato', []),
    { anuncia: false, em_falta: [] });
  assert.deepEqual(chamar('entrega', 'Segue em anexo o relatório.', 'Faz o relatório em Word e PDF', ['docx']),
    { anuncia: true, em_falta: ['pdf'] });
  assert.deepEqual(chamar('entrega', 'Com esses valores, preencho o modelo e envio-te o Excel.', '', []).anuncia, false,
    'Uma promessa não é uma entrega.');
});

test('o filtro do ecrã deixa passar todos os anúncios que os testes do chat conhecem (só sem eles não arranca o Python)', () => {
  // Os anúncios verdadeiros do servidor (TestAnuncioEFormatos.ANUNCIA): se lá aparecer um sem nenhuma das palavras de
  // PODE_ANUNCIAR_FICHEIRO, este teste avisa — o ecrã deixaria de o confirmar.
  py.globals.set('fonte_dos_testes', fs.readFileSync(new URL(
    '../../../forsnaps/addons/forsnaps_ai_chat/tests/test_ai_chat_entrega_ficheiros.py', import.meta.url), 'utf8'));
  const anuncios = py.runPython(`
import ast
arvore = ast.parse(fonte_dos_testes)
modulo = {n.targets[0].id: n.value for n in arvore.body if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name)}
classe = next(n for n in arvore.body if isinstance(n, ast.ClassDef) and n.name == 'TestAnuncioEFormatos')
lista = next(n.value for n in classe.body if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'ANUNCIA')
[ast.literal_eval(modulo[e.id] if isinstance(e, ast.Name) else e) for e in lista.elts]
`).toJs();
  assert.ok(anuncios.length >= 60, `${anuncios.length} anúncios`);
  for (const texto of anuncios) {
    assert.equal(chamar('entrega', texto, '', []).anuncia, true, `o Python do ecrã não o vê: ${texto}`);
    assert.ok(PODE_ANUNCIAR_FICHEIRO.test(texto), `o filtro do ecrã deixava-o de fora: ${texto}`);
  }
});

test('o código do chat vai no ecrã sem os comentários nem as notas internas (python_do_chat.py)', () => {
  // É o mesmo programa do servidor (confere-o um teste do servidor, fs_chat_autonomo).
  const pasta = path.join(PYTHON, 'forsnaps', 'addons', 'forsnaps_ai_chat');
  for (const nome of ['documentos.py', 'revisoes.py', 'ferramenta_anexos.py', 'entrega_ficheiros.py',
    'controllers/ai_chat.py']) {
    const texto = fs.readFileSync(path.join(pasta, nome), 'utf8');
    assert.ok(texto.startsWith(DIREITOS), nome);
    assert.match(texto.slice(DIREITOS.length), /^# (Copiado|Gerado) do chat do Recato \(forsnaps_ai_chat\//);
    for (const nota of ['Pedro', 'Sentry', 'K3', 'medido', 'Medido', 'hostyourai', 'openai', 'anthropic']) {
      assert.ok(!texto.includes(nota), `«${nota}» em ${nome}`);
    }
  }
});

test('o Python do ecrã e as regras do chat vão com todos os direitos reservados, não com a MIT', () => {
  // Decisão do Pedro (27/10/2026): à vista só para se poder confirmar o que o
  // ecrã faz. Todos os .py que vão no worker, os escritos à mão também.
  const modulos = pythonDoEcra();
  for (const nome of ['privada_anexos.py', 'privada_ficheiros.py', 'forsnaps/__init__.py',
    'forsnaps/addons/forsnaps_ai_chat/controllers/so_no_ecra.py', 'forsnaps/addons/forsnaps_ai_chat/documentos.py']) {
    assert.ok(nome in modulos, nome);
  }
  for (const [nome, texto] of Object.entries(modulos)) assert.ok(texto.startsWith(DIREITOS), nome);
  const regras = JSON.parse(fs.readFileSync(path.join(PYTHON, '..', 'ficheiros.json'), 'utf8'));
  assert.match(regras._licenca, /Todos os direitos reservados \(all rights reserved\) — ver privada\/licencas\.txt/);
  const licencas = fs.readFileSync(path.join(PYTHON, '..', 'licencas.txt'), 'utf8');
  assert.match(licencas, /Exceto o código do chat do Recato que este ecrã corre: a pasta python\//);
  assert.match(licencas, /Todos os direitos reservados \/ All rights reserved/);
});

test('o cliente do worker: um pedido de cada vez por id, erros e um worker caído', async () => {
  const mensagens = [];
  let trabalhador;
  const python = criarPython({ criarTrabalhador: () => {
    trabalhador = { postMessage: (m) => mensagens.push(m), terminate() { this.terminado = true; } };
    return trabalhador;
  } });
  const a = python.criar({ format: 'md' }, 1);
  const b = python.gerar({ format: 'md' });
  assert.deepEqual(mensagens.map((m) => [m.id, m.funcao]), [[1, 'criar'], [2, 'gerar']]);
  trabalhador.onmessage({ data: { id: 2, ok: true, resultado: new Uint8Array([1]) } });
  trabalhador.onmessage({ data: { id: 1, ok: false, erro: 'falhou' } });
  assert.deepEqual(await b, new Uint8Array([1]));
  await assert.rejects(a, { message: 'falhou', codigo: 'python' });
  const c = python.gerar({ format: 'docx' });
  const antes = trabalhador;
  trabalhador.onerror({ message: 'sem memória' });
  await assert.rejects(c, { message: 'sem memória' });
  assert.equal(antes.terminado, true);
  python.gerar({});
  assert.notEqual(trabalhador, antes, 'O pedido seguinte cria outro worker.');
});

test('o cliente avisa uma vez, na primeira resposta, que o Python está pronto', async () => {
  let avisos = 0;
  let trabalhador;
  const python = criarPython({ aoPronto: () => { avisos += 1; },
    criarTrabalhador: () => { trabalhador = { postMessage() {}, terminate() {} }; return trabalhador; } });
  const a = python.gerar({});
  const b = python.gerar({});
  trabalhador.onmessage({ data: { id: 1, ok: true, resultado: 1 } });
  trabalhador.onmessage({ data: { id: 2, ok: true, resultado: 2 } });
  await Promise.all([a, b]);
  assert.equal(avisos, 1);
});
