# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
"""O que, no controlador do chat do Recato, vai à base de dados, aos pedidos
ou aos fornecedores: no ecrã da conversa privada é do ecrã (27/10/2026). O
ai_chat.py ao lado (gerado por scripts/python_do_chat.py) leva do chat a
leitura dos anexos, o read_document, o edit_document e as fichas, e vai
buscar isto aqui. A chamada ao modelo é a do ecrã (ver privada_anexos.py).
"""
import logging
import threading
import types

_logger = logging.getLogger(__name__)
#: O estado da chamada (no chat, por thread): aqui, o texto dos anexos com
#: ficha de onde procurar_nos_anexos lê, que o privada_anexos.py põe.
_chamada_local = threading.local()
#: Os fornecedores que leem imagens nos anexos: no ecrã, a chave com que se
#: chama o chat (privada_anexos.py), para as páginas digitalizadas dos PDF
#: (30/10/2026, desenhadas pelo pdf.js e lidas pelo GLM-5.3-Flash da
#: caixa-forte). As imagens anexadas vão à parte (imagens.js), e os vídeos não
#: vão (privada_anexos._Leitor._video_em_imagens).
_VISION_PROVIDERS = frozenset({'privada'})

#: Quem responde: a marca do produto, como no chat do Recato.
MARCA = 'Recato'
#: O pedido HTTP do chat: no ecrã não há.
request = types.SimpleNamespace(env=None)


class _RespostaCancelada(Exception):
    """O «Parar» da pessoa: no ecrã, cancela-o o ecrã."""


class _OrcamentoEsgotado(Exception):
    """No chat, o orçamento em euros acabou a meio da leitura das páginas
    digitalizadas. No ecrã não há orçamento (quem para é o «Parar»): não
    acontece, mas o chat apanha-a."""

    def __init__(self, lidas=None):
        super().__init__('orçamento esgotado')
        self.lidas = lidas or {}


def _servido_pela_privatemode(provider_key, model):
    """No chat, se o modelo é servido pela Privatemode (as leituras pedem-lhe
    então o maior teto que ela aceita). No ecrã, a leitura vai sempre à
    caixa-forte da Privatemode."""
    return True


class CircuitOpen(Exception):
    """No chat, o modelo em pausa (o disjuntor): a leitura das páginas
    digitalizadas não parte esse lote em metades, que falhavam da mesma
    maneira. No ecrã, o lote que se desistiu de pedir com o servidor ou o
    fornecedor em baixo (privada.js, chamarParaAsPaginas)."""


def _verificar_cancelamento():
    """No chat, o «Parar» a meio da leitura das páginas; no ecrã, o ecrã deixa
    de voltar a correr o método."""


#: Os ficheiros da conversa que o modelo pode ler e editar ({id: anexo, com
#: name, mimetype e datas em base64}) e os que ele fez nesta chamada: põe-nos
#: e tira-os o privada_anexos.py, à volta de cada ferramenta.
ANEXOS = {}
GERADOS = []
PROXIMO_ID = [None]
#: A última etapa que o chat mostraria ({modelo, valores}, na língua da
#: pessoa pelo ecrã), para o ecrã a mostrar.
ULTIMA_ETAPA = [None]


def _brand_name(env):
    return MARCA


def _task_model(provider_key, task):
    """O trabalho da chamada (o ecrã escolhe o modelo, pelas listas do chat)."""
    return task


def _model_fallbacks(provider_key, model, task=None):
    """O recurso de cada trabalho é do ecrã (MODELOS_DO_TRABALHO)."""
    return []


def _orcamento_de_leitura(orcamento, chars):
    """Os prazos de uma leitura longa: no chat, os do pedido ao fornecedor;
    no ecrã, quem espera pela resposta é o ecrã."""
    return orcamento


def _etapa(texto, lingua=None, **valores):
    # Na língua da pessoa, pelo ecrã (anexos.js, fazerFichas).
    return {'modelo': str(texto), 'valores': valores}


def _report_progress(texto):
    """No chat vai ao cartão da resposta; no ecrã, mostra-a o ecrã."""
    ULTIMA_ETAPA[0] = texto


def _tool_create_file(env, args):
    raise ValueError('no ecrã, o create_file é do privada_ficheiros.py')


def _tool_append_to_file(env, args):
    raise ValueError('no ecrã, o append_to_file é do privada_ficheiros.py')


def _anexo_do_utilizador(env, attachment_id):
    """O ficheiro da conversa com este id (só os da conversa: os ids são os
    dela), ou None."""
    try:
        return ANEXOS.get(int(attachment_id))
    except (TypeError, ValueError):
        return None


def _guardar_ficheiro_gerado(env, nome, mimetype, dados, tal_como_veio=False, custo_eur=None):
    """O ficheiro que o modelo fez fica para o ecrã (GERADOS), com o número
    que o ecrã lhe deu."""
    ficheiro = types.SimpleNamespace(id=PROXIMO_ID[0], name=nome, mimetype=mimetype, dados=bytes(dados))
    GERADOS.append(ficheiro)
    return ficheiro
