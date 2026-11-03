// Os ficheiros da conversa privada (27/10/2026): create_file e append_to_file,
// como no chat do Recato, feitos neste ecrã pelo mesmo código do servidor
// (o Python do Pyodide, python.js), para a conversa (pesquisa.js); o ficheiro
// feito guarda a sua «fonte» (os argumentos do create_file), de onde se volta
// a fazer para o descarregar.
import DADOS from './ficheiros.json' with { type: 'json' };

/** As que fazem ficheiros novos (read_document e edit_document são dos anexos: anexos.js). */
export const FAZEM_FICHEIROS = new Set(['create_file', 'append_to_file']);
/** As ferramentas dos ficheiros do chat (FILE_TOOLS_OPENAI), as quatro, como lá. */
export const FERRAMENTAS_DE_FICHEIROS = DADOS.ficheiros.ferramentas;
/** As regras dos ficheiros do chat (FILES_PROMPT). */
export const REGRAS_DOS_FICHEIROS = DADOS.ficheiros.prompt;

const A_PREPARAR = ['A preparar %(nome)s…', 'Preparing %(nome)s…'];
const aPreparar = (nome, lingua) => A_PREPARAR[lingua === 'en' ? 1 : 0].replace('%(nome)s', nome);
const erroDaFerramenta = (mensagem) => JSON.stringify({ error: mensagem });

// ── a entrega dos ficheiros (30/10/2026, pedido do Pedro: como no chat) ──
// O modelo às vezes diz que o ficheiro está pronto sem o ter feito. No chat a
// prova é o ficheiro, nunca o texto (_confirmar_entrega_de_ficheiro): a
// resposta que anuncia um ficheiro que não fez (ou sem o formato pedido) tem
// UMA ronda de reparação, só com as ferramentas dos ficheiros; se nem assim,
// fica com o aviso. Aqui é igual, pelas mesmas regras (entrega_ficheiros.py,
// no Python do ecrã); a ronda é a do responder (pesquisa.js).

/** As palavras sem as quais nenhum anúncio de ficheiro do chat existe (entrega_ficheiros._ANUNCIO): sem elas não se
 *  arranca o Python do ecrã para confirmar nada. */
export const PODE_ANUNCIAR_FICHEIRO = new RegExp('\\b(?:documentos?|documents?|ficheiros?|arquivos?|anex\\w*|files?|'
  + 'attach\\w*|download\\w*|please find|word|docx?|excel|xlsx?|folha de c[áa]lculo|spreadsheet|powerpoint|pptx?|'
  + 'slides?|diapositivos?|pdf|csv|markdown|md|txt)\\b', 'i');
/** As que entregam um ficheiro (_FERRAMENTAS_QUE_ENTREGAM): chamadas, a entrega confirma-se mesmo sem anúncio. */
export const ENTREGAM = new Set(['create_file', 'edit_document']);
/** Rondas da reparação: as do create_file (e do append_to_file) e, na última, a resposta sem ferramentas. */
export const RONDAS_DA_REPARACAO = 3;

const A_CONFIRMAR = ['A confirmar o ficheiro…', 'Checking the file…'];
// Os avisos do chat sem o «já foi comunicado à nossa equipa»: o ecrã não comunica erros.
const NAO_CRIADO = ['⚠️ Não conseguimos gerar o documento pedido. Pedimos desculpa pelo incómodo. Volta a tentar '
  + 'mais tarde.', '⚠️ We could not generate the requested document. We apologise for the inconvenience. Please try '
  + 'again later.'];
const NOUTRO_FORMATO = ['⚠️ Não conseguimos gerar o documento no formato pedido; segue no formato em que foi possível '
  + 'criá-lo.', '⚠️ We could not generate the document in the requested format; it is attached in the format we were '
  + 'able to create.'];
const naLingua = (par, lingua) => par[lingua === 'en' ? 1 : 0];
export const aConfirmarOFicheiro = (lingua) => naLingua(A_CONFIRMAR, lingua);
/** O aviso no fim da resposta que anunciou um ficheiro que nem a reparação fez (*algum*: há outro, noutro formato). */
export const avisoDaEntrega = (algum, lingua) => naLingua(algum ? NOUTRO_FORMATO : NAO_CRIADO, lingua);

/** A ordem da ronda de reparação, a do chat (sem as ferramentas de modelos de documentos, que aqui não há):
 *  *emFalta*, os formatos pedidos que faltam; *feitos*, os ficheiros que a resposta já entregou. */
export function ordemDaEntrega(emFalta, feitos) {
  return 'ENTREGA POR CONFIRMAR: não chegou nenhum ficheiro'
    + (emFalta.length ? ` no formato pedido (${emFalta.join(', ')})` : '')
    + '. Dizer que está anexado ou pronto não o cria. Cria-o AGORA com create_file (ou edit_document, se é uma '
    + 'cópia alterada de um anexo do utilizador), com o conteúdo completo. Não repitas outras ações do pedido'
    + (feitos.length ? ` nem voltes a criar os ficheiros já confirmados: ${feitos.map((f) => f.nome).join(', ')}` : '')
    + '. Se não conseguires, explica porquê sem afirmares que o entregaste.';
}

/**
 * Um ficheiro pedido pelo modelo (create_file ou append_to_file), feito pelo
 * Python do ecrã: o que o modelo recebe, como _execute_file_tool no chat. O
 * ficheiro fica em *feitos* (os desta chamada: só se acrescenta a um ficheiro
 * criado nela) e o ecrã sabe dele por *aoFicheiro*.
 */
export async function ficheiroPedido(nome, argumentos, { ficheiros, feitos, lingua = 'pt', etapa, aoFicheiro }) {
  try {
    if (nome === 'create_file') {
      etapa?.(aPreparar(String(argumentos?.name || '…'), lingua));
      const id = ficheiros.novoId();
      const r = await ficheiros.criar(argumentos, id);
      if (r.erro) return r.erro;
      const ficheiro = { id, nome: r.nome, formato: r.formato, mime: r.mime, fonte: r.fonte };
      feitos.push(ficheiro);
      aoFicheiro?.(ficheiro, r.dados);
      return r.saida;
    }
    const id = Number(argumentos?.attachment_id);
    const ficheiro = feitos.find((f) => f.id === id);
    if (!ficheiro) {
      return erroDaFerramenta('ficheiro não encontrado: só se acrescenta a um ficheiro criado com create_file '
        + 'nesta resposta — usa o attachment_id que ele devolveu');
    }
    etapa?.(aPreparar(ficheiro.nome, lingua));
    const r = await ficheiros.acrescentar(ficheiro.fonte, argumentos, id);
    if (r.erro) return r.erro;
    ficheiro.fonte = r.fonte;
    aoFicheiro?.(ficheiro, r.dados);
    return r.saida;
  } catch {
    // O Python do ecrã falhou (sem memória, por exemplo): como no chat, o
    // modelo lê só o erro genérico.
    return erroDaFerramenta('falha a processar o ficheiro');
  }
}

