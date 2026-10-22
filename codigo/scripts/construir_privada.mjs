// Compila a conversa privada (22/10/2026) para os três sítios onde ela vive,
// sempre com os MESMOS ficheiros do ecrã (index.html, estilo.css, privada.js e
// o módulo da caixa-forte, privatemode.wasm):
//
// * a app Android: android/app/src/main/assets/privada/;
// * a página privada.recato.ai: dist/web/, com a página «Como confirmar»;
// * a extensão do browser, para Chrome/Edge (dist/extensao-chrome/) e para
//   Firefox (dist/extensao-firefox/), com o ecrã dentro dela (privada/).
//
// O código que vê o texto nunca muda sem se ver: a página traz as impressões
// digitais do privada.js e do estilo.css (o browser recusa outros) e o
// privada.js traz a do módulo da caixa-forte (o SDK recusa outro). No fim
// escreve-se dist/manifesto.json, com as impressões digitais SHA-256 de todos
// os ficheiros, que se publica num sítio público (scripts/publicar_privada.mjs).
// A compilação é repetível: as versões estão fixadas no package-lock.json.
//
// Uso: npm run privada [-- --publicacao=producao]   (por omissão: local)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { build } from 'esbuild';

const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const ECRA = path.join(RAIZ, 'privada');
const EXTENSAO = path.join(RAIZ, 'extensao');
const DIST = path.join(RAIZ, 'dist');
const APP = path.join(RAIZ, 'android', 'app', 'src', 'main', 'assets', 'privada');
const WASM = path.join(RAIZ, 'node_modules', 'privatemode-ai', 'dist', 'privatemode.wasm');

/** Os ficheiros do ecrã, iguais na app, na página e na extensão. */
const ECRA_PUBLICADO = ['index.html', 'estilo.css', 'privada.js', 'privatemode.wasm', 'licencas.txt'];

const sha256 = (dados) => createHash('sha256').update(dados).digest('hex');
const sri = (dados) => `sha384-${createHash('sha384').update(dados).digest('base64')}`;

function opcoes(argumentos) {
  const publicacao = (argumentos.find((a) => a.startsWith('--publicacao=')) || '--publicacao=local').split('=')[1];
  const destino = argumentos.find((a) => a.startsWith('--destino='))?.split('=')[1];
  return { publicacao, dist: destino ? path.resolve(destino) : DIST };
}

/** Os endereços públicos onde as impressões digitais e o código ficam. */
function enderecosPublicos(publicacao) {
  const todos = JSON.parse(fs.readFileSync(path.join(ECRA, 'publicacao.json'), 'utf8'));
  const escolhidos = todos[publicacao];
  if (!escolhidos?.manifestos || !escolhidos?.repositorio) {
    throw new Error(`privada/publicacao.json: faltam os endereços de «${publicacao}» `
      + '(o repositório público ainda não existe?)');
  }
  return escolhidos;
}

const ESBUILD = {
  bundle: true,
  platform: 'browser',
  target: ['chrome110', 'firefox115'],
  legalComments: 'inline',
  logLevel: 'warning',
  write: false,
};

async function compilar(entrada, extra = {}) {
  const resultado = await build({ ...ESBUILD, entryPoints: [entrada], format: 'esm', ...extra });
  return Buffer.from(resultado.outputFiles[0].contents);
}

/** O ecrã: igual nos três sítios. */
async function compilarEcra(versao) {
  const wasm = fs.readFileSync(WASM);
  const privada = await compilar(path.join(ECRA, 'privada.js'), {
    // Os ramos do SDK para o Node.js nunca correm no browser.
    external: ['node:*', 'fs', 'path', 'url', 'crypto', 'worker_threads'],
    define: { __WASM_SHA256__: JSON.stringify(sha256(wasm)) },
  });
  const estilo = fs.readFileSync(path.join(ECRA, 'estilo.css'));
  const pagina = fs.readFileSync(path.join(ECRA, 'index.html'), 'utf8')
    .replace('{{SRI_PRIVADA}}', sri(privada))
    .replace('{{SRI_ESTILO}}', sri(estilo));
  if (pagina.includes('{{')) throw new Error('index.html: ficou uma marca por preencher');
  return {
    'index.html': Buffer.from(pagina), 'estilo.css': estilo, 'privada.js': privada, 'privatemode.wasm': wasm,
    // As licenças do código de terceiros que vai no ecrã (SDK da Privatemode,
    // wasm_exec.js do Go, SDK da OpenAI) e a nossa.
    'licencas.txt': fs.readFileSync(path.join(ECRA, 'licencas.txt')),
    versao,
  };
}

function paginaComoConfirmar(ecra, versao, publicos) {
  const linhas = ['index.html', 'estilo.css', 'privada.js', 'privatemode.wasm']
    .map((f) => `<tr><td><code>${f}</code></td><td class="impressao">${sha256(ecra[f])}</td></tr>`).join('\n');
  const pagina = fs.readFileSync(path.join(ECRA, 'confirmar.html'), 'utf8')
    .replaceAll('{{VERSAO}}', versao)
    .replaceAll('{{IMPRESSOES}}', linhas)
    .replaceAll('{{MANIFESTOS}}', publicos.manifestos)
    .replaceAll('{{REPOSITORIO}}', publicos.repositorio);
  if (pagina.includes('{{')) throw new Error('confirmar.html: ficou uma marca por preencher');
  return Buffer.from(pagina);
}

/** O manifest.json da extensão; o Firefox lê os bytes ao passarem
 *  (filterResponseData), o Chrome não tem como. */
function manifestDaExtensao(navegador, versao) {
  const manifest = {
    manifest_version: 3,
    name: 'Recato — Conversa privada',
    short_name: 'Recato privada',
    version: versao,
    description: 'A conversa privada do Recato com o código publicado, e a conferência da página privada.recato.ai.',
    icons: { 16: 'icones/icone-16.png', 32: 'icones/icone-32.png', 48: 'icones/icone-48.png', 128: 'icones/icone-128.png' },
    action: { default_popup: 'popup.html', default_icon: { 16: 'icones/icone-16.png', 32: 'icones/icone-32.png' } },
    permissions: ['storage'],
    host_permissions: ['https://recato.ai/*', 'https://*.recato.ai/*'],
    content_scripts: [
      { matches: ['https://recato.ai/*', 'https://*.recato.ai/*'], exclude_matches: ['https://privada.recato.ai/*'],
        js: ['recato.js'], run_at: 'document_start' },
      { matches: ['https://privada.recato.ai/*'], js: ['conferir.js'], run_at: 'document_idle' },
    ],
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
  };
  if (navegador === 'firefox') {
    manifest.background = { scripts: ['fundo.js'], type: 'module' };
    manifest.permissions.push('webRequest', 'webRequestBlocking', 'webRequestFilterResponse');
    manifest.browser_specific_settings = { gecko: { id: 'conversa-privada@recato.ai', strict_min_version: '121.0' } };
  } else {
    manifest.background = { service_worker: 'fundo.js', type: 'module' };
  }
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

async function compilarExtensao(navegador, ecra, versao, publicos) {
  const publicacao = {
    name: 'publicacao',
    setup(construtor) {
      construtor.onResolve({ filter: /\/publicacao\.js$/ }, () => ({ path: 'publicacao', namespace: 'publicacao' }));
      construtor.onLoad({ filter: /.*/, namespace: 'publicacao' }, () => ({
        contents: `export const MANIFESTOS = ${JSON.stringify(publicos.manifestos)};\n`
          + `export const REPOSITORIO = ${JSON.stringify(publicos.repositorio)};\n`,
        loader: 'js',
      }));
    },
  };
  const ficheiros = {
    'manifest.json': manifestDaExtensao(navegador, versao),
    'fundo.js': await compilar(path.join(EXTENSAO, 'fundo.js'), { plugins: [publicacao] }),
    'recato.js': await compilar(path.join(EXTENSAO, 'recato.js'), { format: 'iife' }),
    'conferir.js': await compilar(path.join(EXTENSAO, 'conferir.js'), { format: 'iife' }),
    'popup.js': await compilar(path.join(EXTENSAO, 'popup.js'), { plugins: [publicacao] }),
    'popup.html': fs.readFileSync(path.join(EXTENSAO, 'popup.html')),
    'popup.css': fs.readFileSync(path.join(EXTENSAO, 'popup.css')),
  };
  for (const icone of fs.readdirSync(path.join(EXTENSAO, 'icones')).sort()) {
    ficheiros[`icones/${icone}`] = fs.readFileSync(path.join(EXTENSAO, 'icones', icone));
  }
  for (const nome of ECRA_PUBLICADO) {
    ficheiros[`privada/${nome}`] = ecra[nome];
  }
  return ficheiros;
}

function escrever(pasta, ficheiros) {
  fs.rmSync(pasta, { recursive: true, force: true });
  for (const [nome, dados] of Object.entries(ficheiros)) {
    fs.mkdirSync(path.dirname(path.join(pasta, nome)), { recursive: true });
    fs.writeFileSync(path.join(pasta, nome), dados);
  }
}

const impressoes = (ficheiros) => Object.fromEntries(Object.keys(ficheiros).sort()
  .map((nome) => [nome, sha256(ficheiros[nome])]));

export async function construir({ publicacao = 'local', dist = DIST, app = true } = {}) {
  const versao = JSON.parse(fs.readFileSync(path.join(ECRA, 'package.json'), 'utf8')).version;
  const publicos = enderecosPublicos(publicacao);
  const ecra = await compilarEcra(versao);
  const doEcra = Object.fromEntries(ECRA_PUBLICADO.map((nome) => [nome, ecra[nome]]));
  const web = { ...doEcra, 'confirmar.html': paginaComoConfirmar(ecra, versao, publicos),
    'confirmar.css': fs.readFileSync(path.join(ECRA, 'confirmar.css')) };
  const chrome = await compilarExtensao('chrome', ecra, versao, publicos);
  const firefox = await compilarExtensao('firefox', ecra, versao, publicos);

  if (app) escrever(APP, doEcra);
  escrever(path.join(dist, 'web'), web);
  escrever(path.join(dist, 'extensao-chrome'), chrome);
  escrever(path.join(dist, 'extensao-firefox'), firefox);
  const manifesto = {
    versao,
    app: impressoes(Object.fromEntries(Object.entries(doEcra).map(([n, d]) => [`assets/privada/${n}`, d]))),
    web: impressoes(web),
    extensao: { chrome: impressoes(chrome), firefox: impressoes(firefox) },
  };
  fs.writeFileSync(path.join(dist, 'manifesto.json'), `${JSON.stringify(manifesto, null, 2)}\n`);
  return manifesto;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { publicacao, dist } = opcoes(process.argv.slice(2));
  // No repositório público não há a app Android: compila-se só o resto.
  const manifesto = await construir({ publicacao, dist, app: fs.existsSync(path.join(RAIZ, 'android')) });
  console.log(`versão ${manifesto.versao} (${publicacao}) → ${path.relative(RAIZ, dist)}/`);
  for (const [nome, impressao] of Object.entries(manifesto.web)) {
    console.log(`${impressao}  web/${nome}`);
  }
}
