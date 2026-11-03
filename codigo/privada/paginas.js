// As páginas digitalizadas dos PDF anexados (30/10/2026, decisão do Pedro:
// «sim» ao pdf.js): o chat do Recato desenha-as no servidor (_pagina_em_jpeg,
// com o pypdfium2) para o modelo das imagens as ler; aqui desenha-as o pdf.js
// (Mozilla, Apache-2.0) neste ecrã, como o chat: em JPEG cinzento, a 150 ppp,
// com o lado maior até 2500 pixéis (os valores do chat, em ficheiros.json).
// Com o worker do pdf.js e os WebAssembly dos formatos das digitalizações
// (JBIG2, JPEG 2000) na pasta pdfjs/ do ecrã. É a versão «legacy» do pdf.js: o
// ecrã corre desde o Chrome 110 e o Firefox 115, e a outra pede o Chrome 140
// (achado no ensaio: «a.toHex is not a function»). Só no browser: o resto da
// leitura é do anexos.js (lerAsPaginas) e do Python (privada_anexos.paginas).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.min.mjs';

import { LIMITES_DAS_PAGINAS } from './anexos.js';
import { b64 } from './cofre.js';

const { PAGINA_DPI, PAGINA_MAX_PIXEIS, PAGINA_JPEG_QUALIDADE } = LIMITES_DAS_PAGINAS;

/**
 * As *paginas* (a contar de 1) do PDF *dados* em JPEG cinzento, em base64:
 * [{pagina, jpeg}], pela ordem. Uma página que não se desenha fica de fora
 * (como no chat, fica por ler); um PDF que não abre falha.
 */
export async function desenharPaginas(dados, paginas) {
  const pasta = new URL('pdfjs/', document.baseURI).href;
  GlobalWorkerOptions.workerSrc = `${pasta}pdf.worker.min.js`;
  // Destrói-se a tarefa, que fecha o documento e o worker (no pdf.js 6, o documento já não tem destroy).
  const tarefa = getDocument({ data: new Uint8Array(dados), wasmUrl: pasta, enableXfa: false });
  const pdf = await tarefa.promise;
  try {
    const feitas = [];
    for (const numero of paginas) {
      try {
        feitas.push({ pagina: numero, jpeg: await emJpeg(await pdf.getPage(numero)) });
      } catch {
        // Página danificada: fica por ler.
      }
    }
    return feitas;
  } finally {
    await tarefa.destroy();
  }
}

async function emJpeg(pagina) {
  const escala = PAGINA_DPI / 72;
  let vista = pagina.getViewport({ scale: escala });
  // Plantas e A3: a imagem não cresce sem fim (o thumbnail do chat).
  const maior = Math.max(vista.width, vista.height);
  if (maior > PAGINA_MAX_PIXEIS) vista = pagina.getViewport({ scale: (escala * PAGINA_MAX_PIXEIS) / maior });
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.floor(vista.width));
  tela.height = Math.max(1, Math.floor(vista.height));
  await pagina.render({ canvas: tela, viewport: vista, background: 'white' }).promise;
  // Cinzento, como o convert('L') do chat: L = R·299/1000 + G·587/1000 + B·114/1000.
  const contexto = tela.getContext('2d', { willReadFrequently: true });
  const imagem = contexto.getImageData(0, 0, tela.width, tela.height);
  const p = imagem.data;
  for (let i = 0; i < p.length; i += 4) {
    const cinzento = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;
    p[i] = cinzento;
    p[i + 1] = cinzento;
    p[i + 2] = cinzento;
  }
  contexto.putImageData(imagem, 0, 0);
  const jpeg = await new Promise((ok, mal) => tela.toBlob((blob) => (blob ? ok(blob) : mal(new Error('jpeg'))),
    'image/jpeg', PAGINA_JPEG_QUALIDADE / 100));
  pagina.cleanup();
  return b64(new Uint8Array(await jpeg.arrayBuffer()));
}
