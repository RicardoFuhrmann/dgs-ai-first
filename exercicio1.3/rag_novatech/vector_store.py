"""Módulo de vector store usando ChromaDB local."""

import os
from dataclasses import dataclass

import chromadb

from .config import CHROMA_PERSIST_DIR, CHROMA_COLLECTION_NAME, DEFAULT_TOP_K
from .chunker import Chunk
from .embeddings import generate_embeddings, generate_query_embedding


@dataclass
class RetrievedChunk:
    rank: int
    chunk_id: str
    source_document: str
    section: str
    text: str
    distance: float
    document_type: str
    version: str
    is_informal_source: bool
    observation: str = ""


def _get_client() -> chromadb.PersistentClient:
    """Cria ou abre o client ChromaDB persistente."""
    persist_dir = os.path.abspath(CHROMA_PERSIST_DIR)
    os.makedirs(persist_dir, exist_ok=True)
    return chromadb.PersistentClient(path=persist_dir)


def create_collection(recreate: bool = True) -> chromadb.Collection:
    """Cria (ou recria) a collection no ChromaDB.

    Args:
        recreate: Se True, apaga a collection existente antes de criar.

    Returns:
        Instância da Collection.
    """
    client = _get_client()

    if recreate:
        try:
            client.delete_collection(CHROMA_COLLECTION_NAME)
            print(f"✓ Collection '{CHROMA_COLLECTION_NAME}' removida para recriação.")
        except Exception:
            pass

    collection = client.get_or_create_collection(
        name=CHROMA_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    print(f"✓ Collection '{CHROMA_COLLECTION_NAME}' pronta.")
    return collection


def index_chunks(chunks: list[Chunk]) -> int:
    """Indexa chunks no vector store com embeddings e metadados.

    Args:
        chunks: Lista de Chunk para indexar.

    Returns:
        Número de chunks indexados.
    """
    collection = create_collection(recreate=True)

    # Prepend context metadata to text for better embedding quality.
    # The original text is stored in 'documents' for display.
    texts_for_embedding = []
    for c in chunks:
        prefix = (
            f"Documento: {c.source_document}. "
            f"Tipo: {c.document_type}. "
            f"Seção: {c.section}. "
        )
        if c.is_informal_source:
            prefix += "Fonte informal (FAQ). "
        texts_for_embedding.append(prefix + c.text)

    texts = [c.text for c in chunks]
    ids = [c.chunk_id for c in chunks]
    metadatas = [
        {
            "source_document": c.source_document,
            "section": c.section,
            "title": c.title,
            "document_type": c.document_type,
            "version": c.version,
            "is_informal_source": str(c.is_informal_source),
            "chunk_id": c.chunk_id,
        }
        for c in chunks
    ]

    print(f"⏳ Gerando embeddings para {len(texts_for_embedding)} chunks...")
    embeddings = generate_embeddings(texts_for_embedding)

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )

    print(f"✓ {len(chunks)} chunks indexados no ChromaDB.")
    return len(chunks)


def search(question: str, top_k: int = DEFAULT_TOP_K) -> list[RetrievedChunk]:
    """Busca os chunks mais relevantes para uma pergunta.

    Args:
        question: Pergunta em linguagem natural.
        top_k: Número de resultados a retornar.

    Returns:
        Lista de RetrievedChunk ordenados por relevância.
    """
    client = _get_client()

    try:
        collection = client.get_collection(CHROMA_COLLECTION_NAME)
    except Exception:
        raise RuntimeError(
            "Collection não encontrada. Execute 'ingest' primeiro.\n"
            "Comando: python -m rag_novatech.cli ingest"
        )

    query_embedding = generate_query_embedding(question)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    retrieved = []
    for i in range(len(results["ids"][0])):
        meta = results["metadatas"][0][i]
        distance = results["distances"][0][i]
        is_informal = meta.get("is_informal_source", "False") == "True"

        observation = ""
        if is_informal:
            observation = "⚠️ Fonte informal (FAQ) — não validada por Compliance"

        retrieved.append(RetrievedChunk(
            rank=i + 1,
            chunk_id=results["ids"][0][i],
            source_document=meta.get("source_document", ""),
            section=meta.get("section", ""),
            text=results["documents"][0][i],
            distance=distance,
            document_type=meta.get("document_type", ""),
            version=meta.get("version", ""),
            is_informal_source=is_informal,
            observation=observation,
        ))

    return retrieved
