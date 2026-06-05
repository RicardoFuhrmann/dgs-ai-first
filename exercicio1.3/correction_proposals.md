# Propostas de Correção e Melhoria

## Resumo dos testes executados

- **Prazo de devolução** (test_01_prazo_devolucao.md): ⚠️ Parcial
- **Carga perigosa** (test_02_carga_perigosa.md): ✅ Aprovado
- **SLA do cliente Gold** (test_03_sla_gold.md): ✅ Aprovado
- **Frete para 600kg para Manaus** (test_04_frete_600kg_manaus.md): ⚠️ Parcial
- **Multiplicador para o Sudeste** (test_05_multiplicador_sudeste.md): ✅ Aprovado

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
   collection.query(..., where={"status": "vigente"})
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
