"""CLI para o pipeline RAG NovaTech."""

import sys

from .document_loader import load_documents
from .chunker import chunk_all_documents
from .vector_store import index_chunks, search
from .prompt_builder import build_prompt
from .retrieval_test_runner import run_all_tests
from .config import DEFAULT_TOP_K


def cmd_ingest():
    """Carrega os documentos, faz chunking e indexa no vector store."""
    print("=" * 60)
    print("NovaTech RAG Pipeline — Ingestão")
    print("=" * 60)

    documents = load_documents()
    chunks = chunk_all_documents(documents)
    count = index_chunks(chunks)
    print(f"\n✅ Ingestão concluída: {count} chunks indexados.")


def cmd_search(question: str, top_k: int = DEFAULT_TOP_K):
    """Busca chunks relevantes para uma pergunta."""
    print(f"\n🔍 Buscando: \"{question}\" (top {top_k})\n")
    results = search(question, top_k=top_k)

    for r in results:
        informal = " [INFORMAL]" if r.is_informal_source else ""
        print(f"  #{r.rank} [{r.distance:.4f}] {r.chunk_id} — {r.source_document}/{r.section}{informal}")
        preview = r.text[:120].replace("\n", " ")
        print(f"     {preview}...")
        print()


def cmd_build_prompt(question: str, top_k: int = 5):
    """Monta e exibe o prompt completo para uso manual."""
    results = search(question, top_k=top_k)
    prompt = build_prompt(question, results)

    print("\n" + "=" * 60)
    print("PROMPT COMPLETO — Copie e cole em um LLM (Claude/ChatGPT)")
    print("=" * 60 + "\n")
    print(prompt)


def cmd_run_tests():
    """Executa os 5 testes de retrieval e gera arquivos .md."""
    print("=" * 60)
    print("NovaTech RAG Pipeline — Testes de Retrieval")
    print("=" * 60)

    # Garante ingestão
    print("\n📋 Verificando ingestão...")
    try:
        search("teste", top_k=1)
        print("✓ Collection encontrada. Usando índice existente.")
    except RuntimeError:
        print("⚠️ Collection não encontrada. Executando ingestão...")
        cmd_ingest()

    # Executa testes
    summary = run_all_tests()

    # Resumo
    print("\n" + "=" * 60)
    print("RESUMO DOS TESTES")
    print("=" * 60)
    for name, file, classification in summary:
        print(f"  {classification} — {name} → {file}")


def cmd_generate_local(question: str):
    """Tenta gerar resposta usando Ollama local (opcional)."""
    try:
        import subprocess
        result = subprocess.run(
            ["ollama", "list"], capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            raise FileNotFoundError("Ollama não disponível")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("⚠️ Ollama não está instalado ou não está respondendo.")
        print("   Use o comando 'build-prompt' para gerar o prompt manualmente:")
        print(f"   python -m rag_novatech.cli build-prompt \"{question}\"")
        return

    # Ollama disponível — gera resposta
    results = search(question, top_k=5)
    prompt = build_prompt(question, results)

    print("⏳ Gerando resposta com Ollama...")
    try:
        import subprocess
        result = subprocess.run(
            ["ollama", "run", "llama3.2", "--nowordwrap"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            print("\n" + "=" * 60)
            print("RESPOSTA GERADA LOCALMENTE (Ollama)")
            print("=" * 60 + "\n")
            print(result.stdout)
        else:
            print(f"Erro do Ollama: {result.stderr}")
    except subprocess.TimeoutExpired:
        print("⏱️ Timeout — o modelo demorou mais de 120s para responder.")


def main():
    if len(sys.argv) < 2:
        print("Uso: python -m rag_novatech.cli <comando> [argumentos]")
        print()
        print("Comandos disponíveis:")
        print("  ingest                          Carrega e indexa documentos")
        print("  search \"<pergunta>\"              Busca chunks relevantes")
        print("  build-prompt \"<pergunta>\"        Monta prompt para uso manual")
        print("  run-tests                       Executa 5 testes de retrieval")
        print("  generate-local \"<pergunta>\"      Gera resposta via Ollama (opcional)")
        sys.exit(1)

    command = sys.argv[1]

    if command == "ingest":
        cmd_ingest()
    elif command == "search":
        if len(sys.argv) < 3:
            print("Erro: forneça uma pergunta. Ex: python -m rag_novatech.cli search \"Qual o SLA?\"")
            sys.exit(1)
        cmd_search(sys.argv[2])
    elif command == "build-prompt":
        if len(sys.argv) < 3:
            print("Erro: forneça uma pergunta.")
            sys.exit(1)
        cmd_build_prompt(sys.argv[2])
    elif command == "run-tests":
        cmd_run_tests()
    elif command == "generate-local":
        if len(sys.argv) < 3:
            print("Erro: forneça uma pergunta.")
            sys.exit(1)
        cmd_generate_local(sys.argv[2])
    else:
        print(f"Comando desconhecido: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
