// O texto das respostas do Recato no ecrã da conversa privada (saiu do
// privada.js a 23/10/2026, para se testar). O modelo escreve em Markdown:
// mostra-se o negrito, os títulos, as tabelas e as ligações http(s) das
// «Fontes:» das pesquisas (25/10/2026), e o resto fica texto.
// Escapa-se tudo antes, por isso nenhum HTML do modelo entra.

export function escapar(texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const negrito = (texto) => texto.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// [nome](https://…): o endereço já vem escapado e nunca leva aspas nem
// espaços, por isso não sai do atributo; abre fora do ecrã.
const LIGACAO = /\[([^\]\n]+)\]\((https?:\/\/[^\s()"<>]+)\)/g;
const emLinha = (texto) => negrito(texto).replace(LIGACAO,
  '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

// Uma linha de tabela («| a | b |») e a linha que separa o cabeçalho
// («|---|:--:|»), como as escreve o modelo.
const LINHA_DA_TABELA = /^\s*\|.*\|\s*$/;
const SEPARADOR = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;

function celulas(linha) {
  return linha.trim().slice(1, -1).split('|').map((celula) => emLinha(celula.trim()));
}

function tabela(cabecalho, corpo) {
  const linha = (etiqueta, valores) => `<tr>${valores.map((v) => `<${etiqueta}>${v}</${etiqueta}>`).join('')}</tr>`;
  return `<div class="tabela"><table><thead>${linha('th', cabecalho)}</thead>`
    + `<tbody>${corpo.map((valores) => linha('td', valores)).join('')}</tbody></table></div>`;
}

export function formatar(texto) {
  const linhas = escapar(texto).split('\n');
  let html = '';
  let anteriorETexto = false;
  for (let i = 0; i < linhas.length; i++) {
    if (LINHA_DA_TABELA.test(linhas[i]) && SEPARADOR.test(linhas[i + 1] || '')) {
      const cabecalho = celulas(linhas[i]);
      const corpo = [];
      for (i += 2; i < linhas.length && LINHA_DA_TABELA.test(linhas[i]); i++) {
        corpo.push(celulas(linhas[i]));
      }
      i--;
      // A tabela é um bloco: não leva a quebra de linha do texto à volta.
      html += tabela(cabecalho, corpo);
      anteriorETexto = false;
      continue;
    }
    html += (anteriorETexto ? '\n' : '') + emLinha(linhas[i].replace(/^#{1,6}\s+(.+)$/, '<strong>$1</strong>'));
    anteriorETexto = true;
  }
  return html;
}
