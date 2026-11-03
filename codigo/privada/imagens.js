// As imagens da conversa privada (26/10/2026, pedido do Pedro): lê-as o
// GLM-5.3-Flash, que está na mesma instalação atestada da Privatemode que o
// GLM-5.3 — a imagem vai cifrada daqui até lá dentro, como o texto.
//
// As regras são as do chat do Recato (forsnaps_ai_chat, controllers/ai_chat.py):
// imagens reduzidas a 2000 píxeis em JPEG 85 quando passam disso ou de 1 MB
// (_IMAGE_CONVERT_MAX_DIM, _IMAGEM_MAX_BYTES); em cada pedido, as imagens das
// últimas 3 mensagens da pessoa (_HISTORY_IMAGE_MAX_MESSAGES), no máximo 8
// (_MAX_IMAGES_PER_CALL) e 3 MB em base64 (_IMAGENS_BYTES_POR_PEDIDO), as mais
// recentes primeiro. Sem imagens nessa janela, a conversa volta ao GLM-5.3.

export const LADO_MAXIMO = 2000;
export const QUALIDADE_JPEG = 0.85;
export const MAX_BYTES_IMAGEM = 1024 * 1024;
export const MAX_BYTES_POR_PEDIDO = 3 * 1024 * 1024;
export const MAX_IMAGENS_POR_PEDIDO = 8;
export const MENSAGENS_COM_IMAGENS = 3;
/** O que cabe das imagens numa conversa guardada (a conversa cifrada vai até
 *  4 MB em base64: ≈3 MB de conteúdo, com o texto). */
export const MAX_BYTES_GUARDADOS = 2.5 * 1024 * 1024;
const TIPOS_DIRETOS = ['image/jpeg', 'image/png', 'image/webp'];

/** O tamanho de uma imagem em data URL, tal como vai no pedido (base64). */
export const bytesDe = (url) => (typeof url === 'string' ? url.length : 0);

/** As dimensões de uma imagem reduzida para caber em *maximo* píxeis. */
export function dimensoesReduzidas(largura, altura, maximo = LADO_MAXIMO) {
  const fator = Math.min(1, maximo / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * fator)), altura: Math.max(1, Math.round(altura * fator)) };
}

/** As reduções a tentar, por ordem, até a imagem caber em MAX_BYTES_IMAGEM:
 *  2000 píxeis em JPEG 85 (a do chat) e, numa imagem muito detalhada, menos
 *  qualidade e depois menos píxeis — nunca fica uma imagem de fora sem aviso. */
export function reducoes(largura, altura) {
  const tentativas = [];
  let { largura: l, altura: a } = dimensoesReduzidas(largura, altura);
  for (let vez = 0; vez < 4; vez += 1) {
    for (const qualidade of [QUALIDADE_JPEG, 0.7, 0.55]) tentativas.push({ largura: l, altura: a, qualidade });
    ({ largura: l, altura: a } = dimensoesReduzidas(l, a, Math.round(Math.max(l, a) * 0.75)));
  }
  return tentativas;
}

/** Os bytes de uma imagem em data URL, depois de descodificada. */
export const bytesDescodificados = (url) => Math.floor((bytesDe(url) - url.indexOf(',') - 1) * 3 / 4);

/** Se uma imagem pode ir tal como está, sem a reduzir. */
export const vaiTalComoEsta = (tipo, bytes, largura, altura) => TIPOS_DIRETOS.includes(tipo)
  && bytes <= MAX_BYTES_IMAGEM && Math.max(largura, altura) <= LADO_MAXIMO;

/**
 * As mensagens para o modelo: o sistema e a conversa, com as imagens das
 * últimas MENSAGENS_COM_IMAGENS mensagens da pessoa que cabem nos limites,
 * as mais recentes primeiro. Devolve {mensagens, bytesImagens}: os bytes das
 * imagens que foram (o servidor tira-os da estimativa da cobrança).
 */
export function paraOModelo(sistema, conversa) {
  const daPessoa = conversa.map((m, i) => (m.papel === 'eu' ? i : -1)).filter((i) => i >= 0);
  const janela = new Set(daPessoa.slice(-MENSAGENS_COM_IMAGENS));
  const escolhidas = new Map();
  let bytesImagens = 0;
  let quantas = 0;
  for (let i = conversa.length - 1; i >= 0; i -= 1) {
    if (!janela.has(i)) continue;
    for (const url of [...(conversa[i].imagens || [])].reverse()) {
      if (quantas >= MAX_IMAGENS_POR_PEDIDO || bytesImagens + bytesDe(url) > MAX_BYTES_POR_PEDIDO) continue;
      if (!escolhidas.has(i)) escolhidas.set(i, []);
      escolhidas.get(i).unshift(url);
      bytesImagens += bytesDe(url);
      quantas += 1;
    }
  }
  const mensagens = [{ role: 'system', content: sistema }, ...conversa.map((m, i) => {
    if (m.papel !== 'eu') return { role: 'assistant', content: m.texto };
    const imagens = escolhidas.get(i);
    if (!imagens) return { role: 'user', content: m.texto || '' };
    return { role: 'user', content: [
      ...(m.texto ? [{ type: 'text', text: m.texto }] : []),
      ...imagens.map((url) => ({ type: 'image_url', image_url: { url } })),
    ] };
  })];
  return { mensagens, bytesImagens };
}

/** As mensagens a guardar no histórico: as imagens mais recentes até
 *  *maximo* (por omissão MAX_BYTES_GUARDADOS; menos quando a conversa leva
 *  muito texto ou os originais de documentos); as outras ficam contadas em
 *  `imagensNaoGuardadas`. */
export function paraGuardar(mensagens, maximo = MAX_BYTES_GUARDADOS) {
  let bytes = 0;
  const guardadas = [];
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i];
    if (!m.imagens?.length) {
      guardadas.unshift(m);
      continue;
    }
    const ficam = [];
    let fora = m.imagensNaoGuardadas || 0;
    for (const url of [...m.imagens].reverse()) {
      if (bytes + bytesDe(url) <= maximo) {
        ficam.unshift(url);
        bytes += bytesDe(url);
      } else {
        fora += 1;
      }
    }
    const { imagens: _imagens, imagensNaoGuardadas: _fora, ...resto } = m;
    guardadas.unshift({ ...resto, ...(ficam.length ? { imagens: ficam } : {}), ...(fora ? { imagensNaoGuardadas: fora } : {}) });
  }
  return guardadas;
}

/** Uma imagem escolhida pela pessoa como data URL pronta para o modelo:
 *  tal como está ou reduzida (só no browser: usa um canvas). */
export async function prepararImagem(ficheiro, documento = globalThis.document) {
  if (!ficheiro.type?.startsWith('image/')) throw Object.assign(new Error('nao_e_imagem'), { codigo: 'nao_e_imagem' });
  let bitmap;
  try {
    bitmap = await createImageBitmap(ficheiro);
  } catch {
    throw Object.assign(new Error('imagem_invalida'), { codigo: 'imagem_invalida' });
  }
  if (vaiTalComoEsta(ficheiro.type, ficheiro.size, bitmap.width, bitmap.height)) {
    bitmap.close?.();
    return lerComoDataUrl(ficheiro);
  }
  const canvas = documento.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let url = '';
  for (const { largura, altura, qualidade } of reducoes(bitmap.width, bitmap.height)) {
    if (canvas.width !== largura || canvas.height !== altura) {
      canvas.width = largura;
      canvas.height = altura;
      // Fundo branco: o JPEG não tem transparência (um PNG transparente ficava preto).
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(bitmap, 0, 0, largura, altura);
    }
    url = canvas.toDataURL('image/jpeg', qualidade);
    if (bytesDescodificados(url) <= MAX_BYTES_IMAGEM) break;
  }
  bitmap.close?.();
  return url;
}

function lerComoDataUrl(ficheiro) {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(leitor.result);
    leitor.onerror = () => rejeitar(Object.assign(new Error('imagem_invalida'), { codigo: 'imagem_invalida' }));
    leitor.readAsDataURL(ficheiro);
  });
}
