// Testes de privada/falhas.js (04/11/2026): os erros do código do ecrã chegam
// ao servidor só com o tipo, o sítio e a versão — nunca a mensagem nem nada da
// conversa —, e só os deste ecrã. Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  criarAvisos, eDaRede, eDefeito, eDesteEcra, eFalhaDoEcra, MAX_AVISOS, origemDoEcra, sitioDoErro, tipoDoErro,
} from '../falhas.js';

const PAGINA = 'https://privada.recato.ai/1.0.4/privada.js';

/** Um erro com o stack do V8 (Chrome, Android): a 1.ª linha é a mensagem. */
function doV8(Tipo, mensagem, endereco = PAGINA) {
  const erro = new Tipo(mensagem);
  erro.stack = `${erro.name}: ${mensagem}\n    at Object.parse (<anonymous>)\n    at enviar (${endereco}:120:7)\n`
    + `    at async correr (${endereco}:300:3)`;
  return erro;
}

/** Um erro do Python do ecrã, como o python.js o faz no ecrã compilado (a mensagem é o traceback). */
function doPython(traceback) {
  const erro = Object.assign(new Error(traceback), { codigo: 'python' });
  erro.stack = `Error: ${traceback}\n    at receber (${PAGINA}:900:21)`;
  return erro;
}

const TRACEBACK = 'Traceback (most recent call last):\n'
  + '  File "/lib/python3.12/site-packages/pyodide/_base.py", line 597, in eval_code_async\n'
  + '  File "/home/pyodide/ficheiros_chat.py", line 412, in criar_ficheiro\n'
  + 'ValueError: o texto «contrato da Ana» não cabe';

/** Uma janela a fingir: a origem da página e os ouvintes dos eventos. */
function janela(origem = 'https://privada.recato.ai') {
  const [protocol, host] = origem.split('//');
  const ouvintes = {};
  return {
    location: { protocol, host },
    addEventListener: (nome, funcao) => { ouvintes[nome] = funcao; },
    disparar: (nome, evento) => ouvintes[nome](evento),
  };
}

test('a rede em baixo e as respostas do servidor não são defeitos; os erros do JavaScript e do Python são', () => {
  for (const mensagem of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
    assert.ok(eDaRede(new TypeError(mensagem)), mensagem);
    assert.ok(!eDefeito(new TypeError(mensagem)), mensagem);
  }
  assert.ok(eDefeito(new TypeError('x is not a function')));
  assert.ok(eDefeito(new RangeError('Invalid array length')));
  assert.ok(!eDefeito(Object.assign(new TypeError('x'), { status: 500 })), 'Com status, é o servidor.');
  assert.ok(!eDefeito(new Error('HTTP 402')));
  assert.ok(!eDefeito(new DOMException('parado', 'AbortError')));
  assert.ok(!eDefeito('TypeError'));
  assert.ok(eFalhaDoEcra(doPython(TRACEBACK)));
  assert.ok(!eFalhaDoEcra(doPython('encerrado')), 'O ecrã é que encerrou o Python.');
});

test('o tipo é o nome do erro e, no Python, o da exceção — nunca a mensagem', () => {
  assert.equal(tipoDoErro(new TypeError('x is not a function')), 'TypeError');
  assert.equal(tipoDoErro(doPython(TRACEBACK)), 'ValueError');
  assert.equal(tipoDoErro(doPython('Traceback…\npyodide.ffi.JsException: a Ana disse')), 'JsException');
  assert.equal(tipoDoErro(doPython('MemoryError')), 'MemoryError');
  // O que não é o nome de uma exceção não sai: podia ser texto de alguém.
  assert.equal(tipoDoErro(doPython('Contrato: Ana Silva')), 'Python');
  assert.equal(tipoDoErro(doPython('x is not a function')), 'Python');
  assert.equal(tipoDoErro(Object.assign(new Error('x'), { name: 'Erro com espaços' })), undefined);
  assert.equal(tipoDoErro('não é um erro'), undefined);
});

test('o sítio é ficheiro:linha:coluna do primeiro passo, nos três motores, e no Python o ficheiro.py:linha', () => {
  assert.equal(sitioDoErro(doV8(TypeError, 'x is not a function')), 'privada.js:120:7');
  // A mensagem no V8 nunca conta, nem quando acaba como um endereço.
  assert.equal(sitioDoErro(doV8(TypeError, 'hora https://privada.recato.ai/a.js:1:2')), 'privada.js:120:7');
  const doSafari = Object.assign(new TypeError('x'),
    { stack: 'enviar@recato-privada://localhost/privada.js:88:12\ncorrer@recato-privada://localhost/privada.js:9:1' });
  assert.equal(sitioDoErro(doSafari), 'privada.js:88:12');
  const doFirefox = Object.assign(new TypeError('x'),
    { stack: 'enviar@moz-extension://8a1b/privada.js?v=3:7:5\n' });
  assert.equal(sitioDoErro(doFirefox), 'privada.js:7:5');
  assert.equal(sitioDoErro(doPython(TRACEBACK)), 'ficheiros_chat.py:412');
  assert.equal(sitioDoErro(Object.assign(new Error('x'), { stack: '' })), undefined);
  assert.equal(sitioDoErro(Object.assign(new Error('x'), { stack: '' }), [PAGINA, 3, 4]), 'privada.js:3:4');
});

test('só os erros dos guiões deste ecrã: os de uma extensão metida na página não', () => {
  const origem = origemDoEcra(janela());
  assert.equal(origem, 'https://privada.recato.ai/');
  assert.ok(eDesteEcra(doV8(TypeError, 'x'), origem));
  assert.ok(!eDesteEcra(doV8(TypeError, 'x', 'chrome-extension://outra/conteudo.js'), origem));
  assert.ok(!eDesteEcra(doV8(TypeError, 'x', 'https://privada.recato.ai.engano.pt/a.js'), origem));
  assert.equal(origemDoEcra(janela('recato-privada://localhost')), 'recato-privada://localhost/');
  assert.equal(origemDoEcra({}), null);
  assert.ok(!eDesteEcra(doV8(TypeError, 'x'), null), 'Sem página (os testes, o Node) nada é deste ecrã.');
});

test('os avisos esperam pelo servidor, levam só os códigos e cada falha vai uma vez', () => {
  const enviados = [];
  const avisos = criarAvisos({ versao: '1.0.4', janela: janela() });
  assert.ok(avisos.avisar('responder', 'acao', doV8(TypeError, 'o texto da Ana')));
  assert.equal(enviados.length, 0, 'Antes da sessão ficam à espera.');
  avisos.ligar((campos) => enviados.push(campos));
  assert.deepEqual(enviados, [{ onde: 'responder', motivo: 'acao', versao: '1.0.4', tipo: 'TypeError',
    sitio: 'privada.js:120:7' }]);
  assert.ok(!JSON.stringify(enviados).includes('Ana'), 'A mensagem do erro nunca sai.');
  assert.ok(!avisos.avisar('responder', 'acao', doV8(TypeError, 'outra mensagem')), 'A mesma falha, uma vez.');
  assert.ok(avisos.avisar('ficheiros', 'acao', doPython(TRACEBACK)));
  assert.deepEqual(enviados.at(-1), { onde: 'ficheiros', motivo: 'acao', versao: '1.0.4', tipo: 'ValueError',
    sitio: 'ficheiros_chat.py:412' });
  for (const [onde, motivo] of [['Responder', 'acao'], ['responder', 'inventado'], ['', 'js']]) {
    assert.ok(!avisos.avisar(onde, motivo, doV8(TypeError, 'x')), `${onde}/${motivo}`);
  }
  assert.ok(!avisos.avisar('responder', 'acao', 'não é um erro'));
});

test(`no máximo ${MAX_AVISOS} avisos por carregamento`, () => {
  const enviados = [];
  const avisos = criarAvisos({ janela: janela() });
  avisos.ligar((campos) => enviados.push(campos));
  for (let i = 0; i < MAX_AVISOS + 5; i += 1) avisos.avisar(`sitio_${i}`, 'acao', doV8(TypeError, 'x'));
  assert.equal(enviados.length, MAX_AVISOS);
});

test('seFalhar avisa só as falhas do código: não a rede, nem o servidor, nem o «Parar»', () => {
  const enviados = [];
  const avisos = criarAvisos({ janela: janela() });
  avisos.ligar((campos) => enviados.push(campos));
  assert.ok(!avisos.seFalhar('responder', doV8(TypeError, 'Failed to fetch')));
  assert.ok(!avisos.seFalhar('responder', Object.assign(doV8(Error, 'HTTP 500'), { status: 500 })));
  assert.ok(!avisos.seFalhar('responder', doV8(DOMException, 'parado')));
  assert.ok(avisos.seFalhar('responder', doV8(ReferenceError, 'y is not defined')));
  assert.deepEqual(enviados.map((c) => [c.onde, c.motivo, c.tipo]), [['responder', 'acao', 'ReferenceError']]);
});

test('os erros que ninguém apanhou: os deste ecrã sim, o «Script error.» e os de fora não', () => {
  const enviados = [];
  const pagina = janela();
  const avisos = criarAvisos({ janela: pagina });
  avisos.ligar((campos) => enviados.push(campos));
  avisos.escutar();
  pagina.disparar('error', { error: doV8(TypeError, 'x'), filename: PAGINA, lineno: 120, colno: 7 });
  pagina.disparar('error', { error: null, message: 'Script error.', filename: '', lineno: 0, colno: 0 });
  pagina.disparar('error', { error: doV8(TypeError, 'y', 'chrome-extension://outra/c.js') });
  // Um erro sem stack (alguns motores): conta o guião do evento.
  pagina.disparar('error', { error: Object.assign(new RangeError('z'), { stack: '' }), filename: PAGINA,
    lineno: 5, colno: 9 });
  pagina.disparar('unhandledrejection', { reason: doV8(TypeError, 'Failed to fetch') });
  pagina.disparar('unhandledrejection', { reason: Object.assign(new Error('sem_saldo'), { status: 402 }) });
  pagina.disparar('unhandledrejection', { reason: doV8(SyntaxError, 'JSON') });
  assert.deepEqual(enviados.map((c) => [c.onde, c.motivo, c.tipo, c.sitio]), [
    ['ecra', 'js', 'TypeError', 'privada.js:120:7'],
    ['ecra', 'js', 'RangeError', 'privada.js:5:9'],
    ['ecra', 'js', 'SyntaxError', 'privada.js:120:7'],
  ]);
});

test('um aviso que falha (sem rede, o servidor em baixo) nunca é ele próprio um erro', async () => {
  const avisos = criarAvisos({ janela: janela() });
  avisos.ligar(() => { throw new Error('sem rede'); });
  assert.ok(avisos.avisar('a', 'acao', doV8(TypeError, 'x')));
  avisos.ligar(async () => { throw new Error('HTTP 502'); });
  assert.ok(avisos.avisar('b', 'acao', doV8(TypeError, 'x')));
  await new Promise((resolver) => setTimeout(resolver, 0));
});
