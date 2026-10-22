// O ecrã da conversa privada fora da app (22/10/2026): na extensão do browser
// e na página privada.recato.ai. Faz o que a parte nativa da app faz
// (nativo.js): dá a sessão e guarda a cópia da chave mestra deste browser,
// fechada com uma chave que o próprio browser cria e não deixa copiar
// (WebCrypto, não exportável, guardada no IndexedDB desta origem).
import { aleatorio, b64, de64 } from './cofre.js';

const SESSAO_DO_SEPARADOR = 'privada.sessao';
const BASE = 'recato-privada';
const LOJA = 'chaves';
const CHAVE = 'dispositivo';

const erro = (codigo) => Object.assign(new Error(codigo), { codigo });

/** O endereço da conta, se for de um Recato verdadeiro: https, recato.ai ou
 *  uma conta *.recato.ai (nunca a própria página privada); senão null. */
export function carteiroValido(endereco) {
  let url;
  try {
    url = new URL(endereco);
  } catch {
    return null;
  }
  const doRecato = url.hostname === 'recato.ai' || url.hostname.endsWith('.recato.ai');
  if (url.protocol !== 'https:' || !doRecato || url.hostname === 'privada.recato.ai' || url.port
      || url.username || url.password) {
    return null;
  }
  return url.origin;
}

function aSessao(dados) {
  const carteiro = carteiroValido(dados?.carteiro);
  if (!dados?.sessao || !carteiro) throw erro('sem_sessao');
  return { sessao: dados.sessao, carteiro, prazo: Math.max(0, Math.round(dados.expira - Date.now() / 1000)) };
}

/** Na página web: o Recato manda a sessão na parte da ligação depois do «#»
 *  (que nunca chega a servidor nenhum). Tira-se logo da ligação e fica neste
 *  separador, para recarregar a página. */
export function sessaoDaLigacao(janela = globalThis) {
  const parametros = new URLSearchParams(janela.location.hash.slice(1));
  if (parametros.has('sessao')) {
    janela.history.replaceState(null, '', janela.location.pathname + janela.location.search);
    const dados = {
      sessao: parametros.get('sessao'),
      carteiro: parametros.get('carteiro'),
      expira: Date.now() / 1000 + (Number(parametros.get('prazo')) || 0),
    };
    const sessao = aSessao(dados);
    janela.sessionStorage.setItem(SESSAO_DO_SEPARADOR, JSON.stringify(dados));
    return sessao;
  }
  return aSessao(JSON.parse(janela.sessionStorage.getItem(SESSAO_DO_SEPARADOR) || 'null'));
}

/** Na extensão: o fundo da extensão guardou a sessão (vinda do Recato) com um
 *  número, que vem na ligação do separador. */
export async function sessaoDaExtensao(api, janela = globalThis) {
  const numero = janela.location.hash.slice(1);
  const guardada = numero ? (await api.storage.session.get(numero))[numero] : null;
  return aSessao(guardada);
}

/** As chaves guardadas no IndexedDB desta origem. */
export function armazemIndexedDB(indexedDB = globalThis.indexedDB) {
  const abrirBase = () => new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
  const naLoja = async (modo, fazer) => {
    const base = await abrirBase();
    try {
      return await new Promise((resolve, reject) => {
        const pedido = fazer(base.transaction(LOJA, modo).objectStore(LOJA));
        pedido.onsuccess = () => resolve(pedido.result);
        pedido.onerror = () => reject(pedido.error);
      });
    } finally {
      base.close();
    }
  };
  return {
    ler: (nome) => naLoja('readonly', (loja) => loja.get(nome)),
    gravar: (nome, valor) => naLoja('readwrite', (loja) => loja.put(valor, nome)),
  };
}

/** A chave deste browser: AES-256 criada aqui e NÃO exportável — o browser
 *  usa-a, mas nem este código a consegue tirar de lá. Fecha e abre a cópia
 *  da chave mestra deste browser (o mesmo formato da app: IV e bytes
 *  fechados, em base64). */
export function criarChaveDoNavegador(armazem = armazemIndexedDB()) {
  async function chave(criar) {
    let guardada = await armazem.ler(CHAVE);
    if (!guardada && criar) {
      guardada = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await armazem.gravar(CHAVE, guardada);
    }
    return guardada;
  }
  return {
    async fechar(bytes) {
      const iv = aleatorio(12);
      const fechado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(true), bytes));
      const tudo = new Uint8Array(iv.length + fechado.length);
      tudo.set(iv);
      tudo.set(fechado, iv.length);
      return b64(tudo);
    },
    async abrir(texto) {
      const guardada = await chave(false);
      if (!guardada) throw erro('sem_chave');
      const tudo = de64(texto);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: tudo.slice(0, 12) }, guardada,
        tudo.slice(12)));
    },
  };
}
