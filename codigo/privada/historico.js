// O histórico cifrado da conversa privada (22/10/2026): as regras, sem ecrã
// (o ecrã é o privada.js). O servidor, o chip do telemóvel e o sítio onde a
// cópia do telemóvel fica guardada vêm de fora (servidor.js, nativo.js e o
// localStorage do ecrã), para os testes (privada/testes/historico.test.mjs);
// *conta* é o endereço da conta (o do carteiro).
//
// A chave mestra só existe aberta aqui, em memória, enquanto o ecrã está
// aberto. Ao servidor só vão a cópia fechada com o código e as conversas e
// os títulos já cifrados; a cópia fechada pelo chip fica neste telemóvel.
import {
  abrirComCodigo, cifrar, decifrar, fecharComCodigo, gerarChaveMestra, gerarCodigo,
} from './cofre.js';

const MAX_TITULO = 60;

export function criarHistorico({ servidor, telemovel, guardados, conta }) {
  let cofre; // {id, embrulhos, versao}; null = sem cofre; undefined = por ler
  let mestra = null;
  let ativacao = null;
  let codigoNovo = null;

  const doCodigo = () => (cofre?.embrulhos || []).filter((e) => e.tipo === 'recuperacao');
  // Cada conta neste telemóvel, e cada cofre dela, tem a sua cópia; trocar
  // de código não a muda (nem a dos outros telemóveis da pessoa).
  const ondeGuardada = () => `privada.chave.${conta}.${cofre.id}`;

  async function guardarNoTelemovel() {
    try {
      guardados.gravar(ondeGuardada(), await telemovel.fechar(mestra));
    } catch {
      // Sem o chip (ou sem onde guardar): da próxima vez pede-se o código.
    }
  }

  async function abrirNoTelemovel() {
    const fechada = guardados.ler(ondeGuardada());
    if (!fechada) return;
    try {
      mestra = await telemovel.abrir(fechada);
    } catch {
      // A chave do chip mudou (a app foi reinstalada, o bloqueio do ecrã
      // mudou…): a cópia já não abre e pede-se o código.
      guardados.apagar(ondeGuardada());
    }
  }

  async function cifrarConversa(conversa) {
    const corpo = await cifrar(mestra, { v: 1, mensagens: conversa.mensagens });
    const titulo = await cifrar(mestra, { titulo: conversa.titulo });
    return { iv: corpo.iv, dados: corpo.dados, titulo_iv: titulo.iv, titulo: titulo.dados };
  }

  return {
    /** 'por_ler', 'sem_cofre', 'fechado' ou 'aberto'. */
    get estado() {
      if (cofre === undefined) return 'por_ler';
      if (!cofre) return 'sem_cofre';
      return mestra ? 'aberto' : 'fechado';
    },

    /** Lê o cofre e, se este telemóvel tem a sua cópia, abre logo. */
    async ler() {
      ({ cofre } = await servidor.lerCofre());
      if (cofre) await abrirNoTelemovel();
      return this.estado;
    },

    /** Ativar, 1.º passo: a chave mestra nova e o código de recuperação, que
     *  o ecrã mostra. Nada é gravado antes de a pessoa dizer que o guardou. */
    comecarAtivacao() {
      ativacao = { mestra: gerarChaveMestra(), codigo: gerarCodigo() };
      return ativacao.codigo;
    },

    /** Ativar, 2.º passo: a cópia fechada com o código vai para o servidor e
     *  a fechada pelo chip fica neste telemóvel. */
    async concluirAtivacao() {
      const embrulhos = [await fecharComCodigo(ativacao.mestra, ativacao.codigo)];
      const { id, versao } = await servidor.gravarCofre(embrulhos, null);
      cofre = { id, embrulhos, versao };
      mestra = ativacao.mestra;
      ativacao = null;
      await guardarNoTelemovel();
    },

    /** Código novo, 1.º passo (com o histórico aberto, depois de o telemóvel
     *  confirmar que é a pessoa): o código, que o ecrã mostra. */
    comecarCodigoNovo() {
      codigoNovo = gerarCodigo();
      return codigoNovo;
    },

    /** Código novo, 2.º passo: a cópia fechada com ele substitui a antiga e
     *  o código antigo deixa de abrir. As conversas e as cópias dos
     *  telemóveis não mudam. Se o cofre mudou noutro telemóvel entretanto,
     *  erro com o código 'versao' (e não se grava nada). */
    async concluirCodigoNovo() {
      const embrulhos = [await fecharComCodigo(mestra, codigoNovo)];
      const { versao } = await servidor.gravarCofre(embrulhos, cofre.versao);
      cofre = { ...cofre, embrulhos, versao };
      codigoNovo = null;
    },

    /** Abre com o código de recuperação (num telemóvel novo, ou depois de
     *  reinstalar a app) e guarda a cópia deste telemóvel; false se o código
     *  não abre. */
    async abrirComCodigo(codigo) {
      for (const embrulho of doCodigo()) {
        try {
          mestra = await abrirComCodigo(embrulho, codigo);
        } catch {
          continue;
        }
        await guardarNoTelemovel();
        return true;
      }
      return false;
    },

    /** Grava a conversa cifrada; devolve-a com o id e a versão novos. */
    async guardar(conversa) {
      const primeira = conversa.mensagens.find((m) => m.papel === 'eu')?.texto || '';
      const titulo = conversa.titulo || primeira.replace(/\s+/g, ' ').trim().slice(0, MAX_TITULO);
      const cifrada = await cifrarConversa({ ...conversa, titulo });
      let gravada;
      try {
        gravada = await servidor.gravarConversa(cifrada, conversa.id, conversa.versao);
      } catch (e) {
        if (e.codigo !== 'versao') throw e;
        // Mexida ou apagada noutro telemóvel: fica como conversa nova, sem se perder nada.
        gravada = await servidor.gravarConversa(cifrada, null, null);
      }
      return { ...conversa, titulo, id: gravada.id, versao: gravada.versao };
    },

    /** As conversas guardadas, com o título decifrado. */
    async lista() {
      const conversas = await servidor.listarConversas();
      return Promise.all(conversas.map(async (c) => ({
        id: c.id,
        atualizada: c.atualizada,
        titulo: (await decifrar(mestra, { iv: c.titulo_iv, dados: c.titulo }).catch(() => null))?.titulo,
      })));
    },

    async abrir(id) {
      const c = await servidor.lerConversa(id);
      const { mensagens } = await decifrar(mestra, c);
      return { id: c.id, versao: c.versao, mensagens };
    },

    apagar: (id) => servidor.apagarConversa(id),
  };
}
