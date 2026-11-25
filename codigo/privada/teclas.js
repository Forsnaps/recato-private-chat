// A tecla de enviar na caixa de escrita da conversa privada (23/11/2026, pedido do Pedro; saiu do privada.js para se
// testar). Como no chat do Recato e no Recato Code: o Enter envia e o Shift+Enter muda de linha; o Ctrl/Cmd+Enter
// também envia e, com Shift, a pensar ao máximo. No telemóvel e no tablet o teclado do ecrã não tem Shift+Enter: lá o
// Enter muda de linha e envia o botão.

/** O que a tecla *evento* faz na caixa: 'enviar', 'maximo' (enviar a pensar ao máximo) ou null (fica para o browser:
 *  a linha nova, ou a composição de um acento). *comTeclado*: há teclado de verdade (não é um ecrã de toque). */
export function teclaDaCaixa(evento, { comTeclado }) {
  // A meio de uma composição (acentos, teclados asiáticos) o Enter é dela; o Safari avisa-o só pelo keyCode 229.
  if (evento.key !== 'Enter' || evento.isComposing || evento.keyCode === 229) return null;
  if (evento.ctrlKey || evento.metaKey) return evento.shiftKey ? 'maximo' : 'enviar';
  if (evento.shiftKey || evento.altKey || !comTeclado) return null;
  return 'enviar';
}
