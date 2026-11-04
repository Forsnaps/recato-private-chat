// Os documentos anexados à conversa privada (27/10/2026, decisão do Pedro:
// «documentos anexados: sim, junta»): PDF, Word, Excel, PowerPoint e texto.
// Leem-se e editam-se neste ecrã pelo mesmo código do chat do Recato
// (python/privada_anexos.py, com o controlador do chat tal como está), e o
// texto vai com a mensagem à caixa-forte, como no chat. Sem ecrã, para os
// testes (privada/testes/anexos.test.mjs).
//
// Como no chat:
// - o texto dos anexos vai com a mensagem (o bloco «ANEXOS DO UTILIZADOR»);
//   nas 3 mensagens com anexos mais recentes vai inteiro, nas outras ficam os
//   nomes (_get_conversation_history);
// - um anexo grande (mais de 20 000 carateres) lê-se UMA vez para uma ficha
//   por anexo, e daí em diante vai a ficha; o pormenor procura-se no texto
//   completo com procurar_nos_anexos;
// - os Word, Excel e PowerPoint leem-se e editam-se com read_document e
//   edit_document; a cópia editada é um ficheiro novo da conversa;
// - as páginas digitalizadas dos PDF (só com imagem) passam a texto pelo
//   modelo das imagens da caixa-forte, todas, antes da resposta (30/10/2026,
//   decisão do Pedro: «sim» ao pdf.js, que as desenha neste ecrã), e as
//   imagens dentro de um Word, PowerPoint ou Excel também (02/11/2026).
//
// O que só o ecrã tem: os bytes dos anexos ficam em memória enquanto ele está
// aberto e, os que couberem, guardados (cifrados) com a conversa; sem eles o
// modelo sabe que o original já não está para ler nem editar.
import { avisos } from './falhas.js';
import DADOS from './ficheiros.json' with { type: 'json' };

/** read_document e edit_document (as do chat, FILE_TOOLS_OPENAI). */
export const COM_OS_DOCUMENTOS = new Set(['read_document', 'edit_document']);
export const FERRAMENTAS_DOS_DOCUMENTOS = DADOS.ficheiros.ferramentas
  .filter((f) => COM_OS_DOCUMENTOS.has(f.function.name));
/** procurar_nos_anexos e a regra que vai com ela (ferramenta_anexos.py). */
export const FERRAMENTA_PROCURAR = DADOS.anexos.procurar;
export const REGRA_DAS_FICHAS = DADOS.anexos.regra;
/** Os limites do chat: anexos por mensagem, o tamanho a partir do qual se
 *  fazem fichas e o máximo que vai inteiro sem elas. */
export const LIMITES_DOS_ANEXOS = DADOS.anexos.limites;
/** O que dos originais se guarda com a conversa (em base64): os mais
 *  recentes até aqui; os outros ficam só enquanto o ecrã está aberto. */
export const MAX_ORIGINAIS_GUARDADOS = 1024 * 1024;
/** O teto de saída de uma leitura das fichas (o de uma resposta do chat). */
export const MAX_TOKENS_DAS_FICHAS = DADOS.limites.MAX_TOKENS_CHAT;
/** Como o chat desenha as páginas digitalizadas e quantas lê ao mesmo tempo (paginas.js, lerAsPaginas). */
export const LIMITES_DAS_PAGINAS = DADOS.paginas;

const TEXTOS = {
  a_ler: ['A ler os anexos…', 'Reading the attachments…'],
  a_ler_parte: ['A ler os anexos (parte %(parte)s de %(partes)s)…',
    'Reading the attachments (part %(parte)s of %(partes)s)…'],
  a_editar: ['A editar %(nome)s…', 'Editing %(nome)s…'],
  a_ler_paginas: ['A ler as páginas digitalizadas: %(feitas)s de %(total)s…',
    'Reading the scanned pages: %(feitas)s of %(total)s…'],
  erro_por_ler: [DADOS.anexos.erro_por_ler, 'The attachments could not be read: the AI service did not respond. '
    + 'Please try again in a few minutes.'],
};

/** Um texto dos anexos na *lingua* ('pt' ou 'en'). */
export function textoDosAnexos(chave, lingua = 'pt', valores = {}) {
  return TEXTOS[chave][lingua === 'en' ? 1 : 0].replace(/%\((\w+)\)s/g, (_m, nome) => String(valores[nome] ?? ''));
}

/** O que o modelo lê quando o original de um anexo já não está no ecrã. */
export const ORIGINAL_EM_FALTA = 'o original deste ficheiro já não está guardado nesta conversa (era grande de '
  + 'mais para ficar com ela): pede ao utilizador que o junte outra vez';

/** Se um ficheiro escolhido vai como documento (e não como imagem). */
export const eDocumento = (ficheiro) => !String(ficheiro?.type || '').toLowerCase().startsWith('image/');
const ePdf = (anexo) => /pdf$/i.test(anexo.mime || '') || /\.pdf$/i.test(anexo.nome || '');

/**
 * Lê os documentos de uma mensagem como o chat os lê (_process_attachments):
 * *documentos* [{nome, mime, dados}] → {contexto, anexos: [{id, nome, mime,
 * tipo, editavel, tamanho}]}, ou {erro} (o texto do chat, para a pessoa).
 * *novoId()*: o número de cada um na conversa.
 */
export async function lerAnexos(documentos, { python, novoId }) {
  if (!documentos.length) return { contexto: '', anexos: [] };
  const ids = documentos.map(() => novoId());
  // O texto dos PDF lê-o o pdfminer, que só se carrega no primeiro PDF.
  if (documentos.some(ePdf)) await python.carregar('pdf');
  const r = JSON.parse(await python.lerAnexos(JSON.stringify({
    anexos: documentos.map(({ nome, mime }) => ({ nome, mime })), ids,
  }), ...documentos.map((d) => d.dados)));
  if (r.erro) return { erro: r.erro };
  const tamanhos = new Map(ids.map((id, i) => [id, documentos[i].dados?.length || 0]));
  return { contexto: r.contexto || '', anexos: (r.anexos || []).map((a) => ({ ...a, tamanho: tamanhos.get(a.id) || 0 })),
    digitalizadas: r.digitalizadas || [], imagens: r.imagens || [] };
}

/**
 * As páginas digitalizadas que lerAnexos marcou (*lidos*.digitalizadas) e as
 * imagens dentro de um Word, PowerPoint ou Excel (*lidos*.imagens, 02/11/2026),
 * lidas como no chat (_ler_paginas_digitalizadas, no Python do ecrã): as
 * páginas desenhadas aqui (*desenhar(dados, paginas)* → [{pagina, jpeg}], o
 * pdf.js de paginas.js), as imagens tiradas do próprio documento pelo Python, e
 * com os pedidos ao modelo das imagens feitos pelo ecrã (*chamar(pedido)* →
 * {texto, cortada}), os de vários lotes ao mesmo tempo, como no chat.
 * Devolve o texto dos anexos com cada página e imagem no lugar da marca — ou,
 * a que não se leu, com o aviso do chat. Sem saldo ou com o «Parar», o erro sobe.
 */
export async function lerAsPaginas(lidos, documentos, { python, desenhar, chamar, etapa, lingua = 'pt',
  emSimultaneo = LIMITES_DAS_PAGINAS.PAGINAS_EM_SIMULTANEO }) {
  const digitalizadas = lidos.digitalizadas || [];
  const imagens = lidos.imagens || [];
  if (!digitalizadas.length && !imagens.length) return lidos.contexto;
  const porAnexo = new Map();
  for (const [anexo, pagina] of digitalizadas) porAnexo.set(anexo, [...(porAnexo.get(anexo) || []), pagina]);
  for (const [anexo] of imagens) if (!porAnexo.has(anexo)) porAnexo.set(anexo, []);
  const anexos = [];
  const ficheiros = [];
  const paginas = [];
  for (const [anexo, numeros] of porAnexo) {
    const indice = lidos.anexos.findIndex((a) => a.id === anexo);
    const dados = documentos[indice]?.dados;
    if (!dados) continue;
    anexos.push({ id: anexo, nome: lidos.anexos[indice].nome, mime: lidos.anexos[indice].mime });
    ficheiros.push(dados);
    if (!numeros.length) continue;
    try {
      for (const { pagina, jpeg } of await desenhar(dados, numeros)) paginas.push([anexo, pagina, jpeg]);
    } catch {
      // O pdf.js não abriu este PDF: as páginas dele ficam por ler, com o aviso do chat.
    }
  }
  const total = digitalizadas.length + imagens.length;
  let feitas = 0;
  const mostrar = () => etapa?.(textoDosAnexos('a_ler_paginas', lingua, { feitas, total }));
  const respostas = {};
  const perguntar = async (extra = {}) => JSON.parse(await python.paginas(JSON.stringify({
    contexto: lidos.contexto, anexos, paginas, respostas, ...extra }), ...ficheiros));
  const ler = async (pedido) => {
    try {
      respostas[pedido.chave] = await chamar(pedido);
    } catch (e) {
      if (String(e?.status) === '402' || e?.name === 'AbortError' || e?.codigo === 'parada') throw e;
      respostas[pedido.chave] = { erro: e?.status ? `HTTP ${e.status}` : String(e?.message || e).slice(0, 500),
        ...(e?.emBaixo ? { emBaixo: true } : {}) };
    }
    feitas = Math.min(total, feitas + pedido.paginas.length);
    mostrar();
  };
  mostrar();
  let r = await perguntar({ planear: true });
  if (r.pedidos) {
    const fila = [...r.pedidos];
    await Promise.all(Array.from({ length: Math.min(emSimultaneo, fila.length) }, async () => {
      while (fila.length) await ler(fila.shift());
    }));
    r = await perguntar();
  }
  // Os lotes que falharam ou voltaram sem todas as páginas pedem-se outra vez, em metades (como no chat): um de
  // cada vez — menos os que se desistiu de pedir com o servidor ou o fornecedor em baixo (emBaixo).
  while (r.pausa) {
    await ler(r.pausa);
    r = await perguntar();
  }
  if (!r.fim) throw new Error(r.erro || 'paginas');
  return r.fim.contexto;
}

/**
 * As mensagens da conversa com o texto dos anexos no fim das da pessoa, como
 * o chat as manda ao modelo (_get_conversation_history): a ficha, se a houver
 * (é pequena e vai sempre); senão o texto inteiro nas 3 mais recentes, até
 * ANEXOS_SEM_FICHA_MAX_CHARS; nas outras, uma nota com os nomes.
 */
export function comOsAnexos(mensagens) {
  const saida = [...mensagens];
  let incluidos = 0;
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i];
    if (m.papel !== 'eu' || !(m.fichasDosAnexos || m.contextoDosAnexos)) continue;
    let texto = m.texto || '';
    if (m.fichasDosAnexos) {
      texto += `\n\n${m.fichasDosAnexos}`;
    } else if (incluidos < 3 && m.contextoDosAnexos.length <= LIMITES_DOS_ANEXOS.ANEXOS_SEM_FICHA_MAX_CHARS) {
      texto += m.contextoDosAnexos;
      incluidos += 1;
    } else {
      const nomes = (m.anexos || []).map((a) => a.nome).join(', ');
      texto += `\n\n[Esta mensagem tinha anexos${nomes ? ` (${nomes})` : ''}; conteúdo omitido por brevidade.]`;
    }
    saida[i] = { ...m, texto };
  }
  return saida;
}

/** Se a conversa tem anexos com ficha (a procura no texto deles entra). */
export const temFichas = (mensagens) => mensagens.some((m) => m.papel === 'eu' && m.fichasDosAnexos);

/** O texto completo dos anexos com ficha, de onde procurar_nos_anexos lê: o
 *  das últimas MAX_ATTACHMENTS mensagens com ficha, por ordem. */
export const textoDosAnexosComFicha = (mensagens) => mensagens
  .filter((m) => m.papel === 'eu' && m.fichasDosAnexos && m.contextoDosAnexos)
  .slice(-LIMITES_DOS_ANEXOS.MAX_ATTACHMENTS).map((m) => m.contextoDosAnexos).join('\n\n');

/** Os ficheiros da conversa que o modelo pode ler e editar (_anexo_do_utilizador:
 *  os anexos da pessoa e os ficheiros feitos na conversa): [{id, nome, mime}]. */
export const ficheirosParaLer = (mensagens) => mensagens.flatMap((m) => [...(m.anexos || []), ...(m.ficheiros || [])])
  .filter((f, i, todos) => f?.id && todos.findIndex((g) => g.id === f.id) === i)
  .map(({ id, nome, mime }) => ({ id, nome, mime }));

/**
 * read_document, edit_document ou procurar_nos_anexos, pelo Python do ecrã
 * (_execute_file_tool e _executar_procurar_nos_anexos). Devolve {saida: o
 * JSON para o modelo, ficheiro: a cópia editada, se a houver}.
 *
 * - *ficheiros*: os da conversa (ficheirosParaLer); *bytesDe(id)*: os
 *   bytes de um deles (null se já não estão);
 * - *contexto*: o texto completo dos anexos com ficha (para a procura);
 * - *novoId()*: o número da cópia editada; *autor*: quem assina as
 *   alterações controladas; *etapa(texto)*: o que a pessoa vê.
 */
export async function ferramentaDosAnexos(nome, argumentos, { python, ficheiros = [], bytesDe, contexto = '', novoId,
  autor = '', lingua = 'pt', etapa }) {
  try {
    if (nome === 'procurar_nos_anexos') {
      return { saida: (await python.ferramentaDosAnexos(JSON.stringify({ nome, argumentos, contexto }))).saida };
    }
    const id = Number(argumentos?.attachment_id);
    const ficheiro = ficheiros.find((f) => f.id === id);
    const dados = ficheiro ? await bytesDe(id) : null;
    if (ficheiro && !dados) return { saida: JSON.stringify({ error: ORIGINAL_EM_FALTA }) };
    if (nome === 'edit_document' && ficheiro) etapa?.(textoDosAnexos('a_editar', lingua, { nome: ficheiro.nome }));
    return await python.ferramentaDosAnexos(JSON.stringify({
      nome, argumentos, autor,
      anexos: ficheiro ? [{ id, nome: ficheiro.nome, mime: ficheiro.mime }] : [],
      proximo_id: nome === 'edit_document' && ficheiro ? novoId() : null,
    }), ...(ficheiro ? [dados] : []));
  } catch (e) {
    // O Python do ecrã falhou: como no chat, o modelo lê só o erro genérico, e a falha vai a quem mantém o ecrã.
    avisos.seFalhar('anexos', e);
    return { saida: JSON.stringify({ error: 'falha a processar o ficheiro' }) };
  }
}

/** A cópia editada como ficheiro da conversa: guarda o pedido, de onde se
 *  volta a fazer a partir do original (como a fonte do create_file). */
export const ficheiroEditado = (ficheiro, argumentos, autor) => ({
  id: ficheiro.id, nome: ficheiro.nome, formato: ficheiro.formato, mime: ficheiro.mime,
  fonte: { edicao: { anexo: Number(argumentos?.attachment_id), argumentos, autor } },
});

/**
 * As fichas dos anexos grandes (_fichas_dos_anexos): o próprio método do chat
 * corre no Python e pede ao ecrã cada chamada ao modelo (uma por parte do
 * texto). *chamar(mensagens)*: a resposta do modelo (texto), com o recurso
 * das fichas; *etapa(texto)*: o que a pessoa vê. Devolve as fichas, ou ''
 * se uma parte falhou (como no chat: quem chama decide).
 */
export async function fazerFichas(contexto, pergunta, { python, chamar, etapa, lingua = 'pt' }) {
  const respostas = [];
  for (;;) {
    const r = JSON.parse(await python.fichas(JSON.stringify({ contexto, pergunta, respostas })));
    if (r.fim) return r.fim.devolveu || '';
    if (!r.pausa) throw new Error(r.erro || 'fichas');
    const parte = r.pausa.etapa?.valores;
    etapa?.(parte ? textoDosAnexos('a_ler_parte', lingua, parte) : textoDosAnexos('a_ler', lingua));
    try {
      respostas.push({ texto: await chamar(r.pausa.messages) });
    } catch (e) {
      if (String(e?.status) === '402' || e?.name === 'AbortError') throw e;
      respostas.push({ erro: String(e?.message || e).slice(0, 500) });
    }
  }
}

/**
 * Os originais a guardar com a conversa ({id: base64}): os mais recentes até
 * *maximo*; os outros só ficam em memória. *bytes(id)*: os bytes de um
 * anexo (Uint8Array), ou o base64 de quando já estava guardado, ou null.
 */
export function originaisParaGuardar(mensagens, bytes, maximo = MAX_ORIGINAIS_GUARDADOS) {
  const guardados = {};
  let total = 0;
  const ids = mensagens.flatMap((m) => (m.papel === 'eu' ? (m.anexos || []).map((a) => a.id) : [])).reverse();
  for (const id of ids) {
    const dados = bytes(id);
    if (!dados) continue;
    const tamanho = typeof dados === 'string' ? dados.length : Math.ceil(dados.length / 3) * 4;
    if (total + tamanho > maximo) continue;
    guardados[id] = typeof dados === 'string' ? dados : paraBase64(dados);
    total += tamanho;
  }
  return guardados;
}

function paraBase64(dados) {
  let texto = '';
  for (let i = 0; i < dados.length; i += 0x8000) texto += String.fromCharCode(...dados.subarray(i, i + 0x8000));
  return btoa(texto);
}

/** Os bytes de um original guardado em base64. */
export function deBase64(texto) {
  const binario = atob(texto);
  const dados = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) dados[i] = binario.charCodeAt(i);
  return dados;
}
