// O fundo da extensão «Recato — Conversa privada» (22/10/2026). Faz duas
// coisas (as regras estão em fundo_regras.js):
// 1. abre a conversa privada a partir do Recato com o ecrã que vem DENTRO da
//    extensão, igual ao da app — o código não vem do servidor;
// 2. confere a página privada.recato.ai contra as impressões digitais
//    publicadas, num sítio público e igual para toda a gente, e mostra o
//    resultado no ícone e na própria página.
import { MANIFESTOS } from './publicacao.js';
import {
  abrirConversa, capturarAoPassar, conferirSeparador, obterVersoes, separadorFechado,
} from './fundo_regras.js';

const api = globalThis.browser || globalThis.chrome;

if (api.webRequest?.filterResponseData) {
  capturarAoPassar(api);
}

api.tabs.onRemoved.addListener((separadorId) => {
  separadorFechado(api, separadorId);
});

api.runtime.onMessage.addListener((pedido, remetente, responder) => {
  let resposta;
  if (pedido?.tipo === 'abrir') {
    resposta = abrirConversa(api, pedido, remetente);
  } else if (pedido?.tipo === 'conferencia_exata') {
    // No Firefox o fundo já tem os bytes exatos: a página não precisa de os ler.
    resposta = Promise.resolve({ exata: Boolean(api.webRequest?.filterResponseData) });
  } else if (pedido?.tipo === 'conferir' && remetente.tab) {
    resposta = conferirSeparador(api, remetente.tab.id, pedido,
      () => obterVersoes(api, fetch, MANIFESTOS));
  } else {
    return false;
  }
  resposta.then(responder, () => responder(null));
  return true;
});
