// As respostas à espera (28/10/2026, pedido do Pedro: «não quero que seja
// interrompida [...] quando o user voltar tem lá a resposta»), sem ecrã (o
// ecrã é o privada.js), para os testes (privada/testes/espera.test.mjs).
//
// Cada pedido ao modelo leva um número (X-Recato-Resposta). O carteiro guarda
// a resposta cifrada enquanto a passa e, se o ecrã fechar, continua a recebê-la
// até ao fim (fs_chat_autonomo, models/privada_resposta.py). Este ecrã guarda
// aqui, antes de o pedido sair, o que precisa para continuar quando a pessoa
// voltar: a conversa, a ronda em curso e o segredo do SDK com que a resposta
// se abre (oae.js). Fica cifrado com uma chave deste browser (ou deste
// telemóvel), e apaga-se quando a resposta fica mostrada (e gravada, com o
// histórico aberto) — também para quem disse «Agora não» ao histórico
// (decisão do Pedro, 28/10/2026: «só até mostrar»).
import { aleatorio, b64, de64 } from './cofre.js';
import { pedacosDaResposta } from './oae.js';
import { RespostaParada } from './pesquisa.js';

/** Quanto espera o carteiro por quem fechou o ecrã: o mesmo prazo do servidor. */
export const PRAZO_DIAS = 7;
/** De quanto em quanto tempo se pergunta ao servidor pelo resto de uma resposta que ainda está a chegar. */
export const INTERVALO_MS = 1000;

const PREFIXO = 'privada.espera';

/**
 * As esperas desta conta neste aparelho.
 *
 * - *armazem*: {ler, gravar, apagar, nomes} (o IndexedDB desta origem);
 * - *fechar(bytes)* e *abrir(texto)*: a chave do browser ou do chip (plataforma.js), que guarda a chave das esperas;
 * - *conta*: o endereço da conta (o do carteiro).
 */
export function criarEsperas({ armazem, fechar, abrir, conta }) {
  const nomeDaChave = `${PREFIXO}.chave.${conta}`;
  const prefixo = `${PREFIXO}.${conta}.`;
  let chave = null;

  async function chaveDasEsperas(criar) {
    if (chave) return chave;
    const guardada = await armazem.ler(nomeDaChave);
    let bytes = null;
    if (guardada) {
      try {
        bytes = await abrir(guardada);
      } catch {
        // A chave do browser (ou do chip) mudou: as esperas antigas já não abrem.
        bytes = null;
      }
    }
    if (!bytes) {
      if (!criar) return null;
      bytes = aleatorio(32);
      await armazem.gravar(nomeDaChave, await fechar(bytes));
    }
    chave = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return chave;
  }

  return {
    /** Guarda (ou atualiza) a espera *registo* — {id, ...}. */
    async guardar(registo) {
      const iv = aleatorio(12);
      const dados = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveDasEsperas(true),
        new TextEncoder().encode(JSON.stringify(registo))));
      await armazem.gravar(prefixo + registo.id, { iv: b64(iv), dados: b64(dados) });
    },

    /** As esperas desta conta, da mais antiga para a mais nova; as que já não abrem, ou passaram do prazo, apagam-se. */
    async lista(agora = Date.now()) {
      const nomes = (await armazem.nomes()).filter((n) => n.startsWith(prefixo));
      if (!nomes.length) return [];
      const k = await chaveDasEsperas(false);
      const registos = [];
      for (const nome of nomes) {
        let registo = null;
        try {
          const { iv, dados } = await armazem.ler(nome);
          registo = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: de64(iv) }, k, de64(dados))));
        } catch {
          registo = null;
        }
        if (!registo || agora - (registo.criado || 0) > PRAZO_DIAS * 86400_000) {
          await armazem.apagar(nome);
          continue;
        }
        registos.push(registo);
      }
      return registos.sort((a, b) => a.criado - b.criado);
    },

    apagar: (id) => armazem.apagar(prefixo + id),
  };
}

/** *fazer()* já, com o ecrã à vista; com ele escondido (*documento*.visibilityState), quando voltar à vista
 *  (30/10/2026, achado no Chrome do Android: o separador fechado fica vivo uns segundos, para o «Anular», e acabava a
 *  resposta sozinho — apagava a espera sem ninguém a ter visto). Se o ecrã morrer escondido, não se faz. */
export function quandoAVista(documento, fazer) {
  if (documento.visibilityState !== 'hidden') {
    fazer();
    return;
  }
  const aoMudar = () => {
    if (documento.visibilityState === 'hidden') return;
    documento.removeEventListener('visibilitychange', aoMudar);
    fazer();
  };
  documento.addEventListener('visibilitychange', aoMudar);
}

/**
 * Os bytes cifrados de uma resposta guardada pelo carteiro, aos bocados, à
 * medida que o servidor os tem: se ainda estiver a chegar, volta a perguntar
 * de INTERVALO_MS em INTERVALO_MS. *aoComecar(lida)* recebe a 1.ª leitura (o
 * estado, os cabeçalhos e o número do pedido do carteiro).
 *
 * Erros: com o status 404 se o servidor não a tem; com o status da caixa-forte
 * se ela respondeu com erro; com o código 'cortada' se já estava cortada (pede-
 * -se outra vez); RespostaParada se acabou no «Parar» (o deste ecrã ou o de
 * antes de ele fechar).
 */
export async function* bytesDaResposta(servidor, numero, { sinal = null, esperar, aoComecar } = {}) {
  let desde = 0;
  let primeira = true;
  for (;;) {
    if (sinal?.aborted) throw new RespostaParada();
    const lida = await servidor.lerResposta(numero, desde);
    if (primeira) {
      primeira = false;
      if (lida.estado_http >= 400) throw Object.assign(new Error(`HTTP ${lida.estado_http}`), { status: lida.estado_http });
      if (lida.estado === 'cortada') throw Object.assign(new Error('cortada'), { codigo: 'cortada' });
      aoComecar?.(lida);
    }
    for (const bocado of lida.bocados) yield de64(bocado);
    desde = lida.seguinte;
    if (lida.mais) continue;
    if (lida.estado === 'parada') throw new RespostaParada();
    // Completa, ou cortada a meio da leitura (a cifra dá pela falta do fim).
    if (lida.estado !== 'a_receber') return;
    await esperar(INTERVALO_MS, sinal);
  }
}

/**
 * O fluxo de uma resposta guardada, como o do SDK (os pedaços do modelo), com
 * o número do pedido do carteiro (`pedidoDoCarteiro`, para o consumo) e se o
 * consumo dele já foi dito (`gastoContado`: pelo ecrã antes de fechar, ou
 * cobrado pela estimativa; não se diz outra vez). Abre-se com o *segredo* do
 * SDK ({id, data, expiresAtUnix}) com que o pedido saiu. Uma resposta que o
 * servidor tem cortada falha com o código 'cortada'.
 */
export async function fluxoGuardado({ servidor, numero, segredo, sinal = null, esperar }) {
  // Sem o segredo (o SDK não o deu antes de o ecrã fechar) não há como a abrir: pede-se outra vez.
  if (!segredo?.data) throw Object.assign(new Error('segredo'), { codigo: 'segredo' });
  let lida = null;
  const bytes = bytesDaResposta(servidor, numero, { sinal, esperar, aoComecar: (l) => { lida = l; } });
  // A 1.ª leitura diz se a resposta existe (404) e traz os cabeçalhos: lê-se já, antes de devolver o fluxo.
  const primeiro = await bytes.next();
  const fluxo = (async function* () {
    async function* todos() {
      if (!primeiro.done) yield primeiro.value;
      yield* bytes;
    }
    yield* pedacosDaResposta({ segredo: de64(segredo.data), cabecalhoDoPedido: lida.cabecalho_pedido,
      cabecalhoDaResposta: lida.cabecalho_resposta, bytes: todos() });
  })();
  fluxo.pedidoDoCarteiro = lida?.pedido ?? null;
  fluxo.gastoContado = !!lida?.gasto_contado;
  return fluxo;
}
