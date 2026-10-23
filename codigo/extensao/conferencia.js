// A conferência da página privada.recato.ai (22/10/2026), sem nada do
// browser: dadas as impressões digitais do que o browser recebeu e as
// publicadas (manifestos.json, num sítio público e igual para toda a gente),
// diz se a página é uma versão publicada. Testes: extensao/testes/.

export const PAGINA_PRIVADA = 'https://privada.recato.ai';

/** O ficheiro publicado a que um endereço da página privada corresponde
 *  («/» é o index.html); null se não é da página privada. */
export function ficheiroDe(endereco) {
  let url;
  try {
    url = new URL(endereco);
  } catch {
    return null;
  }
  if (url.origin !== PAGINA_PRIVADA) return null;
  const caminho = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  return caminho === '' ? 'index.html' : caminho;
}

export async function sha256(bytes) {
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(resumo, (b) => b.toString(16).padStart(2, '0')).join('');
}

const HEX64 = /^[0-9a-f]{64}$/;

/** As versões publicadas, só se o manifestos.json tiver a forma certa. */
export function versoesPublicadas(manifestos) {
  const versoes = manifestos?.versoes;
  if (!Array.isArray(versoes)) throw new Error('manifestos: sem versões');
  for (const v of versoes) {
    const ficheiros = v?.web;
    if (typeof v?.versao !== 'string' || !ficheiros || typeof ficheiros !== 'object'
        || !HEX64.test(ficheiros['index.html'] || '')
        || !Object.values(ficheiros).every((h) => HEX64.test(h))) {
      throw new Error(`manifestos: versão mal formada (${v?.versao})`);
    }
  }
  return versoes;
}

/**
 * Compara o que o browser recebeu (*recebidos*: ficheiro → impressão digital)
 * com as versões publicadas, a partir do documento aberto no separador
 * (*pagina*: a conversa, index.html, mas também «Como confirmar» ou as
 * licenças). Devolve:
 * - {estado: 'conferida', versao} — tudo igual a uma versão publicada (a mais
 *   recente, se o documento é igual em várias, como as licenças);
 * - {estado: 'diferente', ficheiros} — há ficheiros que não são os publicados;
 * - {estado: 'incompleta'} — falta o próprio documento (não se conseguiu ler)
 *   ou nunca se publicou um ficheiro com esse nome.
 */
export function conferir(recebidos, versoes, pagina = 'index.html') {
  if (!recebidos[pagina] || !versoes.some((v) => v.web[pagina])) return { estado: 'incompleta' };
  const versao = versoes.findLast((v) => v.web[pagina] === recebidos[pagina]);
  if (!versao) return { estado: 'diferente', ficheiros: [pagina] };
  const diferentes = Object.entries(recebidos)
    .filter(([ficheiro, impressao]) => versao.web[ficheiro] !== impressao)
    .map(([ficheiro]) => ficheiro)
    .sort();
  return diferentes.length ? { estado: 'diferente', ficheiros: diferentes } : { estado: 'conferida', versao: versao.versao };
}
