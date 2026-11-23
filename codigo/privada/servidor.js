// As rotas do Recato que o ecrã da conversa privada usa (fs_chat_autonomo,
// controllers/privada.py), sempre com a sessão da conversa privada. Tudo o
// que vai daqui para lá já vai cifrado, exceto o consumo de tokens (quantos
// entraram, quantos saíram e quantos da entrada vieram da cache),
// as pesquisas na web que a pessoa confirma (só a frase ou o endereço) e os
// avisos de uma falha do código do ecrã (falhas.js: só o tipo e o sítio do
// erro no código e a versão do ecrã, nunca a mensagem nem nada da conversa).

/** As esperas (ms) antes de voltar a dizer o consumo de um pedido que o carteiro ainda não deu por acabado (a
 *  resposta chegou inteira ao ecrã primeiro, 30/10/2026); depois da última, fica a estimativa do servidor. */
export const ESPERAS_DO_CONSUMO_MS = [1000, 2000, 4000, 8000];

/** *esperar(ms)*: entre as vezes que se diz o consumo (nos testes, sem relógio). */
export function criarServidor(carteiro, sessaoAtual, { esperar = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  async function pedir(caminho, { metodo = 'GET', corpo } = {}) {
    const cabecalhos = { Authorization: `Bearer ${sessaoAtual()}` };
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    const resposta = await fetch(`${carteiro}${caminho}`, {
      method: metodo, headers: cabecalhos, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(dados.erro || `HTTP ${resposta.status}`);
      erro.status = resposta.status;
      erro.codigo = dados.erro;
      throw erro;
    }
    return dados;
  }

  return {
    renovar: () => pedir('/fs_chat/privada/renovar', { metodo: 'POST' }),
    /** O consumo de uma resposta e, se o pedido levava imagens, quantos
     *  bytes delas (o servidor tira-os da estimativa da cobrança). Desde
     *  20/11/2026 vai também quantos tokens da entrada a caixa-forte serviu
     *  da cache (*da_cache*, só quando há): cobram-se ao preço dela. *pedido*:
     *  o número que o carteiro deu à resposta (X-Recato-Pedido) — sem ele, o
     *  servidor junta o consumo ao pedido mais antigo por conferir. Se o
     *  carteiro ainda não acabou o pedido («a_correr»), volta a dizê-lo
     *  (ESPERAS_DO_CONSUMO_MS). */
    async consumo(usage, bytesImagens = 0, pedido = null) {
      const daCache = Number(usage.prompt_tokens_details?.cached_tokens) || 0;
      const corpo = { entrada: usage.prompt_tokens, saida: usage.completion_tokens, imagens: bytesImagens,
        ...(daCache > 0 ? { da_cache: daCache } : {}), ...(pedido ? { pedido: Number(pedido) } : {}) };
      let dito = null;
      for (const espera of [0, ...ESPERAS_DO_CONSUMO_MS]) {
        if (espera) await esperar(espera);
        dito = await pedir('/fs_chat/privada/consumo', { metodo: 'POST', corpo });
        if (dito.estado !== 'a_correr') break;
      }
      return dito;
    },
    /** Como acabou o pedido *pedido* ao modelo (o número que o carteiro lhe deu, X-Recato-Pedido): {estado, corte}
     *  — *corte* 'sem_saldo' ou 'saldo_em_uso' se foi o saldo a cortá-lo a meio (14/11/2026), senão null. */
    pedido: (pedido) => pedir(`/fs_chat/privada/pedido/${Number(pedido) || 0}`),
    /** O motivo do corte de *fluxo* pelo saldo, ou null: pergunta-se pelo pedido do carteiro preso a ele (o do SDK ou
     *  o de uma resposta guardada, espera.js) — o *corte* de responder (pesquisa.js). */
    async corteDoFluxo(fluxo) {
      const numero = Number(fluxo?.pedidoDoCarteiro);
      if (!numero) return null;
      return (await pedir(`/fs_chat/privada/pedido/${numero}`)).corte || null;
    },
    /** O texto do resultado de uma pesquisa (web_search) ou página (fetch_page)
     *  que a pessoa confirmou. */
    pesquisar: async (ferramenta, argumentos) => (await pedir('/fs_chat/privada/pesquisa', {
      metodo: 'POST', corpo: { ferramenta, argumentos },
    })).resultado,
    /** A resposta cifrada que o carteiro guardou para o pedido *numero* (28/10/2026): o estado, os cabeçalhos OAE e
     *  os bocados a partir do *desde* (espera.js). Erro com o status 404 se não a tem. */
    lerResposta: (numero, desde = 0) => pedir(`/fs_chat/privada/resposta/${numero}?desde=${Number(desde) || 0}`),
    /** O «Parar»: o carteiro deixa de receber a resposta (mesmo com o ecrã fechado). */
    pararResposta: (numero) => pedir(`/fs_chat/privada/resposta/${numero}/parar`, { metodo: 'POST' }),
    /** O ecrã já tem a resposta: o servidor apaga a cópia. */
    apagarResposta: (numero) => pedir(`/fs_chat/privada/resposta/${numero}/apagar`, { metodo: 'POST' }),
    /** Uma falha do código do ecrã (04/11/2026, falhas.js): onde, o motivo, a versão e, se houver, o tipo e o sítio
     *  do erro no código. */
    avisarFalha: (campos) => pedir('/fs_chat/privada/falha', { metodo: 'POST', corpo: campos }),
  };
}
