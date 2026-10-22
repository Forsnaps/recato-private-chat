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
