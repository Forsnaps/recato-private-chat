// O Python do ecrã em Node, para os testes (27/10/2026): o mesmo Pyodide, as
// mesmas rodas (privada/python/pacotes.json, da cache de
// scripts/pacotes_python.mjs) e os mesmos .py que o worker leva
// (pythonDoEcra, do construir_privada.mjs), montados como o
// python_trabalhador.js os monta. Não é um teste: usam-no python.test.mjs e
// anexos.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadPyodide } from 'pyodide';

import { pythonDoEcra } from '../../scripts/construir_privada.mjs';
import { CACHE, PACOTES, rodasPython } from '../../scripts/pacotes_python.mjs';
import { criarPython } from '../python.js';

export const PYTHON = new URL('../python/', import.meta.url).pathname;
const MODULOS = ['privada_ficheiros', 'privada_anexos'];

/** {py, chamar(funcao, ...argumentos), python}: o Pyodide pronto, uma função
 *  dos módulos do ecrã («privada_anexos.ler» ou, sem módulo, de
 *  privada_ficheiros) como o worker a chama, e o cliente do python.js com um
 *  worker que corre aqui mesmo. */
export async function pythonDoEcraEmNode() {
  await rodasPython();
  // Como o worker: os do Pyodide pelo nome (da cache já conferida), os outros
  // pelo ficheiro; aqui também os do PDF, que no ecrã só vêm no primeiro PDF.
  const py = await loadPyodide({ packageCacheDir: CACHE });
  await py.loadPackage(PACOTES.map((p) => (p.do_pyodide ? p.pacote : pathToFileURL(path.join(CACHE, p.ficheiro)).href)),
    { messageCallback: () => {} });
  for (const [caminho, texto] of Object.entries(pythonDoEcra())) {
    const destino = `/privada/${caminho}`;
    py.FS.mkdirTree(destino.slice(0, destino.lastIndexOf('/')));
    py.FS.writeFile(destino, texto);
  }
  py.FS.mkdirTree('/privada/letras');
  for (const nome of fs.readdirSync(path.join(PYTHON, 'letras'))) {
    py.FS.writeFile(`/privada/letras/${nome}`, fs.readFileSync(path.join(PYTHON, 'letras', nome)));
  }
  py.runPython(`import sys\nsys.path.insert(0, '/privada')\nimport ${MODULOS.join(', ')}`);
  const chamar = (funcao, ...argumentos) => {
    if (funcao === 'carregar') return true;
    const [modulo, nome] = funcao.includes('.') ? funcao.split('.', 2) : [MODULOS[0], funcao];
    const argumentosPy = argumentos.map((a) => (a instanceof Uint8Array ? a : py.toPy(a)));
    const resultado = py.pyimport(modulo)[nome](...argumentosPy);
    return resultado?.toJs ? resultado.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false })
      : resultado;
  };
  const python = criarPython({ criarTrabalhador: () => {
    const trabalhador = {
      postMessage({ id, funcao, argumentos }) {
        setImmediate(() => {
          try {
            trabalhador.onmessage({ data: { id, ok: true, resultado: chamar(funcao, ...argumentos) } });
          } catch (e) {
            trabalhador.onmessage({ data: { id, ok: false, erro: String(e?.message || e) } });
          }
        });
      },
      terminate() {},
    };
    return trabalhador;
  } });
  return { py, chamar, python };
}
