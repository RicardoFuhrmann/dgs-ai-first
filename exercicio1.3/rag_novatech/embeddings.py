"""Módulo de geração de embeddings usando sentence-transformers."""

from sentence_transformers import SentenceTransformer

from .config import EMBEDDING_MODEL

_model = None


def load_model() -> SentenceTransformer:
    """Carrega o modelo de embeddings. Faz download na primeira execução.

    Returns:
        Instância do SentenceTransformer.

    Raises:
        RuntimeError: Se não conseguir carregar/baixar o modelo.
    """
    global _model
    if _model is not None:
        return _model

    try:
        print(f"⏳ Carregando modelo de embeddings: {EMBEDDING_MODEL}...")
        _model = SentenceTransformer(EMBEDDING_MODEL)
        print(f"✓ Modelo carregado: {EMBEDDING_MODEL}")
        return _model
    except Exception as e:
        raise RuntimeError(
            f"Erro ao carregar modelo '{EMBEDDING_MODEL}': {e}\n"
            "Verifique sua conexão com a internet para o primeiro download.\n"
            "Após o download inicial, funciona offline."
        ) from e


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Gera embeddings para uma lista de textos.

    Args:
        texts: Lista de strings para gerar embeddings.

    Returns:
        Lista de vetores de embeddings.
    """
    model = load_model()
    embeddings = model.encode(texts, show_progress_bar=True, convert_to_numpy=True)
    return embeddings.tolist()


def generate_query_embedding(query: str) -> list[float]:
    """Gera embedding para uma query de busca.

    Args:
        query: Texto da pergunta.

    Returns:
        Vetor de embedding.
    """
    model = load_model()
    embedding = model.encode([query], convert_to_numpy=True)
    return embedding[0].tolist()
