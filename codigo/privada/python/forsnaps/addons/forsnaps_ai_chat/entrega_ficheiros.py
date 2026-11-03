# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
# Copiado do chat do Recato (forsnaps_ai_chat/entrega_ficheiros.py) por mobile-recato/scripts/python_do_chat.py, sem os
# comentários nem as notas internas: não se edita à mão.
import io
import re
from forsnaps.tools.pdf import PdfReader
from . import documentos
_IMAGENS = {'png': ('image/png', lambda d: d.startswith(b'\x89PNG\r\n\x1a\n')), 'jpg': ('image/jpeg', lambda d: d.startswith(b'\xff\xd8\xff')), 'webp': ('image/webp', lambda d: d[:4] == b'RIFF' and d[8:12] == b'WEBP')}
_VIDEOS = {'mp4': ('video/mp4', lambda d: d[4:8] == b'ftyp')}
_FORMATOS = {'docx': '\\b(?:word|docx?)\\b', 'xlsx': '\\b(?:excel|xlsx?|folha de c[áa]lculo|spreadsheet)\\b', 'pptx': '\\b(?:powerpoint|pptx?|slides?|diapositivos?)\\b', 'pdf': '\\bpdf\\b', 'csv': '\\bcsv\\b', 'md': '\\b(?:markdown|md)\\b', 'txt': '\\btxt\\b'}
_NOMES_DE_FORMATO = 'word|docx?|excel|xlsx?|folha de c[áa]lculo|spreadsheet|powerpoint|pptx?|slides?|diapositivos?|pdf|csv|markdown|md|txt'
_NOMES_ESTRITOS = '(?:ficheiros?|arquivos?|anexos?|files?|attachments?|' + _NOMES_DE_FORMATO + ')'
_NOMES = '(?:documentos?|documents?|ficheiros?|arquivos?|anexos?|files?|attachments?|' + _NOMES_DE_FORMATO + ')'
_SAIDA = re.compile('\\b(?:em|para|num|numa|no formato|in|into|to|as an?|as)\\s+(?:um |uma |ficheiro |file |formato |format )?(?=(?:' + _NOMES_DE_FORMATO + ')\\b)', re.I)
_LISTA_FORMATOS = '(?:' + _NOMES_DE_FORMATO + ')\\b(?:\\s*(?:,|/|\\be\\b|\\bou\\b|\\band\\b|\\bor\\b)\\s*(?:' + _NOMES_DE_FORMATO + ')\\b)*'
_ORIGEM = re.compile('\\b(?:a partir d(?:e|o|a|os|as)|com base n[oa]s?|from)\\s+(?:(?:um|uma|o|a|the|an?|ficheiro|file)\\s+)*' + _LISTA_FORMATOS, re.I)
_MEU = '(?:meu|minha|meus|minhas|nosso|nossa|nossos|nossas|my|our)'
_PALAVRA_FICHEIRO = '(?:(?:ficheiro|arquivo|documento|file|document)s?\\s+)?'
_ANTES_DE_UM_FICHEIRO_QUE_EXISTE = '\\b(?:[dn]?(?:est|ess|aquel)[ea]s?|[dn][oa]s?|(?:[oa]s?\\s+)?' + _MEU + '|(?:l[êe]|leia|ler|analis[ae]|analisar|resum[ea]|resumir|rev[êe]|reveja|rever|consult[ae]|consultar|abr[ea]|abrir|usa|use|usar|v[êe]|veja|ver|convert[ea]|converter|compar[ae]|comparar|extrai|extraia|extrair)(?:-(?:me|nos|lhe))?\\s+[oa]s?|this|that|these|those|(?:of|in) the|(?:the\\s+)?attached|(?:read|analy[sz]e|summari[sz]e|review|check|open|use|convert|compare)\\s+the)\\s+(?:' + _MEU + '\\s+)?' + _PALAVRA_FICHEIRO + '(?:attached\\s+)?'
_DEPOIS_DE_UM_FICHEIRO_QUE_EXISTE = '\\s+(?:(?:que\\s+)?(?:est[áa]|est[ãa]o|vai|v[ãa]o|segue[m]?)\\s+)?(?:em anexo|anexad[oa]s?|anexos?|acima|attached|above)\\b|\\s+que\\s+(?:(?:te|lhe|vos)\\s+)?(?:j[áa]\\s+)?(?:mandei|enviei|anexei|passei|dei|partilhei|juntei|carreguei|coloquei|pus|mand[áa]mos|envi[áa]mos|anex[áa]mos)\\b|\\s+que\\s+j[áa]\\s+(?:tens|tem)\\b|\\s+(?:(?:that|which)\\s+)?(?:i|we)\\s+(?:sent|attached|uploaded|shared|gave)\\b|\\s+(?:that\\s+)?you\\s+(?:already\\s+)?have\\b'
_DE_UM_FORMATO = 'd[oa]s?\\s+' + _PALAVRA_FICHEIRO + _LISTA_FORMATOS
_FICHEIRO_QUE_JA_EXISTE = re.compile('(?P<pedido>\\b(?:precis\\w*|esque[cç]\\w*)(?:-(?:te|se|me))?\\s+(?:(?:também|ainda|mesmo|só|já|agora)\\s+)?' + _DE_UM_FORMATO + '(?:\\s*(?:,|\\be\\b|\\bou\\b)\\s*(?:' + _DE_UM_FORMATO + '|' + _LISTA_FORMATOS + '))*)|' + _ANTES_DE_UM_FICHEIRO_QUE_EXISTE + _LISTA_FORMATOS + '|(?<!\\bum )(?<!\\buma )(?<!\\ba )(?<!\\ban )' + _LISTA_FORMATOS + '(?=' + _DEPOIS_DE_UM_FICHEIRO_QUE_EXISTE + ')', re.I)
_ATE_AO_FORMATO = '(?:(?:em|para|num|numa|no formato|in|into|to|ser|[ée]|era|seja|o|a|os|as|um|uma|the|an|ficheiro|file|formato|format)\\s+)*'
_NEGACAO = '\\b(?:n[ãa]o|nem|sem|em vez d[eoa]s?|em lugar d[eoa]s?|ao inv[ée]s d[eoa]s?|not|nor|without|instead of|rather than)\\s+'
_VERBO_NEGADO = "\\b(?:(?:n[ãa]o|nem)\\s+(?:(?:me|te|lhe|nos|vos|se)\\s+)?(?:quer\\w*|precis\\w*|[ée] preciso|[ée] necess[áa]rio|faz falta|fa[çc]a[sm]?|us[ae][sm]?|cri[ae][sm]?|ger[ae][sm]?|mand[ae][sm]?|envi[ae][sm]?|inclu[ai][sm]?|ponha[sm]?|convert[ae][sm]?|export[ae][sm]?)|(?:don'?t|do not|doesn'?t|does not)\\s+(?:need|want|make|use|create|send|include|generate|export|convert)|no need (?:to|for))\\b"
_PALAVRAS_DA_ORACAO = '(?:(?!(?:mas|but|por[ée]m|contudo)\\b)[^\\s,.;:!?()—–]+\\s+){0,5}?'
_FORMATO_RECUSADO = re.compile(_NEGACAO + _ATE_AO_FORMATO + _LISTA_FORMATOS + '|' + _VERBO_NEGADO + '\\s+' + _PALAVRAS_DA_ORACAO + _LISTA_FORMATOS + '|\\b(?:(?:em|para|in|to)\\s+)?' + _LISTA_FORMATOS + '\\s+n[ãa]o(?=\\s*(?:[,.;:!?)]|$))', re.I)
_FORMATO_DO_PROBLEMA = re.compile('\\b(?:abr(?:e|em|o|i|imos|iu|ia|ir|indo)|funciona[mr]?|funcionou|d[áa] erro|deu erro|opens?|opened|opening|works?|worked|working)\\s+(?:(?:bem|mal|direito|corretamente|properly|well)\\s+)?(?:em|no|na|pelo|pela|com o|com a|in|on|with)\\s+(?:(?:o|a|the)\\s+)?' + _LISTA_FORMATOS, re.I)
_SEM_LIGACAO = '(?:(?!\\b(?:do|da|dos|das|que|no|na|nos|nas)\\b)[^.\\n!?]){0,30}?'
_ANUNCIO = re.compile('\\b(?:criei|gerei|anexei|preparei|elaborei|exportei|converti|guardei|produzi)\\b[^.\\n!?]{0,60}\\b' + _NOMES + '\\b|\\b(?:segue[m]?|envio(?:-te|-lhe)?|anexo|junto)\\s+(?:em anexo|anexad[oa]s?|(?:o |a |os |as |um |uma )?(?:teu |tua |seu |sua )?' + _NOMES_ESTRITOS + '\\b)|\\b(?:segue[m]?|vai|v[ãa]o|est[áa]|est[ãa]o|fica[m]?|envio)\\s+' + _SEM_LIGACAO + '\\bem anexo\\b|\\b(?:est[áa]|est[ãa]o|fic(?:a|am|ou|aram))\\s+(?:pront[oa]s?|anexad[oa]s?|dispon[íi]ve(?:l|is))\\b[^.\\n!?]{0,40}\\b' + _NOMES + '\\b|\\b' + _NOMES + '\\b[^.\\n!?]{0,30}\\b(?:est[áa]|est[ãa]o|fic(?:a|am|ou|aram))\\s+(?:pront[oa]s?|anexad[oa]s?|dispon[íi]ve(?:l|is)|em anexo)\\b|\\baqui\\s+(?:est[áa]|est[ãa]o|tens|tem|vai|fica[m]?)\\s+(?:o |a |os |as |um |uma )?(?:teu |tua |seu |sua )?' + _NOMES_ESTRITOS + '\\b|\\b(?:pode[sm]?|podem|poder[áã]s?|basta|clica\\w*|clique|link)\\b[^.\\n!?]{0,30}\\bdescarreg\\w*\\b[^.\\n!?]{0,30}\\b' + _NOMES_ESTRITOS + "\\b|\\b(?:i(?:'ve| have)?|we(?:'ve| have)?)\\s+(?:created|generated|attached|prepared|exported|converted|saved|produced)\\b[^.\\n!?]{0,60}\\b" + _NOMES + "\\b|\\b(?:is|are)\\s+(?:attached|ready (?:for|to) download)\\b|\\bplease find (?:the |it |attached)|\\bhere (?:is|are|'s) (?:the |your )?" + _NOMES_ESTRITOS + '\\b|\\byou can download\\b[^.\\n!?]{0,30}\\b' + _NOMES_ESTRITOS + '\\b|\\battached (?:is|are|you)\\b', re.I)
_PRONOME = '(?:me|te|nos|lhe|lhes)'
_VERBO_NO_FUTURO = '(?:\\w+\\s+){0,2}?(?!(?:re)?queres\\b)\\w+(?:ar|er|ir|ares|eres|ires)\\b'
_CONDICAO_OU_FUTURO = re.compile('\\b(?:assim que|logo que|as soon as)\\b|\\bmal\\s+(?:' + _PRONOME + '|eu|tu|você|ele|ela|tenhas?|recebas?|possas?|consigas?|saibas?|estejas?|haja|obtenhas?|chegues?|vejas?|envies?|mandes?|confirmes?|indiques?|digas?|d[êe]s?)\\b|\\be depois\\b|\\bdepois disso\\b|\\bdepois de\\s+(?:' + _PRONOME + '\\s+)?(?:\\w+\\s+){0,2}?\\w+(?:ares|eres|ires)\\b|\\bquando\\s+(?:' + _PRONOME + '\\s+)?' + _VERBO_NO_FUTURO + '|(?<![-\\w])(?<!diz-me )(?<!diga-me )(?<!sei )(?<!saber )se\\s+(?!calhar\\b)(?:' + _PRONOME + '\\s+)?' + _VERBO_NO_FUTURO + "|\\b(?:vou|irei|vamos|iremos)\\b|\\b(?:logo )?a seguir\\b|\\b(?:em|de) seguida\\b|\\bmais tarde\\b|\\b(?:i|we)(?:'ll| will)\\b|\\b(?:when|once|after|if|unless)\\s+(?:you|i|we)\\s+(?!(?:\\w+ed|spoke|sent|asked|gave|said|told|wrote|saw|had|were|was|did|made|got)\\b)|\\b(?:diz|d[áa]|manda|envia|indica|confirma|passa|partilha|diga|d[êe]|mande|envie|indique|confirme|passe|partilhe)-(?:me|nos)\\b(?!\\s+(?:se|o que)\\b)|\\b(?:send|give|tell) (?:me|us)\\b(?!\\s+(?:what|if|whether)\\b)|\\bcom (?:ess[ea]s?|est[ea]s?|o|a|os|as)\\s+(?:dados?|informaç(?:ão|ões)|elementos?|nif|morada|nome|valores?|preços?|números?|datas?|contactos?|detalhes)\\b(?!\\s+(?:d[oa]s?\\b|que\\b(?!\\s+(?:" + _PRONOME + '\\s+)?' + _VERBO_NO_FUTURO + ')))', re.I)
_FIM_DE_ORACAO = re.compile('[—–:;]|\\s-\\s|\\b(?:mas|but)\\b', re.I)
_ENTREGA_IMEDIATA = re.compile('(?:aqui|here)\\b', re.I)
_PRESENTE_POR_FUTURO = re.compile('(?:envio|anexo|junto)\\b', re.I)
_FIM_DE_ORACAO_DEPOIS = re.compile('[—–:;,]|\\s-\\s|\\b(?:mas|but|e|and)\\b', re.I)
_MAIS_TARDE = re.compile('\\b(?:logo )?a seguir\\b|\\b(?:em|de) seguida\\b|\\bmais tarde\\b|\\bdaqui a (?:pouco|bocado)\\b|\\bdepois(?=\\s*(?:[.!?;,]|$))', re.I)
_PASSADO = re.compile("\\b(?:criei|gerei|anexei|preparei|elaborei|exportei|converti|guardei|produzi|fic(?:ou|aram))\\b|\\b(?:i|we)(?:'ve| have)?\\s+(?:created|generated|attached|prepared|exported|converted|saved|produced)\\b", re.I)
_FIM_DE_FRASE = re.compile('[.!?;](?=\\s)|\\n')
_NOMES_DE_IMAGEM = '(?:imag(?:em|ens)|fotografias?|fotos?|ilustraç(?:ão|ões)|images?|pictures?|photos?)'
_NOMES_DE_VIDEO = '(?:v[íi]deos?|videos?)'
_NOMES_DE_MEDIA = '(?:' + _NOMES_DE_IMAGEM + '|' + _NOMES_DE_VIDEO + ')'
_NOMES_DE_ANUNCIO = '(?:an[úu]ncios?)'
_NAO_DEPOIS_DE_DE = '(?<!\\bde )(?<!\\bdo )(?<!\\bda )(?<!\\bdos )(?<!\\bdas )(?<!\\bof )'
_ARTIGO_DE_MEDIA = '(?:(?:o|a|os|as|um|uma|the|your|an)\\s+)?(?:(?:teu|tua|teus|tuas|seu|sua|seus|suas|nov[oa]s?|new)\\s+)?'
_ATE_AO_VERBO = '[^.\\n!?:;—–]{0,30}?'
_ANUNCIO_DE_MEDIA = re.compile('\\baqui\\s+(?:est[áa]|est[ãa]o|tens|tem|vai|v[ãa]o|fica[m]?|segue[m]?)\\s+' + _ARTIGO_DE_MEDIA + '(?P<aqui>' + _NOMES_DE_MEDIA + ')\\b|\\b(?:est[áa]|est[ãa]o|fic(?:a|am|ou|aram))\\s+(?:aqui\\s+)?(?:em baixo|abaixo|pront[oa]s?)\\s+' + _ARTIGO_DE_MEDIA + '(?P<depois>' + _NOMES_DE_MEDIA + ')\\b|' + _NAO_DEPOIS_DE_DE + '\\b(?P<antes>' + _NOMES_DE_MEDIA + ')\\b' + _ATE_AO_VERBO + '\\b(?:est[áa]|est[ãa]o|fic(?:a|am|ou|aram)|segue[m]?)\\s+(?:aqui\\s+)?(?:em baixo|abaixo|pront[oa]s?)(?!\\w)|' + _NAO_DEPOIS_DE_DE + '\\b(?P<anuncio>' + _NOMES_DE_ANUNCIO + ')\\b' + _ATE_AO_VERBO + "\\b(?:est[áa]|est[ãa]o|fic(?:a|am|ou|aram)|segue[m]?)\\s+(?:aqui\\s+)?(?:em baixo|abaixo)(?!\\w)|\\bhere (?:is|are|'s) " + _ARTIGO_DE_MEDIA + '(?P<here>' + _NOMES_DE_MEDIA + ')\\b|' + _NAO_DEPOIS_DE_DE + '\\b(?P<is>' + _NOMES_DE_MEDIA + ')\\b' + _ATE_AO_VERBO + '\\b(?:is|are)\\s+(?:ready|below)\\b', re.I)
_DE_ANTES = re.compile('\\b(?:anterior(?:es)?|acima|antes(?!\\s+de\\b)|previous|above|earlier)\\b', re.I)

def formatos(texto):
    texto = texto or ''
    return {f for f, padrao in _FORMATOS.items() if re.search(padrao, texto, re.I)}

def _o_que_pede(mensagem):
    mensagem = _FORMATO_RECUSADO.sub(' ', _ORIGEM.sub('', mensagem or ''))
    return _FORMATO_DO_PROBLEMA.sub(' ', mensagem)

def formatos_pedidos(mensagem):
    return formatos_de_saida(mensagem) or formatos(_o_que_pede(mensagem))

def formatos_de_saida(mensagem):
    mensagem = _o_que_pede(mensagem)
    saidas = set()
    for m in _SAIDA.finditer(mensagem):
        lista = re.match(_LISTA_FORMATOS, mensagem[m.end():], re.I)
        if lista:
            saidas |= formatos(lista.group())
    return saidas

def anuncia_ficheiro(resposta):
    return next(_anuncios(resposta or '', _ANUNCIO), None) is not None

def _anuncios(texto, padrao):
    inicio_da_procura = 0
    while True:
        anuncio = padrao.search(texto, inicio_da_procura)
        if not anuncio:
            return
        inicio_da_procura = anuncio.start() + 1
        if _PASSADO.search(anuncio.group()) or _ENTREGA_IMEDIATA.match(anuncio.group()):
            yield anuncio
            continue
        inicio_da_frase = max((fim.end() for fim in _FIM_DE_FRASE.finditer(texto, 0, anuncio.start())), default=0)
        inicio_da_oracao = max((fim.end() for fim in _FIM_DE_ORACAO.finditer(texto, inicio_da_frase, anuncio.start())), default=inicio_da_frase)
        fim_da_frase = _FIM_DE_FRASE.search(texto, anuncio.end())
        fim_da_frase = fim_da_frase.start() if fim_da_frase else len(texto)
        fim_da_oracao = _FIM_DE_ORACAO_DEPOIS.search(texto, anuncio.end(), fim_da_frase)
        fim_da_oracao = fim_da_oracao.start() if fim_da_oracao else fim_da_frase
        promessa = _CONDICAO_OU_FUTURO.search(texto, inicio_da_oracao, anuncio.start()) or (_PRESENTE_POR_FUTURO.match(anuncio.group()) and _MAIS_TARDE.search(texto, anuncio.end(), fim_da_oracao))
        if not promessa:
            yield anuncio

def anuncia_imagem_ou_video(resposta):
    texto = resposta or ''
    tipos = set()
    for anuncio in _anuncios(texto, _ANUNCIO_DE_MEDIA):
        if not _ENTREGA_IMEDIATA.match(anuncio.group()):
            inicio = max((fim.end() for fim in _FIM_DE_FRASE.finditer(texto, 0, anuncio.start())), default=0)
            fim = _FIM_DE_FRASE.search(texto, anuncio.end())
            if _DE_ANTES.search(texto, inicio, fim.start() if fim else len(texto)):
                continue
        nome = next((grupo for grupo in anuncio.groups() if grupo))
        tipos.add('vídeo' if re.fullmatch(_NOMES_DE_VIDEO + '|' + _NOMES_DE_ANUNCIO, nome, re.I) else 'imagem')
    return tipos

def tipo_de_media(formato):
    if formato in _IMAGENS:
        return 'imagem'
    if formato in _VIDEOS:
        return 'vídeo'
    return None

def formatos_em_falta(mensagem, entregues):
    return set().union(*(g for g in _grupos_exigidos(mensagem) if not g.intersection(entregues)))

def formatos_exigidos(mensagem):
    return set().union(*_grupos_exigidos(mensagem))

def _grupos_exigidos(mensagem):
    mensagem = _o_que_pede(mensagem)
    listas = []
    for saida in _SAIDA.finditer(mensagem):
        lista = re.match(_LISTA_FORMATOS, mensagem[saida.end():], re.I)
        if lista:
            listas.append(lista.group())
    grupos = []
    for lista in listas or [_FICHEIRO_QUE_JA_EXISTE.sub(lambda m: m.group() if m.group('pedido') else ' ', mensagem)]:
        anterior = None
        for nome in re.finditer('\\b(?:' + _NOMES_DE_FORMATO + ')\\b', lista, re.I):
            opcoes = formatos(nome.group())
            if anterior and re.fullmatch('\\s*(?:ou|or|/)\\s*', lista[anterior.end():nome.start()], re.I):
                grupos[-1] |= opcoes
            else:
                grupos.append(opcoes)
            anterior = nome
    return grupos

def tipo_de_imagem(dados):
    for extensao, (mime, assinatura) in _IMAGENS.items():
        if dados and assinatura(dados):
            return (extensao, mime)
    return None

def tipo_de_video(dados):
    for extensao, (mime, assinatura) in _VIDEOS.items():
        if dados and assinatura(dados):
            return (extensao, mime)
    return None

def basta_o_inicio(nome):
    formato = nome.rsplit('.', 1)[-1].lower() if '.' in (nome or '') else ''
    return formato in _IMAGENS or formato in _VIDEOS

def inicio_do_anexo(att, tamanho=64):
    if not att.store_fname:
        return (att.raw or b'')[:tamanho]
    try:
        with open(att._full_path(att.store_fname), 'rb') as ficheiro:
            return ficheiro.read(tamanho)
    except OSError:
        return b''

def formato_valido(nome, mimetype, dados):
    nome = nome or ''
    formato = nome.rsplit('.', 1)[-1].lower() if '.' in nome else ''
    if formato in _IMAGENS or formato in _VIDEOS:
        mime, assinatura = _IMAGENS.get(formato) or _VIDEOS[formato]
        return formato if dados and mimetype == mime and assinatura(dados) else None
    if not dados or formato not in documentos.FORMATOS_GERAVEIS or mimetype != documentos.MIMES.get(formato):
        return None
    try:
        if formato in documentos.TIPOS_MODERNOS:
            if not documentos.estrutura(formato, dados):
                return None
        elif formato == 'pdf':
            if not dados.startswith(b'%PDF-') or b'%%EOF' not in dados[-2048:]:
                return None
            leitor = PdfReader(io.BytesIO(dados))
            if not leitor.pages:
                return None
            for pagina in leitor.pages:
                conteudo = pagina.get_contents()
                if conteudo is not None:
                    conteudo.get_data()
        elif not dados.decode('utf-8-sig').strip():
            return None
    except Exception:
        return None
    return formato
