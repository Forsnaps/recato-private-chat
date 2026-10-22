// No Recato aberto no browser (22/10/2026): o botão «Privada» pergunta se a
// extensão está cá e, se estiver, entrega-lhe a sessão da conversa privada
// para ela abrir o ecrã que traz consigo (fundo.js). Só mensagens da própria
// página; nunca devolve nada além de «estou» e «aberta».
const api = globalThis.browser || globalThis.chrome;
const VERSAO = api.runtime.getManifest().version;

window.addEventListener('message', (evento) => {
  if (evento.source !== window || evento.origin !== location.origin) return;
  const dados = evento.data;
  if (!dados || typeof dados !== 'object') return;
  if (dados.recato_privada === 'ola') {
    window.postMessage({ recato_privada: 'estou', versao: VERSAO }, location.origin);
  } else if (dados.recato_privada === 'abrir') {
    api.runtime.sendMessage({ tipo: 'abrir', sessao: dados.sessao, carteiro: dados.carteiro, prazo: dados.prazo })
      .then((r) => r, () => null)
      .then((r) => window.postMessage({ recato_privada: r?.aberta ? 'aberta' : 'recusada' }, location.origin));
  }
});
