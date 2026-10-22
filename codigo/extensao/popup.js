// O popup do ícone da extensão: o que ela faz e, na página
// privada.recato.ai, o resultado da conferência desse separador.
import { textos } from './textos.js';

const api = globalThis.browser || globalThis.chrome;
const t = textos(navigator.language);
const $ = (id) => document.getElementById(id);

document.documentElement.lang = /^pt\b/i.test(navigator.language || '') ? 'pt-PT' : 'en';
$('titulo').textContent = t.popup_titulo;
$('explica').textContent = t.popup_explica;
$('confirmar').textContent = t.como_confirmar;

const [separador] = await api.tabs.query({ active: true, currentWindow: true });
if (!separador?.url?.startsWith('https://privada.recato.ai/')) {
  $('estado').textContent = t.popup_fora;
} else {
  const chave = `conferencia:${separador.id}`;
  const resultado = (await api.storage.session.get(chave))[chave];
  $('estado').textContent = resultado?.estado === 'conferida' ? t.conferida(resultado.versao) : t[resultado?.estado] || t.erro;
  $('estado').classList.add(resultado?.estado === 'conferida' ? 'conferida' : 'por-conferir');
}
