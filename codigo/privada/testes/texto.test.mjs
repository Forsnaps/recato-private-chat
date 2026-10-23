// Testes do texto das respostas na conversa privada (privada/texto.js).
// Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatar } from '../texto.js';

const TABELA = [
  'Na prática:',
  '',
  '| Tipo de betão | Resistência **típica** |',
  '|---|:--:|',
  '| Betão corrente | 25–30 MPa |',
  '| Betão estrutural | 30–37 MPa |',
  '',
  'Mesmo assim, confirma no caderno de encargos.',
].join('\n');

test('as tabelas do modelo passam a tabela, com cabeçalho e linhas', () => {
  assert.equal(formatar(TABELA),
    'Na prática:\n'
    + '<div class="tabela"><table><thead><tr><th>Tipo de betão</th><th>Resistência <strong>típica</strong></th></tr></thead>'
    + '<tbody><tr><td>Betão corrente</td><td>25–30 MPa</td></tr>'
    + '<tr><td>Betão estrutural</td><td>30–37 MPa</td></tr></tbody></table></div>'
    + '\nMesmo assim, confirma no caderno de encargos.');
});

test('nas células o HTML do modelo também fica escapado', () => {
  const html = formatar('| a | b |\n|---|---|\n| <script>alert(1)</script> | <img src=x onerror=alert(1)> |');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>'));
});

test('sem a linha de separação não é tabela: fica o texto', () => {
  assert.equal(formatar('| isto | não é tabela |\nsó texto'), '| isto | não é tabela |\nsó texto');
  assert.equal(formatar('a | b'), 'a | b');
});

test('os títulos e o negrito ficam como estavam', () => {
  assert.equal(formatar('## Resumo\nO **prazo** é amanhã.\n<b>não</b>'),
    '<strong>Resumo</strong>\nO <strong>prazo</strong> é amanhã.\n&lt;b&gt;não&lt;/b&gt;');
});
