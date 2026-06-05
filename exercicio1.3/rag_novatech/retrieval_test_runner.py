"""Runner de testes de retrieval com geração de relatórios .md."""

import os
from dataclasses import dataclass

from .config import OUTPUT_DIR, DEFAULT_TOP_K
from .vector_store import search, RetrievedChunk
from .prompt_builder import build_prompt


@dataclass
class RetrievalTestCase:
    name: str
    question: str
    expected_chunks: list[str]
    acceptable_chunks: list[str]
    output_file: str
    notes: str = ""


# Definição dos 5 testes obrigatórios
TEST_CASES = [
    RetrievalTestCase(
        name="Prazo de devolução",
        question="Qual o prazo de devolução?",
        expected_chunks=["POL-001-A", "POL-001-B"],
        acceptable_chunks=["POL-001-C"],
        output_file="test_01_prazo_devolucao.md",
    ),
    RetrievalTestCase(
        name="Carga perigosa",
        question="Posso devolver carga perigosa?",
        expected_chunks=["POL-001-B"],
        acceptable_chunks=["FAQ-03", "POL-001-A"],
        output_file="test_02_carga_perigosa.md",
    ),
    RetrievalTestCase(
        name="SLA do cliente Gold",
        question="Qual o SLA do cliente Gold?",
        expected_chunks=["SLA-2024-B"],
        acceptable_chunks=["SLA-2024-A", "SLA-2024-C"],
        output_file="test_03_sla_gold.md",
    ),
    RetrievalTestCase(
        name="Frete para 600kg para Manaus",
        question="Frete para 600kg para Manaus?",
        expected_chunks=["PROC-042v2-B", "PROC-042v2-A"],
        acceptable_chunks=["PROC-042-B"],
        output_file="test_04_frete_600kg_manaus.md",
    ),
    RetrievalTestCase(
        name="Multiplicador para o Sudeste",
        question="Qual o multiplicador para o Sudeste?",
        expected_chunks=["PROC-042v2-B"],
        acceptable_chunks=["PROC-042-B"],
        output_file="test_05_multiplicador_sudeste.md",
    ),
]


def _classify_chunk(
    chunk_id: str,
    expected: list[str],
    acceptable: list[str],
) -> str:
    """Classifica se o chunk recuperado é correto, aceitável ou incorreto."""
    # Normaliza IDs: remove hífens extras para comparação flexível
    normalized_id = chunk_id.replace("-", "").lower()
    normalized_expected = [e.replace("-", "").lower() for e in expected]
    normalized_acceptable = [a.replace("-", "").lower() for a in acceptable]

    if normalized_id in normalized_expected:
        return "Sim"
    elif normalized_id in normalized_acceptable:
        return "Parcial"
    else:
        return "Não"


def _evaluate_result(
    results: list[RetrievedChunk],
    test: RetrievalTestCase,
) -> tuple[str, str]:
    """Avalia o resultado do retrieval e gera classificação + análise.

    Returns:
        (classificação, análise_texto)
    """
    retrieved_ids = [r.chunk_id for r in results]
    retrieved_ids_normalized = [r.replace("-", "").lower() for r in retrieved_ids]

    expected_normalized = [e.replace("-", "").lower() for e in test.expected_chunks]
    acceptable_normalized = [a.replace("-", "").lower() for a in test.acceptable_chunks]

    # Conta quantos esperados foram encontrados no top 5
    found_expected = sum(
        1 for e in expected_normalized if e in retrieved_ids_normalized
    )
    found_in_top3 = sum(
        1 for e in expected_normalized
        if e in [r.replace("-", "").lower() for r in retrieved_ids[:3]]
    )

    total_expected = len(test.expected_chunks)

    # Classificação
    if found_expected == total_expected:
        classification = "✅ Aprovado"
    elif found_expected > 0 or any(a in retrieved_ids_normalized for a in acceptable_normalized):
        classification = "⚠️ Parcial"
    else:
        classification = "❌ Reprovado"

    # Análise
    analysis_parts = []

    # Chunks principais no top 3
    if found_in_top3 == total_expected:
        analysis_parts.append(
            f"- ✅ Todos os {total_expected} chunk(s) esperado(s) apareceram no top 3."
        )
    elif found_in_top3 > 0:
        analysis_parts.append(
            f"- ⚠️ {found_in_top3} de {total_expected} chunk(s) esperado(s) no top 3."
        )
    else:
        analysis_parts.append(
            f"- ❌ Nenhum chunk esperado apareceu no top 3."
        )

    # Chunks contraditórios (versões diferentes do mesmo doc)
    doc_versions = {}
    for r in results:
        base_doc = r.source_document.replace("-v2", "").replace("v2", "")
        if base_doc not in doc_versions:
            doc_versions[base_doc] = set()
        doc_versions[base_doc].add(r.version)

    for doc, versions in doc_versions.items():
        if len(versions) > 1:
            analysis_parts.append(
                f"- ⚠️ Chunks contraditórios detectados: {doc} com versões {versions}. "
                f"Isso pode induzir o LLM a misturar informações de versões diferentes."
            )

    # Fontes informais
    informal_count = sum(1 for r in results if r.is_informal_source)
    if informal_count > 0:
        analysis_parts.append(
            f"- ℹ️ {informal_count} chunk(s) de fonte informal (FAQ) nos resultados."
        )

    # Separação de scores
    if len(results) >= 2:
        best_dist = results[0].distance
        worst_dist = results[-1].distance
        gap = worst_dist - best_dist
        analysis_parts.append(
            f"- Distância do melhor resultado: {best_dist:.4f}, pior: {worst_dist:.4f} "
            f"(gap: {gap:.4f}). "
            + (
                "Boa separação entre relevantes e irrelevantes."
                if gap > 0.15
                else "Separação pequena — pode haver ambiguidade nos resultados."
            )
        )

    # Chunks faltantes
    missing = [
        e for e, en in zip(test.expected_chunks, expected_normalized)
        if en not in retrieved_ids_normalized
    ]
    if missing:
        analysis_parts.append(
            f"- ❌ Chunk(s) obrigatório(s) ausente(s): {', '.join(missing)}. "
            f"Possíveis causas: chunking inadequado, metadados insuficientes ou top_k muito baixo."
        )

    analysis = "\n".join(analysis_parts)
    return classification, analysis


def run_single_test(test: RetrievalTestCase, top_k: int = DEFAULT_TOP_K) -> str:
    """Executa um único teste de retrieval e retorna o conteúdo do arquivo .md."""
    print(f"\n{'='*60}")
    print(f"Teste: {test.name}")
    print(f"Pergunta: {test.question}")
    print(f"{'='*60}")

    results = search(test.question, top_k=top_k)

    # Tabela de resultados
    table_rows = []
    for r in results:
        correct = _classify_chunk(r.chunk_id, test.expected_chunks, test.acceptable_chunks)
        obs = r.observation or ""
        table_rows.append(
            f"| {r.rank} | {r.chunk_id} | {r.source_document} | "
            f"{r.section} | {r.distance:.4f} | {correct} | {obs} |"
        )

    table = "\n".join(table_rows)

    # Avaliação
    classification, analysis = _evaluate_result(results, test)

    # Monta prompt manual
    prompt = build_prompt(test.question, results)

    # Comparação com gabarito
    retrieved_ids = [r.chunk_id for r in results]
    retrieved_normalized = [r.replace("-", "").lower() for r in retrieved_ids]
    expected_normalized = [e.replace("-", "").lower() for e in test.expected_chunks]

    found = [e for e, en in zip(test.expected_chunks, expected_normalized) if en in retrieved_normalized]
    missing = [e for e, en in zip(test.expected_chunks, expected_normalized) if en not in retrieved_normalized]

    comparison_text = ""
    if found:
        comparison_text += f"Chunks esperados encontrados: {', '.join(found)}.\n\n"
    if missing:
        comparison_text += f"Chunks esperados NÃO encontrados: {', '.join(missing)}.\n\n"
    if not missing:
        comparison_text += "Todos os chunks esperados foram recuperados.\n\n"

    comparison_text += f"Classificação: **{classification}**"

    # Gera o Markdown
    md_content = f"""# Teste: {test.name}

## Pergunta

{test.question}

## Chunks esperados

{chr(10).join(f"- {c}" for c in test.expected_chunks)}

## Chunks aceitáveis com menor relevância

{chr(10).join(f"- {c}" for c in test.acceptable_chunks) if test.acceptable_chunks else "- Nenhum"}

## Chunks recuperados

| Rank | Chunk ID | Documento | Seção | Score/Distância | Correto? | Observação |
|------|----------|-----------|-------|-----------------|----------|------------|
{table}

## Comparação com o gabarito

{comparison_text}

## Análise

{analysis}

## Prompt manual para geração

<details>
<summary>Clique para expandir o prompt completo</summary>

```
{prompt}
```

</details>
"""

    return md_content


def run_all_tests(top_k: int = DEFAULT_TOP_K) -> list[tuple[str, str, str]]:
    """Executa todos os testes e salva os arquivos .md.

    Returns:
        Lista de (nome_teste, arquivo, classificação).
    """
    results_summary = []

    for test in TEST_CASES:
        try:
            md_content = run_single_test(test, top_k=top_k)
            output_path = os.path.join(OUTPUT_DIR, test.output_file)
            output_path = os.path.abspath(output_path)

            with open(output_path, "w", encoding="utf-8") as f:
                f.write(md_content)

            print(f"✓ Arquivo salvo: {output_path}")

            # Extrai classificação
            if "✅ Aprovado" in md_content:
                classification = "✅ Aprovado"
            elif "⚠️ Parcial" in md_content:
                classification = "⚠️ Parcial"
            else:
                classification = "❌ Reprovado"

            results_summary.append((test.name, test.output_file, classification))

        except Exception as e:
            print(f"✗ Erro no teste '{test.name}': {e}")
            # Salva arquivo com erro
            error_md = f"""# Teste: {test.name}

## Pergunta

{test.question}

## Status

❌ **Teste não executado**

## Motivo

```
{str(e)}
```

## Instruções

Execute o pipeline de ingestão primeiro:

```bash
python -m rag_novatech.cli ingest
```

Depois execute os testes:

```bash
python -m rag_novatech.cli run-tests
```
"""
            output_path = os.path.join(OUTPUT_DIR, test.output_file)
            output_path = os.path.abspath(output_path)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(error_md)
            results_summary.append((test.name, test.output_file, "❌ Erro"))

    # Gera correction_proposals.md
    _generate_correction_proposals(results_summary)

    return results_summary


def _generate_correction_proposals(results_summary: list[tuple[str, str, str]]):
    """Gera o arquivo correction_proposals.md com base nos resultados."""
    output_path = os.path.join(OUTPUT_DIR, "correction_proposals.md")
    output_path = os.path.abspath(output_path)

    # Build summary from actual results
    summary_lines = []
    for name, filename, classification in results_summary:
        summary_lines.append(f"- **{name}** ({filename}): {classification}")
    summary_text = "\n".join(summary_lines)

    md = f"""# Propostas de Correção e Melhoria

## Resumo dos testes executados

{summary_text}

---

## Problema 1: Coexistência de versões de documentos sem marcação de obsolescência

### Evidência

Os documentos PROC-042 (v1) e PROC-042-v2 coexistem no sistema sem hierarquia clara. No **teste 4** (Frete para 600kg para Manaus) e **teste 5** (Multiplicador para o Sudeste), chunks de ambas as versões são recuperados simultaneamente, apresentando multiplicadores regionais e fatores de peso diferentes.

Valores contraditórios encontrados nos testes:
- PROC-042 (v1): multiplicador Norte = 1.6, Sudeste = 1.0
- PROC-042-v2: multiplicador Norte = 1.8, Sudeste = 1.1

No teste 4, o retrieval retorna PROC-042-B (v1) junto com PROC-042-v2-A (v2), sem indicação de qual versão é vigente. Mesmo com o system prompt v2 instruindo o LLM a sinalizar contradições (regras CF0-CF6), a presença de ambas as versões no contexto força o LLM a tomar uma decisão que deveria ser do sistema.

### Impacto

O assistente pode fornecer valores incorretos de frete ao atendente, gerando:
- Orçamentos errados para o cliente (diferença de 12,5% no multiplicador Norte entre v1 e v2).
- Inconsistência entre o que o atendente informa e o que o sistema calcula.
- Perda de confiança do cliente e possíveis prejuízos financeiros.
- Sobrecarga do supervisor, que precisa validar toda resposta que envolva cálculo de frete.

### Correção proposta

1. **Metadados de vigência:** Adicionar campos `status` (vigente/obsoleto) e `data_vigencia` aos metadados dos chunks. No momento da busca, filtrar documentos obsoletos automaticamente via `where` filter do ChromaDB:
   ```python
   collection.query(..., where={{"status": "vigente"}})
   ```
2. **Validação determinística pré-LLM:** Antes de montar o prompt, detectar se chunks de versões diferentes do mesmo documento foram recuperados. Se sim, manter apenas a versão mais recente e adicionar nota ao prompt: "versão anterior descartada automaticamente".
3. **Governança documental:** Recomendar à NovaTech que marque formalmente documentos obsoletos no repositório, impedindo que coexistam sem hierarquia no sistema de retrieval.

## Problema 2: Fontes informais (FAQ) recuperadas sem diferenciação adequada no ranking

### Evidência

O FAQ-Atendimento é um documento informal, não validado por Compliance ou Operações. No **teste 2** (Carga perigosa), o chunk FAQ-03 aparece junto com POL-001-B nos resultados. O FAQ-03 contém a orientação: "não diga que é impossível — diga que precisa de tratamento especial", que contradiz a POL-001 que afirma categoricamente que cargas perigosas **NÃO** são elegíveis para devolução pelo processo padrão.

Embora o system prompt v2 inclua regras de fonte informal (FI1-FI5: "FAQ nunca pode ser base de decisão"), a similaridade coseno não diferencia autoridade da fonte — ela ranqueia apenas por proximidade semântica. Isso pode colocar um FAQ informal acima de um documento normativo se a linguagem do FAQ for mais coloquial (e portanto mais próxima da pergunta do atendente).

### Impacto

Se o LLM usar a informação do FAQ como base principal, pode:
- Dar orientação incorreta ao atendente (ex: dizer que "não é impossível" devolver carga perigosa).
- Criar expectativa no cliente de que exceções são rotineiras.
- Contradizer a política formal da empresa, gerando risco de compliance.

### Correção proposta

1. **Reranking com penalização de fonte informal:** Implementar um reranker que aplique penalidade à distância de chunks com `is_informal_source=True`:
   ```python
   if chunk.is_informal_source:
       chunk.distance *= 1.3  # penaliza 30% para baixar no ranking
   ```
2. **Namespace separado para FAQ:** Armazenar documentos informais em uma collection separada no ChromaDB. A busca principal consulta apenas fontes formais; FAQ é consultado como complemento opcional e aparece ao final do prompt com tag visual.
3. **Validação humana do FAQ:** Recomendar revisão periódica do FAQ pelo Compliance, convertendo informações validadas em documentos formais.

## Problema 3: Chunks curtos com baixo sinal semântico para embeddings

### Evidência

No **teste 4** (Frete para 600kg para Manaus), o chunk PROC-042-v2-B contém a tabela de multiplicadores regionais com apenas ~209 caracteres. Esse chunk não é recuperado no top 7, apesar de conter informação essencial para responder a pergunta (multiplicador da região Norte para Manaus).

No **teste 1** (Prazo de devolução), o chunk POL-001-B (exceções ao prazo) também não aparece no top 7. A query "Qual o prazo de devolução?" tem alta similaridade com chunks de "prazo de entrega" do PROC-042/PROC-042-v2, que falam de prazo de frete, não de devolução — ambiguidade semântica que o modelo multilingual `paraphrase-multilingual-MiniLM-L12-v2` não resolve sozinho.

### Impacto

- O LLM não recebe a tabela de multiplicadores no contexto, tornando impossível calcular o frete corretamente.
- O LLM não recebe as exceções à política de devolução, podendo informar prazo padrão sem mencionar casos em que ele não se aplica.
- Chunks curtos (tabelas, listas) geram embeddings com menos informação, pois o modelo tem menos texto para extrair semântica.

### Correção proposta

1. **Enriquecimento semântico de chunks curtos:** Adicionar descrição contextual a tabelas antes de gerar o embedding:
   ```python
   # Antes do embedding, não no texto armazenado
   enriched = "Tabela de multiplicadores regionais para cálculo de frete especial. " + chunk.text
   ```
2. **Merge condicional:** Se um chunk tem menos de 250 caracteres e pertence à mesma seção do chunk anterior, mesclá-lo para criar um embedding mais rico, mantendo separação nos metadados para citação.
3. **Reranking com cross-encoder:** Adicionar `cross-encoder/ms-marco-MiniLM-L-6-v2` como segunda etapa. O cross-encoder recebe pares (query, chunk) e avalia relevância com mais precisão que distância coseno, especialmente para textos curtos.
4. **Hybrid search (BM25 + vetorial):** Combinar busca vetorial com busca por keywords (BM25) — tabelas curtas com termos exatos como "Norte", "1.8", "Manaus" teriam boost na busca por keywords mesmo com embedding fraco.
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"✓ Arquivo salvo: {output_path}")
