// Publica uma versão da conversa privada (22/10/2026) no repositório público:
// o sítio, igual para toda a gente, de onde a extensão tira as impressões
// digitais que confere (manifestos.json) e onde está o código desta parte.
//
// 1. Compila duas vezes, em pastas à parte, e só segue se der exatamente o
//    mesmo (a compilação tem de ser repetível por qualquer pessoa).
// 2. Junta a versão ao manifestos.json do repositório público. Uma versão
//    publicada nunca muda: para mudar ficheiros, sobe-se a versão em
//    privada/package.json.
// 3. Guarda a página compilada em web/<versão>/ do repositório público
//    (03/11/2026): é de lá que o deploy (scripts/production/
//    update_privada_page.py) a põe em privada.recato.ai, depois de conferir
//    cada ficheiro com o manifestos.json. Também nunca muda.
// 4. Copia o código desta parte para o repositório público (codigo/).
// 5. Junta ao LICENSE (MIT) do repositório público a exceção do código do
//    chat que o ecrã corre (27/10/2026): esse vai com todos os direitos
//    reservados (termos em privada/licencas.txt).
//
// Depois: rever e enviar o repositório público (git commit + push). O deploy
// seguinte põe a versão em privada.recato.ai, e só depois de a ver no
// manifestos.json publicado — para a extensão já a conhecer.
//
// Uso: node scripts/publicar_privada.mjs --repositorio=<pasta> [--publicacao=producao]
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { construir } from './construir_privada.mjs';

const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
/** O código desta parte, tal como se publica (sem node_modules nem compilados). */
const CODIGO = [
  'package.json', 'package-lock.json', 'privada', 'extensao', 'scripts/construir_privada.mjs',
  'scripts/pacotes_python.mjs', 'scripts/publicar_privada.mjs', 'scripts/testes',
];

const MARCA_DA_EXCECAO = `${'-'.repeat(80)}\nExceção / Exception\n`;
/** O fim do LICENSE do repositório público (decisão do Pedro, 27/10/2026). */
export const EXCECAO_DA_LICENCA = `${MARCA_DA_EXCECAO}
A licença MIT acima não se aplica ao código do chat do Recato que a conversa
privada corre: codigo/privada/python/ (exceto as letras DejaVu de
codigo/privada/python/letras/, que têm a licença delas) e
codigo/privada/ficheiros.json. Esses ficheiros são Copyright (c) 2026 Forsnaps
AI - Soluções Tecnológicas, Unipessoal Lda, com todos os direitos reservados, e
estão publicados apenas para verificação: os termos estão em
codigo/privada/licencas.txt.

The MIT License above does not apply to the Recato chat code that the private
chat runs: codigo/privada/python/ (except the DejaVu fonts in
codigo/privada/python/letras/, which keep their own licence) and
codigo/privada/ficheiros.json. Those files are Copyright (c) 2026 Forsnaps AI -
Soluções Tecnológicas, Unipessoal Lda, with all rights reserved, and are
published for verification only: the terms are in codigo/privada/licencas.txt.
`;

/** *licenca* (o texto do LICENSE) com a EXCECAO_DA_LICENCA no fim: uma só vez, e a de agora. */
export function comAExcecao(licenca) {
  const inicio = licenca.indexOf(MARCA_DA_EXCECAO);
  const base = (inicio === -1 ? licenca : licenca.slice(0, inicio)).trimEnd();
  return base ? `${base}\n\n${EXCECAO_DA_LICENCA}` : EXCECAO_DA_LICENCA;
}

const temporaria = () => fs.mkdtempSync(path.join(os.tmpdir(), 'privada-publicar-'));

/** Compila duas vezes e devolve o manifesto, só se as duas forem iguais. Antes
 *  de as compilações se apagarem, passa a *usar* a pasta de uma delas. */
export async function compilarRepetivel(publicacao, usar = () => {}) {
  const [a, b] = [temporaria(), temporaria()];
  try {
    const primeira = await construir({ publicacao, dist: a, app: false });
    const segunda = await construir({ publicacao, dist: b, app: false });
    if (!isDeepStrictEqual(primeira, segunda)) {
      throw new Error('A compilação não é repetível: duas compilações deram ficheiros diferentes.');
    }
    usar(a, primeira);
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

const sha256 = (dados) => createHash('sha256').update(dados).digest('hex');

/** {caminho relativo: SHA-256} de todos os ficheiros de *pasta* (como no manifesto). */
function impressoesDaPasta(pasta, base = pasta, impressoes = {}) {
  for (const nome of fs.readdirSync(pasta)) {
    const caminho = path.join(pasta, nome);
    if (fs.statSync(caminho).isDirectory()) impressoesDaPasta(caminho, base, impressoes);
    else impressoes[path.relative(base, caminho).split(path.sep).join('/')] = sha256(fs.readFileSync(caminho));
  }
  return impressoes;
}

/** Guarda em *destino* (web/<versão>/ do repositório público) a página compilada em *origem*, que tem de ter
 *  as *impressoes* do manifesto. Uma página guardada nunca muda: se já lá está, tem de ser igual. Devolve se a
 *  guardou agora. */
export function guardarPagina(origem, destino, impressoes) {
  if (!isDeepStrictEqual(impressoesDaPasta(origem), impressoes)) {
    throw new Error('A página compilada não tem os ficheiros do manifesto.');
  }
  if (fs.existsSync(destino)) {
    if (!isDeepStrictEqual(impressoesDaPasta(destino), impressoes)) {
      throw new Error(`${destino} já tem outros ficheiros: uma versão publicada nunca muda `
        + '(sobe a versão em privada/package.json).');
    }
    return false;
  }
  // Numa pasta à parte e só no fim com o nome certo: uma cópia a meio nunca passa por publicada.
  const provisoria = `${destino}.novo`;
  fs.rmSync(provisoria, { recursive: true, force: true });
  fs.cpSync(origem, provisoria, { recursive: true });
  fs.renameSync(provisoria, destino);
  return true;
}

function copiarCodigo(destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  for (const parte of CODIGO) {
    fs.cpSync(path.join(RAIZ, parte), path.join(destino, parte), {
      recursive: true,
      filter: (origem) => !origem.includes(`${path.sep}node_modules`) && !origem.endsWith('.DS_Store')
        && !origem.includes(`${path.sep}__pycache__`),
    });
  }
}

export async function publicar({ repositorio, publicacao = 'local', quando = new Date().toISOString() }) {
  const ficheiro = path.join(repositorio, 'manifestos.json');
  const publicadas = fs.existsSync(ficheiro) ? JSON.parse(fs.readFileSync(ficheiro, 'utf8')) : { versoes: [] };
  let nova;
  const manifesto = await compilarRepetivel(publicacao, (dist, compilado) => {
    // Primeiro a regra de sempre (uma versão publicada nunca muda); só depois a página.
    nova = juntarVersao(publicadas, compilado, quando);
    fs.mkdirSync(path.join(repositorio, 'web'), { recursive: true });
    guardarPagina(path.join(dist, 'web'), path.join(repositorio, 'web', compilado.versao), compilado.web);
  });
  fs.mkdirSync(path.join(repositorio, 'versoes'), { recursive: true });
  if (nova) {
    fs.writeFileSync(ficheiro, `${JSON.stringify(publicadas, null, 2)}\n`);
    fs.writeFileSync(path.join(repositorio, 'versoes', `${manifesto.versao}.json`),
      `${JSON.stringify(manifesto, null, 2)}\n`);
  }
  copiarCodigo(path.join(repositorio, 'codigo'));
  const licenca = path.join(repositorio, 'LICENSE');
  const atual = fs.existsSync(licenca) ? fs.readFileSync(licenca, 'utf8') : '';
  if (comAExcecao(atual) !== atual) fs.writeFileSync(licenca, comAExcecao(atual));
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
