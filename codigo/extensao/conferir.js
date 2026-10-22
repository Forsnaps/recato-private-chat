// Na página privada.recato.ai (22/10/2026): confere se é uma versão
// publicada. Tira as impressões digitais do que o browser recebeu — da cópia
// que o browser guardou (no Firefox o fundo já as tirou dos bytes ao
// passarem, que é exato) —, pede a comparação ao fundo e mostra o resultado
// na faixa da própria página; se não for a publicada, tapa a página com um
// aviso.
import { ficheiroDe, sha256 } from './conferencia.js';
import { textos } from './textos.js';

const api = globalThis.browser || globalThis.chrome;
const t = textos(navigator.language);
const ESPERA_PELO_MODULO_MS = 60000;

/** A cópia que o browser guardou (a página serve-se com «no-cache»: fica
 *  guardada); se não houver cópia, não se pode conferir esse ficheiro. */
async function daCopiaGuardada(endereco) {
  const resposta = await fetch(endereco, { cache: 'only-if-cached', mode: 'same-origin', credentials: 'omit' });
  if (!resposta.ok) throw new Error(`sem cópia de ${endereco}`);
  return sha256(await resposta.arrayBuffer());
}

async function recebidos() {
  const enderecos = new Set([location.href.split('#')[0]]);
  for (const entrada of performance.getEntriesByType('resource')) {
    if (ficheiroDe(entrada.name)) enderecos.add(entrada.name.split('#')[0]);
  }
  const impressoes = {};
  for (const endereco of enderecos) {
    try {
      impressoes[ficheiroDe(endereco)] = await daCopiaGuardada(endereco);
    } catch {
      // Sem cópia: fica de fora (sem a da página, a conferência fica incompleta).
    }
  }
  return impressoes;
}

/** Código que não é o da página: outros scripts (de outra extensão, por
 *  exemplo) ou um service worker, que a página nunca regista. */
async function estranhos() {
  const scripts = [...document.scripts].filter((s) => !s.src || ficheiroDe(s.src) !== 'privada.js')
    .map((s) => s.src || 'script na página');
  const registos = await navigator.serviceWorker?.getRegistrations?.().catch(() => []) || [];
  return [...scripts, ...registos.map(() => 'service worker')];
}

function mostrar(resultado) {
  const faixa = document.getElementById('faixa');
  const texto = resultado?.estado === 'conferida'
    ? t.conferida(resultado.versao)
    : t[resultado?.estado] || t.erro;
  if (faixa) {
    faixa.hidden = false;
    faixa.className = `faixa ${resultado?.estado === 'conferida' ? 'conferida' : 'por-conferir'}`;
    faixa.replaceChildren(document.createTextNode(texto));
  }
  if (resultado?.estado === 'diferente' && !document.getElementById('recato-aviso-vermelho')) {
    const aviso = document.createElement('div');
    aviso.id = 'recato-aviso-vermelho';
    aviso.setAttribute('role', 'alert');
    aviso.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(120,20,20,.96);color:#fff;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;'
      + 'font:16px system-ui,sans-serif;text-align:center';
    const titulo = document.createElement('strong');
    titulo.textContent = t.diferente_titulo;
    const explica = document.createElement('p');
    explica.textContent = t.diferente_explica(resultado.ficheiros || []);
    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.textContent = t.mostrar_mesmo_assim;
    fechar.style.cssText = 'padding:10px 16px;border-radius:10px;border:1px solid #fff;background:none;color:#fff;font:inherit';
    fechar.addEventListener('click', () => aviso.remove());
    aviso.append(titulo, explica, fechar);
    document.documentElement.append(aviso);
  }
}

async function conferirAgora() {
  // No Firefox o fundo viu os bytes ao passarem; ler aqui a cópia guardada
  // seria outro pedido (e o fundo vê-o também).
  const exata = (await api.runtime.sendMessage({ tipo: 'conferencia_exata' }).catch(() => null))?.exata;
  const resultado = await api.runtime.sendMessage({
    tipo: 'conferir', recebidos: exata ? {} : await recebidos(), estranhos: await estranhos(),
  }).catch(() => null);
  mostrar(resultado);
  return resultado;
}

/** O módulo da caixa-forte (privatemode.wasm) chega depois da página: confere-
 *  se já e outra vez quando ele chegar. */
async function iniciar() {
  const primeiro = await conferirAgora();
  if (primeiro?.estado === 'diferente') return;
  const fim = Date.now() + ESPERA_PELO_MODULO_MS;
  while (Date.now() < fim) {
    const modulo = performance.getEntriesByType('resource')
      .find((e) => ficheiroDe(e.name) === 'privatemode.wasm' && e.responseEnd > 0);
    if (modulo) {
      await conferirAgora();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

iniciar();
