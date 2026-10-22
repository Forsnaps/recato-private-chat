// As rotas do Recato que o ecrã da conversa privada usa (fs_chat_autonomo,
// controllers/privada.py), sempre com a sessão da conversa privada. Tudo o
// que vai daqui para lá já vai cifrado (cofre.js), exceto o consumo de tokens.

export function criarServidor(carteiro, sessaoAtual) {
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
    consumo: (usage) => pedir('/fs_chat/privada/consumo', {
      metodo: 'POST', corpo: { entrada: usage.prompt_tokens, saida: usage.completion_tokens },
    }),
    /** {cofre}: a cópia da chave mestra fechada com o código. */
    lerCofre: () => pedir('/fs_chat/privada/cofre'),
    gravarCofre: (embrulhos, versaoAnterior) => pedir('/fs_chat/privada/cofre', {
      metodo: 'POST', corpo: { embrulhos, versao_anterior: versaoAnterior || null },
    }),
    listarConversas: async () => (await pedir('/fs_chat/privada/conversas')).conversas,
    lerConversa: (id) => pedir(`/fs_chat/privada/conversa/${id}`),
    gravarConversa: (cifrada, id, versaoAnterior) => pedir(
      id ? `/fs_chat/privada/conversa/${id}` : '/fs_chat/privada/conversa',
      { metodo: 'POST', corpo: { ...cifrada, versao_anterior: versaoAnterior || null } },
    ),
    apagarConversa: (id) => pedir(`/fs_chat/privada/conversa/${id}/apagar`, { metodo: 'POST' }),
  };
}
