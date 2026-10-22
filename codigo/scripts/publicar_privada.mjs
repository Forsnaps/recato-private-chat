// Publica uma versão da conversa privada (22/10/2026) no repositório público:
// o sítio, igual para toda a gente, de onde a extensão tira as impressões
// digitais que confere (manifestos.json) e onde está o código desta parte.
//
// 1. Compila duas vezes, em pastas à parte, e só segue se der exatamente o
//    mesmo (a compilação tem de ser repetível por qualquer pessoa).
// 2. Junta a versão ao manifestos.json do repositório público. Uma versão
//    publicada nunca muda: para mudar ficheiros, sobe-se a versão em
//    privada/package.json.
// 3. Copia o código desta parte para o repositório público (codigo/).
//
// Depois: rever e enviar o repositório público (git commit + push) ANTES de
// pôr a versão nova em privada.recato.ai — para a extensão já a conhecer.
//
// Uso: node scripts/publicar_privada.mjs --repositorio=<pasta> [--publicacao=producao]
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { construir } from './construir_privada.mjs';

const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
/** O código desta parte, tal como se publica (sem node_modules nem compilados). */
const CODIGO = [
  'package.json', 'package-lock.json', 'privada', 'extensao', 'scripts/construir_privada.mjs',
  'scripts/publicar_privada.mjs', 'scripts/testes',
];

const temporaria = () => fs.mkdtempSync(path.join(os.tmpdir(), 'privada-publicar-'));

/** Compila duas vezes e devolve o manifesto, só se as duas forem iguais. */
export async function compilarRepetivel(publicacao) {
  const [a, b] = [temporaria(), temporaria()];
  try {
    const primeira = await construir({ publicacao, dist: a, app: false });
    const segunda = await construir({ publicacao, dist: b, app: false });
    if (!isDeepStrictEqual(primeira, segunda)) {
      throw new Error('A compilação não é repetível: duas compilações deram ficheiros diferentes.');
    }
    return primeira;
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
}

/** Junta *manifesto* às versões publicadas; devolve se mudou alguma coisa. */
export function juntarVersao(publicadas, manifesto, quando) {
  const existente = publicadas.versoes.find((v) => v.versao === manifesto.versao);
  if (existente) {
    const { publicada: _publicada, ...sem } = existente;
    if (!isDeepStrictEqual(sem, manifesto)) {
      throw new Error(`A versão ${manifesto.versao} já foi publicada com outros ficheiros: `
        + 'sobe a versão em privada/package.json.');
    }
    return false;
  }
  publicadas.versoes.push({ ...manifesto, publicada: quando });
  return true;
}

function copiarCodigo(destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  for (const parte of CODIGO) {
    fs.cpSync(path.join(RAIZ, parte), path.join(destino, parte), {
      recursive: true,
      filter: (origem) => !origem.includes(`${path.sep}node_modules`) && !origem.endsWith('.DS_Store'),
    });
  }
}

export async function publicar({ repositorio, publicacao = 'local', quando = new Date().toISOString() }) {
  const manifesto = await compilarRepetivel(publicacao);
  fs.mkdirSync(path.join(repositorio, 'versoes'), { recursive: true });
  const ficheiro = path.join(repositorio, 'manifestos.json');
  const publicadas = fs.existsSync(ficheiro) ? JSON.parse(fs.readFileSync(ficheiro, 'utf8')) : { versoes: [] };
  const nova = juntarVersao(publicadas, manifesto, quando);
  if (nova) {
    fs.writeFileSync(ficheiro, `${JSON.stringify(publicadas, null, 2)}\n`);
    fs.writeFileSync(path.join(repositorio, 'versoes', `${manifesto.versao}.json`),
      `${JSON.stringify(manifesto, null, 2)}\n`);
  }
  copiarCodigo(path.join(repositorio, 'codigo'));
  return { versao: manifesto.versao, nova };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argumento = (nome) => process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];
  const repositorio = argumento('repositorio');
  if (!repositorio) {
    console.error('Uso: node scripts/publicar_privada.mjs --repositorio=<pasta> [--publicacao=producao]');
    process.exit(2);
  }
  const { versao, nova } = await publicar({ repositorio: path.resolve(repositorio),
    publicacao: argumento('publicacao') || 'local' });
  console.log(nova ? `Versão ${versao} publicada em ${repositorio} (falta rever e enviar).`
    : `A versão ${versao} já estava publicada, igual. Código atualizado em ${repositorio}/codigo.`);
}
