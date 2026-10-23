// As regras do fundo da extensão (22/10/2026), sem os ouvintes do browser
// (esses estão em fundo.js), para os testes (extensao/testes/).
import { carteiroValido } from '../privada/navegador.js';
import { conferir, ficheiroDe, sha256, versoesPublicadas } from './conferencia.js';

export const PAGINA_DA_EXTENSAO = 'privada/index.html';
const MANIFESTOS_VALEM_MS = 10 * 60 * 1000;

const origemDe = (endereco) => {
  try {
    return new URL(endereco).origin;
  } catch {
    return null;
  }
};

/**
 * O Recato pediu para abrir a conversa privada (recato.js). Só um Recato
 * verdadeiro e só para a conta da própria página (o endereço da conta tem de
 * ser o da página que pede). A sessão fica só em memória (storage.session:
 * apaga-se ao fechar o browser ou o separador) e o MESMO separador vai para
 * o ecrã que vem DENTRO da extensão — o código não vem do servidor; o
 * «voltar» regressa ao Recato (pedido do Pedro, 23/10/2026).
 */
export async function abrirConversa(api, dados, remetente, agora = Date.now()) {
  const carteiro = carteiroValido(dados?.carteiro);
  const separadorId = remetente?.tab?.id;
  if (!carteiro || typeof dados.sessao !== 'string' || !dados.sessao || origemDe(remetente?.url) !== carteiro
      || separadorId === undefined) {
    return { aberta: false };
  }
  const chave = `separador:${separadorId}`;
  const anterior = (await api.storage.session.get(chave))[chave];
  if (anterior) await api.storage.session.remove(anterior);
  const numero = crypto.randomUUID();
  await api.storage.session.set({
    [numero]: { sessao: dados.sessao, carteiro, expira: agora / 1000 + (Number(dados.prazo) || 0) },
    [chave]: numero,
  });
  await api.tabs.update(separadorId, { url: api.runtime.getURL(`${PAGINA_DA_EXTENSAO}#${numero}`) });
  return { aberta: true };
}

/** Ao fechar um separador, apaga-se o que era dele. */
export async function separadorFechado(api, separadorId) {
  const chave = `separador:${separadorId}`;
  const numero = (await api.storage.session.get(chave))[chave];
  await api.storage.session.remove([chave, `conferencia:${separadorId}`, `recebidos:${separadorId}`,
    ...(numero ? [numero] : [])]);
}

/** As versões publicadas, do sítio público (guardadas 10 minutos). */
export async function obterVersoes(api, buscar, url, agora = Date.now()) {
  const guardadas = (await api.storage.local.get('manifestos')).manifestos;
  if (guardadas && guardadas.url === url && agora - guardadas.quando < MANIFESTOS_VALEM_MS) {
    return guardadas.versoes;
  }
  const resposta = await buscar(url, { cache: 'no-store', credentials: 'omit' });
  if (!resposta.ok) throw new Error(`manifestos: HTTP ${resposta.status}`);
  const versoes = versoesPublicadas(await resposta.json());
  await api.storage.local.set({ manifestos: { url, quando: agora, versoes } });
  return versoes;
}

const NO_ICONE = {
  conferida: ['✓', '#2f7d6d'],
  diferente: ['!', '#c0392b'],
  incompleta: ['?', '#b9770e'],
  interferencia: ['?', '#b9770e'],
  erro: ['?', '#b9770e'],
};

/**
 * A página pediu a conferência (conferir.js). No Firefox usam-se as
 * impressões digitais que o fundo tirou dos bytes ao passarem (exatas); no
 * Chrome, as que a página calculou da cópia guardada pelo browser. Outra
 * extensão a meter código na página dá «interferência» (não se pode dizer
 * que é a publicada). O resultado vai para o ícone e para o popup.
 */
export async function conferirSeparador(api, separadorId, pedido, versoesDe) {
  const exatos = (await api.storage.session.get(`recebidos:${separadorId}`))[`recebidos:${separadorId}`];
  const recebidos = { ...(pedido.recebidos || {}), ...(exatos || {}) };
  let resultado;
  try {
    resultado = conferir(recebidos, await versoesDe(), pedido.pagina);
  } catch (e) {
    resultado = { estado: 'erro', motivo: String(e.message || e) };
  }
  if (resultado.estado === 'conferida' && pedido.estranhos?.length) {
    resultado = { estado: 'interferencia', estranhos: pedido.estranhos };
  }
  resultado.exato = Boolean(exatos);
  const [texto, cor] = NO_ICONE[resultado.estado];
  await api.action.setBadgeText({ tabId: separadorId, text: texto });
  await api.action.setBadgeBackgroundColor({ tabId: separadorId, color: cor });
  await api.storage.session.set({ [`conferencia:${separadorId}`]: resultado });
  return resultado;
}

const juntar = (pedacos) => {
  const tudo = new Uint8Array(pedacos.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of pedacos) {
    tudo.set(p, i);
    i += p.length;
  }
  return tudo;
};

/**
 * Só no Firefox (filterResponseData): o fundo vê os bytes de cada ficheiro da
 * página privada ao passarem e guarda as impressões digitais, por separador.
 * Uma navegação nova da página começa do zero.
 */
export function capturarAoPassar(api) {
  api.webRequest.onBeforeRequest.addListener((pedido) => {
    const ficheiro = ficheiroDe(pedido.url);
    // Só o que a página recebe: nem pedidos sem separador nem os da extensão.
    if (!ficheiro || pedido.tabId < 0 || pedido.originUrl?.startsWith('moz-extension:')) return;
    // Nem o ícone do separador: o browser pede-o sozinho (por exemplo, nas
    // licenças) e uma imagem não corre código. Um documento aberto com esse
    // nome conta como os outros.
    if (ficheiro === 'favicon.ico' && pedido.type === 'image') return;
    const chave = `recebidos:${pedido.tabId}`;
    const filtro = api.webRequest.filterResponseData(pedido.requestId);
    const pedacos = [];
    filtro.ondata = (evento) => {
      // Copia antes de passar: o write() pode ficar com os bytes.
      pedacos.push(new Uint8Array(evento.data.slice(0)));
      filtro.write(evento.data);
    };
    filtro.onstop = async () => {
      filtro.close();
      const impressao = await sha256(juntar(pedacos));
      const anteriores = pedido.type === 'main_frame' ? {} : (await api.storage.session.get(chave))[chave] || {};
      await api.storage.session.set({ [chave]: { ...anteriores, [ficheiro]: impressao } });
    };
  }, { urls: ['https://privada.recato.ai/*'] }, ['blocking']);
}
