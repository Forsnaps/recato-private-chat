# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
# Copiado do chat do Recato (forsnaps_ai_chat/documentos.py) por mobile-recato/scripts/python_do_chat.py, sem os
# comentários nem as notas internas: não se edita à mão.
import bisect
import copy
import csv
import datetime
import difflib
import html as _html
import io
import math
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import zipfile
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.parse import urlsplit
from docx import Document
from docx.oxml import OxmlElement as ElementoWord
from docx.shared import Mm
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from lxml import etree
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment
from openpyxl.styles.numbers import BUILTIN_FORMATS, is_date_format
from openpyxl.utils import get_column_letter
from openpyxl.utils.datetime import MAC_EPOCH, WINDOWS_EPOCH, to_excel
from openpyxl.worksheet.properties import PageSetupProperties
from pptx import Presentation
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn
from pptx.oxml.xmlchemy import OxmlElement as ElementoPptx
from pptx.shapes.group import GroupShape
from pptx.text.text import _Paragraph as ParagrafoPptx
from pptx.text.text import _Run as TrechoPptx
from pptx.util import Emu, Inches, Pt
MAX_UNIDADES = 2000
MAX_CELULAS = 5000
MAX_EDICOES = 500
MAX_LINHAS_NOVAS = 500
MAX_CONTEUDO_CHARS = 200000
MAX_LINHAS = 5000
MAX_COLUNAS = 60
MAX_NOME_CHARS = 120
MAX_TEXTO_CELULA = 2000
MIMES = {'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'xls': 'application/vnd.ms-excel', 'doc': 'application/msword', 'ppt': 'application/vnd.ms-powerpoint', 'csv': 'text/csv', 'txt': 'text/plain', 'md': 'text/markdown', 'html': 'text/html', 'pdf': 'application/pdf'}
TIPOS_MODERNOS = ('docx', 'xlsx', 'pptx')
TIPOS_LEGADOS = {'doc': 'docx', 'ppt': 'pptx', 'xls': 'xlsx'}
TIPOS_LEGIVEIS = TIPOS_MODERNOS + tuple(TIPOS_LEGADOS)
TIPOS_EDITAVEIS = TIPOS_MODERNOS
FORMATOS_GERAVEIS = ('txt', 'md', 'csv', 'xlsx', 'docx', 'pptx', 'pdf')
_MIME_PARA_TIPO = {v: k for k, v in MIMES.items() if k in TIPOS_LEGIVEIS}
_ASSINATURA_ZIP = b'PK\x03\x04'
_ASSINATURA_OLE = b'\xd0\xcf\x11\xe0'
_SOFFICE = shutil.which('soffice') or shutil.which('libreoffice')
_FILTROS_SOFFICE = {'docx': 'docx:MS Word 2007 XML', 'pptx': 'pptx:Impress MS PowerPoint 2007 XML', 'xlsx': 'xlsx:Calc MS Excel 2007 XML', 'doc': 'doc:MS Word 97', 'pdf': 'pdf'}
_PERFIL_SOFFICE_XCU = '<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="UseOpenCL" oor:op="fuse"><value>false</value></prop></item>\n<item oor:path="/org.openoffice.Setup/L10N"><prop oor:name="ooSetupSystemLocale" oor:op="fuse"><value>pt-PT</value></prop></item>\n</oor:items>\n'
MOTIVO_INVALIDO = 'pedido inválido'
MOTIVO_ID = 'id inexistente'
MOTIVO_VALOR = 'valor inválido'
MOTIVO_ORIGINAL = 'texto original não encontrado'
MOTIVO_REPETIDO = 'substituído por outro pedido para o mesmo sítio'
MOTIVO_REESCRITO = 'o texto inteiro foi trocado noutro pedido'
MOTIVO_FORMULA = 'fórmula'
MOTIVO_FOLHA = 'folha inexistente'
MOTIVO_CELULA = 'célula inválida'
MOTIVO_SEM_TABELA = 'não está numa tabela'
MOTIVO_OUTRA_TABELA = 'não é da tabela da linha-modelo'
MOTIVO_LINHA_USADA = 'linha já usada noutra tabela deste preenchimento'
MOTIVO_NAO_E_COLUNA = 'não é um parágrafo da linha-modelo'

def conversao_disponivel():
    return bool(_SOFFICE)

def _perfil_soffice(pasta):
    perfil = os.path.join(pasta, 'perfil')
    os.makedirs(os.path.join(perfil, 'user'), exist_ok=True)
    with open(os.path.join(perfil, 'user', 'registrymodifications.xcu'), 'w', encoding='utf-8') as f:
        f.write(_PERFIL_SOFFICE_XCU)
    return perfil

def tipo_moderno(tipo):
    return TIPOS_LEGADOS.get(tipo, tipo)

def legivel(tipo):
    if tipo in TIPOS_MODERNOS or tipo == 'xls':
        return True
    return tipo in TIPOS_LEGADOS and conversao_disponivel()

def editavel(tipo):
    return tipo in TIPOS_MODERNOS or (tipo in TIPOS_LEGADOS and conversao_disponivel())

def _converter(dados, ext_entrada, ext_saida):
    if not _SOFFICE:
        raise ValueError('formato antigo (.doc/.ppt/.xls): este servidor não tem LibreOffice para o converter — envie em .docx/.pptx/.xlsx')
    with tempfile.TemporaryDirectory() as pasta:
        entrada = os.path.join(pasta, f'documento.{ext_entrada}')
        with open(entrada, 'wb') as f:
            f.write(dados)
        perfil = _perfil_soffice(pasta)
        subprocess.run([_SOFFICE, '--headless', '--norestore', f'-env:UserInstallation=file://{perfil}', '--convert-to', _FILTROS_SOFFICE[ext_saida], '--outdir', pasta, entrada], check=True, timeout=180, capture_output=True)
        saida = os.path.join(pasta, f'documento.{ext_saida}')
        if not os.path.exists(saida):
            raise ValueError('a conversão do formato antigo falhou')
        with open(saida, 'rb') as f:
            return f.read()

def converter_legado(tipo, dados):
    return _converter(dados, tipo, TIPOS_LEGADOS[tipo])

def para_pdf(tipo, dados):
    if tipo not in TIPOS_LEGIVEIS:
        raise ValueError(f'este tipo de ficheiro não se converte para PDF: {tipo}')
    if not conversao_disponivel():
        raise ValueError('este servidor não tem o LibreOffice para converter o documento em PDF')
    if tipo == 'xlsx':
        dados = _datas_com_barra(dados)
    try:
        pdf = _converter(dados, tipo, 'pdf')
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        raise ValueError('a conversão para PDF falhou') from exc
    if not pdf.startswith(b'%PDF'):
        raise ValueError('a conversão para PDF falhou')
    return pdf
_DATAS_EMBUTIDAS = {14: 'dd/mm/yyyy', 22: 'dd/mm/yyyy hh:mm'}
_PEDACOS_DO_FORMATO_RE = re.compile('"[^"]*"|\\[[^\\]]*\\]|[\\\\_*].|/')

def _barra_literal(codigo):
    return _PEDACOS_DO_FORMATO_RE.sub(lambda m: '\\/' if m.group(0) == '/' else m.group(0), codigo)

def _datas_com_barra(dados):
    try:
        entrada = zipfile.ZipFile(io.BytesIO(dados))
        caminho = _caminho_da_relacao(entrada, '/styles')
        if not caminho:
            return dados
        raiz = etree.fromstring(entrada.read(caminho))
    except (zipfile.BadZipFile, KeyError, etree.XMLSyntaxError):
        return dados
    ns = '{%s}' % _NS_SS
    mudou = False
    formatos = list(raiz.iter(ns + 'numFmt'))
    for formato in formatos:
        codigo = formato.get('formatCode') or ''
        novo = _barra_literal(codigo) if is_date_format(codigo) else codigo
        if novo != codigo:
            formato.set('formatCode', novo)
            mudou = True
    lista = raiz.find(ns + 'numFmts')
    proprios = {f.get('numFmtId') for f in (lista if lista is not None else ())}
    proximo = max([int(f.get('numFmtId')) for f in formatos if (f.get('numFmtId') or '').isdigit()] + [163]) + 1
    trocados = {}
    for xf in raiz.iter(ns + 'xf'):
        ident = xf.get('numFmtId') or ''
        if not ident.isdigit() or int(ident) not in _DATAS_EMBUTIDAS or ident in proprios:
            continue
        if ident not in trocados:
            if lista is None:
                lista = etree.SubElement(raiz, ns + 'numFmts')
                raiz.insert(0, lista)
            formato = etree.SubElement(lista, ns + 'numFmt')
            formato.set('numFmtId', str(proximo))
            formato.set('formatCode', _barra_literal(_DATAS_EMBUTIDAS[int(ident)]))
            trocados[ident] = str(proximo)
            proximo += 1
        xf.set('numFmtId', trocados[ident])
        mudou = True
    if not mudou:
        return dados
    if lista is not None:
        lista.set('count', str(len(lista)))
    saida = io.BytesIO()
    with zipfile.ZipFile(saida, 'w', zipfile.ZIP_DEFLATED) as z:
        for item in entrada.infolist():
            z.writestr(item, _xml(raiz) if item.filename == caminho else entrada.read(item.filename))
    return saida.getvalue()

def _modernizar(tipo, dados):
    if tipo in TIPOS_LEGADOS:
        return (TIPOS_LEGADOS[tipo], converter_legado(tipo, dados))
    return (tipo, dados)

def tipo_de_documento(nome, mime, dados=None):
    tipo = _MIME_PARA_TIPO.get((mime or '').strip().lower())
    if not tipo and isinstance(nome, str) and ('.' in nome):
        ext = nome.rsplit('.', 1)[-1].lower()
        if ext in TIPOS_LEGIVEIS:
            tipo = ext
    if not tipo or dados is None:
        return tipo
    assinatura = _ASSINATURA_OLE if tipo in TIPOS_LEGADOS else _ASSINATURA_ZIP
    return tipo if bytes(dados[:4]) == assinatura else None

def nome_seguro(nome, formato):
    partes = re.split('\\s+', re.sub('[\\\\/\\x00-\\x1f]+', ' ', str(nome or '')))
    base = ' '.join((p for p in partes if p and set(p) != {'.'})).strip('. ') or 'documento'
    ext = '.' + formato
    if base.lower().endswith(ext):
        base = base[:-len(ext)]
    return base[:MAX_NOME_CHARS] + ext
_NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
_NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
_NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
_NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
_NS_PML = 'http://schemas.openxmlformats.org/presentationml/2006/main'

def _w(nome):
    return '{%s}%s' % (_NS_W, nome)
_W_P, _W_R, _W_TBL, _W_TR, _W_TC = (_w('p'), _w('r'), _w('tbl'), _w('tr'), _w('tc'))
_W_SDT, _W_SDT_PR, _W_SDT_CONTENT = (_w('sdt'), _w('sdtPr'), _w('sdtContent'))
_W_CAIXA = _w('txbxContent')
_MC_CHOICE = '{%s}Choice' % _NS_MC
_MC_FALLBACK = '{%s}Fallback' % _NS_MC
_A_P, _A_TR, _A_TBL = ('{%s}p' % _NS_A, '{%s}tr' % _NS_A, '{%s}tbl' % _NS_A)
_W_INVOLUCROS = frozenset({_w('hyperlink'), _w('fldSimple'), _w('smartTag'), _w('customXml'), _w('ins'), _w('moveTo')})
_W_CONTEUDO_DE_TEXTO = frozenset((_w(n) for n in ('rPr', 't', 'tab', 'br', 'cr', 'noBreakHyphen', 'softHyphen', 'ptab', 'lastRenderedPageBreak')))
_W_PRECISAM_DE_PARAGRAFO = frozenset({_W_TC, _W_CAIXA, _w('hdr'), _w('ftr')})
_TIPOS_DE_CABECALHO = ('default', 'first', 'even')
ONDE_CABECALHO = 'cabeçalho'
ONDE_RODAPE = 'rodapé'
_ID_RE = re.compile('^([pcr])(\\d+)$')

class _Unidade:
    __slots__ = ('id', 'paragrafo', 'onde', 'posicao', 'diapositivo')

    def __init__(self, ident, paragrafo, onde=None, posicao=None, diapositivo=None):
        self.id = ident
        self.paragrafo = paragrafo
        self.onde = onde
        self.posicao = posicao
        self.diapositivo = diapositivo

    @property
    def elemento(self):
        return self.paragrafo._element

class _PaiDaParte:

    def __init__(self, parte):
        self.part = parte

def _normalizar_id(ident):
    m = _ID_RE.match(ident) if isinstance(ident, str) else None
    return f'{m.group(1)}{int(m.group(2))}' if m else None

def _fora_do_recurso(el):
    return next(el.iterancestors(_MC_FALLBACK), None) is None

def _paragrafos_de(raiz):
    return [el for el in raiz.iter(_W_P) if _fora_do_recurso(el)]

def _linhas_da_tabela_docx(tbl):
    return [tr for tr in tbl.iter(_W_TR) if next(tr.iterancestors(_W_TBL), None) is tbl]

def _largura_na_grelha(el, propriedades, nome, por_omissao):
    valor = el.find(f'{_w(propriedades)}/{_w(nome)}')
    try:
        return int(valor.get(_w('val'))) if valor is not None else por_omissao
    except (TypeError, ValueError):
        return por_omissao

def _posicoes_nas_tabelas(raiz):
    tabelas, linhas, celulas, por_tabela, na_grelha = ({}, {}, {}, {}, {})
    for tbl in raiz.iter(_W_TBL):
        if _fora_do_recurso(tbl):
            tabelas[tbl] = len(tabelas) + 1
    for tr in raiz.iter(_W_TR):
        tbl = next(tr.iterancestors(_W_TBL), None)
        if tbl in tabelas:
            por_tabela[tbl] = por_tabela.get(tbl, 0) + 1
            linhas[tr] = (tabelas[tbl], por_tabela[tbl])
            na_grelha[tr] = _largura_na_grelha(tr, 'trPr', 'gridBefore', 0)
    for tc in raiz.iter(_W_TC):
        tr = next(tc.iterancestors(_W_TR), None)
        if tr in linhas:
            celulas[tc] = linhas[tr] + (na_grelha[tr] + 1,)
            na_grelha[tr] += max(1, _largura_na_grelha(tc, 'tcPr', 'gridSpan', 1))
    return celulas

def _posicao_docx(el, celulas):
    tc = next(el.iterancestors(_W_TC), None)
    if tc is None or tc not in celulas:
        return None
    tabela, linha, coluna = celulas[tc]
    return {'tabela': tabela, 'linha': linha, 'coluna': coluna}
_TIPO_DEFINICOES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings'

def _ligado(el):
    return el is not None and (el.get(_w('val')) or 'true').lower() not in ('0', 'false', 'off')

def _pares_e_impares_diferentes(doc):
    try:
        definicoes = doc.part.part_related_by(_TIPO_DEFINICOES)
    except (KeyError, ValueError):
        return False
    raiz = getattr(definicoes, 'element', None)
    return raiz is not None and _ligado(raiz.find(_w('evenAndOddHeaders')))

def _partes_de_cabecalhos_e_rodapes(doc):
    relacionadas = doc.part.related_parts
    pares_e_impares = _pares_e_impares_diferentes(doc)
    cabecalhos, rodapes, escondidas, vistas = ([], [], [], set())
    herdadas = {'headerReference': {}, 'footerReference': {}}
    for seccao in doc.element.body.xpath('./w:p/w:pPr/w:sectPr | ./w:sectPr'):
        primeira_pagina = _ligado(seccao.find(_w('titlePg')))
        for etiqueta, raiz, lista in (('headerReference', _w('hdr'), cabecalhos), ('footerReference', _w('ftr'), rodapes)):
            proprias = {}
            for ref in seccao.findall(_w(etiqueta)):
                proprias.setdefault(ref.get(_w('type')) or 'default', ref.get('{%s}id' % _NS_REL_DOC))
            refs = herdadas[etiqueta]
            refs.update(proprias)
            for tipo in _TIPOS_DE_CABECALHO:
                parte = relacionadas.get(refs.get(tipo)) if refs.get(tipo) else None
                elemento = getattr(parte, 'element', None)
                if elemento is None or elemento.tag != raiz or id(parte) in vistas:
                    continue
                if tipo == 'first' and (not primeira_pagina) or (tipo == 'even' and (not pares_e_impares)):
                    if all((parte is not x for x in escondidas)):
                        escondidas.append(parte)
                    continue
                vistas.add(id(parte))
                lista.append(parte)
    return (cabecalhos, rodapes, [parte for parte in escondidas if id(parte) not in vistas])
_W_TEXTO_OU_APAGADO = _W_CONTEUDO_DE_TEXTO | {_w('delText')}
_W_RPR = _w('rPr')

def _separar_trechos_mistos(raiz):
    for r in list(raiz.iter(_W_R)):
        filhos = [f for f in r if f.tag != _W_RPR]
        de_texto = [f.tag in _W_TEXTO_OU_APAGADO for f in filhos]
        if all(de_texto) or not any(de_texto):
            continue
        formato = r.find(_W_RPR)
        grupos = []
        for filho, texto in zip(filhos, de_texto):
            if grupos and grupos[-1][0] == texto:
                grupos[-1][1].append(filho)
            else:
                grupos.append((texto, [filho]))
        anterior = r
        for _texto, membros in grupos[1:]:
            novo = ElementoWord('w:r')
            if formato is not None:
                novo.append(copy.deepcopy(formato))
            for membro in membros:
                novo.append(membro)
            anterior.addnext(novo)
            anterior = novo

def _unidades_docx(doc):
    unidades = []

    def juntar(raiz, pai, prefixo, onde, n):
        _separar_trechos_mistos(raiz)
        celulas = _posicoes_nas_tabelas(raiz)
        for el in _paragrafos_de(raiz):
            n += 1
            unidades.append(_Unidade(f'{prefixo}{n}', Paragraph(el, pai), onde, _posicao_docx(el, celulas)))
        return n
    cabecalhos, rodapes, _escondidas = _partes_de_cabecalhos_e_rodapes(doc)
    n = 0
    for parte in cabecalhos:
        n = juntar(parte.element, _PaiDaParte(parte), 'c', ONDE_CABECALHO, n)
    juntar(doc.element.body, doc, 'p', None, 0)
    n = 0
    for parte in rodapes:
        n = juntar(parte.element, _PaiDaParte(parte), 'r', ONDE_RODAPE, n)
    return unidades

def _trecho_de_texto(r):
    return all((filho.tag in _W_CONTEUDO_DE_TEXTO for filho in r))

def _trechos_docx(p):
    saida = []

    def percorrer(el):
        for filho in el:
            if filho.tag == _W_R:
                if _trecho_de_texto(filho):
                    saida.append(Run(filho, p))
            elif filho.tag == _W_SDT:
                conteudo = filho.find(_W_SDT_CONTENT)
                if conteudo is not None:
                    percorrer(conteudo)
            elif filho.tag in _W_INVOLUCROS:
                percorrer(filho)
    percorrer(p._p)
    return saida

def _texto_docx(p):
    return ''.join((r.text for r in _trechos_docx(p)))

def _estilo_docx(p):
    return p.style.name if p.style is not None else ''

def _distribuir(textos, novo):
    if not textos:
        return []
    antigo = ''.join(textos)
    inicios, pos = ([], 0)
    for t in textos:
        inicios.append(pos)
        pos += len(t)

    def dono(i):
        return max(0, min(bisect.bisect_right(inicios, i) - 1, len(textos) - 1))
    partes = [[] for _ in textos]
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, antigo, novo, autojunk=False).get_opcodes():
        if tag == 'equal':
            k = i1
            while k < i2:
                t = dono(k)
                fim = min(i2, inicios[t] + len(textos[t]))
                partes[t].append(novo[j1 + (k - i1):j1 + (fim - i1)])
                k = fim
        elif j2 > j1:
            partes[dono(i1)].append(novo[j1:j2])
    return [''.join(p) for p in partes]

def _trocar_por_posicao(textos, trocas):
    antigo = ''.join(textos)
    inicios, pos = ([], 0)
    for t in textos:
        inicios.append(pos)
        pos += len(t)

    def dono(i):
        return max(0, min(bisect.bisect_right(inicios, i) - 1, len(textos) - 1))
    partes = [[] for _ in textos]

    def copiar(de, ate):
        while de < ate:
            k = dono(de)
            fim = max(de + 1, min(ate, inicios[k] + len(textos[k])))
            partes[k].append(antigo[de:fim])
            de = fim
    cursor = 0
    for inicio, fim, novo in trocas:
        copiar(cursor, inicio)
        partes[dono(inicio)].append(novo)
        cursor = fim
    copiar(cursor, len(antigo))
    return [''.join(p) for p in partes]

def _aplicar_trocas(texto, trocas):
    partes, cursor = ([], 0)
    for inicio, fim, novo in trocas:
        partes.append(texto[cursor:inicio])
        partes.append(novo)
        cursor = fim
    partes.append(texto[cursor:])
    return ''.join(partes)

def _formas_pptx(formas):
    for forma in formas:
        if isinstance(forma, GroupShape):
            yield from _formas_pptx(forma.shapes)
        else:
            yield forma

def _unidades_pptx(prs):
    unidades = []
    for numero, slide in enumerate(prs.slides, start=1):
        tabelas = 0
        for forma in _formas_pptx(slide.shapes):
            if forma.has_text_frame:
                for p in forma.text_frame.paragraphs:
                    unidades.append(_Unidade(f'p{len(unidades) + 1}', p, diapositivo=numero))
            elif getattr(forma, 'has_table', False) and forma.has_table:
                tabelas += 1
                for linha, fila in enumerate(forma.table.rows, start=1):
                    for coluna, celula in enumerate(fila.cells, start=1):
                        posicao = {'tabela': tabelas, 'linha': linha, 'coluna': coluna}
                        for p in celula.text_frame.paragraphs:
                            unidades.append(_Unidade(f'p{len(unidades) + 1}', p, posicao=posicao, diapositivo=numero))
    return unidades
_A_R, _A_BR, _A_FLD = ('{%s}r' % _NS_A, '{%s}br' % _NS_A, '{%s}fld' % _NS_A)
_A_T, _A_RPR, _A_TC = ('{%s}t' % _NS_A, '{%s}rPr' % _NS_A, '{%s}tc' % _NS_A)

def _trechos_pptx(p):
    saida = []
    for filho in p._p:
        if filho.tag in (_A_R, _A_FLD):
            t = filho.find(_A_T)
            saida.append((filho, t.text or '' if t is not None else ''))
        elif filho.tag == _A_BR:
            saida.append((filho, '\n'))
    return saida

def _texto_paragrafo_pptx(p):
    return ''.join((texto for _el, texto in _trechos_pptx(p)))

def extrair_texto(tipo, dados, max_chars):
    if tipo in TIPOS_LEGADOS and (tipo != 'xls' or conversao_disponivel()):
        tipo, dados = _modernizar(tipo, dados)
    if tipo == 'docx':
        from . import revisoes
        texto = revisoes.texto_docx(Document(io.BytesIO(dados)))
    elif tipo == 'pptx':
        prs = Presentation(io.BytesIO(dados))
        linhas, atual = ([], None)
        for u in _unidades_pptx(prs):
            if u.diapositivo != atual:
                linhas.append(f'--- Diapositivo {u.diapositivo} ---')
                atual = u.diapositivo
            t = _texto_paragrafo_pptx(u.paragrafo)
            if t.strip():
                linhas.append(t)
        texto = '\n'.join(linhas)
    elif tipo == 'xlsx':
        wb = load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
        formulas = _formulas_xlsx(dados)
        texto = _texto_folhas(((ws.title, _valores_ou_formulas(ws, formulas) if formulas else ws.iter_rows(values_only=True)) for ws in wb.worksheets))
    elif tipo == 'xls':
        import xlrd
        livro = xlrd.open_workbook(file_contents=dados)
        texto = _texto_folhas(((folha.name, (folha.row_values(r) for r in range(folha.nrows))) for folha in livro.sheets()))
    else:
        raise ValueError(f'tipo não legível: {tipo}')
    return texto[:max_chars]
IMAGEM_MIN_LADO = 200
IMAGEM_MIN_PIXEIS = 200000
_PASTA_DAS_IMAGENS = {'docx': 'word/media/', 'pptx': 'ppt/media/', 'xlsx': 'xl/media/'}
_IMAGENS_RASTER = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.webp')

def imagens_do_documento(tipo, dados):
    if tipo in TIPOS_LEGADOS:
        if not conversao_disponivel():
            return []
        tipo, dados = _modernizar(tipo, dados)
    pasta = _PASTA_DAS_IMAGENS.get(tipo)
    if not pasta:
        return []
    from PIL import Image
    try:
        arquivo = zipfile.ZipFile(io.BytesIO(dados))
    except zipfile.BadZipFile:
        return []
    nomes = [n for n in arquivo.namelist() if n.startswith(pasta) and n.lower().endswith(_IMAGENS_RASTER)]
    nomes.sort(key=lambda n: [int(p) if p.isdigit() else p for p in re.split('(\\d+)', n)])
    imagens = []
    for nome in nomes:
        conteudo = arquivo.read(nome)
        try:
            with Image.open(io.BytesIO(conteudo)) as imagem:
                largura, altura = imagem.size
        except Exception:
            continue
        if min(largura, altura) >= IMAGEM_MIN_LADO and largura * altura >= IMAGEM_MIN_PIXEIS:
            imagens.append(conteudo)
    return imagens

def _valores_ou_formulas(ws, formulas):
    for fila in ws.iter_rows():
        yield [celula.value if celula.value is not None else formulas.get((ws.title, getattr(celula, 'coordinate', None))) for celula in fila]

def _texto_folhas(folhas):
    linhas = []
    for titulo, filas in folhas:
        linhas.append(f'=== Folha: {titulo} ===')
        for fila in filas:
            valores = [_texto_da_celula(v) for v in fila]
            while valores and (not valores[-1].strip()):
                valores.pop()
            if valores:
                linhas.append(' | '.join(valores))
    return '\n'.join(linhas)

def _texto_da_celula(v):
    if v is None:
        return ''
    if isinstance(v, datetime.datetime):
        return v.strftime('%d/%m/%Y %H:%M' if (v.hour, v.minute) != (0, 0) else '%d/%m/%Y')
    if isinstance(v, datetime.date):
        return v.strftime('%d/%m/%Y')
    return str(v)

def estrutura(tipo, dados):
    tipo, dados = _modernizar(tipo, dados)
    if tipo == 'docx':
        from . import revisoes
        return revisoes.estrutura_docx(Document(io.BytesIO(dados)))
    if tipo == 'pptx':
        prs = Presentation(io.BytesIO(dados))
        unidades = []
        for u in _unidades_pptx(prs):
            texto = _texto_paragrafo_pptx(u.paragrafo)
            if texto.strip():
                item = {'id': u.id, 'diapositivo': u.diapositivo, 'texto': texto}
                if u.posicao:
                    item.update(u.posicao)
                unidades.append(item)
        return _limitar(unidades, MAX_UNIDADES)
    if tipo == 'xlsx':
        formulas = _formulas_xlsx(dados)
        wb = load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
        unidades = []
        for ws in wb.worksheets:
            for fila in ws.iter_rows():
                for celula in fila:
                    coordenada = getattr(celula, 'coordinate', None)
                    formula = formulas.get((ws.title, coordenada)) if coordenada else None
                    if not formula and (celula.value is None or str(celula.value).strip() == ''):
                        continue
                    item = {'folha': ws.title, 'celula': coordenada, 'valor': _valor_json(celula.value)}
                    if formula:
                        item['formula'] = formula
                    unidades.append(item)
                    if len(unidades) > MAX_CELULAS:
                        return _limitar(unidades, MAX_CELULAS)
        return unidades
    raise ValueError(f'tipo não editável: {tipo}')

def resumo_de_revisoes(tipo, dados):
    if tipo != 'docx':
        return None
    from . import revisoes
    return revisoes.resumo(Document(io.BytesIO(dados)))

def _formulas_xlsx(dados):
    wb = load_workbook(io.BytesIO(dados), read_only=True, data_only=False)
    saida = {}
    for ws in wb.worksheets:
        for fila in ws.iter_rows():
            for celula in fila:
                if getattr(celula, 'data_type', None) != 'f':
                    continue
                texto = getattr(celula.value, 'text', celula.value)
                if isinstance(texto, str) and texto:
                    saida[ws.title, celula.coordinate] = texto if texto.startswith('=') else '=' + texto
    return saida

def _limitar(unidades, maximo):
    if len(unidades) > maximo:
        return unidades[:maximo] + [{'aviso': f'lista cortada em {maximo} unidades'}]
    return unidades

def _valor_json(v):
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    return _texto_da_celula(v)

def editar(tipo, dados, edicoes, revisao=None, autor=''):
    if not isinstance(edicoes, list) or not edicoes:
        raise ValueError('sem edições')
    if len(edicoes) > MAX_EDICOES:
        raise ValueError(f'demasiadas edições (máx. {MAX_EDICOES})')
    tipo, dados = _modernizar(tipo, dados)
    if tipo == 'docx':
        from . import revisoes
        doc = Document(io.BytesIO(dados))
        aplicadas, ignoradas = revisoes.editar_docx(doc, edicoes, revisao, autor)
        return (_bytes(doc), aplicadas, ignoradas)
    if tipo == 'pptx':
        prs = Presentation(io.BytesIO(dados))
        aplicadas, ignoradas = _editar_unidades(_unidades_pptx(prs), edicoes, _reescrever_pptx, _apagar_pptx)
        return (_bytes(prs), aplicadas, ignoradas)
    if tipo == 'xlsx':
        return _editar_xlsx_no_pacote(dados, edicoes)
    raise ValueError(f'tipo não editável: {tipo}')
_NS_SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
_NS_XML = 'http://www.w3.org/XML/1998/namespace'
_REF_RE = re.compile('^([A-Z]{1,3})([1-9][0-9]{0,6})$')
_DEPOIS_DO_CALCPR = frozenset({'oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'})

def _indice_coluna(letras):
    n = 0
    for ch in letras:
        n = n * 26 + (ord(ch) - 64)
    return n

def _folhas_do_pacote(zf):
    wb = etree.fromstring(zf.read('xl/workbook.xml'))
    rels = etree.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    alvo = {r.get('Id'): r.get('Target') for r in rels}
    saida = {}
    for folha in wb.iter('{%s}sheet' % _NS_SS):
        destino = alvo.get(folha.get('{%s}id' % _NS_REL_DOC), '')
        caminho = destino.lstrip('/') if destino.startswith('/') else 'xl/' + destino
        saida[folha.get('name')] = caminho
    return saida

def _escrever_celula_xml(raiz, ref, valor, formulas_apagadas):
    ns = '{%s}' % _NS_SS
    col, lin = _REF_RE.match(ref).groups()
    lin = int(lin)
    dados = raiz.find(ns + 'sheetData')
    if dados is None:
        dados = etree.SubElement(raiz, ns + 'sheetData')
    fila, posicao = (None, None)
    for idx, r in enumerate(dados.findall(ns + 'row')):
        numero = int(r.get('r') or 0)
        if numero == lin:
            fila = r
            break
        if numero > lin:
            posicao = idx
            break
    if fila is None:
        fila = etree.Element(ns + 'row', r=str(lin))
        dados.insert(posicao, fila) if posicao is not None else dados.append(fila)
    celula, pos_c = (None, None)
    for idx, c in enumerate(fila.findall(ns + 'c')):
        referencia = c.get('r') or ''
        if referencia == ref:
            celula = c
            break
        m = re.match('^([A-Z]+)', referencia)
        if m and _indice_coluna(m.group(1)) > _indice_coluna(col):
            pos_c = idx
            break
    if celula is None:
        celula = etree.Element(ns + 'c', r=ref)
        fila.insert(pos_c, celula) if pos_c is not None else fila.append(celula)
    if celula.find(ns + 'f') is not None:
        formulas_apagadas.append(ref)
    for filho in list(celula):
        celula.remove(filho)
    celula.attrib.pop('t', None)
    if valor is None:
        return
    if isinstance(valor, bool):
        celula.set('t', 'b')
        etree.SubElement(celula, ns + 'v').text = '1' if valor else '0'
    elif isinstance(valor, (int, float)):
        etree.SubElement(celula, ns + 'v').text = repr(valor) if isinstance(valor, float) else str(valor)
    else:
        celula.set('t', 'inlineStr')
        t = etree.SubElement(etree.SubElement(celula, ns + 'is'), ns + 't')
        t.text = str(valor)[:MAX_TEXTO_CELULA]
        t.set('{%s}space' % _NS_XML, 'preserve')

def _xml(raiz):
    return etree.tostring(raiz, xml_declaration=True, encoding='UTF-8', standalone=True)

def _alargar_dimensao(raiz, refs):
    dim = raiz.find('{%s}dimension' % _NS_SS)
    if dim is None:
        return
    cantos = []
    for parte in (dim.get('ref') or '').split(':'):
        m = _REF_RE.match(parte)
        if m:
            cantos.append((_indice_coluna(m.group(1)), int(m.group(2))))
    for ref in refs:
        col, lin = _REF_RE.match(ref).groups()
        cantos.append((_indice_coluna(col), int(lin)))
    if not cantos:
        return
    c1, l1 = (min((c for c, _l in cantos)), min((l for _c, l in cantos)))
    c2, l2 = (max((c for c, _l in cantos)), max((l for _c, l in cantos)))
    dim.set('ref', f'{get_column_letter(c1)}{l1}:{get_column_letter(c2)}{l2}')

def _calcular_ao_abrir(xml_livro):
    raiz = etree.fromstring(xml_livro)
    ns = '{%s}' % etree.QName(raiz).namespace
    calculo = raiz.find(ns + 'calcPr')
    if calculo is None:
        calculo = etree.SubElement(raiz, ns + 'calcPr')
        depois = next((f for f in raiz if isinstance(f.tag, str) and etree.QName(f).localname in _DEPOIS_DO_CALCPR), None)
        if depois is not None:
            depois.addprevious(calculo)
    elif calculo.get('fullCalcOnLoad') in ('1', 'true'):
        return None
    calculo.set('fullCalcOnLoad', '1')
    return _xml(raiz)

def _intervalo(ref):
    cantos = []
    for parte in (ref or '').split(':'):
        m = _REF_RE.match(parte.replace('$', ''))
        if not m:
            return None
        cantos.append((_indice_coluna(m.group(1)), int(m.group(2))))
    return (cantos[0], cantos[-1]) if len(cantos) in (1, 2) else None

def _dentro(celula, zona):
    (coluna, linha), ((coluna1, linha1), (coluna2, linha2)) = (celula, zona)
    return coluna1 <= coluna <= coluna2 and linha1 <= linha <= linha2

def _no_intervalo(ref, intervalo):
    celula, zona = (_intervalo(ref), _intervalo(intervalo))
    return bool(celula and zona) and _dentro(celula[0], zona)

def _tirar_valor_guardado(c, ns):
    v = c.find(ns + 'v')
    if v is None or not (v.text or '').strip():
        return False
    c.remove(v)
    if c.get('t') in ('str', 'e', 'b'):
        del c.attrib['t']
    return True

def _com_valores_guardados(dados, valores):
    if not valores:
        return dados
    entrada = zipfile.ZipFile(io.BytesIO(dados))
    caminho = 'xl/worksheets/sheet1.xml'
    raiz = etree.fromstring(entrada.read(caminho))
    ns = '{%s}' % _NS_SS
    for c in raiz.iter(ns + 'c'):
        valor = valores.get(c.get('r'))
        if not isinstance(valor, Decimal) or c.find(ns + 'f') is None:
            continue
        v = c.find(ns + 'v')
        if v is None:
            v = etree.SubElement(c, ns + 'v')
        v.text = format(valor, 'f')
        c.attrib.pop('t', None)
    saida = io.BytesIO()
    with zipfile.ZipFile(saida, 'w', zipfile.ZIP_DEFLATED) as z:
        for item in entrada.infolist():
            z.writestr(item, _xml(raiz) if item.filename == caminho else entrada.read(item.filename))
    return saida.getvalue()

def _tirar_valores_guardados(raiz):
    ns = '{%s}' % _NS_SS
    mudou, zonas = (False, [])
    for c in raiz.iter(ns + 'c'):
        formula = c.find(ns + 'f')
        if formula is None:
            continue
        if formula.get('t') == 'array':
            zona = _intervalo(formula.get('ref'))
            if zona and zona[0] != zona[1]:
                zonas.append(zona)
        mudou = _tirar_valor_guardado(c, ns) or mudou
    if not zonas:
        return mudou
    for c in raiz.iter(ns + 'c'):
        if c.find(ns + 'f') is not None:
            continue
        celula = _intervalo(c.get('r'))
        if celula and any((_dentro(celula[0], zona) for zona in zonas)):
            mudou = _tirar_valor_guardado(c, ns) or mudou
    return mudou

def _caminho_dos_partilhados(zf):
    return _caminho_da_relacao(zf, '/sharedStrings')

def _esvaziar_textos_sem_uso(zf, raizes):
    caminho = _caminho_dos_partilhados(zf)
    if not caminho:
        return {}
    ns = '{%s}' % _NS_SS
    usados = set()
    for raiz in raizes:
        for c in raiz.iter(ns + 'c'):
            v = c.find(ns + 'v') if c.get('t') == 's' else None
            if v is not None and (v.text or '').strip().isdigit():
                usados.add(int(v.text.strip()))
    tabela = etree.fromstring(zf.read(caminho))
    mudou = False
    for i, si in enumerate(tabela.findall(ns + 'si')):
        if i in usados or (len(si) == 1 and si[0].tag == ns + 't' and (not si[0].text)):
            continue
        for filho in list(si):
            si.remove(filho)
        etree.SubElement(si, ns + 't')
        mudou = True
    return {caminho: _xml(tabela)} if mudou else {}

def _acertar_ligacoes_xlsx(zf, caminho, raiz, escritas, preenchimento):
    ns = '{%s}' % _NS_SS
    bloco = raiz.find(ns + 'hyperlinks')
    pasta, nome = caminho.rsplit('/', 1)
    caminho_rels = f'{pasta}/_rels/{nome}.rels'
    if bloco is None or caminho_rels not in zf.namelist():
        return {}
    rels = etree.fromstring(zf.read(caminho_rels))
    por_id = {r.get('Id'): r for r in rels}
    pares = (preenchimento or {}).get('pares') or {}
    mudou = False
    for folha, celula, antes, valor in escritas:
        antes = '' if antes is None else antes if isinstance(antes, str) else _texto_da_celula(antes)
        depois = '' if valor is None else valor if isinstance(valor, str) else _texto_da_celula(valor)
        if antes == depois:
            continue
        for ligacao in [x for x in bloco.findall(ns + 'hyperlink') if _no_intervalo(celula, x.get('ref'))]:
            rid = ligacao.get(_R_ID)
            rel = por_id.get(rid) if rid else None
            if rel is None or rel.get('TargetMode') != 'External':
                continue
            acao, destino = _destino_da_ligacao(rel.get('Target'), antes, depois, pares.get((folha, celula), ()), preenchimento is not None)
            if acao == _TROCAR_LIGACAO:
                if _referencias(raiz, rid) > 1:
                    n = len(por_id) + 1
                    while f'rId{n}' in por_id:
                        n += 1
                    rel = copy.deepcopy(rel)
                    rel.set('Id', f'rId{n}')
                    rels.append(rel)
                    por_id[f'rId{n}'] = rel
                    ligacao.set(_R_ID, f'rId{n}')
                rel.set('Target', destino)
                if ligacao.get('display') is not None:
                    ligacao.set('display', depois[:MAX_TEXTO_CELULA])
            elif acao == _SOLTAR_LIGACAO:
                bloco.remove(ligacao)
                if _referencias(raiz, rid) == 0:
                    rels.remove(rel)
                    por_id.pop(rid, None)
            else:
                continue
            mudou = True
    if not mudou:
        return {}
    if not len(bloco):
        raiz.remove(bloco)
    return {caminho_rels: _xml(rels)}

def _propriedades_limpas_xlsx(zf, titulo):
    try:
        rels = etree.fromstring(zf.read('_rels/.rels'))
    except KeyError:
        return {}
    saida = {}
    for r in rels:
        caminho = (r.get('Target') or '').lstrip('/')
        if caminho not in zf.namelist():
            continue
        if r.get('Type') == _TIPO_PROPRIEDADES:
            raiz = etree.fromstring(zf.read(caminho))
            if _limpar_propriedades_xml(raiz, titulo):
                saida[caminho] = _xml(raiz)
        elif r.get('Type') == _TIPO_PROPRIEDADES_DA_APLICACAO:
            novo = _aplicacao_sem_rasto(zf.read(caminho))
            if novo is not None:
                saida[caminho] = novo
    return saida

def _editar_xlsx_no_pacote(dados, edicoes, preenchimento=None):
    entrada = zipfile.ZipFile(io.BytesIO(dados))
    nomes = set(entrada.namelist())
    folhas = _folhas_do_pacote(entrada)
    por_folha, aplicadas, ignoradas = ({}, [], [])
    for e in edicoes:
        caminho = folhas.get(e.get('folha'))
        valor = e.get('valor')
        if not caminho or caminho not in nomes or (not _celula_valida(e.get('celula'))) or (not (valor is None or isinstance(valor, (int, float, bool, str)))):
            ignoradas.append(e)
            continue
        por_folha.setdefault(caminho, []).append(e)
        aplicadas.append(e)
    alterados, formulas_apagadas, apagar, raizes, cache = ({}, [], set(), {}, {})
    for caminho, lista in por_folha.items():
        raiz = etree.fromstring(entrada.read(caminho))
        com_ligacoes = raiz.find('{%s}hyperlinks' % _NS_SS) is not None
        escritas = []
        for e in lista:
            valor = None if e['valor'] == '' else e['valor']
            antes = _conteudo_da_celula(_celula_do_xml(raiz, e['celula']), entrada, cache)[0] if com_ligacoes else None
            _escrever_celula_xml(raiz, e['celula'], valor, formulas_apagadas)
            escritas.append((e['folha'], e['celula'], antes, valor))
        _alargar_dimensao(raiz, [e['celula'] for e in lista])
        if com_ligacoes:
            alterados.update(_acertar_ligacoes_xlsx(entrada, caminho, raiz, escritas, preenchimento))
        raizes[caminho] = raiz
    if aplicadas:
        livro = _calcular_ao_abrir(entrada.read('xl/workbook.xml'))
        if livro is not None:
            alterados['xl/workbook.xml'] = livro
        for caminho in folhas.values():
            if caminho in nomes and caminho not in raizes:
                raizes[caminho] = etree.fromstring(entrada.read(caminho))
        for caminho, raiz in raizes.items():
            if _tirar_valores_guardados(raiz) or caminho in por_folha:
                alterados[caminho] = _xml(raiz)
        alterados.update(_esvaziar_textos_sem_uso(entrada, raizes.values()))
    if preenchimento is not None:
        alterados.update(_propriedades_limpas_xlsx(entrada, preenchimento.get('titulo')))
    if formulas_apagadas and 'xl/calcChain.xml' in nomes:
        cadeia = etree.fromstring(entrada.read('xl/calcChain.xml'))
        for c in list(cadeia):
            if c.get('r') in formulas_apagadas:
                cadeia.remove(c)
        if len(cadeia):
            alterados['xl/calcChain.xml'] = _xml(cadeia)
        else:
            apagar.add('xl/calcChain.xml')
            tipos = etree.fromstring(entrada.read('[Content_Types].xml'))
            for o in list(tipos):
                if o.get('PartName') == '/xl/calcChain.xml':
                    tipos.remove(o)
            alterados['[Content_Types].xml'] = _xml(tipos)
            rels = etree.fromstring(entrada.read('xl/_rels/workbook.xml.rels'))
            for r in list(rels):
                if (r.get('Target') or '').endswith('calcChain.xml'):
                    rels.remove(r)
            alterados['xl/_rels/workbook.xml.rels'] = _xml(rels)
    saida = io.BytesIO()
    with zipfile.ZipFile(saida, 'w', zipfile.ZIP_DEFLATED) as z:
        for item in entrada.infolist():
            if item.filename in apagar:
                continue
            z.writestr(item, alterados.get(item.filename, entrada.read(item.filename)))
    return (saida.getvalue(), aplicadas, ignoradas)
_CELULA_RE = re.compile('^[A-Z]{1,3}[1-9][0-9]{0,6}$')

def _celula_valida(celula):
    return isinstance(celula, str) and bool(_CELULA_RE.match(celula))

def _editar_unidades(unidades, edicoes, reescrever, apagar):
    por_id = {u.id: u for u in unidades}
    aplicadas, ignoradas, a_apagar = ([], [], [])
    for e in edicoes:
        u = por_id.get(_normalizar_id(e.get('id'))) if isinstance(e, dict) else None
        if u is None:
            ignoradas.append(e)
        elif e.get('apagar'):
            a_apagar.append(u.paragrafo)
            aplicadas.append(e)
        elif isinstance(e.get('texto'), str):
            reescrever(u.paragrafo, e['texto'][:MAX_CONTEUDO_CHARS])
            aplicadas.append(e)
        else:
            ignoradas.append(e)
    apagar(a_apagar)
    return (aplicadas, ignoradas)
_R_ID = '{%s}id' % _NS_REL_DOC
_W_LIGACAO = _w('hyperlink')
_A_CLIQUE = '{%s}hlinkClick' % _NS_A
_TIPO_LIGACAO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'
_TIPO_ESTILOS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles'
_EMAIL_RE = re.compile('^[^@\\s<>"]+@[^@\\s<>"]+\\.[^@\\s<>".]+$')
_MIN_ORIGINAL_NA_LIGACAO = 3
_TROCAR_LIGACAO, _SOLTAR_LIGACAO = ('trocar', 'soltar')

def _endereco_valido(destino):
    if not destino or len(destino) > 2000 or any((ch.isspace() or ch in '<>"' for ch in destino)):
        return False
    baixo = destino.lower()
    if baixo.startswith('mailto:'):
        return bool(_EMAIL_RE.match(destino[len('mailto:'):].split('?', 1)[0]))
    if baixo.startswith(('http://', 'https://')):
        return bool(urlsplit(destino).netloc)
    return False

def _trocar_no_endereco(alvo, pares):
    baixo = alvo.lower()
    trocas = []
    for original, novo in sorted(pares, key=lambda x: -len(x[0])):
        procura = original.lower()
        i = baixo.find(procura)
        while i >= 0:
            fim = i + len(procura)
            if all((fim <= a or b <= i for a, b, _n in trocas)):
                trocas.append((i, fim, novo))
                i = baixo.find(procura, fim)
            else:
                i = baixo.find(procura, i + 1)
    return _aplicar_trocas(alvo, sorted(trocas, key=lambda t: t[0])) if trocas else None

def _destino_da_ligacao(alvo, antes, depois, pares, ao_preencher):
    antes, depois = (antes.strip(), depois.strip())
    if not depois:
        return (_SOLTAR_LIGACAO, None)
    if not ao_preencher and antes and (antes in depois):
        return (None, None)
    alvo = alvo or ''
    novo_alvo = _trocar_no_endereco(alvo, [(antes, depois)]) if len(antes) >= _MIN_ORIGINAL_NA_LIGACAO else None
    if novo_alvo is None:
        dentro = [(o, n) for o, n in pares if len(o) >= _MIN_ORIGINAL_NA_LIGACAO and o in antes]
        novo_alvo = _trocar_no_endereco(alvo, dentro) if dentro else None
    if novo_alvo is not None:
        return (_TROCAR_LIGACAO, novo_alvo) if _endereco_valido(novo_alvo) else (_SOLTAR_LIGACAO, None)
    return (_SOLTAR_LIGACAO, None) if ao_preencher else (None, None)
_TODOS_OS_R_ID = etree.XPath('//@r:id', namespaces={'r': _NS_REL_DOC})
_TODOS_OS_ID = etree.XPath('//@id')
_TODOS_OS_W_ID = etree.XPath('//@w:id', namespaces={'w': _NS_W})
_NS_W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
_W_MARCAS_COM_ID = frozenset((_w(n) for n in ('ins', 'del', 'moveFrom', 'moveTo')))

def _referencias(raiz, rid):
    return sum((1 for v in _TODOS_OS_R_ID(raiz) if v == rid))

def _largar_relacao(parte, rid):
    if rid in parte.rels and _referencias(parte._element, rid) == 0:
        parte.rels.pop(rid)

def _largar_ligacoes_sem_uso(parte):
    raiz = getattr(parte, '_element', None)
    if raiz is None:
        return
    usadas = set(_TODOS_OS_R_ID(raiz))
    for rid, rel in list(parte.rels.items()):
        if rel.is_external and rel.reltype == _TIPO_LIGACAO and (rid not in usadas):
            parte.rels.pop(rid)
_W_CAMPO_SIMPLES = _w('fldSimple')
_W_MARCA_DE_CAMPO = _w('fldChar')

def _soltar_dos_dados_ligados(r):
    for sdt in r.iterancestors(_W_SDT):
        propriedades = sdt.find(_W_SDT_PR)
        if propriedades is None:
            continue
        for ligacao in [f for f in propriedades if isinstance(f.tag, str) and etree.QName(f).localname == 'dataBinding']:
            propriedades.remove(ligacao)

def _tirar_texto_de_exemplo(r):
    _soltar_dos_dados_ligados(r)
    dentro = False
    for sdt in r.iterancestors(_W_SDT):
        dentro = True
        propriedades = sdt.find(_W_SDT_PR)
        if propriedades is not None:
            for marca in propriedades.findall(_w('showingPlcHdr')):
                propriedades.remove(marca)
    propriedades = r.find(_w('rPr')) if dentro else None
    estilo = propriedades.find(_w('rStyle')) if propriedades is not None else None
    if estilo is not None and estilo.get(_w('val')) == 'PlaceholderText':
        propriedades.remove(estilo)

def _mudar_docx(p, novos_de, final, ao_preencher=False, pares=(), manter_campos=False):
    trechos = _trechos_docx(p)
    if not trechos:
        if final:
            p.add_run(final)
        return
    ligacoes = _ligacoes_docx(trechos)
    em_campos = _trechos_em_campos(p._p) if manter_campos else set()
    mudados = []
    for run, novo in zip(trechos, novos_de([r.text for r in trechos])):
        if run.text == novo or id(run._r) in em_campos:
            continue
        run.text = novo
        if novo:
            _tirar_texto_de_exemplo(run._r)
        else:
            _soltar_dos_dados_ligados(run._r)
        mudados.append(run._r)
    if ligacoes and mudados:
        _acertar_ligacoes_docx(p, ligacoes, ao_preencher, pares)
    if ao_preencher and mudados:
        _fixar_campos(p._p, mudados)

def _trechos_em_campos(p_el):
    if next(p_el.iter(_W_CAMPO_SIMPLES, _W_MARCA_DE_CAMPO), None) is None:
        return set()
    ids = {id(r) for campo in p_el.iter(_W_CAMPO_SIMPLES) for r in campo.iter(_W_R)}
    for campo in _campos_complexos(p_el):
        ids.update((id(r) for parte in ('controlo', 'instrucao', 'resultado') for r in campo[parte]))
    return ids

def _ligacoes_docx(trechos):
    por_ligacao = {}
    for run in trechos:
        ligacao = next(run._r.iterancestors(_W_LIGACAO), None)
        if ligacao is not None and ligacao.get(_R_ID):
            por_ligacao.setdefault(ligacao, []).append(run)
    return [(ligacao, runs, ''.join((r.text for r in runs))) for ligacao, runs in por_ligacao.items()]

def _acertar_ligacoes_docx(p, ligacoes, ao_preencher, pares):
    for ligacao, runs, antes in ligacoes:
        depois = ''.join((r.text for r in runs))
        if depois == antes:
            continue
        parte, rid = (p.part, ligacao.get(_R_ID))
        rel = parte.rels.get(rid)
        if rel is None or not rel.is_external:
            continue
        acao, destino = _destino_da_ligacao(rel.target_ref, antes, depois, pares, ao_preencher)
        if acao == _TROCAR_LIGACAO:
            ligacao.set(_R_ID, parte.relate_to(destino, _TIPO_LIGACAO, is_external=True))
        elif acao == _SOLTAR_LIGACAO:
            _soltar_ligacao_docx(ligacao, parte)
        else:
            continue
        _largar_relacao(parte, rid)

def _estilos_de_ligacao(parte):
    ids = {'Hyperlink', 'FollowedHyperlink'}
    try:
        estilos = parte.package.main_document_part.part_related_by(_TIPO_ESTILOS)._element
    except (AttributeError, KeyError, ValueError):
        return ids
    for estilo in estilos.iterfind(_w('style')):
        nome = estilo.find(_w('name'))
        if nome is not None and (nome.get(_w('val')) or '').replace(' ', '').lower() in ('hyperlink', 'followedhyperlink'):
            ids.add(estilo.get(_w('styleId')))
    return ids

def _soltar_ligacao_docx(ligacao, parte):
    estilos = _estilos_de_ligacao(parte)
    for r in ligacao.iter(_W_R):
        propriedades = r.find(_w('rPr'))
        estilo = propriedades.find(_w('rStyle')) if propriedades is not None else None
        if estilo is not None and estilo.get(_w('val')) in estilos:
            propriedades.remove(estilo)
    _desembrulhar(ligacao)

def _desembrulhar(el):
    for filho in list(el):
        el.addprevious(filho)
    _tirar(el)

def _tirar(el):
    pai = el.getparent()
    if pai is not None:
        pai.remove(el)

def _campos_complexos(p_el):
    abertos, fechados = ([], [])
    for r in p_el.iter(_W_R):
        if next(r.iterancestors(_W_P), None) is not p_el:
            continue
        marca = r.find(_W_MARCA_DE_CAMPO)
        tipo = marca.get(_w('fldCharType')) if marca is not None else None
        proprio = abertos[-1] if abertos and tipo in ('separate', 'end') else None
        for campo in abertos:
            if campo is not proprio:
                campo['resultado' if campo['separado'] else 'instrucao'].append(r)
        if tipo == 'begin':
            abertos.append({'controlo': [r], 'instrucao': [], 'resultado': [], 'separado': False})
        elif proprio is not None:
            proprio['controlo'].append(r)
            if tipo == 'separate':
                proprio['separado'] = True
            else:
                fechados.append(abertos.pop())
    return fechados

def _fixar_campos(p_el, mudados):
    for r in mudados:
        for campo in list(r.iterancestors(_W_CAMPO_SIMPLES)):
            _desembrulhar(campo)
    escritos = {id(r) for r in mudados}
    for campo in _campos_complexos(p_el):
        if not any((id(r) in escritos for r in campo['resultado'])):
            continue
        for r in campo['instrucao']:
            _tirar(r)
        for r in campo['controlo']:
            for marca in r.findall(_W_MARCA_DE_CAMPO):
                r.remove(marca)
            if all((f.tag == _w('rPr') for f in r)):
                _tirar(r)

def _espelho_no_recurso(el):
    caixa = next(el.iterancestors(_W_CAIXA), None)
    escolha = next(caixa.iterancestors(_MC_CHOICE), None) if caixa is not None else None
    alternativa = escolha.getparent() if escolha is not None else None
    recurso = alternativa.find(_MC_FALLBACK) if alternativa is not None else None
    if recurso is None:
        return None
    caixas, caixas_recurso = (list(escolha.iter(_W_CAIXA)), list(recurso.iter(_W_CAIXA)))
    i = next((k for k, c in enumerate(caixas) if c is caixa), len(caixas))
    if i >= len(caixas_recurso):
        return None
    paragrafos, paragrafos_recurso = (list(caixa.iter(_W_P)), list(caixas_recurso[i].iter(_W_P)))
    j = next((k for k, x in enumerate(paragrafos) if x is el), len(paragrafos))
    return paragrafos_recurso[j] if j < len(paragrafos_recurso) else None

def _reescrever_docx(p, texto, ao_preencher=False, manter_campos=False):
    _mudar_docx(p, lambda textos: _distribuir(textos, texto), texto, ao_preencher, manter_campos=manter_campos)
    espelho = _espelho_no_recurso(p._p)
    if espelho is not None:
        _mudar_docx(Paragraph(espelho, p._parent), lambda textos: _distribuir(textos, texto), texto, ao_preencher, manter_campos=manter_campos)

def _trocar_docx(p, texto, trocas):
    final = _aplicar_trocas(texto, trocas)
    pares = [(texto[inicio:fim], novo) for inicio, fim, novo in trocas]
    _mudar_docx(p, lambda textos: _trocar_por_posicao(textos, trocas), final, True, pares)
    espelho = _espelho_no_recurso(p._p)
    if espelho is not None:
        irmao = Paragraph(espelho, p._parent)
        if _texto_docx(irmao) == texto:
            _mudar_docx(irmao, lambda textos: _trocar_por_posicao(textos, trocas), final, True, pares)
        else:
            _mudar_docx(irmao, lambda textos: _distribuir(textos, final), final, True, pares)

def _esvaziar_ou_remover_docx(p):
    el = p._p
    pai = el.getparent()
    if pai is None:
        return
    if pai.tag in _W_PRECISAM_DE_PARAGRAFO and len(pai.findall(_W_P)) == 1:
        _mudar_docx(p, lambda textos: [''] * len(textos), '')
        return
    pai.remove(el)

def _apagar_docx(paragrafos):
    planos = [(p, _espelho_no_recurso(p._p)) for p in paragrafos]
    for p, espelho in planos:
        _esvaziar_ou_remover_docx(p)
        if espelho is not None:
            _esvaziar_ou_remover_docx(Paragraph(espelho, p._parent))

def _mudar_pptx(p, novos_de, final, ao_preencher=False, pares=()):
    trechos = _trechos_pptx(p)
    if not any((el.tag == _A_R for el, _t in trechos)):
        p.text = final
        return
    novos = list(novos_de([texto for _el, texto in trechos]))
    trocados = {}
    for i, (el, antigo) in enumerate(trechos):
        if el.tag == _A_FLD and novos[i] != antigo:
            trocados[i] = _campo_para_trecho_pptx(el)
    de_trecho = [i for i, (el, _t) in enumerate(trechos) if el.tag == _A_R or i in trocados]
    inicios, fins = ({}, {})

    def passar(i, texto, para_tras):
        if not texto:
            return
        vizinhos = [j for j in de_trecho if (j < i if para_tras else j > i)]
        if not vizinhos:
            para_tras = not para_tras
            vizinhos = [j for j in de_trecho if (j < i if para_tras else j > i)]
        j = max(vizinhos) if para_tras else min(vizinhos)
        (fins if para_tras else inicios).setdefault(j, []).append(texto)
    for i, (el, _antigo) in enumerate(trechos):
        if el.tag != _A_BR or novos[i] == '\n':
            continue
        if '\n' in novos[i]:
            primeiro, resto = novos[i].split('\n', 1)
            passar(i, primeiro, True)
            passar(i, resto, False)
        else:
            passar(i, novos[i], True)
            p._p.remove(el)
    for i in de_trecho:
        el, antigo = (trocados.get(i, trechos[i][0]), trechos[i][1])
        novo = ''.join(inicios.get(i, [])) + novos[i] + ''.join(fins.get(i, []))
        if novo == antigo and i not in trocados:
            continue
        run = TrechoPptx(el, p)
        pedacos = novo.split('\n')
        run.text = pedacos[0]
        if i not in trocados:
            _acertar_ligacao_pptx(run, antigo, novo, ao_preencher, pares)
        anterior = el
        for pedaco in pedacos[1:]:
            quebra = ElementoPptx('a:br')
            formato = el.find(_A_RPR)
            if formato is not None:
                quebra.append(copy.deepcopy(formato))
            outro = copy.deepcopy(el)
            TrechoPptx(outro, p).text = pedaco
            anterior.addnext(quebra)
            quebra.addnext(outro)
            anterior = outro

def _campo_para_trecho_pptx(campo):
    trecho = ElementoPptx('a:r')
    formato = campo.find(_A_RPR)
    if formato is not None:
        trecho.append(copy.deepcopy(formato))
    trecho.append(ElementoPptx('a:t'))
    campo.addnext(trecho)
    campo.getparent().remove(campo)
    return trecho

def _acertar_ligacao_pptx(run, antes, depois, ao_preencher, pares):
    propriedades = run._r.find('{%s}rPr' % _NS_A)
    clique = propriedades.find(_A_CLIQUE) if propriedades is not None else None
    rid = clique.get(_R_ID) if clique is not None else None
    if not rid:
        return
    parte = run.part
    rel = parte.rels.get(rid)
    if rel is None or not rel.is_external:
        return
    acao, destino = _destino_da_ligacao(rel.target_ref, antes, depois, pares, ao_preencher)
    if acao == _TROCAR_LIGACAO:
        clique.set(_R_ID, parte.relate_to(destino, _TIPO_LIGACAO, is_external=True))
    elif acao == _SOLTAR_LIGACAO:
        propriedades.remove(clique)
    else:
        return
    _largar_relacao(parte, rid)

def _reescrever_pptx(p, texto, ao_preencher=False):
    _mudar_pptx(p, lambda textos: _distribuir(textos, texto), texto, ao_preencher)

def _trocar_pptx(p, texto, trocas):
    pares = [(texto[inicio:fim], novo) for inicio, fim, novo in trocas]
    _mudar_pptx(p, lambda textos: _trocar_por_posicao(textos, trocas), _aplicar_trocas(texto, trocas), True, pares)

def _apagar_pptx(paragrafos):
    for p in paragrafos:
        _reescrever_pptx(p, '')

def _bytes(objeto):
    saida = io.BytesIO()
    objeto.save(saida)
    return saida.getvalue()

def preencher(tipo, dados, substituicoes=(), tabelas=(), titulo=None):
    substituicoes = list(substituicoes or ())
    tabelas = list(tabelas or ())
    if len(substituicoes) > MAX_EDICOES:
        raise ValueError(f'demasiadas substituições (máx. {MAX_EDICOES})')
    novas = sum((len(t['linhas']) for t in tabelas if isinstance(t, dict) and isinstance(t.get('linhas'), list)))
    if novas > MAX_LINHAS_NOVAS:
        raise ValueError(f'demasiadas linhas de tabela (máx. {MAX_LINHAS_NOVAS} por preenchimento)')
    moderno = tipo_moderno(tipo)
    if moderno not in TIPOS_MODERNOS:
        raise ValueError(f'tipo não editável: {tipo}')
    if moderno == 'xlsx' and tabelas:
        raise ValueError('no Excel não há tabelas a repetir: as linhas escrevem-se célula a célula, com substituicoes')
    tipo, dados = _modernizar(tipo, dados)
    if not substituicoes and (not tabelas):
        return (dados, [], [])
    if tipo == 'xlsx':
        return _preencher_xlsx(dados, substituicoes, titulo)
    if tipo == 'docx':
        doc = Document(io.BytesIO(dados))
        aplicadas, ignoradas = _preencher_unidades(_Word, _unidades_docx(doc), substituicoes, tabelas)
        _limpar_rasto_docx(doc, titulo)
        return (_bytes(doc), aplicadas, ignoradas)
    prs = Presentation(io.BytesIO(dados))
    aplicadas, ignoradas = _preencher_unidades(_PowerPoint, _unidades_pptx(prs), substituicoes, tabelas)
    _limpar_rasto_pptx(prs, titulo)
    return (_bytes(prs), aplicadas, ignoradas)
_TIPO_PROPRIEDADES = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties'
_TIPO_PROPRIEDADES_DA_APLICACAO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties'
_PROPRIEDADES_DA_APLICACAO = ('HeadingPairs', 'TitlesOfParts', 'HLinks')
_NS_DC = 'http://purl.org/dc/elements/1.1/'
_PROPRIEDADES_DO_DOCUMENTO = ('title', 'subject', 'keywords', 'description', 'category')
_RELACOES_DE_COMENTARIOS = frozenset({'comments', 'commentsExtended', 'commentsIds', 'commentsExtensible', 'commentAuthors', 'authors'})
_W_MARCAS_DE_COMENTARIO = (_w('commentRangeStart'), _w('commentRangeEnd'), _w('commentReference'))

def _limpar_propriedades_xml(raiz, titulo):
    mudou, com_titulo = (False, False)
    for el in list(raiz):
        if not isinstance(el.tag, str) or etree.QName(el).localname not in _PROPRIEDADES_DO_DOCUMENTO:
            continue
        novo = ''
        if etree.QName(el).localname == 'title':
            com_titulo, novo = (True, (titulo or '')[:MAX_NOME_CHARS])
        if (el.text or '') != novo or len(el):
            for filho in list(el):
                el.remove(filho)
            el.text = novo or None
            mudou = True
    if titulo and (not com_titulo):
        etree.SubElement(raiz, '{%s}title' % _NS_DC).text = titulo[:MAX_NOME_CHARS]
        mudou = True
    return mudou

def _tirar_titulos_das_partes(raiz):
    fora = [el for el in raiz if isinstance(el.tag, str) and etree.QName(el).localname in _PROPRIEDADES_DA_APLICACAO]
    for el in fora:
        raiz.remove(el)
    return bool(fora)

def _aplicacao_sem_rasto(xml):
    raiz = etree.fromstring(xml)
    return _xml(raiz) if _tirar_titulos_das_partes(raiz) else None

def _limpar_propriedades(pacote, titulo):
    try:
        parte = pacote.part_related_by(_TIPO_PROPRIEDADES)
    except (KeyError, ValueError):
        parte = None
    raiz = getattr(parte, '_element', None)
    if raiz is not None:
        _limpar_propriedades_xml(raiz, titulo)
    try:
        aplicacao = pacote.part_related_by(_TIPO_PROPRIEDADES_DA_APLICACAO)
    except (KeyError, ValueError):
        return
    raiz = getattr(aplicacao, '_element', None)
    if raiz is not None:
        _tirar_titulos_das_partes(raiz)
        return
    novo = _aplicacao_sem_rasto(aplicacao.blob) if aplicacao.blob else None
    if novo is not None:
        aplicacao._blob = novo

def _largar_relacoes_de_comentarios(parte):
    raiz = getattr(parte, '_element', None)
    for rid, rel in list(parte.rels.items()):
        if rel.reltype.rsplit('/', 1)[-1] in _RELACOES_DE_COMENTARIOS:
            parte.rels.pop(rid)
            if raiz is not None:
                _tirar_referencias(raiz, rid)

def _tirar_referencias(raiz, rid):
    for el in [e for e in raiz.iter() if isinstance(e.tag, str) and e.get(_R_ID) == rid]:
        pai = el.getparent()
        while pai is not None:
            pai.remove(el)
            if len(pai) or etree.QName(pai).localname not in ('ext', 'extLst'):
                break
            el, pai = (pai, pai.getparent())

def _esvaziar_parte_escondida(parte):
    raiz = parte.element
    for filho in list(raiz):
        raiz.remove(filho)
    raiz.append(ElementoWord('w:p'))
    for rid in list(parte.rels):
        parte.rels.pop(rid)

def _limpar_rasto_docx(doc, titulo):
    pacote = doc.part.package
    for parte in _partes_de_cabecalhos_e_rodapes(doc)[2]:
        _esvaziar_parte_escondida(parte)
    for parte in list(pacote.iter_parts()):
        raiz = getattr(parte, '_element', None)
        if raiz is None:
            continue
        for marca in list(raiz.iter(*_W_MARCAS_DE_COMENTARIO)):
            r = marca.getparent()
            _tirar(marca)
            if r is not None and r.tag == _W_R and all((f.tag == _w('rPr') for f in r)):
                _tirar(r)
        _largar_ligacoes_sem_uso(parte)
    _largar_relacoes_de_comentarios(doc.part)
    _limpar_propriedades(pacote, titulo)

def _limpar_rasto_pptx(prs, titulo):
    for slide in prs.slides:
        if slide.has_notes_slide:
            notas = slide.notes_slide.notes_text_frame
            if notas is not None and notas.text:
                notas.text = ''
    pacote = prs.part.package
    for parte in list(pacote.iter_parts()):
        _largar_relacoes_de_comentarios(parte)
        _largar_ligacoes_sem_uso(parte)
    _limpar_propriedades(pacote, titulo)

def numero_para_texto(valor):
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    if isinstance(valor, int):
        return str(valor)
    if not math.isfinite(valor):
        return None
    if valor.is_integer():
        return str(int(valor))
    texto = repr(valor)
    if 'e' in texto:
        texto = format(valor, '.15f').rstrip('0').rstrip('.')
    return texto.replace('.', ',')

def _como_texto(valor):
    if valor is None:
        return ''
    if isinstance(valor, str):
        return valor
    return numero_para_texto(valor)
_ESPACOS_COMO_ESPACO = str.maketrans({'\xa0': ' ', '\u202f': ' ', '\u2007': ' ', '\u2009': ' '})

def trecho_no_texto(texto, original):
    if not isinstance(texto, str) or not isinstance(original, str) or (not original):
        return None
    i = texto.translate(_ESPACOS_COMO_ESPACO).find(original.translate(_ESPACOS_COMO_ESPACO))
    return texto[i:i + len(original)] if i >= 0 else None

def _planear_trocas(texto, pedidos):
    inteiros = [x for x in pedidos if not x[2]]
    parciais = [x for x in pedidos if x[2]]
    if inteiros:
        ordem, pedido, _original, novo = inteiros[-1]
        falhados = [(o, p, MOTIVO_REPETIDO) for o, p, _a, _n in inteiros[:-1]]
        falhados += [(o, p, MOTIVO_REESCRITO) for o, p, _a, _n in parciais]
        return (('inteiro', novo), [(ordem, pedido)], falhados)
    trocas, feitos, falhados = ([], [], [])
    onde = texto.translate(_ESPACOS_COMO_ESPACO)
    for ordem, pedido, original, novo in sorted(parciais, key=lambda x: -len(x[2])):
        achou = False
        procura = original.translate(_ESPACOS_COMO_ESPACO)
        i = onde.find(procura)
        while i >= 0:
            fim = i + len(procura)
            if all((fim <= a or b <= i for a, b, _n in trocas)):
                trocas.append((i, fim, novo))
                achou = True
                i = onde.find(procura, fim)
            else:
                i = onde.find(procura, i + 1)
        if achou:
            feitos.append((ordem, pedido))
        else:
            falhados.append((ordem, pedido, MOTIVO_ORIGINAL))
    return (('trocas', sorted(trocas, key=lambda t: t[0])), feitos, falhados)

class _Word:
    texto = staticmethod(_texto_docx)
    trocar = staticmethod(_trocar_docx)

    @staticmethod
    def reescrever(p, texto, sem_valor=False):
        _reescrever_docx(p, texto, ao_preencher=True, manter_campos=sem_valor)

    @staticmethod
    def linha(el):
        return next(el.iterancestors(_W_TR), None)

    @staticmethod
    def tabela(tr):
        return next(tr.iterancestors(_W_TBL), None)
    linhas = staticmethod(_linhas_da_tabela_docx)
    paragrafos = staticmethod(_paragrafos_de)

    @staticmethod
    def paragrafo(el, modelo):
        return Paragraph(el, modelo._parent)

    @staticmethod
    def celula(el):
        pai = el.getparent()
        return pai if pai is not None and pai.tag == _W_TC else None

    @staticmethod
    def ids_livres(modelo):
        maior, maior_w = (0, 0)
        for parte in modelo.part.package.iter_parts():
            raiz = getattr(parte, 'element', None)
            if raiz is None:
                continue
            maior = max([maior] + [int(v) for v in _TODOS_OS_ID(raiz) if v.isdigit()])
            maior_w = max([maior_w] + [int(v) for v in _TODOS_OS_W_ID(raiz) if v.isdigit()])
        return {'id': maior + 1, 'w:id': maior_w + 1}

    @staticmethod
    def preparar_copia(tr, ids):
        for marca in list(tr.iter(_w('bookmarkStart'), _w('bookmarkEnd'))):
            marca.getparent().remove(marca)
        for propriedades in tr.iter(_W_SDT_PR):
            for ident in propriedades.findall(_w('id')):
                propriedades.remove(ident)
        for el in tr.iter():
            if not isinstance(el.tag, str):
                continue
            if etree.QName(el).localname in ('docPr', 'cNvPr') and el.get('id') is not None:
                el.set('id', str(ids['id']))
                ids['id'] += 1
            elif el.tag in _W_MARCAS_COM_ID and el.get(_w('id')) is not None:
                el.set(_w('id'), str(ids['w:id']))
                ids['w:id'] += 1
            for atributo in ('paraId', 'textId'):
                el.attrib.pop('{%s}%s' % (_NS_W14, atributo), None)

    @staticmethod
    def ajustar(tbl):
        pass

class _PowerPoint:
    texto = staticmethod(_texto_paragrafo_pptx)
    trocar = staticmethod(_trocar_pptx)

    @staticmethod
    def reescrever(p, texto, sem_valor=False):
        _reescrever_pptx(p, texto, ao_preencher=True)

    @staticmethod
    def linha(el):
        return next(el.iterancestors(_A_TR), None)

    @staticmethod
    def tabela(tr):
        return next(tr.iterancestors(_A_TBL), None)

    @staticmethod
    def linhas(tbl):
        return tbl.findall(_A_TR)

    @staticmethod
    def paragrafos(tr):
        return list(tr.iter(_A_P))

    @staticmethod
    def paragrafo(el, modelo):
        return ParagrafoPptx(el, modelo._parent)

    @staticmethod
    def celula(el):
        pai = el.getparent()
        avo = pai.getparent() if pai is not None else None
        return avo if avo is not None and avo.tag == _A_TC else None

    @staticmethod
    def ids_livres(modelo):
        return None

    @staticmethod
    def preparar_copia(tr, ids):
        for extensao in tr.findall('{%s}extLst' % _NS_A):
            tr.remove(extensao)

    @staticmethod
    def ajustar(tbl):
        moldura = next(tbl.iterancestors('{%s}graphicFrame' % _NS_PML), None)
        medida = moldura.find('{%s}xfrm/{%s}ext' % (_NS_PML, _NS_A)) if moldura is not None else None
        alturas = [int(tr.get('h') or 0) for tr in tbl.findall(_A_TR)]
        if medida is not None and alturas and all(alturas):
            medida.set('cy', str(sum(alturas)))

def _preencher_unidades(fmt, unidades, substituicoes, tabelas):
    por_id = {u.id: u for u in unidades}
    id_do_elemento = {u.elemento: u.id for u in unidades}
    ignoradas = []
    por_unidade = {}
    for ordem, s in enumerate(substituicoes):
        if not isinstance(s, dict):
            ignoradas.append({'motivo': MOTIVO_INVALIDO})
            continue
        u = por_id.get(_normalizar_id(s.get('id')))
        novo, original = (_como_texto(s.get('novo')), s.get('original'))
        if u is None:
            ignoradas.append({'id': s.get('id'), 'motivo': MOTIVO_ID})
        elif novo is None or not (original is None or isinstance(original, str)):
            ignoradas.append({'id': s.get('id'), 'motivo': MOTIVO_VALOR})
        else:
            por_unidade.setdefault(u.id, []).append((ordem, s, original or '', novo[:MAX_CONTEUDO_CHARS]))
    planos, usadas = ([], set())
    for t in tabelas:
        plano, motivos = _plano_da_tabela(fmt, t, por_id, id_do_elemento, usadas)
        ignoradas.extend(motivos)
        if plano:
            planos.append(plano)
    feitas = []
    for ident, pedidos in por_unidade.items():
        p = por_id[ident].paragrafo
        texto = fmt.texto(p)
        (modo, valor), feitos, falhados = _planear_trocas(texto, pedidos)
        if modo == 'inteiro':
            fmt.reescrever(p, valor)
        elif valor:
            fmt.trocar(p, texto, valor)
        feitas.extend(feitos)
        ignoradas.extend(({'id': s.get('id'), 'motivo': motivo} for _o, s, motivo in falhados))
    for plano in planos:
        _aplicar_tabela(fmt, plano)
    aplicadas = [s for _o, s in sorted(feitas, key=lambda x: x[0])]
    return (aplicadas + [plano['pedido'] for plano in planos], ignoradas)

def _plano_da_tabela(fmt, t, por_id, id_do_elemento, usadas):
    if not isinstance(t, dict):
        return (None, [{'motivo': MOTIVO_INVALIDO}])
    ident = t.get('linha')
    u = por_id.get(_normalizar_id(ident))
    if u is None:
        return (None, [{'id': ident, 'motivo': MOTIVO_ID}])
    tr = fmt.linha(u.elemento)
    if tr is None:
        return (None, [{'id': ident, 'motivo': MOTIVO_SEM_TABELA}])
    if tr in usadas:
        return (None, [{'id': ident, 'motivo': MOTIVO_LINHA_USADA}])
    linhas, exemplos = (t.get('linhas') or [], t.get('exemplos') or [])
    if not isinstance(linhas, list) or not isinstance(exemplos, list):
        return (None, [{'id': ident, 'motivo': MOTIVO_INVALIDO}])
    tbl = fmt.tabela(tr)
    colunas = {}
    for i, el in enumerate(fmt.paragrafos(tr)):
        if el in id_do_elemento:
            colunas[id_do_elemento[el]] = i
    motivos, remover = ([], [tr])
    for x in exemplos:
        ue = por_id.get(_normalizar_id(x))
        linha_exemplo = fmt.linha(ue.elemento) if ue is not None else None
        if ue is None:
            motivos.append({'id': x, 'motivo': MOTIVO_ID})
        elif linha_exemplo is None or fmt.tabela(linha_exemplo) is not tbl:
            motivos.append({'id': x, 'motivo': MOTIVO_OUTRA_TABELA})
        elif linha_exemplo in usadas:
            motivos.append({'id': x, 'motivo': MOTIVO_LINHA_USADA})
        elif all((linha_exemplo is not r for r in remover)):
            remover.append(linha_exemplo)
    valores, desconhecidas = ([], [])
    for linha in linhas:
        if not isinstance(linha, dict):
            motivos.append({'id': ident, 'motivo': MOTIVO_INVALIDO})
            continue
        celulas = {}
        for chave, valor in linha.items():
            coluna = colunas.get(_normalizar_id(chave))
            texto = _como_texto(valor)
            if coluna is None:
                if chave not in desconhecidas:
                    desconhecidas.append(chave)
            elif texto is None:
                motivos.append({'id': chave, 'motivo': MOTIVO_VALOR})
            else:
                celulas[coluna] = texto[:MAX_CONTEUDO_CHARS]
        valores.append(celulas)
    motivos += [{'id': chave, 'motivo': MOTIVO_NAO_E_COLUNA} for chave in desconhecidas]
    usadas.update(remover)
    return ({'pedido': t, 'modelo': u.paragrafo, 'linha': tr, 'tabela': tbl, 'remover': remover, 'valores': valores}, motivos)

def _aplicar_tabela(fmt, plano):
    tr, modelo, remover = (plano['linha'], plano['modelo'], plano['remover'])
    com_texto = [bool(fmt.texto(fmt.paragrafo(el, modelo)).strip()) for el in fmt.paragrafos(tr)]
    ids = fmt.ids_livres(modelo)
    for celulas in plano['valores']:
        copia = copy.deepcopy(tr)
        tr.addprevious(copia)
        fmt.preparar_copia(copia, ids)
        paragrafos = fmt.paragrafos(copia)
        for i, el in enumerate(paragrafos):
            fmt.reescrever(fmt.paragrafo(el, modelo), celulas.get(i, ''), sem_valor=i not in celulas)
        _tirar_paragrafos_sem_valor(fmt, paragrafos, celulas, com_texto)
    if all((any((r is x for x in remover)) for r in fmt.linhas(plano['tabela']))):
        for el in fmt.paragrafos(tr):
            fmt.reescrever(fmt.paragrafo(el, modelo), '')
        remover = [r for r in remover if r is not tr]
    for r in remover:
        pai = r.getparent()
        if pai is not None:
            pai.remove(r)
    fmt.ajustar(plano['tabela'])

def _tirar_paragrafos_sem_valor(fmt, paragrafos, celulas, com_texto):
    por_celula = {}
    for i, el in enumerate(paragrafos):
        celula = fmt.celula(el)
        if celula is not None:
            por_celula.setdefault(celula, []).append(i)
    for indices in por_celula.values():
        if not any((celulas.get(i, '').strip() for i in indices)):
            continue
        for i in indices:
            if com_texto[i] and (not celulas.get(i, '').strip()):
                _tirar(paragrafos[i])
_NUMERO_PT_RE = re.compile('^-?(?:0|[1-9]\\d{0,2}(?:\\.\\d{3})+|[1-9]\\d*)(?:,\\d+)?$')
_NUMERO_PONTO_RE = re.compile('^-?(?:0|[1-9]\\d*)\\.\\d+$')
_PERCENTAGEM_RE = re.compile('^(.+?)\\s*%$')
_MAX_ALGARISMOS_EM_CELULA_VAZIA = 6

def _numero(texto):
    t = texto.strip()
    negativo = t[:1] in ('-', '−')
    if negativo:
        t = t[1:].strip()
    for marca in ('€', 'EUR'):
        if t.endswith(marca):
            t = t[:-len(marca)].strip()
        elif t.startswith(marca):
            t = t[len(marca):].strip()
    if any((ch in t for ch in _ESPACOS_MILHARES)):
        if not _NUMERO_COM_ESPACOS_RE.match(t):
            return None
        t = ''.join((ch for ch in t if ch not in _ESPACOS_MILHARES))
    if _NUMERO_PT_RE.match(t):
        t = t.replace('.', '').replace(',', '.')
    elif not _NUMERO_PONTO_RE.match(t):
        return None
    if sum((ch.isdigit() for ch in t)) > 15:
        return None
    valor = float(t) if '.' in t else int(t)
    return -valor if negativo else valor

def _valor_da_escrita(novo, atual, formato=None, epoca=WINDOWS_EPOCH):
    if novo is None or novo == '':
        return None
    if not isinstance(novo, str):
        return novo
    if isinstance(atual, (int, float)) and (not isinstance(atual, bool)):
        texto = novo.strip()
        if formato and is_date_format(formato):
            data = _data(texto)
            if data:
                return to_excel(data[0], epoca)
        percentagem = _PERCENTAGEM_RE.match(texto) if formato and '%' in formato else None
        numero = _numero(percentagem.group(1)) if percentagem else None
        if numero is not None:
            return numero / 100
        numero = _numero(texto)
        return novo if numero is None else numero
    if atual is None:
        numero = _numero(novo)
        if numero is not None and (',' in novo or '€' in novo or 'EUR' in novo or (sum((ch.isdigit() for ch in novo)) <= _MAX_ALGARISMOS_EM_CELULA_VAZIA)):
            return numero
    return novo

def _caminho_da_relacao(zf, fim):
    rels = etree.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    caminho = None
    for r in rels:
        if (r.get('Type') or '').endswith(fim):
            destino = r.get('Target') or ''
            caminho = destino.lstrip('/') if destino.startswith('/') else 'xl/' + destino
    return caminho if caminho and caminho in zf.namelist() else None

def _formatos_do_livro(zf):
    caminho = _caminho_da_relacao(zf, '/styles')
    if not caminho:
        return []
    ns = '{%s}' % _NS_SS
    raiz = etree.fromstring(zf.read(caminho))
    proprios = {f.get('numFmtId'): f.get('formatCode') for f in raiz.iter(ns + 'numFmt')}
    estilos = raiz.find(ns + 'cellXfs')
    saida = []
    for xf in estilos.findall(ns + 'xf') if estilos is not None else ():
        ident = xf.get('numFmtId') or '0'
        saida.append(proprios.get(ident) or BUILTIN_FORMATS.get(int(ident) if ident.isdigit() else 0, 'General'))
    return saida

def _formato_da_celula(c, zf, cache):
    if 'formatos' not in cache:
        cache['formatos'] = _formatos_do_livro(zf)
    estilo = c.get('s') if c is not None else None
    try:
        return cache['formatos'][int(estilo)] if estilo else 'General'
    except (ValueError, IndexError):
        return 'General'

def _epoca_do_livro(zf, cache):
    if 'epoca' not in cache:
        propriedades = etree.fromstring(zf.read('xl/workbook.xml')).find('{%s}workbookPr' % _NS_SS)
        de_1904 = propriedades is not None and (propriedades.get('date1904') or '').lower() in ('1', 'true')
        cache['epoca'] = MAC_EPOCH if de_1904 else WINDOWS_EPOCH
    return cache['epoca']

def _textos_partilhados(zf):
    caminho = _caminho_dos_partilhados(zf)
    if not caminho:
        return []
    ns = '{%s}' % _NS_SS
    return [_texto_de_si(si, ns) for si in etree.fromstring(zf.read(caminho)).findall(ns + 'si')]

def _texto_de_si(el, ns):
    return ''.join((t.text or '' for t in el.iter(ns + 't') if t.getparent().tag != ns + 'rPh'))

def _celula_do_xml(raiz, ref):
    ns = '{%s}' % _NS_SS
    dados = raiz.find(ns + 'sheetData')
    linha = _REF_RE.match(ref).group(2)
    for fila in dados.findall(ns + 'row') if dados is not None else ():
        if fila.get('r') == linha:
            return next((c for c in fila.findall(ns + 'c') if c.get('r') == ref), None)
    return None

def _conteudo_da_celula(c, zf, cache):
    if c is None:
        return (None, False)
    ns = '{%s}' % _NS_SS
    formula = c.find(ns + 'f') is not None
    tipo = c.get('t')
    if tipo == 'inlineStr':
        caixa = c.find(ns + 'is')
        return (_texto_de_si(caixa, ns) if caixa is not None else '', formula)
    v = c.find(ns + 'v')
    if v is None or v.text is None:
        return (None, formula)
    if tipo == 's':
        if 'partilhados' not in cache:
            cache['partilhados'] = _textos_partilhados(zf)
        try:
            return (cache['partilhados'][int(v.text)], formula)
        except (ValueError, IndexError):
            return ('', formula)
    if tipo in ('str', 'e'):
        return (v.text, formula)
    if tipo == 'b':
        return (v.text.strip() in ('1', 'true'), formula)
    try:
        return (float(v.text), formula)
    except ValueError:
        return (v.text, formula)

def _preencher_xlsx(dados, substituicoes, titulo=None):
    entrada = zipfile.ZipFile(io.BytesIO(dados))
    nomes = set(entrada.namelist())
    folhas = _folhas_do_pacote(entrada)
    ignoradas, grupos = ([], {})
    for ordem, s in enumerate(substituicoes):
        if not isinstance(s, dict):
            ignoradas.append({'motivo': MOTIVO_INVALIDO})
            continue
        folha, celula = (s.get('folha'), s.get('celula'))
        onde = {'folha': folha, 'celula': celula}
        caminho = folhas.get(folha) if isinstance(folha, str) else None
        novo, original = (s.get('novo'), s.get('original'))
        if not caminho or caminho not in nomes:
            ignoradas.append({**onde, 'motivo': MOTIVO_FOLHA})
        elif not _celula_valida(celula):
            ignoradas.append({**onde, 'motivo': MOTIVO_CELULA})
        elif not (novo is None or isinstance(novo, (str, int, float))) or not (original is None or isinstance(original, str)):
            ignoradas.append({**onde, 'motivo': MOTIVO_VALOR})
        else:
            grupos.setdefault((folha, celula), []).append((ordem, s, original or '', novo))
    edicoes, feitas, raizes, cache, pares = ([], [], {}, {}, {})
    for (folha, celula), pedidos in grupos.items():
        onde = {'folha': folha, 'celula': celula}
        caminho = folhas[folha]
        if caminho not in raizes:
            raizes[caminho] = etree.fromstring(entrada.read(caminho))
        celula_xml = _celula_do_xml(raizes[caminho], celula)
        atual, formula = _conteudo_da_celula(celula_xml, entrada, cache)
        if formula:
            ignoradas.extend(({**onde, 'motivo': MOTIVO_FORMULA} for _p in pedidos))
            continue
        if isinstance(atual, str) and atual:
            texto_pedidos = [(o, s, orig, _como_texto(novo) or '' if orig else novo) for o, s, orig, novo in pedidos]
            (modo, plano), feitos, falhados = _planear_trocas(atual, texto_pedidos)
        else:
            (modo, plano), feitos, falhados = _planear_trocas('', [(o, s, '', novo) for o, s, _orig, novo in pedidos])
        ignoradas.extend(({**onde, 'motivo': motivo} for _o, _s, motivo in falhados))
        if not feitos:
            continue
        if modo == 'inteiro':
            valor = _valor_da_escrita(plano, atual, _formato_da_celula(celula_xml, entrada, cache), _epoca_do_livro(entrada, cache))
        else:
            valor = _aplicar_trocas(atual, plano)
            pares[folha, celula] = [(atual[inicio:fim], novo) for inicio, fim, novo in plano]
        edicoes.append({'folha': folha, 'celula': celula, 'valor': valor})
        feitas.extend(feitos)
    aplicadas = [s for _o, s in sorted(feitas, key=lambda x: x[0])]
    if not edicoes:
        return (dados, aplicadas, ignoradas)
    novo_pacote, _aplicadas, _ignoradas = _editar_xlsx_no_pacote(dados, edicoes, {'pares': pares, 'titulo': titulo})
    return (novo_pacote, aplicadas, ignoradas)

def gerar(formato, conteudo=None, linhas=None, titulo=None, maximo=MAX_CONTEUDO_CHARS, calculadas=None, totais=None, rotulo_total=None):
    if formato not in FORMATOS_GERAVEIS:
        raise ValueError(f'formato não suportado: {formato}')
    if calculadas or totais:
        return gerar_tabela(formato, conteudo, linhas, titulo, calculadas, totais, rotulo_total, maximo)[0]
    titulo = _titulo_limpo(titulo)
    conteudo = conteudo or ''
    if maximo:
        conteudo = conteudo[:maximo]
    linhas = _linhas_validas(linhas)
    if formato in ('csv', 'xlsx'):
        linhas = _linhas_limpas(linhas)
    if formato in ('csv', 'xlsx') and (not linhas):
        linhas = _tabela_do_markdown(conteudo)
        if not linhas:
            raise ValueError('csv/xlsx precisam de `rows` (lista de linhas) ou de uma tabela em Markdown')
    if formato == 'csv':
        saida = io.StringIO()
        csv.writer(saida, delimiter=';', lineterminator='\n').writerows(linhas)
        return saida.getvalue().encode('utf-8-sig')
    if formato == 'xlsx':
        return _gerar_xlsx(linhas, titulo)
    if not conteudo.strip() and linhas:
        conteudo = _markdown_da_tabela(linhas)
    if formato in ('txt', 'md'):
        return conteudo.encode('utf-8')
    blocos = analisar_markdown(conteudo)
    if formato == 'docx':
        return _gerar_docx(blocos)
    if formato == 'pptx':
        return _gerar_pptx(blocos, titulo)
    return _gerar_html(blocos, titulo).encode('utf-8')

def _linhas_validas(linhas):
    if not isinstance(linhas, list):
        return []
    saida = []
    for fila in linhas[:MAX_LINHAS]:
        if not isinstance(fila, list):
            continue
        saida.append([_valor_json(v) for v in fila[:MAX_COLUNAS]])
    return saida

def _gerar_xlsx(linhas, titulo):
    wb = Workbook()
    ws = wb.active
    ws.title = _nome_da_folha(titulo)
    valores, formatos, enfase, textos = _celulas_tipadas(linhas)
    for fila in valores:
        ws.append(['' if v is None else v for v in fila])
    for linha in ws.iter_rows():
        for celula in linha:
            _quebra_na_celula(celula)
    for (r, c), formato in formatos.items():
        ws.cell(row=r + 1, column=c + 1).number_format = formato
    for (r, c), (negrito, italico) in enfase.items():
        celula = ws.cell(row=r + 1, column=c + 1)
        celula.font = _fonte(celula.font, negrito, italico)
    if linhas:
        for celula in ws[1]:
            celula.font = _fonte(celula.font, True, celula.font.i)
        colunas = max((len(f) for f in linhas))
        for idx in range(colunas):
            largura = max((_largura_do_texto(f[idx]) + (2 if r == 0 else 0) if idx < len(f) else 0 for r, f in enumerate(textos[:200])))
            ws.column_dimensions[get_column_letter(idx + 1)].width = min(60, max(10, largura + 2))
        if len(linhas) > 1:
            ws.freeze_panes = 'A2'
            ws.auto_filter.ref = f'A1:{get_column_letter(colunas)}{len(linhas)}'
    return _bytes(wb)

def _fonte(base, negrito, italico):
    fonte = copy.copy(base)
    fonte.b, fonte.i = (bool(negrito), bool(italico))
    return fonte
_ESPACOS_MILHARES = ' \xa0\u202f\u2009'
_NUMERO_COM_ESPACOS_RE = re.compile('^\\d{1,3}(?:[ \\u00a0\\u202f\\u2009]\\d{3})+(?:[.,]\\d+)?$')
_SO_ALGARISMOS_E_SEPARADORES_RE = re.compile('^\\d+(?:[.,]\\d+)*$')
_NUMERO_POR_DECIMAL = {',': re.compile('^(0|[1-9]\\d{0,2}(?:\\.\\d{3})+|[1-9]\\d*)(?:,(\\d+))?$'), '.': re.compile('^(0|[1-9]\\d{0,2}(?:,\\d{3})+|[1-9]\\d*)(?:\\.(\\d+))?$')}
_DATA_DMA_RE = re.compile('^(\\d{1,2})([/.-])(\\d{1,2})\\2(\\d{4})(?:[ T](\\d{1,2}):(\\d{2}))?$')
_DATA_ISO_RE = re.compile('^(\\d{4})-(\\d{2})-(\\d{2})(?:[ T](\\d{2}):(\\d{2})(?::\\d{2})?)?$')
_FORMATO_EURO = '#,##0.00 "€"'
_FORMATO_DATA = 'dd/mm/yyyy'
_FORMATO_DATA_HORA = 'dd/mm/yyyy hh:mm'
_MAX_ALGARISMOS_INTEIRO_SIMPLES = 11

def _data(texto):
    m = _DATA_DMA_RE.match(texto)
    if m:
        dia, mes, ano, hora, minuto = (m.group(1), m.group(3), m.group(4), m.group(5), m.group(6))
    else:
        m = _DATA_ISO_RE.match(texto)
        if not m:
            return None
        ano, mes, dia, hora, minuto = m.groups()
    try:
        if hora is None:
            return (datetime.date(int(ano), int(mes), int(dia)), _FORMATO_DATA)
        return (datetime.datetime(int(ano), int(mes), int(dia), int(hora), int(minuto)), _FORMATO_DATA_HORA)
    except ValueError:
        return None

def _numero_bruto(texto):
    t = texto.strip()
    negativo = t[:1] in ('-', '−')
    if negativo:
        t = t[1:].strip()
    euro = False
    for marca in ('€', 'EUR'):
        if t.endswith(marca):
            t, euro = (t[:-len(marca)].strip(), True)
        elif t.startswith(marca):
            t, euro = (t[len(marca):].strip(), True)
    if euro and (not negativo) and (t[:1] in ('-', '−')):
        negativo, t = (True, t[1:].strip())
    com_espacos = any((ch in t for ch in _ESPACOS_MILHARES))
    if com_espacos:
        if not _NUMERO_COM_ESPACOS_RE.match(t):
            return None
        t = ''.join((ch for ch in t if ch not in _ESPACOS_MILHARES))
    if not _SO_ALGARISMOS_E_SEPARADORES_RE.match(t):
        return None
    return (negativo, euro, t, com_espacos)

def _voto_decimal(corpo):
    if ',' in corpo and '.' in corpo:
        return ',' if corpo.rfind(',') > corpo.rfind('.') else '.'
    sep = ',' if ',' in corpo else '.' if '.' in corpo else None
    if sep is None:
        return None
    outro = '.' if sep == ',' else ','
    if corpo.count(sep) > 1:
        return outro
    inteiro, decimais = corpo.split(sep)
    if len(decimais) != 3 or inteiro == '0' or len(inteiro) > 3:
        return sep
    return None

def _decimal_da_coluna(corpos):
    votos = [v for v in map(_voto_decimal, corpos) if v]
    if not votos:
        return None
    return '.' if votos.count('.') > votos.count(',') else ','

def _numero_da_coluna(corpo, decimal, com_espacos):
    if decimal is None:
        decimal = '.' if ',' in corpo else ','
    m = _NUMERO_POR_DECIMAL[decimal].match(corpo)
    if not m:
        return None
    inteiro, decimais = (m.group(1), m.group(2) or '')
    milhares = com_espacos or ('.' if decimal == ',' else ',') in inteiro
    algarismos = inteiro.replace('.', '').replace(',', '')
    if len(algarismos) + len(decimais) > 15:
        return None
    if not milhares and (not decimais) and (len(algarismos) > _MAX_ALGARISMOS_INTEIRO_SIMPLES):
        return None
    valor = float(f'{algarismos}.{decimais}') if decimais else int(algarismos)
    if not milhares and (not decimais):
        return (valor, None)
    formato = ('#,##0' if milhares else '0') + ('.' + '0' * len(decimais) if decimais else '')
    return (valor, formato)

def _enfase_da_celula(texto):
    if not texto.startswith(('*', '_')):
        return None
    trechos = _trechos(texto)
    if len(trechos) != 1:
        return None
    t, negrito, italico, _codigo = trechos[0]
    if not (negrito or italico):
        return None
    return (t, negrito, italico)

def _celulas_tipadas(linhas):
    valores = [list(f) for f in linhas]
    formatos, enfase = ({}, {})
    for r, fila in enumerate(valores):
        for c, v in enumerate(fila):
            if isinstance(v, str) and (not v.startswith('=')):
                marcada = _enfase_da_celula(v.strip())
                if marcada:
                    fila[c] = marcada[0]
                    enfase[r, c] = marcada[1:]
    colunas = max((len(f) for f in valores), default=0)
    for c in range(colunas):
        brutos = {}
        for r in range(1, len(valores)):
            v = valores[r][c] if c < len(valores[r]) else None
            if isinstance(v, str) and v.strip() and (not v.startswith('=')):
                bruto = _numero_bruto(v)
                if bruto and (not _data(v.strip())):
                    brutos[r] = bruto
        decimal = _decimal_da_coluna([b[2] for b in brutos.values()])
        em_euros = any((b[1] for b in brutos.values()))
        for r in range(1, len(valores)):
            if c >= len(valores[r]):
                continue
            v = valores[r][c]
            if isinstance(v, str) and v.strip() and (not v.startswith('=')):
                data = _data(v.strip())
                if data:
                    valores[r][c], formatos[r, c] = data
                    continue
                if r not in brutos:
                    continue
                negativo, euro, corpo, com_espacos = brutos[r]
                lido = _numero_da_coluna(corpo, decimal, com_espacos)
                if lido is None:
                    continue
                valor, formato = lido
                valores[r][c] = -valor if negativo else valor
                if formato:
                    formatos[r, c] = formato
            if em_euros and isinstance(valores[r][c], (int, float)) and (not isinstance(valores[r][c], bool)):
                formatos[r, c] = _FORMATO_EURO
    textos = []
    for r, fila in enumerate(valores):
        linha = []
        for c, v in enumerate(fila):
            if formatos.get((r, c)) == _FORMATO_EURO:
                linha.append(f'{v:,.2f} €')
            elif isinstance(linhas[r][c], str):
                linha.append(fila[c] if isinstance(fila[c], str) else linhas[r][c])
            else:
                linha.append('' if v is None else str(v))
        textos.append(linha)
    return (valores, formatos, enfase, textos)
MAX_CALCULADAS = 10
MAX_FORMULA_CHARS = 300
MAX_NOME_COLUNA_CHARS = 80
MAX_ROTULO_CHARS = 60
ROTULO_TOTAL = 'Total'
ROTULO_SUBTOTAL = 'Subtotal'
_CENTIMO = Decimal('0.01')
_SINAIS_DA_FORMULA = str.maketrans({'−': '-', '–': '-', '—': '-', '×': '*', '÷': '/', '_': ' '})
_NUMERO_DA_FORMULA_RE = re.compile('\\d+(?:[.,]\\d+)?(?: ?%)?')
_PRECEDENCIA = {'+': 1, '-': 1, '*': 2, '/': 2}
_FECHO_DO_NOME = {'[': ']', '«': '»', '"': '"', '“': '”'}
_EUROS_NO_NOME_RE = re.compile('€|\\beur(?:os?)?\\b')
_CASAS_DO_FORMATO_RE = re.compile('\\.(0+)')
_CARATERES_PROIBIDOS_NA_FOLHA_RE = re.compile('[\\\\*?:/\\[\\]]')
_TEXTO = object()

def _nome_da_folha(titulo):
    nome = _CARATERES_PROIBIDOS_NA_FOLHA_RE.sub('-', ' '.join(str(titulo or '').split()))[:31].strip()
    return nome or 'Folha1'

def _quebra_na_celula(celula):
    if isinstance(celula.value, str) and '\n' in celula.value:
        celula.alignment = Alignment(wrap_text=True)

def _largura_do_texto(texto):
    return max((len(linha) for linha in str(texto).split('\n')))

def _chave_coluna(texto):
    texto = unicodedata.normalize('NFKD', str(texto or ''))
    texto = ''.join((c for c in texto if not unicodedata.combining(c))).casefold()
    return ' '.join(texto.translate(_SINAIS_DA_FORMULA).split())

def _lista_de_colunas(colunas):
    return ', '.join((f'«{c}»' for c in colunas if c))

def _isolado(texto, inicio, fim):
    antes = inicio == 0 or not (texto[inicio - 1].isalnum() and texto[inicio].isalnum())
    depois = fim >= len(texto) or not (texto[fim - 1].isalnum() and texto[fim].isalnum())
    return antes and depois

def _numero_na_formula(valor):
    return format(valor.normalize(), 'f')

def _simbolos_da_formula(formula, colunas):
    texto = _chave_coluna(formula)
    if texto.startswith('='):
        texto = texto[1:].lstrip()
    chaves = {}
    for i, nome in enumerate(colunas):
        chave = _chave_coluna(nome)
        if chave:
            chaves[chave] = i if chave not in chaves else None
    por_tamanho = sorted(chaves, key=len, reverse=True)

    def coluna(chave):
        if chave not in chaves:
            raise ValueError(f'«{chave}» não é uma coluna da tabela — as fórmulas usam os nomes do cabeçalho ({_lista_de_colunas(colunas)}), números e os sinais + - * / ( )')
        if chaves[chave] is None:
            raise ValueError(f'há duas colunas chamadas «{chave}»: dá-lhes nomes diferentes')
        return ('col', chaves[chave])
    simbolos, pos = ([], 0)
    while pos < len(texto):
        c = texto[pos]
        if c == ' ':
            pos += 1
            continue
        if c in _FECHO_DO_NOME:
            fim = texto.find(_FECHO_DO_NOME[c], pos + 1)
            if fim < 0:
                raise ValueError(f'falta fechar o «{c}» do nome da coluna')
            simbolos.append(coluna(texto[pos + 1:fim].strip()))
            pos = fim + 1
            continue
        achada = next((k for k in por_tamanho if texto.startswith(k, pos) and _isolado(texto, pos, pos + len(k))), None)
        if achada:
            simbolos.append(coluna(achada))
            pos += len(achada)
            continue
        m = _NUMERO_DA_FORMULA_RE.match(texto, pos)
        if m:
            corpo = m.group().replace(' ', '')
            valor = Decimal(corpo.rstrip('%').replace(',', '.'))
            simbolos.append(('num', valor / 100 if corpo.endswith('%') else valor))
            pos = m.end()
            continue
        if c in '+-*/()':
            simbolos.append((c,))
            pos += 1
            continue
        coluna(re.match('[^+\\-*/()]+', texto[pos:]).group().strip())
    return simbolos

class _LeitorDeFormula:

    def __init__(self, simbolos, colunas):
        self.simbolos, self.colunas, self.pos = (simbolos, colunas, 0)

    def _ver(self):
        return self.simbolos[self.pos][0] if self.pos < len(self.simbolos) else None

    def _mostrar(self, simbolo):
        if simbolo[0] == 'col':
            return self.colunas[simbolo[1]]
        if simbolo[0] == 'num':
            return _numero_na_formula(simbolo[1])
        return simbolo[0]

    def ler(self):
        if not self.simbolos:
            raise ValueError('a fórmula está vazia')
        arvore = self._expressao()
        if self.pos < len(self.simbolos):
            seguinte = self.simbolos[self.pos]
            if seguinte[0] == ')':
                raise ValueError('há um «)» a mais')
            raise ValueError(f'falta um sinal (+ - * /) entre «{self._mostrar(self.simbolos[self.pos - 1])}» e «{self._mostrar(seguinte)}»')
        return arvore

    def _expressao(self):
        no = self._termo()
        while self._ver() in ('+', '-'):
            sinal = self._ver()
            self.pos += 1
            no = (sinal, no, self._termo())
        return no

    def _termo(self):
        no = self._fator()
        while self._ver() in ('*', '/'):
            sinal = self._ver()
            self.pos += 1
            no = (sinal, no, self._fator())
        return no

    def _fator(self):
        simbolo = self._ver()
        if simbolo is None:
            raise ValueError('a fórmula acaba a meio: falta um número ou uma coluna')
        self.pos += 1
        if simbolo in ('-', '+'):
            dentro = self._fator()
            return ('neg', dentro) if simbolo == '-' else dentro
        if simbolo == '(':
            no = self._expressao()
            if self._ver() != ')':
                raise ValueError('falta fechar um parêntese')
            self.pos += 1
            return no
        if simbolo in ('col', 'num'):
            return self.simbolos[self.pos - 1]
        raise ValueError(f'«{simbolo}» fora do sítio')

def _colunas_da_arvore(no):
    if no[0] == 'col':
        return {no[1]}
    if no[0] == 'num':
        return set()
    return set().union(*(_colunas_da_arvore(filho) for filho in no[1:]))

def _tem_divisao(no):
    return no[0] == '/' or (no[0] not in ('col', 'num') and any((_tem_divisao(f) for f in no[1:])))

def _formula_excel(no, letras, linha, pai=0, a_direita=False):
    tipo = no[0]
    if tipo == 'col':
        return f'{letras[no[1]]}{linha}'
    if tipo == 'num':
        return _numero_na_formula(no[1])
    if tipo == 'neg':
        return '-' + _formula_excel(no[1], letras, linha, 3)
    nivel = _PRECEDENCIA[tipo]
    texto = _formula_excel(no[1], letras, linha, nivel) + tipo + _formula_excel(no[2], letras, linha, nivel, tipo in '-/')
    return f'({texto})' if nivel < pai or (nivel == pai and a_direita) else texto

def _avaliar(no, numeros):
    tipo = no[0]
    if tipo == 'col':
        valor = numeros.get(no[1])
        return valor if isinstance(valor, Decimal) else Decimal(0)
    if tipo == 'num':
        return no[1]
    if tipo == 'neg':
        return -_avaliar(no[1], numeros)
    a, b = (_avaliar(no[1], numeros), _avaliar(no[2], numeros))
    if tipo == '+':
        return a + b
    if tipo == '-':
        return a - b
    if tipo == '*':
        return a * b
    return a / b

class Calculo:

    def __init__(self, colunas, formulas, ordem, totais, rotulo_total, rotulo_subtotal):
        self.colunas, self.formulas, self.ordem = (colunas, formulas, ordem)
        self.totais, self.rotulo_total, self.rotulo_subtotal = (totais, rotulo_total, rotulo_subtotal)

    def diretas(self, i):
        return _colunas_da_arvore(self.formulas[i])

    def base_usadas(self, i):
        usadas, vistas, pendentes = (set(), set(), [i])
        while pendentes:
            c = pendentes.pop()
            if c in vistas:
                continue
            vistas.add(c)
            for j in self.diretas(c):
                if j in self.formulas:
                    pendentes.append(j)
                else:
                    usadas.add(j)
        return usadas

    def colunas_numericas(self):
        return set().union(set(), *(self.base_usadas(i) for i in self.formulas))

def _rotulo(valor, omissao):
    texto = ' '.join(str(valor or '').split())[:MAX_ROTULO_CHARS]
    return texto or omissao

def _ordem_de_calculo(formulas, colunas):
    ordem, estado = ([], {})

    def visitar(i, caminho):
        if estado.get(i) == 'feita':
            return
        if estado.get(i) == 'a ver':
            ciclo = caminho[caminho.index(i):] + [i]
            raise ValueError('as colunas calculadas ' + ' → '.join((f'«{colunas[c]}»' for c in ciclo)) + ' dependem umas das outras em círculo')
        estado[i] = 'a ver'
        for j in sorted(_colunas_da_arvore(formulas[i])):
            if j in formulas:
                visitar(j, caminho + [i])
        estado[i] = 'feita'
        ordem.append(i)
    for i in formulas:
        visitar(i, [])
    return ordem

def _como_lista(valor):
    if valor is None or valor == '' or valor == []:
        return []
    return valor if isinstance(valor, list) else [valor]

def preparar_calculo(cabecalho, calculadas=None, totais=None, rotulo_total=None, rotulo_subtotal=None):
    colunas = [' '.join(str('' if c is None else c).split()) for c in cabecalho or []]
    if not any(colunas):
        raise ValueError('a tabela precisa de um cabeçalho com os nomes das colunas (a 1.ª linha)')
    calculadas = _como_lista(calculadas)
    if len(calculadas) > MAX_CALCULADAS:
        raise ValueError(f'no máximo {MAX_CALCULADAS} colunas calculadas')
    pedidas = []
    for item in calculadas:
        if not isinstance(item, dict):
            raise ValueError('cada coluna calculada é um objeto {"column": "Total", "formula": "Quantidade * Preço unitário"}')
        nome = ' '.join(str(item.get('column') or item.get('coluna') or '').split())[:MAX_NOME_COLUNA_CHARS]
        formula = str(item.get('formula') or item.get('fórmula') or '').strip()
        if not nome or not formula:
            raise ValueError('cada coluna calculada precisa do nome ("column") e da fórmula ("formula")')
        if len(formula) > MAX_FORMULA_CHARS:
            raise ValueError(f'a fórmula de «{nome}» passa dos {MAX_FORMULA_CHARS} carateres')
        chave = _chave_coluna(nome)
        indice = next((i for i, c in enumerate(colunas) if _chave_coluna(c) == chave), None)
        if indice is None:
            colunas.append(nome)
            indice = len(colunas) - 1
        elif any((indice == j for j, _f in pedidas)):
            raise ValueError(f'a coluna calculada «{nome}» aparece duas vezes')
        pedidas.append((indice, formula))
    if len(colunas) > MAX_COLUNAS:
        raise ValueError(f'no máximo {MAX_COLUNAS} colunas')
    formulas = {}
    for indice, formula in pedidas:
        try:
            arvore = _LeitorDeFormula(_simbolos_da_formula(formula, colunas), colunas).ler()
        except (ValueError, InvalidOperation) as exc:
            raise ValueError(f'fórmula da coluna «{colunas[indice]}» («{formula}»): {exc}') from None
        usadas = _colunas_da_arvore(arvore)
        if indice in usadas:
            raise ValueError(f'a fórmula da coluna «{colunas[indice]}» usa a própria coluna')
        if not usadas:
            raise ValueError(f'a fórmula da coluna «{colunas[indice]}» não usa nenhuma coluna')
        formulas[indice] = arvore
    ordem = _ordem_de_calculo(formulas, colunas)
    indices_totais = []
    for nome in _como_lista(totais):
        chave = _chave_coluna(nome)
        indice = next((i for i, c in enumerate(colunas) if _chave_coluna(c) == chave), None)
        if indice is None:
            raise ValueError(f'«{nome}» (nos totais) não é uma coluna da tabela: {_lista_de_colunas(colunas)}')
        if indice not in indices_totais:
            indices_totais.append(indice)
    return Calculo(colunas, formulas, ordem, indices_totais, _rotulo(rotulo_total, ROTULO_TOTAL), _rotulo(rotulo_subtotal, ROTULO_SUBTOTAL))

def numero_da_celula(valor):
    if valor is None or isinstance(valor, bool):
        if valor is None:
            return None
        raise ValueError('não é um número')
    if isinstance(valor, (int, float)):
        return Decimal(repr(valor)) if isinstance(valor, float) else Decimal(valor)
    texto = str(valor).strip()
    if not texto:
        return None
    bruto = _numero_bruto(texto)
    if not bruto or _data(texto):
        raise ValueError('não é um número')
    negativo, _euro, corpo, com_espacos = bruto
    lido = _numero_da_coluna(corpo, _voto_decimal(corpo), com_espacos)
    if lido is None:
        raise ValueError('não é um número')
    numero = Decimal(repr(lido[0])) if isinstance(lido[0], float) else Decimal(lido[0])
    return -numero if negativo else numero

def _decimal_da_celula(valor):
    if valor is None or (isinstance(valor, str) and (not valor.strip())):
        return None
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return _TEXTO
    return Decimal(repr(valor)) if isinstance(valor, float) else Decimal(valor)

def _casas_do_formato(formato):
    if not formato:
        return 0
    m = _CASAS_DO_FORMATO_RE.search(formato)
    return len(m.group(1)) if m else 0
_MAX_CASAS_DOS_VALORES = 4

def _casas_do_valor(valor):
    if not isinstance(valor, Decimal):
        valor = _decimal_da_celula(valor)
        if not isinstance(valor, Decimal):
            return 0
    expoente = valor.normalize().as_tuple().exponent
    return -expoente if isinstance(expoente, int) and expoente < 0 else 0

class _Folha:

    def __init__(self, calculo, blocos):
        self.calculo = c = calculo
        self.largura = largura = len(c.colunas)
        self.com_capitulos = any((titulo for titulo, _linhas in blocos))
        self.grelha, self.tipos, self.zonas = ([list(c.colunas)], ['cabecalho'], [])
        n_dados = 0
        for titulo, linhas in blocos:
            if titulo:
                self.grelha.append([titulo] + [None] * (largura - 1))
                self.tipos.append('titulo')
            inicio = len(self.grelha)
            for fila in linhas:
                n_dados += 1
                fila = [_valor_json(v) for v in (fila if isinstance(fila, list) else [fila])]
                while len(fila) > largura and (fila[-1] is None or str(fila[-1]).strip() == ''):
                    fila.pop()
                if len(fila) > largura:
                    raise ValueError(f'a linha de dados {n_dados} tem {len(fila)} células e a tabela tem {largura} colunas ({_lista_de_colunas(c.colunas)})')
                fila += [None] * (largura - len(fila))
                for i in c.formulas:
                    fila[i] = None
                self.grelha.append(fila)
                self.tipos.append('dados')
            self.zonas.append((inicio, len(self.grelha) - 1, titulo))
            if self.com_capitulos and c.totais:
                self.grelha.append([None] * largura)
                self.tipos.append('subtotal')
        if not n_dados:
            raise ValueError('a tabela não tem linhas de dados')
        if c.totais:
            self.grelha.append([None] * largura)
            self.tipos.append('total')
        self.n_dados = n_dados
        self.valores, self.formatos, self.enfase, self.textos = _celulas_tipadas(self.grelha)
        self.dados = [r for r, tipo in enumerate(self.tipos) if tipo == 'dados']
        self._euros()
        self._calcular()
        self.coluna_do_rotulo = next((i for i in range(largura) if i not in c.totais), None)

    def _euros(self):
        c = self.calculo
        self.euros = set()
        for i in range(self.largura):
            if i in c.formulas:
                continue
            if any((self.formatos.get((r, i)) == _FORMATO_EURO for r in self.dados)) or _EUROS_NO_NOME_RE.search(_chave_coluna(c.colunas[i])):
                self.euros.add(i)
                for r in self.dados:
                    if isinstance(self.valores[r][i], (int, float)) and (not isinstance(self.valores[r][i], bool)):
                        self.formatos[r, i] = _FORMATO_EURO
        for i in c.ordem:
            if self.euros & c.diretas(i) or _EUROS_NO_NOME_RE.search(_chave_coluna(c.colunas[i])):
                self.euros.add(i)

    def _calcular(self):
        c = self.calculo
        self.numeros, self.sem_valor = ({}, [])
        for r in self.dados:
            linha = {i: _decimal_da_celula(self.valores[r][i]) for i in range(self.largura) if i not in c.formulas}
            for i in c.ordem:
                usadas = c.base_usadas(i)
                if all((linha.get(u) is None for u in usadas)):
                    linha[i] = None
                    continue
                texto = next((u for u in sorted(usadas) if linha.get(u) is _TEXTO), None)
                if texto is not None:
                    linha[i] = _TEXTO
                    self.sem_valor.append({'linha': r + 1, 'coluna': c.colunas[i], 'motivo': f'«{self.valores[r][texto]}» em «{c.colunas[texto]}» não é um número'})
                    continue
                try:
                    valor = _avaliar(c.formulas[i], linha)
                except (ZeroDivisionError, InvalidOperation):
                    linha[i] = None
                    self.sem_valor.append({'linha': r + 1, 'coluna': c.colunas[i], 'motivo': 'divisão por zero'})
                    continue
                if i in self.euros:
                    valor = valor.quantize(_CENTIMO, rounding=ROUND_HALF_UP)
                linha[i] = valor
            self.numeros[r] = linha
        self.subtotais = []
        for inicio, fim, _titulo in self.zonas:
            self.subtotais.append({i: sum((self.numeros[r][i] for r in range(inicio, fim + 1) if isinstance(self.numeros[r].get(i), Decimal)), Decimal(0)) for i in c.totais})
        self.total = {i: sum((s[i] for s in self.subtotais), Decimal(0)) for i in c.totais}

    def formato(self, i):
        if i in self.euros:
            return _FORMATO_EURO
        c = self.calculo
        if i in c.formulas:
            casas = max((self._casas_da_coluna(u) for u in c.diretas(i)), default=0)
            if _tem_divisao(c.formulas[i]):
                casas = max(casas, 2)
            calculadas = max((_casas_do_valor(self.numeros[r].get(i)) for r in self.dados if isinstance(self.numeros.get(r, {}).get(i), Decimal)), default=0)
            if calculadas:
                casas = max(casas, 2, min(calculadas, _MAX_CASAS_DOS_VALORES))
        else:
            casas = self._casas_da_coluna(i)
        return '#,##0' + ('.' + '0' * casas if casas else '')

    def _casas_da_coluna(self, i):
        if i in self.calculo.formulas:
            return _casas_do_formato(self.formato(i))
        do_formato = max((_casas_do_formato(self.formatos.get((r, i))) for r in self.dados), default=0)
        dos_valores = max((_casas_do_valor(self.valores[r][i]) for r in self.dados), default=0)
        return max(do_formato, min(dos_valores, _MAX_CASAS_DOS_VALORES))

    def mostrar(self, i, valor):
        if i in self.euros:
            return f'{valor:,.2f} €'
        casas = _casas_do_formato(self.formato(i))
        return f'{valor:,.{casas}f}'

    def xlsx(self, titulo):
        c = self.calculo
        letras = [get_column_letter(i + 1) for i in range(self.largura)]
        guardados = {}
        wb = Workbook()
        wb.calculation.fullCalcOnLoad = True
        ws = wb.active
        ws.title = _nome_da_folha(titulo)
        linhas_das_somas = []
        larguras = [len(str(nome)) + 2 for nome in c.colunas]
        for r, tipo in enumerate(self.tipos):
            linha = r + 1
            fila = ['' if v is None else v for v in self.valores[r]]
            if tipo == 'dados':
                for i in c.ordem:
                    estado = self.numeros[r].get(i)
                    if estado is _TEXTO or (estado is None and all((self.numeros[r].get(u) is None for u in c.base_usadas(i)))):
                        fila[i] = ''
                        continue
                    expressao = _formula_excel(c.formulas[i], letras, linha)
                    fila[i] = f'=ROUND({expressao},2)' if i in self.euros else f'={expressao}'
                    if isinstance(estado, Decimal):
                        guardados[f'{letras[i]}{linha}'] = estado
            elif tipo in ('subtotal', 'total'):
                fila = [''] * self.largura
                if tipo == 'subtotal':
                    inicio, fim, titulo_bloco = self.zonas[len(linhas_das_somas)]
                    rotulo = f'{c.rotulo_subtotal} — {_sem_marcas(str(titulo_bloco))}'
                    for i in c.totais:
                        fila[i] = f'=SUM({letras[i]}{inicio + 1}:{letras[i]}{fim + 1})'
                        guardados[f'{letras[i]}{linha}'] = self.subtotais[len(linhas_das_somas)][i]
                    linhas_das_somas.append(linha)
                else:
                    rotulo = c.rotulo_total
                    for i in c.totais:
                        if self.com_capitulos:
                            fila[i] = '=SUM(' + ','.join((f'{letras[i]}{s}' for s in linhas_das_somas)) + ')'
                        else:
                            inicio, fim, _t = self.zonas[0]
                            fila[i] = f'=SUM({letras[i]}{inicio + 1}:{letras[i]}{fim + 1})'
                        guardados[f'{letras[i]}{linha}'] = self.total[i]
                if self.coluna_do_rotulo is not None:
                    fila[self.coluna_do_rotulo] = rotulo
            ws.append(fila)
            for i in range(self.largura):
                celula = ws.cell(row=linha, column=i + 1)
                formato = self.formatos.get((r, i))
                if tipo == 'dados' and i in c.formulas or (tipo in ('subtotal', 'total') and i in c.totais):
                    formato = self.formato(i)
                if formato:
                    celula.number_format = formato
                negrito, italico = self.enfase.get((r, i), (False, False))
                if tipo in ('cabecalho', 'titulo', 'subtotal', 'total'):
                    negrito = True
                if negrito or italico:
                    celula.font = _fonte(celula.font, negrito, italico)
                _quebra_na_celula(celula)
                if tipo == 'dados' or (tipo in ('subtotal', 'total') and i in c.totais):
                    if tipo == 'dados' and i in c.formulas:
                        valor = self.numeros[r].get(i)
                        texto = self.mostrar(i, valor) if isinstance(valor, Decimal) else ''
                    elif tipo == 'dados':
                        texto = self.textos[r][i] if i < len(self.textos[r]) else ''
                    else:
                        soma = (self.subtotais[len(linhas_das_somas) - 1] if tipo == 'subtotal' else self.total)[i]
                        texto = self.mostrar(i, soma)
                    if r < 200 or tipo != 'dados':
                        larguras[i] = max(larguras[i], _largura_do_texto(texto))
        for i, largura in enumerate(larguras):
            ws.column_dimensions[letras[i]].width = min(60, max(10, largura + 2))
        ws.freeze_panes = 'A2'
        if not self.com_capitulos:
            _inicio, fim, _t = self.zonas[0]
            ws.auto_filter.ref = f'A1:{letras[-1]}{fim + 1}'
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.print_title_rows = '1:1'
        return _com_valores_guardados(_bytes(wb), guardados)

    def csv(self):
        c = self.calculo
        corpos, com_euro = ([], False)
        for i in c.colunas_numericas() | set(c.totais):
            for r in self.dados:
                original = self.grelha[r][i]
                if isinstance(original, str) and original.strip():
                    bruto = _numero_bruto(original)
                    if bruto:
                        corpos.append(bruto[2])
                        com_euro = com_euro or (bruto[1] and i in self.euros)
        separador = _decimal_da_coluna(corpos) or ','

        def texto(i, valor):
            if i in self.euros:
                corpo = f'{valor:.2f}'
            else:
                corpo = format(valor.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP).normalize(), 'f')
            if separador == ',':
                corpo = corpo.replace('.', ',')
            return corpo + (' €' if i in self.euros and com_euro else '')
        saida = io.StringIO()
        escritor = csv.writer(saida, delimiter=';', lineterminator='\n')
        somas = 0
        for r, tipo in enumerate(self.tipos):
            if tipo in ('cabecalho', 'titulo'):
                escritor.writerow(['' if v is None else v for v in self.grelha[r]])
            elif tipo == 'dados':
                fila = []
                for i in range(self.largura):
                    if i in c.formulas:
                        valor = self.numeros[r].get(i)
                        fila.append(texto(i, valor) if isinstance(valor, Decimal) else '')
                    else:
                        fila.append('' if self.grelha[r][i] is None else self.grelha[r][i])
                escritor.writerow(fila)
            else:
                fila = [''] * self.largura
                if tipo == 'subtotal':
                    rotulo = f'{c.rotulo_subtotal} — {_sem_marcas(str(self.zonas[somas][2]))}'
                    valores = self.subtotais[somas]
                    somas += 1
                else:
                    rotulo, valores = (c.rotulo_total, self.total)
                for i in c.totais:
                    fila[i] = texto(i, valores[i])
                if self.coluna_do_rotulo is not None:
                    fila[self.coluna_do_rotulo] = rotulo
                escritor.writerow(fila)
        return saida.getvalue().encode('utf-8-sig')

    def resumo(self):
        c = self.calculo

        def somas(valores):
            return [{'coluna': c.colunas[i], 'valor': str(valores[i]), 'euros': i in self.euros} for i in c.totais]
        return {'colunas': list(c.colunas), 'linhas': self.n_dados, 'calculadas': [c.colunas[i] for i in c.ordem], 'totais': somas(self.total) if c.totais else [], 'subtotais': [somas(s) for s in self.subtotais] if self.com_capitulos and c.totais else [], 'sem_valor': self.sem_valor[:20], 'sem_valor_total': len(self.sem_valor)}

def gerar_folha(formato, cabecalho, blocos, calculadas=None, totais=None, rotulo_total=None, rotulo_subtotal=None, titulo=None):
    if formato not in ('xlsx', 'csv'):
        raise ValueError('as colunas calculadas e os totais só existem em xlsx e csv')
    folha = _Folha(preparar_calculo(cabecalho, calculadas, totais, rotulo_total, rotulo_subtotal), blocos)
    dados = folha.xlsx(_titulo_limpo(titulo)) if formato == 'xlsx' else folha.csv()
    return (dados, folha.resumo())

def gerar_tabela(formato, conteudo=None, linhas=None, titulo=None, calculadas=None, totais=None, rotulo_total=None, maximo=MAX_CONTEUDO_CHARS):
    if formato not in ('xlsx', 'csv'):
        raise ValueError('as colunas calculadas e os totais só existem em xlsx e csv')
    conteudo = conteudo or ''
    if maximo:
        conteudo = conteudo[:maximo]
    linhas = _linhas_limpas(_linhas_validas(linhas)) or _tabela_do_markdown(conteudo)
    if not linhas:
        raise ValueError('csv/xlsx precisam de `rows` (lista de linhas) ou de uma tabela em Markdown')
    return gerar_folha(formato, linhas[0], [(None, linhas[1:])], calculadas, totais, rotulo_total, titulo=titulo)
_TITULO_RE = re.compile('^(#{1,6})\\s+(.*?)\\s*#*\\s*$')
_MARCA_RE = re.compile('^\\s*[-*+]\\s+(.*)$')
_NUMERO_RE = re.compile('^\\s*\\d+[.)]\\s+(.*)$')
_HR_RE = re.compile('^\\s*([-*_])(\\s*\\1){2,}\\s*$')
_TABELA_SEP_RE = re.compile('^\\s*\\|?\\s*:?-{2,}:?\\s*(\\|\\s*:?-{2,}:?\\s*)*\\|?\\s*$')
_ENTIDADE_RE = re.compile('&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});')
_BR_RE = re.compile('<br\\s*/?>', re.I)
_CODIGO_EM_LINHA_RE = re.compile('(`[^`]+`)')

def _sem_entidades(texto):
    partes = _CODIGO_EM_LINHA_RE.split(texto)
    return ''.join((p if i % 2 else _ENTIDADE_RE.sub(lambda m: _html.unescape(m.group()), _BR_RE.sub('\n', p)) for i, p in enumerate(partes)))

def _quebras_limpas(texto):
    return re.sub('[ \\t]*\\n[ \\t]*', '\n', texto).strip('\n')

def _texto_limpo(valor):
    if not isinstance(valor, str):
        return valor
    limpo = _quebras_limpas(_sem_entidades(valor))
    return limpo if limpo.strip() else ''

def _linhas_limpas(linhas):
    return [[_texto_limpo(v) for v in fila] for fila in linhas]

def _titulo_limpo(titulo):
    return _sem_entidades(titulo) if isinstance(titulo, str) else titulo

def analisar_markdown(texto):
    blocos, paragrafo, lista, tipo_lista = ([], [], [], None)
    linhas = (texto or '').replace('\r\n', '\n').split('\n')
    i = 0

    def fechar():
        nonlocal paragrafo, lista, tipo_lista
        if paragrafo:
            blocos.append(('paragrafo', _quebras_limpas(' '.join(paragrafo)) or '\xa0'))
            paragrafo = []
        if lista:
            blocos.append((tipo_lista, lista))
            lista, tipo_lista = ([], None)
    while i < len(linhas):
        linha = linhas[i]
        if linha.strip().startswith('```'):
            fechar()
            codigo = []
            i += 1
            while i < len(linhas) and (not linhas[i].strip().startswith('```')):
                codigo.append(linhas[i])
                i += 1
            blocos.append(('codigo', '\n'.join(codigo)))
            i += 1
            continue
        if '|' in linha and i + 1 < len(linhas) and _TABELA_SEP_RE.match(linhas[i + 1]):
            fechar()
            tabela = [_celulas(linha)]
            i += 2
            while i < len(linhas) and '|' in linhas[i] and linhas[i].strip():
                tabela.append(_celulas(linhas[i]))
                i += 1
            blocos.append(('tabela', tabela))
            continue
        m = _TITULO_RE.match(linha)
        if m:
            fechar()
            blocos.append(('titulo', len(m.group(1)), _quebras_limpas(_sem_entidades(m.group(2)))))
        elif _HR_RE.match(linha):
            fechar()
            blocos.append(('hr',))
        elif _MARCA_RE.match(linha) or _NUMERO_RE.match(linha):
            if paragrafo:
                fechar()
            marca = 'lista' if _MARCA_RE.match(linha) else 'numerada'
            if tipo_lista and tipo_lista != marca:
                fechar()
            tipo_lista = marca
            lista.append(_quebras_limpas(_sem_entidades((_MARCA_RE.match(linha) or _NUMERO_RE.match(linha)).group(1))))
        elif not linha.strip():
            fechar()
        else:
            if lista:
                fechar()
            paragrafo.append(_sem_entidades(linha.strip()))
        i += 1
    fechar()
    return blocos

def _celulas(linha):
    linha = linha.strip()
    if linha.startswith('|'):
        linha = linha[1:]
    if linha.endswith('|'):
        linha = linha[:-1]
    return [_quebras_limpas(_sem_entidades(c.strip())).strip() for c in linha.split('|')]

def _tabela_do_markdown(conteudo):
    for bloco in analisar_markdown(conteudo):
        if bloco[0] == 'tabela':
            return bloco[1]
    return []

def _markdown_da_tabela(linhas):
    if not linhas:
        return ''
    cab = '| ' + ' | '.join(('' if v is None else str(v) for v in linhas[0])) + ' |'
    sep = '|' + '---|' * len(linhas[0])
    corpo = ['| ' + ' | '.join(('' if v is None else str(v) for v in f)) + ' |' for f in linhas[1:]]
    return '\n'.join([cab, sep] + corpo)
_INLINE_RE = re.compile('(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|`[^`]+`|(?<!\\w)__(?=\\S)[^_\\n]+?(?<=\\S)__(?!\\w)|(?<!\\w)_(?=\\S)[^_\\n]+?(?<=\\S)_(?!\\w))')

def _trechos(texto):
    saida = []
    for n, parte in enumerate(_INLINE_RE.split(texto)):
        if not parte:
            continue
        if n % 2 == 0:
            saida.append((parte, False, False, False))
        elif parte[:2] in ('**', '__') and len(parte) > 4:
            saida.append((parte[2:-2], True, False, False))
        elif parte.startswith('`'):
            saida.append((parte[1:-1], False, False, True))
        else:
            saida.append((parte[1:-1], False, True, False))
    return saida

def _sem_marcas(texto):
    return ''.join((t for t, _b, _i, _c in _trechos(texto)))

def _gerar_docx(blocos):
    doc = Document()
    for seccao in doc.sections:
        seccao.page_width, seccao.page_height = (Mm(210), Mm(297))
    for bloco in blocos:
        tipo = bloco[0]
        if tipo == 'titulo':
            doc.add_heading(bloco[2], level=min(bloco[1], 4))
        elif tipo == 'paragrafo':
            _paragrafo_docx(doc.add_paragraph(), bloco[1])
        elif tipo in ('lista', 'numerada'):
            estilo = 'List Bullet' if tipo == 'lista' else 'List Number'
            for item in bloco[1]:
                _paragrafo_docx(doc.add_paragraph(style=estilo), item)
        elif tipo == 'tabela':
            linhas = bloco[1]
            colunas = max((len(l) for l in linhas))
            tabela = doc.add_table(rows=len(linhas), cols=colunas)
            tabela.style = 'Table Grid'
            for r, fila in enumerate(linhas):
                for c in range(colunas):
                    celula = tabela.cell(r, c)
                    celula.text = ''
                    _paragrafo_docx(celula.paragraphs[0], fila[c] if c < len(fila) else '', negrito=r == 0)
        elif tipo == 'codigo':
            p = doc.add_paragraph()
            run = p.add_run(bloco[1])
            run.font.name = 'Courier New'
            run.font.size = Pt(9)
        elif tipo == 'hr':
            doc.add_paragraph('_' * 40)
    return _bytes(doc)

def _paragrafo_docx(p, texto, negrito=False):
    for t, b, i, c in _trechos(texto):
        run = p.add_run(t)
        run.bold = b or negrito
        run.italic = i
        if c:
            run.font.name = 'Courier New'

def _diapositivos(blocos, titulo):
    diapositivos = []
    capa_vazia = False

    def novo(texto, de_um_titulo_1=False):
        diapositivos.append((texto, [], de_um_titulo_1))

    def ponto(texto, nivel=0):
        if not diapositivos:
            novo(titulo)
        diapositivos[-1][1].append(('ponto', texto, nivel))
    for bloco in blocos:
        tipo = bloco[0]
        if tipo == 'titulo' and bloco[1] == 2 and capa_vazia:
            ponto(bloco[2])
            capa_vazia = False
            continue
        if tipo == 'titulo' and bloco[1] <= 2:
            novo(bloco[2], bloco[1] == 1)
            capa_vazia = bloco[1] == 1
            continue
        capa_vazia = False
        if tipo == 'titulo':
            ponto(bloco[2])
        elif tipo == 'paragrafo':
            if bloco[1].strip():
                ponto(_sem_marcas(bloco[1]))
        elif tipo in ('lista', 'numerada'):
            for item in bloco[1]:
                ponto(_sem_marcas(item), nivel=1)
        elif tipo == 'tabela':
            if not diapositivos:
                novo(titulo)
            diapositivos[-1][1].append(('tabela', bloco[1]))
        elif tipo == 'codigo':
            ponto(bloco[1])
    if not diapositivos:
        novo(titulo)
    return diapositivos

def diapositivos_do_markdown(texto):
    return [{'titulo': t, 'pontos': [i[1] for i in itens if i[0] == 'ponto'], 'tabela': any((i[0] == 'tabela' for i in itens))} for t, itens, _n in _diapositivos(analisar_markdown(texto), None)]

def _gerar_pptx(blocos, titulo):
    diapositivos = _diapositivos(blocos, titulo)
    prs = Presentation()
    for n, (texto, itens, de_um_titulo_1) in enumerate(diapositivos):
        texto = texto or titulo or 'Documento'
        if any((item[0] == 'tabela' for item in itens)):
            _diapositivo_com_tabela(prs, texto, itens)
            continue
        if n == 0 and de_um_titulo_1 and (len(diapositivos) > 1) and (len(itens) <= 1) and all((item[2] == 0 for item in itens)):
            _capa_pptx(prs, texto, itens[0][1] if itens else '')
            continue
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        _titulo_pptx(slide.shapes.title, texto)
        _corpo_pptx(slide.placeholders[1], itens)
    return _bytes(prs)
_PPTX_LETRAS_DO_TITULO = (44, 40, 36, 32, 28, 24)
_PPTX_LETRAS_DO_CORPO = (28, 26, 24, 22, 20, 18, 16, 14)
_PPTX_LETRA_DO_TEXTO = 0.42
_PPTX_RECUO_DO_NIVEL = {0: Inches(0.375), 1: Inches(0.8125)}
_PPTX_MARGENS_LADOS = Inches(0.2)

def _tirar_forma(forma):
    elemento = forma._element
    elemento.getparent().remove(elemento)

def _titulo_pptx(forma, texto):
    forma.text = texto
    altura = Emu(forma.height).pt - _PPTX_MARGENS_CAIXA_PT
    largura = forma.width - _PPTX_MARGENS_LADOS
    tamanho = next((t for t in _PPTX_LETRAS_DO_TITULO if _linhas_estimadas(texto, largura, t, _PPTX_LETRA_DO_TEXTO) * t * 1.2 <= altura), _PPTX_LETRAS_DO_TITULO[-1])
    for p in forma.text_frame.paragraphs:
        for run in p.runs:
            run.font.size = Pt(tamanho)

def _capa_pptx(prs, titulo, subtitulo):
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    _titulo_pptx(slide.shapes.title, titulo)
    if subtitulo:
        slide.placeholders[1].text = subtitulo
    else:
        _tirar_forma(slide.placeholders[1])

def _letra_do_corpo(pontos, largura, altura):
    disponivel = Emu(altura).pt - _PPTX_MARGENS_CAIXA_PT
    util = largura - _PPTX_MARGENS_LADOS
    for tamanho in _PPTX_LETRAS_DO_CORPO:
        ocupado = 0.0
        for _tipo, texto, nivel in pontos:
            letra = tamanho if nivel == 0 else max(12, tamanho - 4)
            recuo = _PPTX_RECUO_DO_NIVEL.get(nivel, _PPTX_RECUO_DO_NIVEL[1])
            ocupado += (_linhas_estimadas(texto, util - recuo, letra, _PPTX_LETRA_DO_TEXTO) + 0.2) * letra * 1.2
        if ocupado <= disponivel:
            return tamanho
    return _PPTX_LETRAS_DO_CORPO[-1]

def _corpo_pptx(forma, itens):
    pontos = [item for item in itens if item[0] == 'ponto']
    if not pontos:
        _tirar_forma(forma)
        return
    if all((nivel >= 1 for _tipo, _texto, nivel in pontos)):
        pontos = [(tipo, texto, nivel - 1) for tipo, texto, nivel in pontos]
    tamanho = _letra_do_corpo(pontos, forma.width, forma.height)
    corpo = forma.text_frame
    corpo.clear()
    for i, (_tipo, texto, nivel) in enumerate(pontos):
        p = corpo.paragraphs[0] if i == 0 else corpo.add_paragraph()
        p.text = texto
        p.level = nivel
        for run in p.runs:
            run.font.size = Pt(tamanho if nivel == 0 else max(12, tamanho - 4))
_PPTX_TEXTO_PT = {0: 18, 1: 16}
_PPTX_LETRA_TABELA_PT = (14, 12, 11, 10)
_PPTX_FOLGA = Inches(0.15)
_PPTX_MARGENS_CAIXA_PT = 7.2
_PPTX_MARGENS_CELULA_LADOS = Inches(0.2)

def _linhas_estimadas(texto, largura, tamanho_pt, letra=0.5):
    por_linha = max(1, int(Emu(largura).pt / (tamanho_pt * letra)))
    return max(1, math.ceil(len(texto) / por_linha))

def _diapositivo_com_tabela(prs, titulo, itens):
    area = prs.slide_layouts[1].placeholders[1]
    esquerda, largura, fundo = (area.left, area.width, area.top + area.height)
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = titulo
    y = area.top
    grupos = []
    for item in itens:
        if item[0] == 'ponto' and grupos and (grupos[-1][0] == 'pontos'):
            grupos[-1][1].append(item[1:])
        elif item[0] == 'ponto':
            grupos.append(('pontos', [item[1:]]))
        else:
            grupos.append(item)
    for tipo, conteudo in grupos:
        if tipo == 'pontos':
            y += _caixa_de_pontos(slide, conteudo, esquerda, y, largura) + _PPTX_FOLGA
        else:
            y += _tabela_pptx(slide, conteudo, esquerda, y, largura, fundo - y) + _PPTX_FOLGA

def _caixa_de_pontos(slide, pontos, esquerda, topo, largura):
    altura_pt = _PPTX_MARGENS_CAIXA_PT
    for texto, nivel in pontos:
        tamanho = _PPTX_TEXTO_PT.get(nivel, _PPTX_TEXTO_PT[1])
        altura_pt += _linhas_estimadas(texto, largura - Inches(0.5) * nivel, tamanho) * tamanho * 1.2
    altura = Pt(altura_pt)
    caixa = slide.shapes.add_textbox(esquerda, topo, largura, altura)
    quadro = caixa.text_frame
    quadro.word_wrap = True
    for i, (texto, nivel) in enumerate(pontos):
        p = quadro.paragraphs[0] if i == 0 else quadro.add_paragraph()
        if nivel:
            ppr = p._p.get_or_add_pPr()
            ppr.set('marL', str(Inches(0.5) * nivel))
            ppr.set('indent', str(-Inches(0.25)))
            etree.SubElement(ppr, qn('a:buChar'), char='•')
        p.text = texto
        for run in p.runs:
            run.font.size = Pt(_PPTX_TEXTO_PT.get(nivel, _PPTX_TEXTO_PT[1]))
    return altura

def _tabela_pptx(slide, linhas, esquerda, topo, largura, disponivel):
    colunas = max((len(f) for f in linhas))
    originais = [[f[c] if c < len(f) else '' for c in range(colunas)] for f in linhas]
    textos = [[_sem_marcas(t) for t in fila] for fila in originais]
    pesos = [min(40, max(4, max((len(f[c]) for f in textos)))) for c in range(colunas)]
    larguras = [int(largura * p / sum(pesos)) for p in pesos]
    larguras[-1] = largura - sum(larguras[:-1])
    valores = _celulas_tipadas(textos)[0]
    numericas = set()
    for c in range(colunas):
        corpo = [valores[r][c] for r in range(1, len(textos)) if textos[r][c].strip()]
        if corpo and (not any((isinstance(v, str) for v in corpo))):
            numericas.add(c)

    def alturas_com(tamanho):
        return [max((_linhas_estimadas(t, larguras[c] - _PPTX_MARGENS_CELULA_LADOS, tamanho) for c, t in enumerate(fila))) * tamanho * 1.2 + _PPTX_MARGENS_CAIXA_PT for fila in textos]
    tamanho = _PPTX_LETRA_TABELA_PT[-1]
    for candidato in _PPTX_LETRA_TABELA_PT:
        if Pt(sum(alturas_com(candidato))) <= disponivel:
            tamanho = candidato
            break
    alturas = [Pt(a) for a in alturas_com(tamanho)]
    forma = slide.shapes.add_table(len(textos), colunas, esquerda, topo, largura, sum(alturas))
    tabela = forma.table
    for c, w in enumerate(larguras):
        tabela.columns[c].width = w
    for r, a in enumerate(alturas):
        tabela.rows[r].height = a
    for r, fila in enumerate(originais):
        for c, original in enumerate(fila):
            p = tabela.cell(r, c).text_frame.paragraphs[0]
            if c in numericas:
                p.alignment = PP_ALIGN.RIGHT
            for t, negrito, italico, _codigo in _trechos(original):
                for n, pedaco in enumerate(t.split('\n')):
                    if n:
                        p.add_line_break()
                    run = p.add_run()
                    run.text = pedaco
                    run.font.size = Pt(tamanho)
                    if negrito:
                        run.font.bold = True
                    if italico:
                        run.font.italic = True
            p._p.get_or_add_endParaRPr().set('sz', str(tamanho * 100))
    return sum(alturas)

def _html_inline(texto, quebra='<br>'):
    partes = []
    for t, b, i, c in _trechos(texto):
        t = _html.escape(t).replace('\n', quebra)
        if c:
            t = f'<code>{t}</code>'
        if b:
            t = f'<strong>{t}</strong>'
        if i:
            t = f'<em>{t}</em>'
        partes.append(t)
    return ''.join(partes)

def _html_celula(texto):
    return _html_inline(texto, quebra='\n')

def _gerar_html(blocos, titulo):
    partes = []
    for bloco in blocos:
        tipo = bloco[0]
        if tipo == 'titulo':
            n = min(bloco[1], 4)
            partes.append(f'<h{n}>{_html_inline(bloco[2])}</h{n}>')
        elif tipo == 'paragrafo':
            partes.append(f'<p>{_html_inline(bloco[1])}</p>')
        elif tipo in ('lista', 'numerada'):
            tag = 'ul' if tipo == 'lista' else 'ol'
            itens = ''.join((f'<li>{_html_inline(i)}</li>' for i in bloco[1]))
            partes.append(f'<{tag}>{itens}</{tag}>')
        elif tipo == 'tabela':
            linhas = bloco[1]
            cab = ''.join((f'<th>{_html_celula(c)}</th>' for c in linhas[0]))
            corpo = ''.join(('<tr>' + ''.join((f'<td>{_html_celula(c)}</td>' for c in f)) + '</tr>' for f in linhas[1:]))
            partes.append(f'<table><thead><tr>{cab}</tr></thead><tbody>{corpo}</tbody></table>')
        elif tipo == 'codigo':
            partes.append(f'<pre>{_html.escape(bloco[1])}</pre>')
        elif tipo == 'hr':
            partes.append('<hr/>')
    estilo = 'body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;color:#222;margin:20mm}h1{font-size:20pt}h2{font-size:16pt}h3{font-size:13pt}table{border-collapse:collapse;width:100%;margin:8pt 0}th,td{border:1px solid #999;padding:4pt 6pt;text-align:left;vertical-align:top;white-space:pre-line}th{background:#eee}pre,code{font-family:Courier,monospace;font-size:9.5pt}pre{background:#f5f5f5;padding:6pt;white-space:pre-wrap}'
    cabeca = f'<title>{_html.escape(titulo)}</title>' if titulo else ''
    return f'<!DOCTYPE html><html><head><meta charset="utf-8"/>{cabeca}<style>{estilo}</style></head><body>{''.join(partes)}</body></html>'
