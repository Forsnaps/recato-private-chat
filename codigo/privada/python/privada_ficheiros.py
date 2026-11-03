# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
"""Os ficheiros da conversa privada (27/10/2026, decisão do Pedro: «mesmo código»).

Corre no ecrã, no browser ou na app, com o Pyodide (python_trabalhador.js),
e usa os MESMOS módulos do chat do Recato que fazem os ficheiros
(documentos.py e revisoes.py, copiados tal como estão por
scripts/python_do_chat.py para forsnaps/addons/forsnaps_ai_chat/). O que
aqui está é o que o servidor faz à volta deles nas ferramentas create_file e
append_to_file (forsnaps_ai_chat, controllers/ai_chat.py: _tool_create_file,
_tool_append_to_file, _gerar_ficheiro e _saida_do_ficheiro), sem a base de
dados: o ficheiro fica na conversa, cifrado, e guarda-se a «fonte» dele (os
argumentos do create_file, como _fontes_dos_ficheiros no servidor), de onde o
ecrã o volta a fazer.

Só muda o PDF: no servidor o HTML de documentos.gerar('pdf') passa pelo
wkhtmltopdf; aqui é o fpdf2 que o desenha, a partir do mesmo HTML.
"""
import json
import pathlib
import re

from forsnaps.addons.forsnaps_ai_chat import documentos, entrega_ficheiros

#: O tamanho máximo de um ficheiro feito pelo modelo, como no chat (_MAX_FICHEIRO_GERADO_BYTES).
MAX_FICHEIRO_BYTES = 10 * 1024 * 1024
#: As letras do PDF (DejaVu, com o «€» e as letras portuguesas): no
#: Pyodide, na pasta que o trabalhador monta.
PASTA_DAS_LETRAS = pathlib.Path('/privada/letras')
LETRAS = {'': 'DejaVuSans.ttf', 'B': 'DejaVuSans-Bold.ttf', 'I': 'DejaVuSans-Oblique.ttf',
          'BI': 'DejaVuSans-BoldOblique.ttf'}

NOTA_DO_CREATE = ('O ficheiro segue anexado à tua resposta: diz ao utilizador que o pode descarregar e '
                  'não repitas o conteúdo todo no chat. Se ainda faltam partes, acrescenta-as com '
                  'append_to_file e este attachment_id.')
NOTA_DO_APPEND = ('Parte acrescentada: o ficheiro continua a ser um só, anexado à tua resposta. '
                  'Se ainda faltam partes, acrescenta-as da mesma maneira.')


def _sem_rede_no_fpdf():
    """O fpdf2 importa peças de HTTPS (para ir buscar imagens à rede) que o
    Pyodide não tem: ficam peças vazias — aqui nunca se vai à rede."""
    import http.client
    import urllib.request
    if not hasattr(urllib.request, 'HTTPSHandler'):
        urllib.request.HTTPSHandler = type('HTTPSHandler', (urllib.request.BaseHandler,), {})
    if not hasattr(http.client, 'HTTPSConnection'):
        http.client.HTTPSConnection = http.client.HTTPConnection


def pdf_do_html(html):
    """O PDF (bytes) do HTML que documentos.gerar('pdf') devolve, com os
    tamanhos do estilo dele (corpo 11 pt, títulos 20/16/13 pt, margens 20 mm)."""
    _sem_rede_no_fpdf()
    from fpdf import FPDF, FontFace
    pdf = FPDF(format='A4')
    pdf.set_margins(20, 20, 20)
    pdf.set_auto_page_break(True, margin=20)
    titulo = re.search(r'<title>(.*?)</title>', html, re.S)
    if titulo:
        pdf.set_title(documentos._html.unescape(titulo.group(1)))
    familia = 'helvetica'
    if all((PASTA_DAS_LETRAS / f).exists() for f in LETRAS.values()):
        familia = 'DejaVu'
        for estilo, ficheiro in LETRAS.items():
            pdf.add_font('DejaVu', estilo, str(PASTA_DAS_LETRAS / ficheiro))
    pdf.set_font(familia, size=11)
    pdf.set_text_color(0x22, 0x22, 0x22)
    pdf.add_page()
    corpo = html.split('<body>', 1)[-1].rsplit('</body>', 1)[0]
    estilos = {
        'h1': FontFace(family=familia, emphasis='BOLD', size_pt=20),
        'h2': FontFace(family=familia, emphasis='BOLD', size_pt=16),
        'h3': FontFace(family=familia, emphasis='BOLD', size_pt=13),
        'h4': FontFace(family=familia, emphasis='BOLD', size_pt=11),
        'pre': FontFace(family=familia, size_pt=9.5),
        'code': FontFace(family=familia, size_pt=9.5),
    }
    pdf.write_html(corpo, tag_styles=estilos, li_prefix_color=(0x22, 0x22, 0x22))
    return bytes(pdf.output())


def _gerar(fonte, maximo=documentos.MAX_CONTEUDO_CHARS):
    """``(bytes, resumo das contas ou None)`` do ficheiro descrito em *fonte*
    (os argumentos do create_file), como _gerar_ficheiro no servidor."""
    formato = fonte['format']
    resumo = None
    if fonte.get('computed') or fonte.get('totals'):
        dados, resumo = documentos.gerar_tabela(
            formato, conteudo=fonte.get('content'), linhas=fonte.get('rows'), titulo=fonte.get('title'),
            calculadas=fonte.get('computed'), totais=fonte.get('totals'),
            rotulo_total=fonte.get('total_label'), maximo=maximo)
    else:
        dados = documentos.gerar(formato, conteudo=fonte.get('content'),
                                 linhas=fonte.get('rows'), titulo=fonte.get('title'), maximo=maximo)
    if formato == 'pdf':
        dados = pdf_do_html(dados.decode('utf-8'))
    return dados, resumo


def _saida(attachment_id, nome, formato, dados, resumo, nota):
    """O que o create_file e o append_to_file devolvem ao modelo (_saida_do_ficheiro)."""
    saida = {
        'ok': True, 'attachment_id': attachment_id, 'name': nome, 'format': formato,
        'size': len(dados), 'note': nota,
    }
    if resumo:
        saida['rows'] = resumo['linhas']
        saida['computed'] = resumo['calculadas']
        saida['totals'] = [{'column': t['coluna'], 'sum': t['valor'], 'euros': t['euros']}
                           for t in resumo['totais']]
        if resumo['sem_valor_total']:
            saida['rows_without_value'] = {
                'count': resumo['sem_valor_total'],
                'examples': [{'row': s['linha'], 'column': s['coluna'], 'reason': s['motivo']}
                             for s in resumo['sem_valor'][:5]],
            }
        saida['note'] += (f" A folha tem {resumo['linhas']} linhas de dados."
                          + (' As colunas calculadas e os totais são fórmulas que o Excel calcula ao abrir;'
                             if formato == 'xlsx' else
                             ' As colunas calculadas e os totais foram calculados pelo servidor;')
                          + ' os totais acima e o número de linhas são os do servidor — se os disseres ao '
                          'utilizador, usa estes, sem refazer contas.')
        if resumo['sem_valor_total']:
            saida['note'] += (' Algumas linhas ficaram sem valor calculado (ver rows_without_value): '
                              'diz ao utilizador quais.')
    return json.dumps(saida, ensure_ascii=False)


def criar(args, attachment_id):
    """create_file: ``{'fonte', 'nome', 'formato', 'mime', 'dados', 'saida'}``,
    ou ``{'erro'}`` (o JSON que o modelo recebe), como _tool_create_file."""
    try:
        formato = str(args.get('format') or '').strip().lower()
        if formato not in documentos.FORMATOS_GERAVEIS:
            raise ValueError(f'formato não suportado: {formato!r} '
                             f'(aceites: {", ".join(documentos.FORMATOS_GERAVEIS)})')
        nome = documentos.nome_seguro(args.get('name'), formato)
        fonte = {'format': formato, 'name': nome}
        for chave in ('content', 'rows', 'title', 'computed', 'totals', 'total_label'):
            if args.get(chave):
                fonte[chave] = args[chave]
        if isinstance(fonte.get('content'), str):
            fonte['content'] = fonte['content'][:documentos.MAX_CONTEUDO_CHARS]
        dados, resumo = _gerar(fonte)
        return {'fonte': fonte, 'nome': nome, 'formato': formato, 'mime': documentos.MIMES[formato],
                'dados': dados, 'saida': _saida(attachment_id, nome, formato, dados, resumo, NOTA_DO_CREATE)}
    except ValueError as e:
        return {'erro': json.dumps({'error': str(e)}, ensure_ascii=False)}
    except Exception:  # noqa: BLE001 — como no chat: o modelo lê só o erro genérico
        return {'erro': json.dumps({'error': 'falha a processar o ficheiro'})}


def _juntar_markdown(antes, parte):
    """O Markdown com a parte nova no fim (_juntar_markdown no servidor): a
    seguir a uma linha de tabela, uma parte que começa por outra linha
    continua a tabela."""
    antes = antes.rstrip('\n')
    parte = parte.lstrip('\n')
    if not antes:
        return parte
    ultima = antes.rsplit('\n', 1)[-1].strip()
    if ultima.startswith('|') and parte.lstrip().startswith('|'):
        return antes + '\n' + parte
    return antes + '\n\n' + parte


def acrescentar(fonte, args, attachment_id):
    """append_to_file: junta uma parte ao ficheiro de *fonte* e refá-lo
    (_tool_append_to_file); o mesmo formato de resposta que criar."""
    try:
        if not isinstance(fonte, dict) or not fonte.get('format'):
            raise ValueError('ficheiro não encontrado: só se acrescenta a um ficheiro criado com '
                             'create_file nesta resposta — usa o attachment_id que ele devolveu')
        conteudo = args.get('content')
        linhas = args.get('rows')
        tem_texto = isinstance(conteudo, str) and conteudo.strip()
        if linhas is not None and not isinstance(linhas, list):
            raise ValueError('`rows` tem de ser uma lista de linhas')
        if not tem_texto and not linhas:
            raise ValueError('nada para acrescentar: dá o Markdown em content ou as linhas em rows')
        nova = dict(fonte)
        if tem_texto:
            nova['content'] = _juntar_markdown(fonte.get('content') or '',
                                               conteudo[:documentos.MAX_CONTEUDO_CHARS])
        if linhas:
            if fonte.get('rows'):
                if linhas[0] == fonte['rows'][0]:
                    linhas = linhas[1:]
                if len(fonte['rows']) + len(linhas) > documentos.MAX_LINHAS:
                    raise ValueError(f'a folha passaria o máximo de {documentos.MAX_LINHAS} linhas')
                nova['rows'] = list(fonte['rows']) + list(linhas)
            else:
                nova['content'] = _juntar_markdown(
                    nova.get('content') or '',
                    '\n'.join('| ' + ' | '.join(str(v) for v in fila) + ' |'
                              for fila in linhas if isinstance(fila, list)))
        nome, formato = fonte['name'], fonte['format']
        dados, resumo = _gerar(nova, maximo=None)
        if len(dados) > MAX_FICHEIRO_BYTES:
            raise ValueError('o ficheiro ficaria demasiado grande (máx. 10 MB)')
        return {'fonte': nova, 'nome': nome, 'formato': formato, 'mime': documentos.MIMES[formato],
                'dados': dados, 'saida': _saida(attachment_id, nome, formato, dados, resumo, NOTA_DO_APPEND)}
    except ValueError as e:
        return {'erro': json.dumps({'error': str(e)}, ensure_ascii=False)}
    except Exception:  # noqa: BLE001
        return {'erro': json.dumps({'error': 'falha a processar o ficheiro'})}


def gerar(fonte):
    """Os bytes de um ficheiro guardado na conversa, refeito da fonte (para o
    descarregar outra vez): a fonte de um ficheiro feito em partes já tem as
    partes cortadas, como no servidor."""
    return _gerar(fonte, maximo=None)[0]


def entrega(texto, pedido, entregues):
    """A entrega dos ficheiros de uma resposta (30/10/2026), pelas regras do
    chat (entrega_ficheiros, as de _confirmar_entrega_de_ficheiro): se o
    *texto* anuncia um ficheiro e que formatos o *pedido* da pessoa quer que
    não estão nos *entregues* (os dos ficheiros feitos na resposta). A ronda
    de reparação é o ecrã que a faz (pesquisa.js)."""
    return {'anuncia': entrega_ficheiros.anuncia_ficheiro(texto or ''),
            'em_falta': sorted(entrega_ficheiros.formatos_em_falta(pedido or '', set(entregues or ())))}
