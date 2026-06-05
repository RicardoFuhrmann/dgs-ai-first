"""Módulo de ingestão dos documentos individuais da NovaTech."""

import os

from .config import SOURCE_DOCUMENTS


def load_documents() -> dict[str, str]:
    """Lê todos os documentos individuais e retorna um dicionário {doc_id: conteúdo}.

    Returns:
        Dicionário com ID do documento como chave e conteúdo UTF-8 como valor.

    Raises:
        FileNotFoundError: Se algum arquivo não for encontrado.
    """
    documents = {}
    for doc_id, filepath in SOURCE_DOCUMENTS.items():
        if not os.path.exists(filepath):
            raise FileNotFoundError(
                f"Arquivo não encontrado: {filepath}\n"
                f"Documento esperado: {doc_id}"
            )

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        if not content.strip():
            raise ValueError(f"Arquivo vazio: {filepath}")

        documents[doc_id] = content
        print(f"  ✓ {doc_id}: {len(content)} chars — {os.path.basename(filepath)}")

    print(f"✓ {len(documents)} documentos carregados.")
    return documents
