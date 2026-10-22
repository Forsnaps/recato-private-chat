// Os textos da extensão (na faixa da página privada e no popup), em
// português de Portugal ou inglês, pela língua do browser.
const PT = {
  conferida: (versao) => `Página conferida pela extensão: é a versão publicada ${versao}.`,
  diferente: 'Atenção: esta página NÃO é a publicada. Não escrevas nada aqui.',
  diferente_titulo: 'Esta página não é a versão publicada da conversa privada.',
  diferente_explica: (ficheiros) => `Ficheiros diferentes do publicado: ${ficheiros.join(', ') || '?'}. `
    + 'Não escrevas nada: o que escreveres pode ser lido por quem trocou a página. Avisa o Recato.',
  mostrar_mesmo_assim: 'Mostrar a página mesmo assim',
  incompleta: 'A extensão não conseguiu ler esta página para a conferir. Recarrega a página.',
  interferencia: 'Outra extensão está a mexer nesta página: não dá para confirmar que é a publicada.',
  erro: 'A extensão não conseguiu obter as versões publicadas para conferir esta página.',
  popup_titulo: 'Recato — Conversa privada',
  popup_explica: 'Abre a conversa privada a partir do Recato (botão «Privada», na caixa de escrita): '
    + 'abre o ecrã que vem dentro desta extensão. Na página privada.recato.ai, a extensão confere se é a publicada.',
  popup_fora: 'Este separador não é a página privada.recato.ai.',
  como_confirmar: 'Como confirmar',
};

const EN = {
  conferida: (versao) => `Page checked by the extension: it is published version ${versao}.`,
  diferente: 'Warning: this page is NOT the published one. Do not type anything here.',
  diferente_titulo: 'This page is not the published version of the private chat.',
  diferente_explica: (ficheiros) => `Files that differ from the published ones: ${ficheiros.join(', ') || '?'}. `
    + 'Do not type anything: whoever changed the page could read it. Let Recato know.',
  mostrar_mesmo_assim: 'Show the page anyway',
  incompleta: 'The extension could not read this page to check it. Reload the page.',
  interferencia: 'Another extension is changing this page: it cannot be confirmed as the published one.',
  erro: 'The extension could not get the published versions to check this page.',
  popup_titulo: 'Recato — Private chat',
  popup_explica: 'Open the private chat from Recato (the «Private» button in the message box): it opens the '
    + 'screen that comes inside this extension. On the privada.recato.ai page, the extension checks it is the published one.',
  popup_fora: 'This tab is not the privada.recato.ai page.',
  como_confirmar: 'How to check',
};

export const textos = (lingua) => (/^pt\b/i.test(lingua || '') ? PT : EN);
