// O Python da conversa privada (27/10/2026, decisão do Pedro: «mesmo código»):
// o Pyodide num worker, para o ecrã não parar enquanto faz um ficheiro. Corre
// os módulos do chat do Recato que fazem e leem os ficheiros (copiados do
// servidor por scripts/python_do_chat.py para python/forsnaps/addons/
// forsnaps_ai_chat/) e o que o servidor faz à volta deles: os ficheiros
// (python/privada_ficheiros.py) e os documentos anexados
// (python/privada_anexos.py). Só arranca quando é preciso: o primeiro ficheiro
// de uma conversa demora uns segundos a mais.
//
// Tudo o que carrega é deste ecrã (o Pyodide, as rodas de pacotes.json e as
// letras do PDF, na pasta pyodide/): nada vem de outro sítio, e nada daqui sai
// para a rede — o worker só responde ao ecrã.
//
// As mensagens: {id, funcao, argumentos} → {id, ok, resultado} ou {id, ok:
// false, erro}; *funcao* é uma das de privada_ficheiros.py ou, com o nome do
// módulo à frente, de privada_anexos.py («privada_anexos.ler»), ou «carregar»
// (um grupo de pacotes.json: os do PDF só se carregam no primeiro PDF); os
// bytes vão como Uint8Array.
import { loadPyodide } from 'pyodide';

import PACOTES from './python/pacotes.json' with { type: 'json' };
// Os .py de python/ ({caminho: texto}): juntos pelo construir_privada.mjs.
import PYTHON from 'python-do-ecra';

const LETRAS = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans-Oblique.ttf', 'DejaVuSans-BoldOblique.ttf'];
/** Os módulos que o ecrã chama (o resto só se importa). */
const MODULOS = ['privada_ficheiros', 'privada_anexos'];
const BASE = new URL('./pyodide/', self.location.href).href;

let preparado = null;
const carregados = new Map();

/** Os pacotes de um grupo de pacotes.json (null: os de sempre): os do
 *  Pyodide pelo nome (o pyodide-lock.json confere-os e sabe de que precisam),
 *  os outros pelo ficheiro. Tudo desta pasta. */
const doGrupo = (grupo) => PACOTES.filter((p) => (p.grupo || null) === grupo)
  .map((p) => (p.do_pyodide ? p.pacote : BASE + p.ficheiro));

function carregar(py, grupo) {
  if (!carregados.has(grupo)) {
    carregados.set(grupo, py.loadPackage(doGrupo(grupo), { messageCallback: () => {} }).catch((e) => {
      carregados.delete(grupo);
      throw e;
    }));
  }
  return carregados.get(grupo);
}

async function preparar() {
  const py = await loadPyodide({ indexURL: BASE });
  await carregar(py, null);
  for (const [caminho, texto] of Object.entries(PYTHON)) {
    const destino = `/privada/${caminho}`;
    py.FS.mkdirTree(destino.slice(0, destino.lastIndexOf('/')));
    py.FS.writeFile(destino, texto);
  }
  py.FS.mkdirTree('/privada/letras');
  await Promise.all(LETRAS.map(async (nome) => {
    const resposta = await fetch(`${BASE}letras/${nome}`);
    if (resposta.ok) py.FS.writeFile(`/privada/letras/${nome}`, new Uint8Array(await resposta.arrayBuffer()));
  }));
  py.runPython(`import sys\nsys.path.insert(0, '/privada')\nimport ${MODULOS.join(', ')}`);
  return py;
}

/** Um valor do Python para o ecrã: dicionários e listas como objetos e
 *  listas, bytes como Uint8Array. */
const paraOEcra = (valor) => (valor?.toJs ? valor.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false })
  : valor);

self.onmessage = async ({ data }) => {
  const { id, funcao = '', argumentos = [] } = data || {};
  try {
    // Um arranque falhado volta a tentar-se no pedido seguinte.
    preparado ||= preparar().catch((e) => {
      preparado = null;
      throw e;
    });
    const py = await preparado;
    if (funcao === 'carregar') {
      await carregar(py, argumentos[0]);
      self.postMessage({ id, ok: true, resultado: true });
      return;
    }
    const [modulo, nome] = funcao.includes('.') ? funcao.split('.', 2) : [MODULOS[0], funcao];
    const funcaoPy = MODULOS.includes(modulo) && !nome.startsWith('_') ? py.pyimport(modulo)[nome] : null;
    if (!funcaoPy) throw new Error(`função desconhecida: ${funcao}`);
    const argumentosPy = argumentos.map((a) => (a instanceof Uint8Array ? a : py.toPy(a)));
    const resultado = paraOEcra(funcaoPy(...argumentosPy));
    argumentosPy.forEach((a) => a?.destroy?.());
    const transferir = [];
    if (resultado instanceof Uint8Array) transferir.push(resultado.buffer);
    else if (resultado?.dados instanceof Uint8Array) transferir.push(resultado.dados.buffer);
    self.postMessage({ id, ok: true, resultado }, transferir);
  } catch (e) {
    self.postMessage({ id, ok: false, erro: String(e?.message || e).slice(0, 2000) });
  }
};
