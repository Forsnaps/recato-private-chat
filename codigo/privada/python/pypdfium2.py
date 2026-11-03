# Copyright (c) 2026 Forsnaps AI - Soluções Tecnológicas, Unipessoal Lda.
# Todos os direitos reservados (all rights reserved) — ver privada/licencas.txt.
"""O pypdfium2 do chat do Recato, no ecrã da conversa privada (30/10/2026):
o Pyodide não o tem. O chat abre com ele os PDF para contar as páginas de um
PDF sem texto nenhum (_paginas_do_pdf) e para as desenhar (_pagina_em_jpeg).
No ecrã conta-as o pdfminer, e quem as desenha é o pdf.js (paginas.js), antes
de o Python as pedir (privada_anexos.paginas).
"""
import io


class PdfDocument:
    """Um PDF aberto: as páginas contam-se logo, e um PDF que não abre falha
    já aqui, como no pypdfium2."""

    def __init__(self, dados):
        from pdfminer.pdfpage import PDFPage

        self._paginas = sum(1 for _pagina in PDFPage.get_pages(io.BytesIO(bytes(dados))))

    def __len__(self):
        return self._paginas

    def close(self):
        pass
