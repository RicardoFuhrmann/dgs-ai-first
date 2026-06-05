"""Configurações centralizadas do pipeline RAG NovaTech."""

import os

# Caminho dos documentos individuais (copiados para dentro do projeto)
SOURCE_DIR = os.path.join(os.path.dirname(__file__), "..", "docs")

# Arquivos individuais para ingestão
SOURCE_DOCUMENTS = {
    "POL-001": os.path.join(SOURCE_DIR, "POL-001-politica-devolucao.md"),
    "PROC-042": os.path.join(SOURCE_DIR, "PROC-042-frete-especial-v1.md"),
    "PROC-042-v2": os.path.join(SOURCE_DIR, "PROC-042-v2-frete-especial-revisado.md"),
    "SLA-2024": os.path.join(SOURCE_DIR, "SLA-2024-tabela-sla-clientes.md"),
    "FAQ-Atendimento": os.path.join(SOURCE_DIR, "FAQ-atendimento.md"),
}

# Modelo de embeddings (multilingual para queries em português)
EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

# ChromaDB
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", ".chroma_db")
CHROMA_COLLECTION_NAME = "novatech_docs"

# Chunking
MAX_CHUNK_SIZE = 1500  # caracteres - limite para subdivisão
CHUNK_OVERLAP_RATIO = 0.12  # 12% de overlap

# Busca
DEFAULT_TOP_K = 7

# Diretório de saída dos testes
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..")
