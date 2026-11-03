// As bibliotecas Python do ecrã da conversa privada (27/10/2026): as rodas que
// o Pyodide carrega para fazer os ficheiros (privada/python/pacotes.json, com
// a impressão SHA-256 de cada uma). Descarrega-as uma vez para a pasta de
// cache (node_modules/.cache/privada-python) e confere cada uma: a compilação
// é repetível e recusa uma roda que não seja a fixada.
//
// Uso: node scripts/pacotes_python.mjs   (também o chama a compilação)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export const PACOTES = JSON.parse(fs.readFileSync(path.join(RAIZ, 'privada', 'python', 'pacotes.json'), 'utf8'));
export const CACHE = path.join(RAIZ, 'node_modules', '.cache', 'privada-python');

const sha256 = (dados) => createHash('sha256').update(dados).digest('hex');

/** {ficheiro: bytes} de todas as rodas, conferidas; descarrega as que faltam. */
export async function rodasPython({ cache = CACHE, buscar = fetch } = {}) {
  fs.mkdirSync(cache, { recursive: true });
  const rodas = {};
  for (const { ficheiro, endereco, sha256: esperado } of PACOTES) {
    const caminho = path.join(cache, ficheiro);
    let dados = fs.existsSync(caminho) ? fs.readFileSync(caminho) : null;
    if (!dados || sha256(dados) !== esperado) {
      const resposta = await buscar(endereco);
      if (!resposta.ok) throw new Error(`${ficheiro}: HTTP ${resposta.status} em ${endereco}`);
      dados = Buffer.from(await resposta.arrayBuffer());
      if (sha256(dados) !== esperado) throw new Error(`${ficheiro}: a impressão digital não é a fixada`);
      fs.writeFileSync(caminho, dados);
    }
    rodas[ficheiro] = dados;
  }
  return rodas;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const rodas = await rodasPython();
  for (const [ficheiro, dados] of Object.entries(rodas)) console.log(`${sha256(dados).slice(0, 12)}  ${ficheiro}`);
}
