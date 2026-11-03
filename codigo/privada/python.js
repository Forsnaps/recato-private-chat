// O Python do ecrã, visto do ecrã (27/10/2026): um worker (python_trabalhador.js)
// que só se cria no primeiro pedido, e as funções dos ficheiros e dos
// documentos anexados que a conversa usa. Sem ecrã nem worker, para os testes
// (privada/testes/python.test.mjs): o worker vem de fora.

/**
 * O Python deste ecrã. *criarTrabalhador()*: o worker (no browser,
 * `new Worker('./python_trabalhador.js', {type: 'module'})`); *aoPronto()*: uma
 * vez, na primeira resposta.
 * Devolve {criar, acrescentar, gerar, entrega, lerAnexos, ferramentaDosAnexos, fichas, carregar, chamar, encerrar}.
 */
export function criarPython({ criarTrabalhador, aoPronto }) {
  let trabalhador = null;
  let avisado = false;
  let proximo = 1;
  const pendentes = new Map();

  function falharTodos(erro) {
    for (const { rejeitar } of pendentes.values()) rejeitar(erro);
    pendentes.clear();
    trabalhador?.terminate?.();
    trabalhador = null;
  }

  function oTrabalhador() {
    if (trabalhador) return trabalhador;
    trabalhador = criarTrabalhador();
    trabalhador.onmessage = ({ data }) => {
      const pendente = pendentes.get(data?.id);
      if (!pendente) return;
      pendentes.delete(data.id);
      if (data.ok && !avisado) {
        // A primeira resposta: o Python está pronto (a extensão confere o que ele carregou).
        avisado = true;
        aoPronto?.();
      }
      if (data.ok) pendente.resolver(data.resultado);
      else pendente.rejeitar(Object.assign(new Error(data.erro || 'python'), { codigo: 'python' }));
    };
    // O worker caiu (sem memória, por exemplo): os pedidos em curso falham e
    // o seguinte cria outro.
    trabalhador.onerror = (evento) => falharTodos(Object.assign(new Error(evento?.message || 'python'),
      { codigo: 'python' }));
    return trabalhador;
  }

  function chamar(funcao, ...argumentos) {
    return new Promise((resolver, rejeitar) => {
      const id = proximo++;
      pendentes.set(id, { resolver, rejeitar });
      oTrabalhador().postMessage({ id, funcao, argumentos });
    });
  }

  return {
    chamar,
    /** create_file: {fonte, nome, formato, mime, dados, saida} ou {erro} (JSON para o modelo). */
    criar: (argumentos, id) => chamar('criar', argumentos, id),
    /** append_to_file sobre a *fonte* guardada do ficheiro *id*. */
    acrescentar: (fonte, argumentos, id) => chamar('acrescentar', fonte, argumentos, id),
    /** Os bytes de um ficheiro guardado, refeitos da fonte. */
    gerar: (fonte) => chamar('gerar', fonte),
    /** {anuncia, em_falta}: se o *texto* de uma resposta anuncia um ficheiro e os formatos que o *pedido* da pessoa
     *  quer e não estão nos *entregues* (as regras do chat, entrega_ficheiros). */
    entrega: (texto, pedido, entregues) => chamar('entrega', texto, pedido, entregues),
    /** Os anexos de uma mensagem, lidos como o chat os lê (privada_anexos.py):
     *  o pedido em JSON e os bytes de cada anexo. O PDF precisa do grupo «pdf»
     *  (carregar). */
    lerAnexos: (pedido, ...dados) => chamar('privada_anexos.ler', pedido, ...dados),
    /** read_document, edit_document ou procurar_nos_anexos. */
    ferramentaDosAnexos: (pedido, ...dados) => chamar('privada_anexos.ferramenta', pedido, ...dados),
    /** As fichas dos anexos grandes (JSON, com as pausas para o modelo). */
    fichas: (pedido) => chamar('privada_anexos.fichas', pedido),
    /** As páginas digitalizadas dos PDF e as imagens dos documentos (JSON, com os pedidos ao modelo das imagens):
     *  os bytes de cada ficheiro. */
    paginas: (pedido, ...ficheiros) => chamar('privada_anexos.paginas', pedido, ...ficheiros),
    /** Carrega um grupo de pacotes.json (o «pdf» só no primeiro PDF). */
    carregar: (grupo) => chamar('carregar', grupo),
    encerrar: () => falharTodos(Object.assign(new Error('encerrado'), { codigo: 'python' })),
  };
}
