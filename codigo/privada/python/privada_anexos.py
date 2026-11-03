# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
"""Os documentos anexados à conversa privada (27/10/2026, decisão do Pedro:
«documentos anexados: sim, junta»): PDF, Word, Excel, PowerPoint e texto,
lidos e editados no ecrã, com o Pyodide, pelo MESMO código do chat do Recato
(controllers/ai_chat.py, gerado por scripts/python_do_chat.py com as funções
tal como estão no servidor):

- ler: o texto de cada anexo, como o chat o junta à mensagem
  (_process_attachments: «ANEXOS DO UTILIZADOR (ids: …):» e um bloco por
  anexo), com o texto dos PDF pelo pdfminer;
- ferramenta: read_document, edit_document e procurar_nos_anexos
  (_execute_file_tool e _executar_procurar_nos_anexos);
- fichas: a leitura dos anexos grandes, UMA vez, para uma ficha por anexo
  (_fichas_dos_anexos), com as chamadas ao modelo feitas pelo ecrã: o método
  do chat corre até à chamada, sai como «pausa» (o pedido ao modelo), e o
  ecrã volta a corrê-lo desde o princípio com a resposta, até ele acabar;
- paginas: as páginas digitalizadas dos PDF (30/10/2026), que ler marca e o
  chat lê pelo modelo das imagens (_ler_paginas_digitalizadas), desenhadas
  pelo ecrã com o pdf.js, com as chamadas ao modelo como nas fichas — e as
  imagens dentro de um Word, PowerPoint ou Excel (02/11/2026), que vêm do
  próprio documento.

Aqui não fica nada guardado: os ficheiros chegam do ecrã em cada pedido e os
que o modelo faz voltam para ele (so_no_ecra.py é o que, no chat, é da base
de dados).
"""
import base64
import json
import types

from forsnaps.exceptions import ValidationError
from forsnaps.service.model import PedidoAoModelo
from forsnaps.addons.forsnaps_ai_chat import documentos
from forsnaps.addons.forsnaps_ai_chat.controllers import ai_chat as ctrl, so_no_ecra

#: As ferramentas dos anexos que o chat executa.
FERRAMENTAS = frozenset({'read_document', 'edit_document', 'procurar_nos_anexos'})


def _bytes(dados):
    # Um Uint8Array do ecrã chega como JsProxy.
    return dados.to_bytes() if hasattr(dados, 'to_bytes') else bytes(dados or b'')


def _json(valor):
    return json.dumps(valor, ensure_ascii=False)


class _Registos(list):
    """Os anexos criados (um recordset de ir.attachment, no chat; com um só,
    os campos dele)."""

    @property
    def ids(self):
        return [r.id for r in self]

    def __getattr__(self, campo):
        if len(self) != 1:
            raise AttributeError(campo)
        return getattr(self[0], campo)

    def __or__(self, outros):
        return _Registos(list(self) + list(outros))

    def sudo(self):
        return self


class _AnexosDoEcra:
    """O ir.attachment do chat: os números são os que o ecrã deu."""

    def __init__(self, ids):
        self._ids = list(ids)
        self.criados = []

    def sudo(self):
        return self

    def browse(self):
        return _Registos()

    def create(self, valores):
        anexo = types.SimpleNamespace(id=self._ids.pop(0) if self._ids else None, name=valores.get('name'),
                                      mimetype=valores.get('mimetype'))
        self.criados.append(anexo)
        return _Registos([anexo])


class _MensagemDoEcra:
    """A mensagem do utilizador (ai.chat.message) a que os anexos se prendem."""

    def __init__(self, ids):
        self.id = 0
        self.anexos = _AnexosDoEcra(ids)
        self.env = {'ir.attachment': self.anexos}
        self.escrito = {}

    def write(self, valores):
        self.escrito.update(valores)
        return True


class _Leitor(ctrl.AiChatController):
    """O controlador do chat a ler anexos que o ecrã já tem em bytes (no chat
    chegam no pedido em base64): o resto é o do chat, tal como está."""

    @staticmethod
    def _decode_attachment_b64(data_b64):
        if isinstance(data_b64, (bytes, bytearray, memoryview)):
            return bytes(data_b64)
        return ctrl.AiChatController._decode_attachment_b64(data_b64)

    @classmethod
    def _video_em_imagens(cls, data_bytes, mime, name, human_size, acumulador=None):
        """Com as páginas digitalizadas a ler-se (so_no_ecra._VISION_PROVIDERS),
        o chat mandava também os vídeos, em imagens e som: o ecrã não os manda
        (não tem com que os cortar), e fica como no chat sem visão."""
        return [], (f'- [vídeo] {name} ({human_size}) — não foi enviado à IA porque o modelo actual não '
                    'suporta análise de vídeo.'), None


def ler(pedido_json, *dados):
    """Os anexos de uma mensagem, lidos como o chat os lê.

    O pedido (JSON): ``anexos`` ([{nome, mime}]) e ``ids`` (o número que o
    ecrã dá a cada um); *dados*: os bytes de cada anexo, pela mesma ordem.
    Devolve (JSON) ``{'contexto': o texto que vai com a mensagem, 'anexos':
    [{id, nome, mime, tipo, editavel}], 'digitalizadas': [[anexo, página]],
    'imagens': [[anexo, n.º]]}`` (as páginas só com imagem e as imagens dos
    documentos, marcadas no contexto) ou ``{'erro'}`` (o texto do chat).
    """
    pedido = json.loads(pedido_json)
    lista = pedido.get('anexos') or []
    mensagem = _MensagemDoEcra(pedido.get('ids') or [])
    entradas = [{'name': a.get('nome'), 'mime_type': a.get('mime'), 'data_b64': _bytes(d)}
                for a, d in zip(lista, dados)]
    try:
        contexto, _imagens = _Leitor._process_attachments(entradas, mensagem, 'privada')
    except ValidationError as exc:
        return _json({'erro': str(exc)})
    except Exception:  # noqa: BLE001 — como no chat
        return _json({'erro': 'Erro ao processar os anexos enviados.'})
    # As páginas só com imagem ficaram marcadas: o ecrã desenha-as e lê-as a seguir (paginas). As imagens de um
    # Word, PowerPoint ou Excel também, e leem-se do próprio documento.
    digitalizadas = [[int(anexo), int(pagina)] for anexo, pagina in ctrl._MARCA_DIGITALIZADA_RE.findall(contexto)]
    imagens = [[int(anexo), int(indice)] for anexo, indice in ctrl._MARCA_IMAGEM_DOCUMENTO_RE.findall(contexto)]
    anexos = []
    for anexo, entrada in zip(mensagem.anexos.criados, entradas):
        tipo = documentos.tipo_de_documento(anexo.name, anexo.mimetype, entrada['data_b64'])
        anexos.append({'id': anexo.id, 'nome': anexo.name, 'mime': anexo.mimetype, 'tipo': tipo,
                       'editavel': bool(tipo and documentos.editavel(tipo))})
    return _json({'contexto': contexto, 'anexos': anexos, 'digitalizadas': digitalizadas, 'imagens': imagens})


def ferramenta(pedido_json, *dados):
    """read_document, edit_document ou procurar_nos_anexos.

    O pedido (JSON): ``nome``, ``argumentos``, ``anexos`` ([{id, nome,
    mime}] dos ficheiros da conversa, com os bytes em *dados*, pela ordem),
    ``contexto`` (o texto completo dos anexos com ficha, para a procura),
    ``proximo_id`` (o número da cópia editada) e ``autor`` (quem assina as
    alterações controladas). Devolve ``{'saida': o JSON para o modelo,
    'ficheiro': a cópia editada, se a houver}``.
    """
    pedido = json.loads(pedido_json)
    nome = pedido.get('nome')
    argumentos = pedido.get('argumentos') or {}
    so_no_ecra.ANEXOS.clear()
    so_no_ecra.GERADOS.clear()
    so_no_ecra.PROXIMO_ID[0] = pedido.get('proximo_id')
    for anexo, conteudo in zip(pedido.get('anexos') or [], dados):
        so_no_ecra.ANEXOS[int(anexo['id'])] = types.SimpleNamespace(
            id=int(anexo['id']), name=anexo.get('nome'), mimetype=anexo.get('mime'),
            datas=base64.b64encode(_bytes(conteudo)))
    ctrl._chamada_local.anexos_contexto = pedido.get('contexto') or ''
    env = types.SimpleNamespace(user=types.SimpleNamespace(name=pedido.get('autor') or '', login=''))
    try:
        if nome not in FERRAMENTAS:
            saida = _json({'error': f'ferramenta desconhecida: {nome}'})
        elif nome == 'procurar_nos_anexos':
            saida = ctrl._executar_procurar_nos_anexos(env, argumentos)
        else:
            saida = ctrl._execute_file_tool(env, nome, argumentos)
        resultado = {'saida': saida}
        if so_no_ecra.GERADOS:
            feito = so_no_ecra.GERADOS[-1]
            resultado['ficheiro'] = {'id': feito.id, 'nome': feito.name, 'mime': feito.mimetype,
                                     'formato': feito.name.rsplit('.', 1)[-1].lower(), 'dados': feito.dados}
        return resultado
    finally:
        so_no_ecra.ANEXOS.clear()
        so_no_ecra.GERADOS.clear()
        ctrl._chamada_local.anexos_contexto = ''


class _ChatDoEcra(ctrl.AiChatController):
    """O controlador do chat com a chamada ao modelo feita pelo ecrã (ver o
    princípio): a resposta que o ecrã já trouxe, ou a pausa com o pedido."""

    def __init__(self, respostas):
        self._respostas = list(respostas or [])
        self._vez = 0

    def _call_provider(self, provider_key, api_key, model, messages, use_tools=True, **kwargs):
        vez = self._vez
        self._vez += 1
        if vez < len(self._respostas):
            resposta = self._respostas[vez]
            if resposta.get('erro'):
                raise RuntimeError(resposta['erro'])
            return {'text': resposta.get('texto') or ''}
        raise PedidoAoModelo({'messages': messages, 'tools': None, 'modelo': model,
                              'etapa': so_no_ecra.ULTIMA_ETAPA[0]})


def fichas(pedido_json):
    """As fichas dos anexos grandes (_fichas_dos_anexos): o pedido (JSON) tem
    o ``contexto`` (o texto dos anexos), a ``pergunta`` e as ``respostas``
    das chamadas já feitas. Devolve (JSON) ``{'pausa'}``, ``{'erro'}`` ou
    ``{'fim': {'devolveu': as fichas ('' se uma parte falhou)}}``."""
    pedido = json.loads(pedido_json)
    so_no_ecra.ULTIMA_ETAPA[0] = None
    try:
        feitas = _ChatDoEcra(pedido.get('respostas'))._fichas_dos_anexos(
            'privada', None, pedido.get('contexto') or '', pedido.get('pergunta') or '')
    except PedidoAoModelo as pausa:
        return _json({'pausa': pausa.args[0]})
    except Exception as exc:  # noqa: BLE001
        return _json({'erro': f'{type(exc).__name__}: {exc}'[:2000]})
    finally:
        so_no_ecra.ULTIMA_ETAPA[0] = None
    return _json({'fim': {'devolveu': feitas}})


class _PaginasDoEcra(ctrl.AiChatController):
    """O chat a ler as páginas digitalizadas (_ler_paginas_digitalizadas e o
    que ele chama, tal como estão), com as páginas já desenhadas pelo ecrã
    (pdf.js) e as chamadas ao modelo das imagens feitas por ele: a resposta que
    ele já trouxe para aquele lote, ou a pausa com o pedido. A *planear*, cada
    lote «lê-se» logo com um texto a fingir (com os cabeçalhos das páginas, para
    não se partir em metades): saem os pedidos de todos os lotes, e o ecrã
    fá-los em simultâneo, como o chat (_lotes_em_simultaneo, que no Pyodide não
    corre: não há threads)."""

    def __init__(self, jpegs, respostas, planear=False):
        self._jpegs = jpegs
        self._respostas = respostas or {}
        self._planear = planear
        self._anexo = None
        self.pedidos = []

    def _transcrever_pdf(self, provider_key, api_key, att, paginas, progresso):
        self._anexo = att.id
        return super()._transcrever_pdf(provider_key, api_key, att, paginas, progresso)

    def _transcrever_imagens_do_documento(self, provider_key, api_key, att, indices, progresso):
        self._anexo = att.id
        return super()._transcrever_imagens_do_documento(provider_key, api_key, att, indices, progresso)

    def _pagina_em_jpeg(self, pdf, indice):
        # A que o ecrã desenhou; a que ele não conseguiu falha aqui, e o chat dá-a por ler.
        return self._jpegs[(self._anexo, indice + 1)]

    def _call_provider(self, provider_key, api_key, model, messages, image_blocks=None, use_tools=True, **kwargs):
        numeros = [int(bloco['name'].rsplit(' ', 1)[-1]) for bloco in image_blocks or []]
        chave = f"{self._anexo}:{','.join(map(str, numeros))}"
        resposta = self._respostas.get(chave)
        if resposta is None:
            # As imagens vão na última mensagem da pessoa, em blocos text/image_url, como o chat as manda
            # (_multimodal_user_content, no formato que a caixa-forte lê).
            conversa = [dict(m) for m in messages]
            for mensagem in reversed(conversa):
                if mensagem.get('role') == 'user':
                    texto = mensagem.get('content') or ''
                    mensagem['content'] = ([{'type': 'text', 'text': texto}] if texto else []) + [
                        {'type': 'image_url', 'image_url': {'url': f"data:{bloco['mime']};base64,{bloco['data_b64']}"}}
                        for bloco in image_blocks or []]
                    break
            orcamento = getattr(ctrl._chamada_local, 'orcamento', None) or {}
            pedido = {'chave': chave, 'paginas': numeros, 'messages': conversa, 'modelo': model,
                      'esforco': orcamento.get('esforco'), 'max_tokens': orcamento.get('max_tokens'),
                      'etapa': so_no_ecra.ULTIMA_ETAPA[0]}
            if not self._planear:
                raise PedidoAoModelo(pedido)
            self.pedidos.append(pedido)
            resposta = {'texto': '\n'.join(f'=== Página {numero} ===\n.' for numero in numeros)}
        if resposta.get('erro'):
            # Desistiu-se com o servidor ou o fornecedor em baixo: como o modelo em pausa no chat, o lote não se
            # parte (as metades falhavam da mesma maneira); qualquer outra falha parte-o.
            raise (so_no_ecra.CircuitOpen if resposta.get('emBaixo') else RuntimeError)(resposta['erro'])
        ctrl._chamada_local.resposta_cortada = bool(resposta.get('cortada'))
        return {'text': resposta.get('texto') or ''}


def paginas(pedido_json, *ficheiros):
    """As páginas digitalizadas e as imagens dos documentos que ler marcou,
    lidas pelo modelo das imagens como no chat (_ler_paginas_digitalizadas).

    O pedido (JSON): ``contexto`` (o texto dos anexos, com as marcas),
    ``anexos`` ([{id, nome, mime}] dos PDF e dos documentos de onde elas vêm,
    com os bytes em *ficheiros*, pela mesma ordem), ``paginas`` ([[anexo,
    página, JPEG em base64]], as que o ecrã desenhou; as imagens dos documentos
    tiram-se deles), ``respostas`` ({lote: {texto, cortada} ou {erro, emBaixo}})
    e ``planear``. Devolve (JSON) ``{'pedidos'}`` (a planear: os pedidos de todos
    os lotes), ``{'pausa'}`` (um pedido que ainda falta), ``{'erro'}`` ou
    ``{'fim': {'contexto'}}`` — com o texto de cada página no lugar da marca, ou
    o aviso do chat de que não se leu."""
    pedido = json.loads(pedido_json)
    anexos = _Registos(types.SimpleNamespace(id=int(anexo['id']), name=anexo.get('nome'), mimetype=anexo.get('mime'),
                                             datas=base64.b64encode(_bytes(dados)))
                       for anexo, dados in zip(pedido.get('anexos') or [], ficheiros))
    jpegs = {(int(anexo), int(pagina)): jpeg for anexo, pagina, jpeg in pedido.get('paginas') or []}
    leitor = _PaginasDoEcra(jpegs, pedido.get('respostas'), planear=bool(pedido.get('planear')))
    so_no_ecra.ULTIMA_ETAPA[0] = None
    antes = getattr(ctrl._chamada_local, 'orcamento', None)
    # Sem threads, o caminho do chat de um lote de cada vez (o do orçamento em euros), sem teto: quem para é o
    # «Parar» do ecrã.
    ctrl._chamada_local.orcamento = {'eur_max': float('inf')}
    try:
        contexto = leitor._ler_paginas_digitalizadas('privada', None, pedido.get('contexto') or '', anexos)
    except PedidoAoModelo as pausa:
        return _json({'pausa': pausa.args[0]})
    except Exception as exc:  # noqa: BLE001
        return _json({'erro': f'{type(exc).__name__}: {exc}'[:2000]})
    finally:
        ctrl._chamada_local.orcamento = antes
        so_no_ecra.ULTIMA_ETAPA[0] = None
    if leitor.pedidos:
        return _json({'pedidos': leitor.pedidos})
    return _json({'fim': {'contexto': contexto}})


def limites():
    """Os limites do chat para os anexos (JSON), para o ecrã os conferir antes
    de ler (o chat confere-os em _process_attachments)."""
    return _json({nome: getattr(ctrl, nome) for nome in (
        '_MAX_ATTACHMENTS', '_MAX_ATTACHMENT_BYTES', '_MAX_ATTACHMENTS_TOTAL_BYTES', '_LIMIAR_FICHAS_CHARS',
        'ANEXOS_SEM_FICHA_MAX_CHARS')})
