// Testes dos textos da extensão (extensao/textos.js). Correm com: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { textos } from '../textos.js';

test('«Como confirmar» abre a página na língua do browser', () => {
  for (const lingua of ['pt-PT', 'pt-BR', 'pt']) {
    assert.equal(textos(lingua).ligacao_confirmar, 'https://privada.recato.ai/confirmar.html', lingua);
  }
  for (const lingua of ['en-US', 'en-GB', 'fr-FR', '']) {
    assert.equal(textos(lingua).ligacao_confirmar, 'https://privada.recato.ai/confirm.html', lingua);
  }
});
