// Os erros do código deste ecrã chegam a quem o mantém (04/11/2026, pedido do
// Pedro: todos os erros das apps chegam ao Sentry). Vão ao servidor do Recato
// (servidor.js, /fs_chat/privada/falha), que os regista, só com o sítio do
// código onde rebentaram, o tipo do erro e a versão do ecrã — nunca a mensagem
// do erro, que pode trazer texto da conversa, nem nada da conversa. Contam só
// os erros dos guiões deste ecrã: os de uma extensão do browser metida na
// página, ou o «Script error.» de um guião de fora, não são nossos; a rede em
// baixo e as respostas do servidor também não são defeitos. Cada falha vai uma
// vez, no máximo MAX_AVISOS por carregamento, e sem rede perde-se.

/* global __VERSAO__ */
export const MAX_AVISOS = 10;
/** Os motivos que o servidor conhece (MOTIVOS em web/controllers/falhas.py). */
export const MOTIVOS = new Set(['js', 'acao']);
const ONDE = /^[a-z][a-z0-9_]{0,39}$/;
const TIPO = /^[A-Za-z_][A-Za-z0-9_]{0,59}$/;
const SITIO = /^[A-Za-z0-9_.@/-]{1,120}:\d{1,7}(?::\d{1,7})?$/;
/** Os erros do próprio JavaScript, que são defeitos do código (menos os da rede: eDaRede). */
const DEFEITOS = new Set(['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError']);

/** O fetch sem rede falha com um TypeError («Failed to fetch» no Chrome, «Load failed» no Safari, «NetworkError
 *  when attempting to fetch resource.» no Firefox): é do ambiente, não um defeito. */
export function eDaRede(erro) {
  return erro?.name === 'TypeError' && /fetch|network|load failed/i.test(String(erro.message || ''));
}

/** Um defeito do código: um erro do próprio JavaScript que não é a rede nem uma resposta do servidor (com status). */
export function eDefeito(erro) {
  return erro instanceof Error && DEFEITOS.has(erro.name) && !eDaRede(erro) && erro.status === undefined;
}

/** Uma falha do código deste ecrã: um defeito, ou o Python do ecrã que falhou (python.js; não quando foi o ecrã que
 *  o encerrou). */
export function eFalhaDoEcra(erro) {
  return eDefeito(erro) || (erro instanceof Error && erro.codigo === 'python' && erro.message !== 'encerrado');
}

/** O começo dos endereços dos guiões deste ecrã: o da própria página (na app, na extensão ou na web). */
export function origemDoEcra(janela = globalThis) {
  const local = janela.location;
  return local?.protocol && local.host ? `${local.protocol}//${local.host}/` : null;
}

/** O primeiro passo do stack com um endereço: [endereço, linha, coluna] (V8, WebKit e Firefox), ou null. */
function primeiroPasso(erro) {
  const linhas = String(erro?.stack || '').split('\n').map((linha) => linha.trim());
  // No V8 o stack começa pela mensagem do erro, que nunca se lê: só contam as linhas «at …».
  const passos = linhas.some((linha) => linha.startsWith('at ')) ? linhas.filter((linha) => linha.startsWith('at '))
    : linhas;
  for (const linha of passos) {
    const m = linha.match(/([^\s(@]+):(\d+):(\d+)\)?$/);
    if (m) return [m[1], m[2], m[3]];
  }
  return null;
}

/** O erro rebentou num guião deste ecrã (*origem*)? Pelo primeiro passo do stack ou, sem ele, por *recurso*
 *  ([endereço, linha, coluna] do evento error). */
export function eDesteEcra(erro, origem, recurso = null) {
  const passo = primeiroPasso(erro) || recurso;
  return Boolean(origem && passo && String(passo[0]).startsWith(origem));
}

/** O tipo do erro: o nome dele; num erro do Python do ecrã, o nome da exceção do Python, da última linha do
 *  traceback (sem a mensagem; outra coisa fica «Python»). */
export function tipoDoErro(erro) {
  if (!(erro instanceof Error)) return undefined;
  if (erro.codigo === 'python') {
    const ultima = String(erro.message || '').trim().split('\n').pop().trim();
    const nome = ultima.match(/^([A-Za-z_][\w.]*)(?::|$)/)?.[1]?.split('.').pop();
    return nome && TIPO.test(nome) && /(Error|Exception|Exit|Interrupt|Warning)$/.test(nome) ? nome : 'Python';
  }
  return TIPO.test(erro.name || '') ? erro.name : undefined;
}

/** Onde rebentou, só com o nome do ficheiro: num erro do Python do ecrã, ficheiro.py:linha do último passo do
 *  traceback (o código do chat); nos outros, ficheiro:linha:coluna do primeiro passo do stack (ou de *recurso*). */
export function sitioDoErro(erro, recurso = null) {
  if (!(erro instanceof Error)) return undefined;
  let sitio;
  if (erro.codigo === 'python') {
    const ultimo = [...String(erro.message || '').matchAll(/File "([^"]+)", line (\d+)/g)].pop();
    sitio = ultimo && `${ultimo[1].split('/').pop()}:${ultimo[2]}`;
  } else {
    const passo = primeiroPasso(erro) || recurso;
    sitio = passo && `${String(passo[0]).split(/[?#]/)[0].split('/').pop()}:${passo[1]}:${passo[2]}`;
  }
  return sitio && SITIO.test(sitio) ? sitio : undefined;
}

/** Os avisos de um carregamento do ecrã. Até *ligar(enviar)* (a sessão e o servidor só chegam no arranque) ficam à
 *  espera; depois, cada um sai por *enviar(campos)*, sem se esperar pela resposta. */
export function criarAvisos({ versao = '', maximo = MAX_AVISOS, janela = globalThis } = {}) {
  const vistos = new Set();
  const porEnviar = [];
  let enviar = null;

  function mandar(campos) {
    try {
      Promise.resolve(enviar(campos)).catch(() => {});
    } catch {
      // Um aviso nunca pode ser ele próprio um erro.
    }
  }

  /** Avisa da falha *onde* (um código: responder, imagens…), com o *motivo* (MOTIVOS) e o *erro*, se o erro for
   *  deste ecrã; *recurso*: [endereço, linha, coluna] do evento error, para um erro sem stack. */
  function avisar(onde, motivo, erro, recurso = null) {
    if (!ONDE.test(String(onde)) || !MOTIVOS.has(motivo) || !(erro instanceof Error)
        || !eDesteEcra(erro, origemDoEcra(janela), recurso)) return false;
    const tipo = tipoDoErro(erro);
    const sitio = sitioDoErro(erro, recurso);
    const chave = [onde, motivo, tipo, sitio].join('|');
    if (vistos.has(chave) || vistos.size >= maximo) return false;
    vistos.add(chave);
    const campos = { onde, motivo, versao, ...(tipo ? { tipo } : {}), ...(sitio ? { sitio } : {}) };
    if (enviar) mandar(campos);
    else porEnviar.push(campos);
    return true;
  }

  return {
    avisar,
    /** Num catch que mostra um erro à pessoa e segue: avisa só se for uma falha do código do ecrã. */
    seFalhar: (onde, erro) => eFalhaDoEcra(erro) && avisar(onde, 'acao', erro),
    /** Os erros deste ecrã que ninguém apanhou: o que rebenta (error) e a promessa recusada sem catch
     *  (unhandledrejection, só as falhas do código: a rede e as respostas do servidor não). */
    escutar() {
      janela.addEventListener?.('error', (evento) => {
        const erro = evento?.error;
        if (erro instanceof Error && !eDaRede(erro)) {
          avisar('ecra', 'js', erro, evento.filename ? [evento.filename, evento.lineno, evento.colno] : null);
        }
      });
      janela.addEventListener?.('unhandledrejection', (evento) => {
        if (eFalhaDoEcra(evento?.reason)) avisar('ecra', 'js', evento.reason);
      });
    },
    /** A partir daqui os avisos saem por *funcao(campos)* (servidor.avisarFalha), também os que estavam à espera. */
    ligar(funcao) {
      enviar = funcao;
      for (const campos of porEnviar.splice(0)) mandar(campos);
    },
  };
}

/** Os avisos deste carregamento do ecrã: o privada.js escuta-os e liga-os ao servidor, e os módulos avisam por
 *  eles. A versão é a do ecrã, posta pela compilação (scripts/construir_privada.mjs). */
export const avisos = criarAvisos({ versao: typeof __VERSAO__ === 'string' ? __VERSAO__ : '' });
