# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
# Copiado do chat do Recato (forsnaps_ai_chat/revisoes.py) por mobile-recato/scripts/python_do_chat.py, sem os
# comentários nem as notas internas: não se edita à mão.
import copy
import datetime
import difflib
import re
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from lxml import etree
from . import documentos as _d
_w = _d._w
_W_P, _W_R, _W_PPR, _W_RPR = (_d._W_P, _d._W_R, _w('pPr'), _w('rPr'))
_W_T, _W_DEL_TEXT = (_w('t'), _w('delText'))
_W_INSTR, _W_DEL_INSTR = (_w('instrText'), _w('delInstrText'))
_W_INS, _W_DEL, _W_MOVE_FROM, _W_MOVE_TO = (_w('ins'), _w('del'), _w('moveFrom'), _w('moveTo'))
_W_ID, _W_AUTOR, _W_DATA, _W_VAL = (_w('id'), _w('author'), _w('date'), _w('val'))
_INSERCOES = frozenset({_W_INS, _W_MOVE_TO})
_APAGAMENTOS = frozenset({_W_DEL, _W_MOVE_FROM})
_MARCAS = _INSERCOES | _APAGAMENTOS
_MOVIMENTOS = frozenset({_W_MOVE_FROM, _W_MOVE_TO})
_W_INICIO, _W_FIM, _W_REFERENCIA = (_w('commentRangeStart'), _w('commentRangeEnd'), _w('commentReference'))
_MARCADORES = (_W_INICIO, _W_FIM, _w('bookmarkStart'), _w('bookmarkEnd'))
_W_SO_FORMATO = (_w('rPrChange'), _w('pPrChange'))
_W_DOCUMENTO = _w('document')
_RAIZES = frozenset({_W_DOCUMENTO, _w('hdr'), _w('ftr')})
_UM_CARACTER = frozenset({_w('tab'), _w('ptab'), _w('cr'), _w('noBreakHyphen')})
_XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
_TODAS = frozenset({'todas', 'all', '*'})
_ID_ALTERACAO_RE = re.compile('^[Aa]?(\\d+)$')
_PALAVRAS_RE = re.compile('\\w+|\\s+|[^\\w\\s]')
MAX_SOBRE = 200
MAX_COMENTARIO = 2000
MOTIVO_COM_MARCAS = 'o parágrafo tem alterações controladas por aceitar: edita com "track_changes": true, ou aceita/rejeita primeiro as alterações dele'

def _parte(doc, tipo_de_relacao):
    try:
        return doc.part.part_related_by(tipo_de_relacao)
    except KeyError:
        return None

def _paragrafo_de(el):
    return next(el.iterancestors(_W_P), None)

def _marca_de(el, p_el):
    for acima in el.iterancestors():
        if acima is p_el:
            return None
        if acima.tag in _MARCAS:
            return acima
    return None

def _no_documento(el):
    return el.getroottree().getroot().tag in _RAIZES

def _de_texto(r):
    return all((f.tag in _d._W_CONTEUDO_DE_TEXTO or f.tag == _W_DEL_TEXT for f in r))

def _comprimento(filho):
    if filho.tag in (_W_T, _W_DEL_TEXT):
        return len(filho.text or '')
    if filho.tag == _w('br'):
        return 1 if filho.get(_w('type')) in (None, 'textWrapping') else 0
    return 1 if filho.tag in _UM_CARACTER else 0

def _texto_de(r):
    partes = []
    for filho in r:
        if filho.tag in (_W_T, _W_DEL_TEXT):
            partes.append(filho.text or '')
        elif _comprimento(filho):
            partes.append('-' if filho.tag == _w('noBreakHyphen') else '\t' if filho.tag in (_w('tab'), _w('ptab')) else '\n')
    return ''.join(partes)

def _percorrer(p_el):

    def andar(el, marca):
        for filho in el:
            tag = filho.tag
            if tag == _W_R:
                referencia = filho.find(_W_REFERENCIA)
                if referencia is not None:
                    yield ('ref', referencia.get(_W_ID), marca)
                yield ('trecho', filho, marca)
            elif tag == _W_INICIO:
                yield ('inicio', filho.get(_W_ID), marca)
            elif tag == _W_FIM:
                yield ('fim', filho.get(_W_ID), marca)
            elif tag in _MARCAS:
                yield from andar(filho, filho)
            elif tag == _d._W_SDT:
                conteudo = filho.find(_d._W_SDT_CONTENT)
                if conteudo is not None:
                    yield from andar(conteudo, marca)
            elif tag in _d._W_INVOLUCROS:
                yield from andar(filho, marca)
    yield from andar(p_el, None)

class _Alteracao:
    __slots__ = ('id', 'autor', 'marcas', 'pedacos', 'marcas_de_paragrafo', 'inteiro')

    def __init__(self, autor):
        self.id = None
        self.autor = autor
        self.marcas = []
        self.pedacos = []
        self.marcas_de_paragrafo = []
        self.inteiro = False

    def juntar(self, marca, texto):
        if not any((m is marca for m in self.marcas)):
            self.marcas.append(marca)
        self.pedacos.append((marca.tag in _INSERCOES, texto, marca.tag in _MOVIMENTOS))

    def descricao(self):
        quem = f'{self.autor or 'Autor desconhecido'} ({self.id})'
        if not self.pedacos:
            if self.marcas_de_paragrafo[0].tag in _APAGAMENTOS:
                return f'[{quem} juntou este parágrafo ao seguinte]'
            return f'[{quem} partiu o parágrafo aqui]'
        inserido = ''.join((t for ins, t, _m in self.pedacos if ins))
        apagado = ''.join((t for ins, t, _m in self.pedacos if not ins))
        if any((m for _i, _t, m in self.pedacos)):
            if inserido and (not apagado):
                return f'[{quem} pôs aqui «{inserido}», movido de outro sítio]'
            if apagado and (not inserido):
                return f'[{quem} tirou daqui «{apagado}», movido para outro sítio]'
        o = 'o parágrafo ' if self.inteiro else ''
        if inserido and apagado:
            return f'[{quem} trocou «{apagado}» por «{inserido}»]'
        if inserido:
            return f'[{quem} inseriu {o}«{inserido}»]'
        if apagado:
            return f'[{quem} apagou {o}«{apagado}»]'
        todos = [ins for ins, _t, _m in self.pedacos]
        verbo = 'inseriu' if all(todos) else 'apagou' if not any(todos) else 'alterou'
        return f'[{quem} {verbo} uma imagem ou um campo]'

class _Comentario:
    __slots__ = ('id', 'w_id', 'autor', 'texto', 'sobre', 'unidade')

    def __init__(self, ident, w_id, autor, texto):
        self.id = ident
        self.w_id = w_id
        self.autor = autor
        self.texto = texto
        self.sobre = ''
        self.unidade = None

    def nota(self):
        sobre = f' sobre «{self.sobre}»' if self.sobre.strip() else ''
        return f'[comentário {self.id} de {self.autor or 'autor desconhecido'}{sobre}: «{self.texto}»]'

    def como_dict(self):
        item = {'id': self.id, 'autor': self.autor, 'texto': self.texto}
        if self.sobre.strip():
            item['sobre'] = self.sobre
        return item

def _comentarios_do_documento(doc):
    parte = _parte(doc, RT.COMMENTS)
    if parte is None:
        return []
    saida = []
    for n, el in enumerate(parte.element.iter(_w('comment')), 1):
        linhas = (''.join((t.text or '' for t in p.iter(_W_T))).strip() for p in el.iter(_W_P))
        saida.append(_Comentario(f'C{n}', el.get(_W_ID), el.get(_W_AUTOR) or '', ' '.join((l for l in linhas if l))))
    return saida

def _encurtar(texto):
    texto = ' '.join(texto.split())
    return texto if len(texto) <= MAX_SOBRE else texto[:MAX_SOBRE - 1] + '…'

class _Leitura:

    def __init__(self, doc, unidades=None):
        self.unidades = _d._unidades_docx(doc) if unidades is None else unidades
        self.alteracoes = []
        self.itens = {}
        self.so_formato = 0
        self.comentarios = _comentarios_do_documento(doc)
        por_w_id = {c.w_id: c for c in self.comentarios}
        abertos = {}
        for u in self.unidades:
            eventos = list(_percorrer(u.elemento))
            self._ler_alteracoes(u, eventos)
            for pedacos in abertos.values():
                pedacos.append(' ')
            for tipo, valor, marca in eventos:
                if tipo == 'inicio':
                    if valor in por_w_id:
                        abertos[valor] = []
                elif tipo == 'fim':
                    c = por_w_id.get(valor)
                    if c is not None:
                        c.sobre = _encurtar(''.join(abertos.pop(valor, [])))
                        c.unidade = u.id
                elif tipo == 'ref':
                    c = por_w_id.get(valor)
                    if c is not None and c.unidade is None:
                        c.unidade = u.id
                elif abertos and (marca is None or marca.tag in _INSERCOES) and _de_texto(valor):
                    texto = _texto_de(valor)
                    for pedacos in abertos.values():
                        pedacos.append(texto)
            self.so_formato += sum((1 for x in u.elemento.iter(*_W_SO_FORMATO) if _paragrafo_de(x) is u.elemento))
        for n, g in enumerate(self.alteracoes, 1):
            g.id = f'A{n}'
        self.por_id = {g.id: g for g in self.alteracoes}
        self.comentarios_por_unidade = {}
        for c in self.comentarios:
            if c.unidade:
                self.comentarios_por_unidade.setdefault(c.unidade, []).append(c)
        self.numeros = _Numeracao(doc).numeros(self.unidades)

    def _ler_alteracoes(self, u, eventos):
        itens, atual, com_texto_normal = ([], None, False)
        for tipo, r, marca in eventos:
            if tipo != 'trecho':
                continue
            texto = _texto_de(r) if _de_texto(r) else ''
            if marca is None:
                if _de_texto(r):
                    itens.append(texto)
                    if texto:
                        atual = None
                        com_texto_normal = com_texto_normal or bool(texto.strip())
                continue
            if r.find(_W_REFERENCIA) is not None:
                continue
            autor = marca.get(_W_AUTOR) or ''
            if atual is None or atual.autor != autor:
                atual = _Alteracao(autor)
                self.alteracoes.append(atual)
                itens.append(atual)
            atual.juntar(marca, texto)
        ppr = u.elemento.find(_W_PPR)
        rpr = ppr.find(_W_RPR) if ppr is not None else None
        for m in rpr if rpr is not None else ():
            if m.tag not in _MARCAS:
                continue
            autor = m.get(_W_AUTOR) or ''
            inserida = m.tag in _INSERCOES
            if atual is not None and atual.autor == autor and atual.pedacos and all((ins == inserida for ins, _t, _m in atual.pedacos)):
                atual.marcas_de_paragrafo.append(m)
                atual.inteiro = not com_texto_normal and sum((isinstance(i, _Alteracao) for i in itens)) == 1
            else:
                g = _Alteracao(autor)
                g.marcas_de_paragrafo.append(m)
                self.alteracoes.append(g)
                itens.append(g)
        self.itens[u.id] = itens

    def alteracao(self, valor):
        m = _ID_ALTERACAO_RE.match(str(valor).strip()) if valor is not None else None
        return self.por_id.get(f'A{int(m.group(1))}') if m else None

    def autores(self):
        vistos = []
        for g in self.alteracoes:
            nome = g.autor or 'Autor desconhecido'
            if nome not in vistos:
                vistos.append(nome)
        return vistos

    def tem_alteracoes(self, u):
        return any((isinstance(i, _Alteracao) for i in self.itens.get(u.id, ())))

    def texto_marcado(self, u):
        return ''.join((i if isinstance(i, str) else i.descricao() for i in self.itens.get(u.id, ())))

    def linha(self, u):
        texto = self.texto_marcado(u)
        notas = [c.nota() for c in self.comentarios_por_unidade.get(u.id, ())]
        if not texto.strip() and (not notas):
            return ''
        return ' '.join((x for x in [self.numeros.get(u.id), texto, *notas] if x))

    def linhas_de_resumo(self):
        n, c, f = (len(self.alteracoes), len(self.comentarios), self.so_formato)
        if not (n or c or f):
            return []
        partes = []
        if n:
            partes.append(f'{n} {('alteração controlada' if n == 1 else 'alterações controladas')} por aceitar ({', '.join(self.autores())})')
        if c:
            partes.append(f'{c} {('comentário' if c == 1 else 'comentários')}')
        if f:
            partes.append(f'{f} {('alteração' if f == 1 else 'alterações')} só de formatação (não se mostram)')
        linhas = ['--- Este Word tem ' + '; '.join(partes) + ' ---']
        notacao = []
        if n:
            notacao.append('[Nome (A1) inseriu «…»] é texto proposto e ainda não aceite, [Nome (A2) apagou «…»] é texto que alguém propôs retirar e [Nome (A3) trocou «…» por «…»] é uma troca; o resto do texto já está aceite')
        if c:
            notacao.append('[comentário C1 de Nome sobre «…»: «…»] é uma nota na margem sobre esse trecho')
        if notacao:
            linhas.append('Notação: ' + '; '.join(notacao) + '.')
        return linhas

def _val(el, nome):
    filho = el.find(_w(nome)) if el is not None else None
    return filho.get(_W_VAL) if filho is not None else None

def _romano(n):
    if not 0 < n < 4000:
        return str(n)
    saida = ''
    for valor, letras in ((1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'), (100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')):
        while n >= valor:
            saida += letras
            n -= valor
    return saida

def _formatar(n, formato):
    if formato == 'decimalZero':
        return f'{n:02d}'
    if formato in ('lowerLetter', 'upperLetter') and n > 0:
        letras = chr(ord('a') + (n - 1) % 26) * ((n - 1) // 26 + 1)
        return letras.upper() if formato == 'upperLetter' else letras
    if formato in ('lowerRoman', 'upperRoman'):
        romano = _romano(n)
        return romano.lower() if formato == 'lowerRoman' else romano
    if formato == 'ordinal':
        return f'{n}.º'
    return str(n)

class _Numeracao:

    def __init__(self, doc):
        self.niveis = {}
        self.listas = {}
        self.estilos = {}
        self.contadores = {}
        self.usadas = set()
        parte = _parte(doc, RT.NUMBERING)
        if parte is None:
            return
        estilos = _parte(doc, RT.STYLES)
        for s in estilos.element.iter(_w('style')) if estilos is not None else ():
            num_pr = s.find(_w('pPr') + '/' + _w('numPr'))
            self.estilos[s.get(_w('styleId'))] = (_val(s, 'basedOn'), _val(num_pr, 'numId'), _val(num_pr, 'ilvl'))
        raiz = parte.element
        ligacoes = {}
        for a in raiz.iter(_w('abstractNum')):
            aid = a.get(_w('abstractNumId'))
            self.niveis[aid] = {n.get(_w('ilvl')): n for n in a.iter(_w('lvl'))}
            if _val(a, 'numStyleLink'):
                ligacoes[aid] = _val(a, 'numStyleLink')
        for n in raiz.iter(_w('num')):
            sobrepostos = {}
            for o in n.iter(_w('lvlOverride')):
                inicio = _val(o, 'startOverride')
                sobrepostos[int(o.get(_w('ilvl')) or 0)] = (int(inicio) if inicio and inicio.lstrip('-').isdigit() else None, o.find(_w('lvl')))
            self.listas[n.get(_w('numId'))] = (_val(n, 'abstractNumId'), sobrepostos)
        for aid, estilo in ligacoes.items():
            num_id, _ilvl = self._do_estilo(estilo)
            alvo = self.listas.get(num_id, (None, None))[0]
            if not self.niveis.get(aid) and alvo in self.niveis:
                self.niveis[aid] = self.niveis[alvo]

    def _do_estilo(self, estilo):
        for _ in range(20):
            if estilo not in self.estilos:
                return (None, None)
            base, num_id, ilvl = self.estilos[estilo]
            if num_id is not None:
                return (num_id, ilvl)
            estilo = base
        return (None, None)

    def _nivel(self, aid, sobrepostos, ilvl):
        _inicio, lvl = sobrepostos.get(ilvl, (None, None))
        return lvl if lvl is not None else self.niveis.get(aid, {}).get(str(ilvl))

    def numero(self, p_el):
        ppr = p_el.find(_W_PPR)
        num_pr = ppr.find(_w('numPr')) if ppr is not None else None
        num_id, ilvl = (_val(num_pr, 'numId'), _val(num_pr, 'ilvl'))
        if num_id is None or ilvl is None:
            do_estilo, ilvl_do_estilo = self._do_estilo(_val(ppr, 'pStyle'))
            num_id = num_id if num_id is not None else do_estilo
            ilvl = ilvl if ilvl is not None else ilvl_do_estilo
        if not num_id or num_id == '0' or num_id not in self.listas:
            return None
        ilvl = min(8, max(0, int(ilvl) if ilvl and ilvl.isdigit() else 0))
        aid, sobrepostos = self.listas[num_id]
        lvl = self._nivel(aid, sobrepostos, ilvl)
        if lvl is None:
            return None
        contadores = self.contadores.setdefault(aid, [None] * 9)
        if num_id not in self.usadas:
            self.usadas.add(num_id)
            for nivel, (inicio, _lvl) in sobrepostos.items():
                if inicio is not None and 0 <= nivel < 9:
                    contadores[nivel] = inicio - 1
        atual = contadores[ilvl]
        contadores[ilvl] = atual + 1 if atual is not None else self._inicio(lvl)
        for k in range(ilvl + 1, 9):
            contadores[k] = None
        formato = _val(lvl, 'numFmt') or 'decimal'
        modelo = _val(lvl, 'lvlText')
        if formato in ('bullet', 'none') or not modelo:
            return None
        legal = lvl.find(_w('isLgl')) is not None

        def trocar(m):
            k = int(m.group(1)) - 1
            nivel = self._nivel(aid, sobrepostos, k)
            valor = contadores[k] if contadores[k] is not None else self._inicio(nivel)
            return _formatar(valor, 'decimal' if legal else _val(nivel, 'numFmt') or 'decimal')
        return re.sub('%([1-9])', trocar, modelo).strip() or None

    @staticmethod
    def _inicio(lvl):
        inicio = _val(lvl, 'start')
        return int(inicio) if inicio and inicio.lstrip('-').isdigit() else 1

    def numeros(self, unidades):
        saida = {}
        if not self.listas:
            return saida
        for u in unidades:
            if u.onde is None:
                numero = self.numero(u.elemento)
                if numero:
                    saida[u.id] = numero
        return saida

def texto_docx(doc):
    leitura = _Leitura(doc)
    blocos = {None: [], _d.ONDE_CABECALHO: [], _d.ONDE_RODAPE: []}
    for u in leitura.unidades:
        linha = leitura.linha(u)
        if linha.strip():
            blocos[u.onde].append(linha)
    linhas = leitura.linhas_de_resumo()
    if blocos[_d.ONDE_CABECALHO]:
        linhas += ['--- Cabeçalho ---', *blocos[_d.ONDE_CABECALHO], '--- Corpo ---']
    linhas += blocos[None]
    if blocos[_d.ONDE_RODAPE]:
        linhas += ['--- Rodapé ---', *blocos[_d.ONDE_RODAPE]]
    sem_sitio = [c.nota() for c in leitura.comentarios if c.unidade is None]
    if sem_sitio:
        linhas += ['--- Comentários sem sítio no texto ---', *sem_sitio]
    return '\n'.join(linhas)

def estrutura_docx(doc):
    leitura = _Leitura(doc)
    unidades = []
    for u in leitura.unidades:
        texto = _d._texto_docx(u.paragrafo)
        comentarios = leitura.comentarios_por_unidade.get(u.id)
        alterado = leitura.tem_alteracoes(u)
        if not texto.strip() and (not alterado) and (not comentarios):
            continue
        item = {'id': u.id, 'texto': texto, 'estilo': _d._estilo_docx(u.paragrafo)}
        if leitura.numeros.get(u.id):
            item['numero'] = leitura.numeros[u.id]
        if u.onde:
            item['onde'] = u.onde
        if u.posicao:
            item.update(u.posicao)
        if alterado:
            item['alteracoes'] = leitura.texto_marcado(u)
        if comentarios:
            item['comentarios'] = [c.como_dict() for c in comentarios]
        unidades.append(item)
    return _d._limitar(unidades, _d.MAX_UNIDADES)

def resumo(doc):
    leitura = _Leitura(doc)
    if not leitura.alteracoes and (not leitura.comentarios):
        return None
    return {'alteracoes': len(leitura.alteracoes), 'autores': leitura.autores(), 'comentarios': len(leitura.comentarios)}

def _maior_id(doc):
    maior = 0
    for parte in doc.part.package.iter_parts():
        raiz = getattr(parte, 'element', None)
        if raiz is None:
            continue
        for el in raiz.iter():
            valor = el.get(_W_ID) if isinstance(el.tag, str) else None
            if valor and valor.isdigit():
                maior = max(maior, int(valor))
    return maior

class _Escrita:

    def __init__(self, doc, autor):
        self.doc = doc
        self.autor = (autor or '').strip()
        palavras = self.autor.split()
        self.iniciais = ''.join((p[0] for p in palavras[:1] + palavras[1:][-1:])).upper()
        self.data = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        self._id = _maior_id(doc)
        self.apagamentos = []

    def _novo_id(self):
        self._id += 1
        return str(self._id)

    def marca(self, nome):
        el = OxmlElement('w:' + nome)
        el.set(_W_ID, self._novo_id())
        el.set(_W_AUTOR, self.autor)
        el.set(_W_DATA, self.data)
        return el

    def metade(self, marca):
        el = OxmlElement('w:' + etree.QName(marca).localname)
        for nome, valor in marca.attrib.items():
            el.set(nome, valor)
        el.set(_W_ID, self._novo_id())
        return el

def _diferencas(antigo, novo):
    a, b = (_PALAVRAS_RE.findall(antigo), _PALAVRAS_RE.findall(novo))
    juntas = []
    for op in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        juntas.append(list(op))
        while len(juntas) >= 3 and juntas[-1][0] != 'equal' and (juntas[-2][0] == 'equal') and (juntas[-3][0] != 'equal') and (not ''.join(a[juntas[-2][1]:juntas[-2][2]]).strip()):
            antes, depois = (juntas[-3], juntas[-1])
            juntas[-3:] = [['replace', antes[1], depois[2], antes[3], depois[4]]]
    pa, pb = ([0], [0])
    for palavra in a:
        pa.append(pa[-1] + len(palavra))
    for palavra in b:
        pb.append(pb[-1] + len(palavra))
    return [(pa[i1], pa[i2], pb[j1], pb[j2]) for tag, i1, i2, j1, j2 in juntas if tag != 'equal']

def _partir_trecho(r, k):
    direita = OxmlElement('w:r')
    for nome, valor in r.attrib.items():
        direita.set(nome, valor)
    propriedades = r.find(_W_RPR)
    if propriedades is not None:
        direita.append(copy.deepcopy(propriedades))
    pos = 0
    for filho in [f for f in r if f.tag != _W_RPR]:
        n = _comprimento(filho)
        if pos >= k:
            direita.append(filho)
        elif pos + n > k:
            resto = OxmlElement('w:t')
            resto.text = filho.text[k - pos:]
            resto.set(_XML_SPACE, 'preserve')
            filho.text = filho.text[:k - pos]
            filho.set(_XML_SPACE, 'preserve')
            direita.append(resto)
        pos += n
    r.addnext(direita)

def _partir_em(p, k):
    pos = 0
    for run in _d._trechos_docx(p):
        n = len(run.text)
        if pos < k < pos + n:
            _partir_trecho(run._r, k - pos)
            return
        pos += n

def _trechos_entre(p, i1, i2):
    esquerda = direita = None
    dentro, pos = ([], 0)
    for run in _d._trechos_docx(p):
        n = len(run.text)
        if n:
            if pos + n <= i1:
                esquerda = run
            elif pos >= i2:
                direita = direita or run
            else:
                dentro.append(run)
        pos += n
    return (esquerda, dentro, direita)

def _trecho_novo(base, texto, p):
    r = OxmlElement('w:r')
    propriedades = base._r.find(_W_RPR) if base is not None else None
    if propriedades is not None:
        copia = copy.deepcopy(propriedades)
        for x in copia.findall(_w('rPrChange')):
            copia.remove(x)
        r.append(copia)
    Run(r, p).text = texto
    return r

def _por_depois(esc, ancora, novo):
    pai = ancora.getparent()
    while pai is not None and pai.tag in _MARCAS:
        resto = list(ancora.itersiblings())
        if resto:
            metade = esc.metade(pai)
            for x in resto:
                metade.append(x)
            pai.addnext(metade)
        ancora, pai = (pai, pai.getparent())
    ancora.addnext(novo)

def _por_antes(esc, ancora, novo):
    pai = ancora.getparent()
    while pai is not None and pai.tag in _MARCAS:
        resto = list(ancora.itersiblings(preceding=True))[::-1]
        if resto:
            metade = esc.metade(pai)
            for x in resto:
                metade.append(x)
            pai.addprevious(metade)
        ancora, pai = (pai, pai.getparent())
    ancora.addprevious(novo)

def _desembrulhar(el):
    for filho in list(el):
        el.addprevious(filho)
    el.getparent().remove(el)

def _para_apagado(r):
    for filho in r:
        if filho.tag == _W_T:
            filho.tag = _W_DEL_TEXT
        elif filho.tag == _W_INSTR:
            filho.tag = _W_DEL_INSTR

def _repor_apagado(marca):
    for r in marca.iter(_W_R):
        for filho in r:
            if filho.tag == _W_DEL_TEXT:
                filho.tag = _W_T
                filho.set(_XML_SPACE, 'preserve')
            elif filho.tag == _W_DEL_INSTR:
                filho.tag = _W_INSTR

def _apagar_trecho(esc, r, p_el):
    marca = _marca_de(r, p_el)
    if marca is not None and marca.tag == _W_INS and ((marca.get(_W_AUTOR) or '') == esc.autor):
        r.getparent().remove(r)
        if not any((True for _ in marca.iter(_W_R))):
            _desembrulhar(marca)
        return None
    anterior = r.getprevious()
    if anterior is not None and any((anterior is d for d in esc.apagamentos)):
        apagado = anterior
    else:
        apagado = esc.marca('del')
        r.addprevious(apagado)
        esc.apagamentos.append(apagado)
    apagado.append(r)
    _para_apagado(r)
    return apagado

def _reescrever_com_marcas(esc, p, novo):
    criadas = []
    for i1, i2, j1, j2 in reversed(_diferencas(_d._texto_docx(p), novo)):
        _partir_em(p, i1)
        _partir_em(p, i2)
        esquerda, apagados, direita = _trechos_entre(p, i1, i2)
        texto = novo[j1:j2]
        if texto:
            inserido = esc.marca('ins')
            r = _trecho_novo(apagados[0] if apagados else esquerda or direita, texto, p)
            inserido.append(r)
            if apagados:
                _por_depois(esc, apagados[-1]._r, inserido)
            elif esquerda is not None:
                _por_depois(esc, esquerda._r, inserido)
            elif direita is not None:
                _por_antes(esc, direita._r, inserido)
            else:
                p._p.append(inserido)
            _d._tirar_texto_de_exemplo(r)
            criadas.append(inserido)
        for run in apagados:
            apagado = _apagar_trecho(esc, run._r, p._p)
            if apagado is not None and (not any((apagado is c for c in criadas))):
                criadas.append(apagado)
    return criadas

def _paragrafo_seguinte(p_el):
    seguinte = p_el.getnext()
    return seguinte if seguinte is not None and seguinte.tag == _W_P else None

def _marcar_paragrafo(esc, p_el, nome):
    ppr = p_el.find(_W_PPR)
    if ppr is None:
        ppr = OxmlElement('w:pPr')
        p_el.insert(0, ppr)
    rpr = ppr.find(_W_RPR)
    if rpr is None:
        rpr = OxmlElement('w:rPr')
        depois = [x for x in ppr if x.tag in (_w('sectPr'), _w('pPrChange'))]
        if depois:
            depois[0].addprevious(rpr)
        else:
            ppr.append(rpr)
    marca = esc.marca(nome)
    inserida = rpr.find(_W_INS)
    if nome == 'del' and inserida is not None:
        inserida.addnext(marca)
    else:
        rpr.insert(0, marca)
    return marca

def _apagar_paragrafo_com_marcas(esc, p):
    p_el = p._p
    criadas = []
    for r in list(p_el.iter(_W_R)):
        if _paragrafo_de(r) is not p_el or r.find(_W_REFERENCIA) is not None:
            continue
        marca = _marca_de(r, p_el)
        if marca is not None and marca.tag in _APAGAMENTOS:
            continue
        apagado = _apagar_trecho(esc, r, p_el)
        if apagado is not None and (not any((apagado is c for c in criadas))):
            criadas.append(apagado)
    if _paragrafo_seguinte(p_el) is not None:
        _marcar_paragrafo(esc, p_el, 'del')
    return criadas

def _inserir_paragrafos(esc, u, texto, depois, com_marcas, ancora=None):
    ref = u.elemento
    trechos = _d._trechos_docx(u.paragrafo)
    base = trechos[0] if trechos else None
    ppr = ref.find(_W_PPR)
    alvo = ancora if ancora is not None else ref
    novos = []
    for linha in texto.split('\n'):
        novo = OxmlElement('w:p')
        if ppr is not None:
            copia = copy.deepcopy(ppr)
            for x in list(copia):
                if x.tag in (_w('sectPr'), _w('pPrChange')):
                    copia.remove(x)
            marcas = copia.find(_W_RPR)
            for x in list(marcas) if marcas is not None else ():
                if x.tag in _MARCAS or x.tag == _w('rPrChange'):
                    marcas.remove(x)
            novo.append(copia)
        r = _trecho_novo(base, linha.rstrip('\r'), u.paragrafo)
        if com_marcas:
            inserido = esc.marca('ins')
            inserido.append(r)
            novo.append(inserido)
            _marcar_paragrafo(esc, novo, 'ins')
        else:
            novo.append(r)
        if depois:
            alvo.addnext(novo)
            alvo = novo
        else:
            ref.addprevious(novo)
        novos.append(novo)
    return novos

def _fora_das_marcas(el):
    while el.getparent() is not None and el.getparent().tag in _MARCAS:
        el = el.getparent()
    return el

def _comentar(esc, texto, primeiro=None, ultimo=None, p_el=None):
    comentario = esc.doc.comments.add_comment(text=texto[:MAX_COMENTARIO], author=esc.autor, initials=esc.iniciais)
    cid = str(comentario.comment_id)
    inicio, fim = (OxmlElement('w:commentRangeStart'), OxmlElement('w:commentRangeEnd'))
    inicio.set(_W_ID, cid)
    fim.set(_W_ID, cid)
    referencia = OxmlElement('w:r')
    propriedades, estilo = (OxmlElement('w:rPr'), OxmlElement('w:rStyle'))
    estilo.set(_W_VAL, 'CommentReference')
    propriedades.append(estilo)
    referencia.append(propriedades)
    marca = OxmlElement('w:commentReference')
    marca.set(_W_ID, cid)
    referencia.append(marca)
    if primeiro is None:
        p_el.append(inicio)
        p_el.append(fim)
    else:
        _fora_das_marcas(primeiro).addprevious(inicio)
        _fora_das_marcas(ultimo).addnext(fim)
    fim.addnext(referencia)

def _extremos(p_el, criadas):
    presentes = [x for x in p_el.iter() if any((x is c for c in criadas))]
    return (presentes[0], presentes[-1]) if presentes else None

def _extremos_dos_trechos(p):
    trechos = _d._trechos_docx(p)
    return (trechos[0]._r, trechos[-1]._r) if trechos else None

def _extremos_do_trecho(p, trecho):
    texto = _d._texto_docx(p)
    i = texto.find(trecho) if isinstance(trecho, str) and trecho else -1
    if i < 0:
        return _extremos_dos_trechos(p)
    _partir_em(p, i)
    _partir_em(p, i + len(trecho))
    _esq, dentro, _dir = _trechos_entre(p, i, i + len(trecho))
    return (dentro[0]._r, dentro[-1]._r) if dentro else _extremos_dos_trechos(p)

def _tem_marcas(p_el):
    return any((_paragrafo_de(m) is p_el for m in p_el.iter(*_MARCAS)))

def _tirar(marca):
    for x in list(marca.iter(*_MARCADORES)):
        marca.addprevious(x)
    for r in list(marca.iter(_W_R)):
        if r.find(_W_REFERENCIA) is not None:
            marca.addprevious(r)
    marca.getparent().remove(marca)

def _juntar_ao_seguinte(p_el):
    seguinte = _paragrafo_seguinte(p_el)
    if seguinte is None:
        return
    posicao = 1 if seguinte.find(_W_PPR) is not None else 0
    for i, x in enumerate([x for x in p_el if x.tag != _W_PPR]):
        seguinte.insert(posicao + i, x)
    p_el.getparent().remove(p_el)

def _decidir(g, aceitar):
    for m in g.marcas:
        if not _no_documento(m):
            continue
        if (m.tag in _INSERCOES) == aceitar:
            if not aceitar:
                _repor_apagado(m)
            _desembrulhar(m)
        else:
            _tirar(m)
    for m in g.marcas_de_paragrafo:
        if not _no_documento(m):
            continue
        p_el = _paragrafo_de(m)
        m.getparent().remove(m)
        if (m.tag in _INSERCOES) != aceitar and p_el is not None:
            _juntar_ao_seguinte(p_el)

def _limpar_movimentos(doc):
    cabecalhos, rodapes, _escondidas = _d._partes_de_cabecalhos_e_rodapes(doc)
    for raiz in [doc.element] + [parte.element for parte in cabecalhos + rodapes]:
        for marca, marcadores in ((_W_MOVE_FROM, ('moveFromRangeStart', 'moveFromRangeEnd')), (_W_MOVE_TO, ('moveToRangeStart', 'moveToRangeEnd'))):
            if next(raiz.iter(marca), None) is None:
                for x in list(raiz.iter(*(_w(n) for n in marcadores))):
                    x.getparent().remove(x)

def _booleano(valor):
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, str):
        valor = valor.strip().lower()
        if valor in ('true', 'sim', 'yes', '1'):
            return True
        if valor in ('false', 'não', 'nao', 'no', '0'):
            return False
    return None

def _sem_numero(texto, numero):
    if numero and texto.startswith(numero) and (texto[len(numero):len(numero) + 1] in ('', ' ', '\t')):
        return texto[len(numero):].lstrip(' \t')
    return texto

def editar_docx(doc, edicoes, revisao=None, autor=''):
    unidades = _d._unidades_docx(doc)
    leitura = _Leitura(doc, unidades)
    if revisao is None:
        revisao = bool(leitura.alteracoes)
    esc = _Escrita(doc, autor)
    por_id = {u.id: u for u in unidades}
    aplicadas, ignoradas = ([], [])

    def unidade(e, chave='id'):
        return por_id.get(_d._normalizar_id(e.get(chave)))

    def ignorar(e, motivo):
        ignoradas.append(dict(e, motivo=motivo))

    def comentar(e, extremos, p_el):
        texto = e.get('comentario')
        if not isinstance(texto, str) or not texto.strip():
            return True
        if p_el.getroottree().getroot().tag != _W_DOCUMENTO:
            ignorar({'comentario': texto}, 'o Word não aceita comentários em cabeçalhos e rodapés')
            return False
        primeiro, ultimo = extremos or (None, None)
        _comentar(esc, texto.strip(), primeiro, ultimo, p_el)
        return True
    decisoes, insercoes, reescritas, notas, apagamentos = ([], [], [], [], [])
    for e in edicoes:
        if not isinstance(e, dict):
            ignoradas.append(e)
        elif e.get('alteracao') not in (None, ''):
            decisoes.append(e)
        elif e.get('depois_de') or e.get('antes_de'):
            insercoes.append(e)
        elif e.get('apagar'):
            apagamentos.append(e)
        elif isinstance(e.get('texto'), str):
            reescritas.append(e)
        elif isinstance(e.get('comentario'), str) and e['comentario'].strip():
            notas.append(e)
        else:
            ignoradas.append(e)
    for e in decisoes:
        aceitar = _booleano(e.get('aceitar'))
        valor = e.get('alteracao')
        if aceitar is None:
            ignorar(e, 'diz "accept": true para aceitar ou false para rejeitar')
            continue
        if isinstance(valor, str) and valor.strip().lower() in _TODAS:
            grupos = leitura.alteracoes
        else:
            grupos = [g for g in [leitura.alteracao(valor)] if g is not None]
        if not grupos:
            ignorar(e, 'alteração desconhecida — usa os ids A1, A2… de read_document' if leitura.alteracoes else 'o documento não tem alterações por aceitar')
            continue
        for g in reversed(grupos):
            _decidir(g, aceitar)
        aplicadas.append(e)
    if decisoes:
        _limpar_movimentos(doc)
    vazias = {} if revisao else _linhas_que_podem_ficar_vazias([unidade(e) for e in apagamentos + [r for r in reescritas if not r['texto'].strip()]])
    ultimos = {}
    for e in insercoes:
        depois = bool(e.get('depois_de'))
        u = unidade(e, 'depois_de' if depois else 'antes_de')
        texto = e.get('texto')
        if u is None or not _no_documento(u.elemento):
            ignoradas.append(e)
            continue
        if not isinstance(texto, str):
            ignorar(e, 'falta o texto do parágrafo novo')
            continue
        novos = _inserir_paragrafos(esc, u, texto[:_d.MAX_CONTEUDO_CHARS], depois, revisao, ultimos.get(u.id) if depois else None)
        if depois:
            ultimos[u.id] = novos[-1]
        comentar(e, (_primeiro_conteudo(novos[0]), _ultimo_conteudo(novos[-1])), novos[0])
        aplicadas.append(e)
    for e in reescritas:
        u = unidade(e)
        if u is None:
            ignoradas.append(e)
            continue
        if not _no_documento(u.elemento):
            ignorar(e, 'o parágrafo juntou-se ao seguinte ao aceitar ou rejeitar uma alteração')
            continue
        texto = _sem_numero(e['texto'][:_d.MAX_CONTEUDO_CHARS], leitura.numeros.get(u.id))
        if revisao:
            criadas = _reescrever_com_marcas(esc, u.paragrafo, texto)
            espelho = _d._espelho_no_recurso(u.elemento)
            if espelho is not None:
                _reescrever_com_marcas(esc, Paragraph(espelho, u.paragrafo._parent), texto)
            extremos = _extremos(u.elemento, criadas) or _extremos_dos_trechos(u.paragrafo)
        elif _tem_marcas(u.elemento):
            ignorar(e, MOTIVO_COM_MARCAS)
            continue
        else:
            _d._reescrever_docx(u.paragrafo, texto)
            extremos = _extremos_dos_trechos(u.paragrafo)
        comentar(e, extremos, u.elemento)
        aplicadas.append(e)
    for e in notas:
        u = unidade(e)
        if u is None or not _no_documento(u.elemento):
            ignoradas.append(e)
            continue
        if comentar(e, _extremos_do_trecho(u.paragrafo, e.get('trecho')), u.elemento):
            aplicadas.append(e)
    sem_marcas = []
    for e in apagamentos:
        u = unidade(e)
        if u is None:
            ignoradas.append(e)
            continue
        if not _no_documento(u.elemento):
            ignorar(e, 'o parágrafo juntou-se ao seguinte ao aceitar ou rejeitar uma alteração')
            continue
        if revisao:
            criadas = _apagar_paragrafo_com_marcas(esc, u.paragrafo)
            espelho = _d._espelho_no_recurso(u.elemento)
            if espelho is not None:
                _apagar_paragrafo_com_marcas(esc, Paragraph(espelho, u.paragrafo._parent))
            comentar(e, _extremos(u.elemento, criadas), u.elemento)
        elif _tem_marcas(u.elemento):
            ignorar(e, MOTIVO_COM_MARCAS)
            continue
        else:
            sem_marcas.append(u.paragrafo)
            if isinstance(e.get('comentario'), str) and e['comentario'].strip():
                ignorar({'comentario': e['comentario']}, 'o comentário não tem onde ficar: o parágrafo foi apagado sem marcas')
        aplicadas.append(e)
    _d._apagar_docx(sem_marcas)
    _tirar_linhas_vazias(vazias)
    return (aplicadas, ignoradas)

def _linhas_que_podem_ficar_vazias(unidades):
    linhas = {}
    for u in unidades:
        tr = next(u.elemento.iterancestors(_d._W_TR), None) if u is not None else None
        if tr is not None and tr not in linhas:
            linhas[tr] = ''.join(tr.itertext()).strip()
    return linhas

def _tirar_linhas_vazias(linhas):
    for tr, antes in linhas.items():
        tabela = next(tr.iterancestors(_d._W_TBL), None)
        pai = tr.getparent()
        if not antes or tabela is None or pai is None or ''.join(tr.itertext()).strip() or (next(tr.iter(_d._w('drawing'), _d._w('pict')), None) is not None) or (len(_d._linhas_da_tabela_docx(tabela)) <= 1):
            continue
        pai.remove(tr)

def _primeiro_conteudo(p_el):
    return next((x for x in p_el if x.tag != _W_PPR))

def _ultimo_conteudo(p_el):
    return [x for x in p_el if x.tag != _W_PPR][-1]
