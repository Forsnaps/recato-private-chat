# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
"""O ERP à volta dos módulos do chat do Recato, no ecrã da conversa privada:
peças vazias (27/10/2026).

O ecrã corre com o Pyodide os módulos do chat que fazem e leem os ficheiros
(scripts/python_do_chat.py copia-os para forsnaps/addons/forsnaps_ai_chat/, o
caminho que lá têm). Eles importam peças do ERP — os erros, o tipo de um
ficheiro pelos bytes, os conflitos da base de dados — que aqui não existem:
ficam com o mínimo para os módulos carregarem. O que no chat é da base de
dados é do controllers/so_no_ecra.py.
"""
import sys
import types


def _modulo(nome, **valores):
    modulo = types.ModuleType(f'{__name__}.{nome}')
    modulo.__dict__.update(valores)
    sys.modules[modulo.__name__] = modulo
    return modulo


# As assinaturas que o chat confere com o guess_mimetype (ver
# _sniff_attachment_mime): só as dos tipos binários que ele trata à parte.
_ASSINATURAS = ((b'%PDF-', 'application/pdf'), (b'\x89PNG\r\n\x1a\n', 'image/png'), (b'\xff\xd8\xff', 'image/jpeg'),
                (b'GIF87a', 'image/gif'), (b'GIF89a', 'image/gif'), (b'BM', 'image/bmp'))


def _guess_mimetype(dados, default='application/octet-stream'):
    dados = bytes(dados[:16])
    if dados[:4] == b'RIFF' and dados[8:12] == b'WEBP':
        return 'image/webp'
    return next((mime for inicio, mime in _ASSINATURAS if dados.startswith(inicio)), default)


class PedidoAoModelo(Exception):
    """O pedido ao modelo que um método do chat faz a meio e que, no ecrã, é
    o ecrã que faz (ver privada_anexos.py). No ecrã não há base de dados nem
    conflitos de concorrência: é ele que passa os ``except
    PG_CONCURRENCY_EXCEPTIONS_TO_RETRY: raise`` do chat, tal como está."""


class _LeitorDePdf:
    """O leitor de PDF do ERP, com que o chat confere os PDF que guardou
    (entrega_ficheiros.formato_valido). O ecrã não o usa: o ficheiro é feito
    aqui mesmo, e da entrega só confere os anúncios e os formatos."""

    def __init__(self, *_argumentos, **_opcoes):
        raise NotImplementedError('o ecrã não confere os PDF pelo leitor do ERP')


exceptions = _modulo('exceptions', ValidationError=type('ValidationError', (Exception,), {}))
tools = _modulo('tools')
tools.mimetypes = _modulo('tools.mimetypes', guess_mimetype=_guess_mimetype)
tools.pdf = _modulo('tools.pdf', PdfReader=_LeitorDePdf)
service = _modulo('service')
service.model = _modulo('service.model', PedidoAoModelo=PedidoAoModelo,
                        PG_CONCURRENCY_EXCEPTIONS_TO_RETRY=(PedidoAoModelo,))
