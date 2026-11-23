// Os textos do ecrã da conversa privada, em português e em inglês ([pt, en]),
// à parte do privada.js para se poderem testar (privada/testes/textos.test.mjs).
// O que muda fora da app (extensão e página web), onde quem cifra é o browser
// e não o telemóvel, está em TEXTOS_DO_BROWSER.
export const TEXTOS = {
  titulo: ['Conversa privada', 'Private chat'],
  // Só no browser: volta às conversas normais (pedido do Pedro, 27/10/2026).
  voltar_ao_recato: ['Voltar ao Recato', 'Back to Recato'],
  a_verificar: ['A verificar a caixa-forte…', 'Checking the secure enclave…'],
  verificada: ['Caixa-forte verificada: só ela lê o que escreves.',
               'Secure enclave verified: only it can read what you write.'],
  falhou: ['Não foi possível verificar a caixa-forte. Nada foi enviado.',
           'Could not verify the secure enclave. Nothing was sent.'],
  // «A conversa não fica guardada» (19/11/2026, pedido do Pedro: «A conversa privada não deve conseguir nunca ser
  // gravada»).
  aviso: ['O que escreves aqui, e as imagens e os documentos que juntares, é cifrado no teu telemóvel e só é lido dentro da caixa-forte. Nem o Recato o consegue ler. A conversa não fica guardada: quando fechares este ecrã, desaparece. Se for preciso pesquisar na web, o Recato avisa-te antes: a pesquisa torna a conversa menos privada.',
          'What you write here, and the images and documents you add, is encrypted on your phone and only read inside the secure enclave. Not even Recato can read it. The chat is not saved: when you close this screen, it is gone. If a web search is needed, Recato warns you first: searching makes the chat less private.'],
  placeholder: ['Escreve aqui…', 'Type here…'],
  enviar: ['Enviar', 'Send'],
  // O «Parar» (28/10/2026): a única coisa que para uma resposta; o texto do chat do Recato.
  parar: ['Parar', 'Stop'],
  interrompida: ['Resposta interrompida.', 'Response stopped.'],
  sem_rede: ['Sem ligação. A tentar outra vez…', 'No connection. Trying again…'],
  // Só no browser (página e extensão), enquanto responde (pedidos do Pedro, 28/10/2026): fechar o separador não
  // interrompe a resposta, que fica à espera de quem volta (espera.js).
  fechar_o_separador: ['Podes fechar este separador: a resposta continua e fica à tua espera neste browser.',
                       'You can close this tab: the response carries on and will be waiting for you in this browser.'],
  sem_saldo: ['Não tens saldo para continuar.', 'You have no balance left.'],
  // O saldo com várias respostas ao mesmo tempo (14/11/2026, as frases do chat do Recato): à espera de que as
  // outras acabem, e a nota de uma resposta que o saldo cortou a meio (o que já escreveu fica).
  saldo_em_uso_espera: ['O saldo que resta está a ser usado por outras respostas em curso. Esta continua quando uma terminar…',
                        'The remaining balance is being used by other replies in progress. This one will carry on when one finishes…'],
  sem_saldo_a_meio: ['Não consegui terminar: não tens saldo para continuar.', 'I couldn\'t finish: you have no balance left.'],
  saldo_em_uso_a_meio: ['Não consegui terminar: o saldo que resta está a ser usado por outras respostas em curso. Quando uma terminar, pede «continua».',
                        'I couldn\'t finish: the remaining balance is being used by other replies in progress. When one finishes, ask me to «continue».'],
  erro: ['A resposta falhou. Tenta outra vez.', 'The answer failed. Please try again.'],
  // Quanto pensa a conversa, «Normal» ou «Máximo» (os textos do chat do Recato, 26/10/2026). Na dica, o %s é a
  // tecla que envia a pensar ao máximo.
  nivel_titulo: ['Pensar, nesta conversa', 'Thinking, in this chat'],
  nivel_dica: ['Pensar, nesta conversa · %s envia a pensar ao máximo',
               'Thinking, in this chat · %s sends with maximum thinking'],
  normal: ['Normal', 'Normal'],
  normal_nota: ['Pensa o necessário · responde mais depressa', 'Thinks as much as needed · answers faster'],
  maximo: ['Máximo', 'Max'],
  maximo_nota: ['Melhor nos pedidos difíceis · até 1–2 min · gasta mais saldo',
                'Best for hard requests · up to 1–2 min · uses more balance'],
  a_pensar_maximo: ['A pensar ao máximo…', 'Thinking at maximum depth…'],
  // A pesquisa na web: avisa que torna a conversa menos privada, diz porquê e
  // pergunta se a pessoa quer mesmo assim (pedido do Pedro, 26/10/2026).
  pesquisa_titulo: ['Pesquisar na web torna esta conversa menos privada',
                    'Searching the web makes this chat less private'],
  pesquisa_explica: ['Porquê: para pesquisar, a frase acima tem de sair da caixa-forte cifrada. Passa pelo servidor do Recato e pelo motor de pesquisa, que a conseguem ler. O resto da conversa continua cifrado, mas a frase pode revelar o assunto de que estás a falar.',
                     'Why: to search, the phrase above has to leave the encrypted secure enclave. It goes through Recato\'s server and the search engine, which can read it. The rest of the chat stays encrypted, but the phrase may reveal what you are talking about.'],
  pesquisa_pergunta: ['Queres pesquisar na web mesmo assim?', 'Do you still want to search the web?'],
  pagina_titulo: ['Abrir esta página torna esta conversa menos privada',
                  'Opening this page makes this chat less private'],
  pagina_explica: ['Porquê: para abrir a página, o endereço acima tem de sair da caixa-forte cifrada. Passa pelo servidor do Recato e pelo motor de pesquisa, que o conseguem ler, e o site recebe o pedido da página. O resto da conversa continua cifrado, mas o endereço pode revelar o assunto de que estás a falar.',
                   'Why: to open the page, the address above has to leave the encrypted secure enclave. It goes through Recato\'s server and the search engine, which can read it, and the site receives the request for the page. The rest of the chat stays encrypted, but the address may reveal what you are talking about.'],
  pagina_pergunta: ['Queres abrir a página mesmo assim?', 'Do you still want to open the page?'],
  no_site: ['em', 'on'],
  // Autorizar as pesquisas seguintes da conversa (26/10/2026, opção A do Pedro).
  sempre_nesta_conversa: ['Não voltar a perguntar nesta conversa', 'Don\'t ask again in this chat'],
  sempre_nota: ['Numa conversa nova volta a perguntar.', 'A new chat asks again.'],
  web_sem_perguntar: ['Web sem perguntar', 'Web without asking'],
  voltar_a_perguntar: ['Voltar a perguntar antes de pesquisar', 'Ask again before searching'],
  pesquisado_sem_perguntar: ['Pesquisado na web (sem perguntar):', 'Searched the web (without asking):'],
  pagina_aberta_sem_perguntar: ['Página aberta (sem perguntar):', 'Page opened (without asking):'],
  pesquisar: ['Sim, pesquisar', 'Yes, search'],
  nao_pesquisar: ['Não pesquisar', 'Don\'t search'],
  abrir_pagina: ['Sim, abrir', 'Yes, open'],
  nao_abrir: ['Não abrir', 'Don\'t open'],
  pesquisado: ['Pesquisado na web:', 'Searched the web:'],
  nao_pesquisado: ['Não pesquisado:', 'Not searched:'],
  pagina_aberta: ['Página aberta:', 'Page opened:'],
  pagina_nao_aberta: ['Página não aberta:', 'Page not opened:'],
  a_pesquisar: ['A pesquisar na web…', 'Searching the web…'],
  // As imagens (lê-as o GLM-5.3-Flash, na mesma caixa-forte) e os documentos
  // (lê-os o próprio ecrã, como o chat do Recato; 27/10/2026).
  anexar: ['Juntar imagens ou documentos', 'Add images or documents'],
  tirar_imagem: ['Tirar esta imagem', 'Remove this image'],
  tirar_ficheiro: ['Tirar este documento', 'Remove this document'],
  demasiados_ficheiros: ['No máximo 5 documentos por mensagem.', 'At most 5 documents per message.'],
  // Os ficheiros que o Recato faz (27/10/2026), para descarregar.
  descarregar: ['Descarregar %s', 'Download %s'],
  a_preparar_ficheiro: ['A preparar…', 'Preparing…'],
  erro_descarregar: ['Não foi possível descarregar o ficheiro. Tenta outra vez.', 'Could not download the file. Please try again.'],
  nao_e_imagem: ['Só se podem juntar imagens (fotografias, capturas de ecrã).',
                 'You can only add images (photos, screenshots).'],
  imagem_invalida: ['Não foi possível abrir esta imagem.', 'Could not open this image.'],
  demasiadas_imagens: ['No máximo 8 imagens por mensagem.', 'At most 8 images per message.'],
  a_ver_imagens: ['A ver as imagens…', 'Looking at the images…'],
  erro_imagens: ['Não foi possível ler as imagens. Tenta outra vez.', 'Could not read the images. Please try again.'],
  // Uma vez, a quem tinha o histórico ligado neste aparelho (19/11/2026): as conversas guardadas foram apagadas.
  historico_apagado: ['As conversas privadas deixaram de ficar guardadas, e as que estavam guardadas foram apagadas.',
                      'Private chats are no longer saved, and the ones that were saved have been deleted.'],
  sem_sessao: ['Abre a conversa privada a partir do Recato: botão «Privada», na caixa de escrita.',
               'Open the private chat from Recato: the «Private» button in the message box.'],
  faixa_web: ['Esta página vem do servidor do Recato: sem a extensão (ou a app) não consegues confirmar que é a publicada.',
              'This page comes from Recato\'s server: without the extension (or the app) you cannot confirm it is the published one.'],
  como_confirmar: ['Como confirmar', 'How to check'],
};
export const TEXTOS_DO_BROWSER = {
  aviso: ['O que escreves aqui, e as imagens e os documentos que juntares, é cifrado neste browser e só é lido dentro da caixa-forte. Nem o Recato o consegue ler. A conversa não fica guardada: quando fechares este separador, desaparece. Se for preciso pesquisar na web, o Recato avisa-te antes: a pesquisa torna a conversa menos privada.',
          'What you write here, and the images and documents you add, is encrypted in this browser and only read inside the secure enclave. Not even Recato can read it. The chat is not saved: when you close this tab, it is gone. If a web search is needed, Recato warns you first: searching makes the chat less private.'],
};
