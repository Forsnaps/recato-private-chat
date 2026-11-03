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

/** Descarrega *dados* no browser com o *nome*: um Blob local, sem rede. */
export function descarregarNoBrowser(nome, mime, dados, janela = globalThis) {
  const documento = janela.document;
  const endereco = janela.URL.createObjectURL(new janela.Blob([dados], { type: mime || 'application/octet-stream' }));
  const ligacao = documento.createElement('a');
  ligacao.href = endereco;
  ligacao.download = nome;
  ligacao.rel = 'noopener';
  documento.body.append(ligacao);
  ligacao.click();
  ligacao.remove();
  janela.setTimeout(() => janela.URL.revokeObjectURL(endereco), 60_000);
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
      guardarFicheiro: nativo.guardarFicheiro,
      // A resposta continua com a app fechada ou o ecrã desligado (28/10/2026).
      avisarTrabalho: (aTrabalhar) => nativo.avisarTrabalho(aTrabalhar, janela),
      // Uma pesquisa à espera do «sim» da pessoa (decisão do Pedro, 28/10/2026): com a app fechada, a notificação
      // passa a pedir-lhe que volte.
      avisarEspera: (aEspera) => nativo.avisarEspera(aEspera, janela),
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
    // Um ficheiro feito na conversa descarrega-se pelo browser (27/10/2026).
    guardarFicheiro: (nome, mime, dados) => descarregarNoBrowser(nome, mime, dados, janela),
    // Na página web e na extensão, fechar o separador já não acaba com a
    // resposta (28/10/2026): o servidor guarda-a cifrada e ela fica à espera
    // de quem volta (espera.js). Não há nada a avisar.
    avisarTrabalho: null,
    avisarEspera: null,
  };
}
