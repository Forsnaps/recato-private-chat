// Testes das regras do histórico cifrado (privada/historico.js), com um
// servidor e o chip de segurança de cada telemóvel a fingir. Correm com: npm test
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { gerarCodigo } from '../cofre.js';
import { criarHistorico } from '../historico.js';

const erro = (codigo) => Object.assign(new Error(codigo), { codigo });

/** O servidor (fs_chat_autonomo, models/privada_historico.py) em memória,
 *  com as mesmas regras de versões; guarda tudo o que recebeu. *conta* é o
 *  endereço dele; os números dos cofres começam em 1 em cada servidor. */
function servidorFalso(conta = 'https://recato.ai') {
  let cofre = null;
  const conversas = new Map();
  let proximoId = 1;
  const recebido = [];
  return {
    conta,
    recebido,
    async lerCofre() {
      return { cofre: cofre && structuredClone(cofre) };
    },
    async gravarCofre(embrulhos, versaoAnterior) {
      recebido.push(embrulhos);
      if (cofre ? versaoAnterior !== cofre.versao : versaoAnterior) throw erro('versao');
      cofre = { id: 1, embrulhos: structuredClone(embrulhos), versao: cofre ? cofre.versao + 1 : 1 };
      return { id: cofre.id, versao: cofre.versao };
    },
    async listarConversas() {
      return [...conversas.values()].map(({ id, titulo_iv, titulo }) => (
        { id, titulo_iv, titulo, atualizada: '2026-10-22 10:00:00' }));
    },
    async lerConversa(id) {
      const c = conversas.get(id);
      if (!c) throw erro('sem_conversa');
      return { id, iv: c.iv, dados: c.dados, versao: c.versao };
    },
    async gravarConversa(cifrada, id, versaoAnterior) {
      recebido.push(cifrada);
      if (!id) {
        const nova = { ...cifrada, id: proximoId++, versao: 1 };
        conversas.set(nova.id, nova);
        return { id: nova.id, versao: 1 };
      }
      const c = conversas.get(id);
      if (!c || c.versao !== versaoAnterior) throw erro('versao');
      Object.assign(c, cifrada, { versao: c.versao + 1 });
      return { id, versao: c.versao };
    },
    async apagarConversa(id) {
      conversas.delete(id);
      return { apagada: true };
    },
  };
}

/** Um telemóvel: o chip (uma chave AES que nunca sai dele, como a
 *  ConversaPrivadaActivity) e o armazenamento do ecrã. Reinstalar a app
 *  troca a chave do chip e apaga o armazenamento. */
function telemovelFalso() {
  const tel = {
    chave: randomBytes(32),
    guardados: new Map(),
    telemovel: {
      async fechar(bytes) {
        const iv = randomBytes(12);
        const cifra = createCipheriv('aes-256-gcm', tel.chave, iv);
        const fechado = Buffer.concat([iv, cifra.update(bytes), cifra.final(), cifra.getAuthTag()]);
        return fechado.toString('base64');
      },
      async abrir(texto) {
        const tudo = Buffer.from(texto, 'base64');
        const decifra = createDecipheriv('aes-256-gcm', tel.chave, tudo.subarray(0, 12));
        decifra.setAuthTag(tudo.subarray(-16));
        return new Uint8Array(Buffer.concat([decifra.update(tudo.subarray(12, -16)), decifra.final()]));
      },
    },
    reinstalar() {
      tel.chave = randomBytes(32);
      tel.guardados.clear();
    },
  };
  tel.armazenamento = {
    ler: (chave) => tel.guardados.get(chave) ?? null,
    gravar: (chave, valor) => tel.guardados.set(chave, valor),
    apagar: (chave) => tel.guardados.delete(chave),
  };
  return tel;
}

const historicoDe = (servidor, tel) => criarHistorico({
  servidor, telemovel: tel.telemovel, guardados: tel.armazenamento, conta: servidor.conta });

const PERGUNTA = 'Como faço um bacalhau à Brás para seis?';
const conversaNova = () => ({ id: null, versao: null, mensagens: [
  { papel: 'eu', texto: PERGUNTA }, { papel: 'recato', texto: 'Precisas de 600 g de bacalhau…' }] });

async function ativado({ servidor = servidorFalso(), tel = telemovelFalso() } = {}) {
  const historico = historicoDe(servidor, tel);
  assert.equal(await historico.ler(), 'sem_cofre');
  const codigo = historico.comecarAtivacao();
  assert.deepEqual(servidor.recebido, [], 'Nada é gravado antes de a pessoa guardar o código.');
  await historico.concluirAtivacao();
  return { historico, servidor, tel, codigo };
}

test('ativar: neste telemóvel volta a abrir sozinho; noutro, só com o código', async () => {
  const { historico, servidor, tel, codigo } = await ativado();
  assert.equal(historico.estado, 'aberto');
  const guardada = await historico.guardar(conversaNova());
  assert.deepEqual([guardada.id, guardada.versao, guardada.titulo], [1, 1, PERGUNTA]);

  const deNovo = historicoDe(servidor, tel);
  assert.equal(await deNovo.ler(), 'aberto', 'Sem pedir nada no mesmo telemóvel.');
  assert.deepEqual(await deNovo.lista(), [{ id: 1, titulo: PERGUNTA, atualizada: '2026-10-22 10:00:00' }]);
  assert.deepEqual((await deNovo.abrir(1)).mensagens, conversaNova().mensagens);

  const novo = telemovelFalso();
  const noNovo = historicoDe(servidor, novo);
  assert.equal(await noNovo.ler(), 'fechado');
  assert.equal(await noNovo.abrirComCodigo(gerarCodigo()), false, 'Outro código não abre.');
  assert.equal(noNovo.estado, 'fechado');
  assert.equal(await noNovo.abrirComCodigo(` ${codigo.toLowerCase()} `), true);
  assert.equal((await noNovo.lista())[0].titulo, PERGUNTA);
  assert.equal(await historicoDe(servidor, novo).ler(), 'aberto', 'Depois do código, o telemóvel novo abre sozinho.');

  // Ao servidor só chegou a cópia fechada com o código e o que vai cifrado:
  // nem o texto, nem o título, nem o código, nem a cópia de cada telemóvel.
  assert.deepEqual((await servidor.lerCofre()).cofre.embrulhos.map((e) => e.tipo), ['recuperacao']);
  const recebido = JSON.stringify(servidor.recebido);
  const copias = [...tel.guardados.values(), ...novo.guardados.values()];
  for (const segredo of [PERGUNTA, 'bacalhau', 'Precisas', codigo, codigo.replace(/-/g, ''), ...copias]) {
    assert.ok(!recebido.includes(segredo), `«${segredo.slice(0, 20)}» chegou ao servidor.`);
  }
});

test('app reinstalada: a cópia antiga já não abre, apaga-se e o código volta a abrir', async () => {
  const { servidor, tel, codigo } = await ativado();
  // A cópia guardada sobreviveu, mas a chave do chip é outra.
  const antiga = new Map(tel.guardados);
  tel.reinstalar();
  antiga.forEach((valor, chave) => tel.guardados.set(chave, valor));
  const historico = historicoDe(servidor, tel);
  assert.equal(await historico.ler(), 'fechado');
  assert.equal(tel.guardados.size, 0, 'A cópia que já não abre foi apagada.');
  assert.equal(await historico.abrirComCodigo(codigo), true);
  assert.equal(await historicoDe(servidor, tel).ler(), 'aberto');
});

test('sem chip (ou sem onde guardar): funciona na mesma e pede o código da próxima vez', async () => {
  const servidor = servidorFalso();
  const tel = telemovelFalso();
  tel.telemovel.fechar = async () => { throw new Error('sem_chip'); };
  const { historico, codigo } = await ativado({ servidor, tel });
  assert.equal(historico.estado, 'aberto');
  await historico.guardar(conversaNova());
  const depois = historicoDe(servidor, tel);
  assert.equal(await depois.ler(), 'fechado');
  assert.equal(await depois.abrirComCodigo(codigo), true);
});

test('duas contas no mesmo telemóvel: cada uma abre só o seu histórico', async () => {
  const tel = telemovelFalso();
  // Servidores diferentes, e os dois cofres com o número 1.
  const ana = await ativado({ tel, servidor: servidorFalso('https://ana.recato.ai') });
  const rui = await ativado({ tel, servidor: servidorFalso('https://rui.recato.ai') });
  await ana.historico.guardar(conversaNova());
  assert.equal(tel.guardados.size, 2);
  assert.equal(await historicoDe(ana.servidor, tel).ler(), 'aberto');
  const doRui = historicoDe(rui.servidor, tel);
  assert.equal(await doRui.ler(), 'aberto');
  assert.deepEqual(await doRui.lista(), [], 'O Rui não vê as conversas da Ana.');
});

test('guardar por cima, conversa mexida noutro telemóvel fica como nova, apagar', async () => {
  const { historico, servidor, tel } = await ativado();
  let conversa = await historico.guardar({ id: null, versao: null, mensagens: [{ papel: 'eu', texto: 'Olá' }] });
  conversa = await historico.guardar({ ...conversa,
    mensagens: [...conversa.mensagens, { papel: 'recato', texto: 'Olá! Em que posso ajudar?' }] });
  assert.deepEqual([conversa.id, conversa.versao], [1, 2]);

  const outro = historicoDe(servidor, tel);
  await outro.ler();
  const la = await outro.abrir(1);
  await outro.guardar({ ...la, mensagens: [...la.mensagens, { papel: 'eu', texto: 'Do outro lado' }] });

  const aqui = await historico.guardar({ ...conversa,
    mensagens: [...conversa.mensagens, { papel: 'eu', texto: 'Daqui' }] });
  assert.deepEqual([aqui.id, aqui.versao], [2, 1], 'Não se apagou o que o outro telemóvel gravou.');
  assert.deepEqual((await historico.lista()).map((c) => c.id), [1, 2]);
  assert.equal((await historico.abrir(1)).mensagens.at(-1).texto, 'Do outro lado');

  await historico.apagar(1);
  assert.deepEqual((await historico.lista()).map((c) => c.id), [2]);
});

test('código novo: o antigo deixa de abrir, o novo abre, e os telemóveis que já abriam continuam', async () => {
  const { historico, servidor, tel, codigo: antigo } = await ativado();
  await historico.guardar(conversaNova());
  const outro = telemovelFalso();
  const noOutro = historicoDe(servidor, outro);
  await noOutro.ler();
  assert.equal(await noOutro.abrirComCodigo(antigo), true);

  const novo = historico.comecarCodigoNovo();
  assert.notEqual(novo, antigo);
  await historico.concluirCodigoNovo();
  assert.deepEqual((await servidor.lerCofre()).cofre.embrulhos.map((e) => e.tipo), ['recuperacao']);

  assert.equal(await historicoDe(servidor, tel).ler(), 'aberto', 'Este telemóvel continua a abrir sozinho.');
  assert.equal(await historicoDe(servidor, outro).ler(), 'aberto', 'O outro também.');
  const terceiro = historicoDe(servidor, telemovelFalso());
  await terceiro.ler();
  assert.equal(await terceiro.abrirComCodigo(antigo), false, 'O código antigo já não abre.');
  assert.equal(await terceiro.abrirComCodigo(novo), true);
  assert.equal((await terceiro.lista())[0].titulo, PERGUNTA);
  const recebido = JSON.stringify(servidor.recebido);
  assert.ok(!recebido.includes(novo) && !recebido.includes(novo.replace(/-/g, '')), 'O código novo não chegou ao servidor.');
});

test('código novo com o cofre mexido noutro telemóvel: erro «versao» e nada muda', async () => {
  const { historico, servidor, tel, codigo } = await ativado();
  const outro = historicoDe(servidor, tel);
  await outro.ler();
  outro.comecarCodigoNovo();
  await outro.concluirCodigoNovo();
  const antes = JSON.stringify((await servidor.lerCofre()).cofre);
  historico.comecarCodigoNovo();
  await assert.rejects(historico.concluirCodigoNovo(), (e) => e.codigo === 'versao');
  assert.equal(JSON.stringify((await servidor.lerCofre()).cofre), antes);
  const terceiro = historicoDe(servidor, telemovelFalso());
  await terceiro.ler();
  assert.equal(await terceiro.abrirComCodigo(codigo), false, 'Vale o código que o outro telemóvel gravou.');
});
