// A conversa com a parte nativa da app (ConversaPrivadaActivity): a sessão da
// conversa privada, a chave do chip de segurança do telemóvel, que fecha a
// cópia da chave mestra guardada neste telemóvel, e a confirmação de que é a
// pessoa (antes de um código novo). A chave do chip nunca sai de lá e só esta
// app a pode usar; daqui só vão os bytes a fechar ou a abrir.
import { b64, de64 } from './cofre.js';

const pendentes = new Map();
let proximo = 1;

function pedir(pedido) {
  const nativo = globalThis.RecatoNativo;
  if (!nativo) return Promise.reject(new Error('sem_app'));
  nativo.onmessage = (evento) => {
    const dados = JSON.parse(evento.data);
    const resolver = pendentes.get(dados.id);
    pendentes.delete(dados.id);
    if (resolver) resolver(dados);
  };
  return new Promise((resolve) => {
    const id = proximo++;
    pendentes.set(id, resolve);
    nativo.postMessage(JSON.stringify({ ...pedido, id }));
  });
}

export const pedirSessao = () => pedir({ tipo: 'sessao' });

async function comOChip(tipo, dados) {
  const r = await pedir({ tipo, dados });
  if (r.erro) throw new Error(r.erro);
  return r.dados;
}

/** Fecha *bytes* com a chave do chip deste telemóvel: o texto que devolve só
 *  esta app, neste telemóvel, o consegue voltar a abrir. */
export const fecharNoTelemovel = (bytes) => comOChip('telemovel_fechar', b64(bytes));

export const abrirNoTelemovel = async (fechado) => de64(await comOChip('telemovel_abrir', fechado));

/** Guarda um ficheiro feito na conversa (27/10/2026) nas Transferências do
 *  telemóvel: os bytes vão daqui para a parte nativa, nunca para a rede. */
export async function guardarFicheiro(nome, mime, dados) {
  const r = await pedir({ tipo: 'guardar_ficheiro', nome, mime, dados: b64(dados) });
  if (r.erro) throw Object.assign(new Error(r.erro), { codigo: r.erro });
}

/** Diz à app que a conversa privada começou (ou acabou) uma resposta
 *  (28/10/2026, pedido do Pedro: só o «Parar» a para). Enquanto trabalha, a app
 *  mantém este ecrã vivo com a app fechada ou o ecrã desligado, com uma
 *  notificação que tem o «Parar» (TrabalhoPrivadoServico); no fim, se a app
 *  estiver fechada, avisa que a resposta está pronta. Não espera resposta. */
export function avisarTrabalho(aTrabalhar, janela = globalThis) {
  janela.RecatoNativo?.postMessage(JSON.stringify({ tipo: 'trabalho', a_trabalhar: !!aTrabalhar }));
}

/** Diz à app que a resposta está (ou deixou de estar) à espera da pessoa: uma
 *  pesquisa na web que só sai com o «sim» dela (decisão do Pedro, 28/10/2026:
 *  esperar e avisar). Com a app fechada, a notificação passa a «O Recato
 *  precisa da tua resposta para continuar» e abre a conversa na pergunta.
 *  Não espera resposta. */
export function avisarEspera(aEspera, janela = globalThis) {
  janela.RecatoNativo?.postMessage(JSON.stringify({ tipo: 'espera', a_espera: !!aEspera }));
}

/** Pede ao telemóvel que confirme que é a pessoa (impressão digital, rosto
 *  ou o PIN do ecrã), com estes textos. Erro 'cancelada' se ela desistir e
 *  'sem_bloqueio' se o telemóvel não tiver bloqueio de ecrã. */
export async function confirmarAPessoa(titulo, subtitulo) {
  const r = await pedir({ tipo: 'confirmar_pessoa', titulo, subtitulo });
  if (r.erro) {
    const erro = new Error(r.erro);
    erro.codigo = r.erro;
    throw erro;
  }
}
