// Onde corre o ecrã da conversa privada (22/10/2026): na app (nativo.js), na
// extensão do browser ou na página privada.recato.ai (navegador.js). O código
// é o mesmo nos três; só muda de onde vem a sessão, onde fica a cópia da
// chave do histórico e se há prova de que o código é o publicado — na app e
// na extensão há (vem instalado com elas); na página web, só com a extensão.
import * as nativo from './nativo.js';
import { criarChaveDoNavegador, sessaoDaExtensao, sessaoDaLigacao } from './navegador.js';

/** 'app', 'extensao' ou 'web'. */
export function ondeCorre(janela = globalThis) {
  if (janela.RecatoNativo) return 'app';
  if (/^(chrome|moz)-extension:$/.test(janela.location?.protocol || '')) return 'extensao';
  return 'web';
}

export function criarPlataforma(janela = globalThis) {
  const onde = ondeCorre(janela);
  if (onde === 'app') {
    return {
      onde,
      pedirSessao: nativo.pedirSessao,
      fechar: nativo.fecharNoTelemovel,
      abrir: nativo.abrirNoTelemovel,
      confirmarAPessoa: nativo.confirmarAPessoa,
    };
  }
  const chave = criarChaveDoNavegador();
  return {
    onde,
    pedirSessao: onde === 'extensao'
      ? () => sessaoDaExtensao(janela.browser || janela.chrome, janela)
      : async () => sessaoDaLigacao(janela),
    fechar: chave.fechar,
    abrir: chave.abrir,
    // O código novo pede a impressão digital ou o PIN: por agora, só na app.
    confirmarAPessoa: null,
  };
}
