# Prompt — Revisão Técnica da Análise RAG NovaTech

**Data:** 27 maio 2026  
**Projeto:** DGS AI First · DB1 Group  
**Arquivo original:** `analise-tecnica-rag-novatech.html`  
**Arquivo revisado:** `analise-tecnica-rag-novatech-revisao.html`  
**Modelo:** Claude Sonnet 4.6

---

## Conversa

---

### 👤 Usuário

> Preciso que você analise o documento `@analise-tecnica-rag-novatech.html` e faça uma revisão crítica da proposta:
> 1. identifique estimativas otimistas.
> 2. identifique riscos ignorados.
> 3. diga o que ficou superficial.
> 4. proponha melhorias técnicas.
>
> Depois gere:
> 1. versão melhorada com as melhorias/revisões já aplicadas, com o mesmo nome de arquivo, mesmo formato, porém com um sufixo `-revisao`.
> 2. Salva essa nova conversa em um arquivo md com o nome `prompt-revisao-tecnica.md` e dentro dele salve todas as nossas iterações (suas e minhas respostas).

---

### 🤖 Claude Sonnet 4.6

## Revisão Crítica — Análise Técnica RAG NovaTech

---

### 🔴 1. Estimativas Otimistas

**Acurácia de OCR:**
- O doc afirma "acurácia >98% em documentos limpos" e "85–92% em escaneados comuns" — são números de marketing da Azure. Documentos corporativos reais têm carimbos, assinaturas sobrepostas, tabelas coloridas, watermarks e fontes proprietárias. Acurácia real em documentos de logística/frete: **60–80%** para OCR de qualidade média. Sem mencionar que "acurácia por caractere" ≠ "acurácia por célula de tabela".

**Estimativa de tokens por PDF:**
- 800 docs × 10 páginas × 250 palavras: assume que toda página tem densidade textual homogênea. PDFs corporativos têm capas, sumários, páginas em branco, imagens e gráficos. Estimativa realista: **150–180 palavras úteis/página**. Isso reduz a estimativa em ~30%.

**Overhead de metadados ignorado:**
- O cálculo não inclui tokens dos metadados enriquecidos que o próprio doc recomenda (`tipo`, `num_colunas`, `pagina`, `ocr_quality`, `parent_title`, etc.). Cada chunk com metadados adiciona **15–25% mais tokens** no contexto.

**Lost in the Middle como fato absoluto:**
- O doc cita Liu et al. (2023) sem ressalvas. GPT-4o tem arquitetura significativamente diferente dos modelos do estudo original (gpt-3.5-turbo/Claude 2.1). Testes com GPT-4o mostram degradação muito menor. Apresentar os números de 2023 como verdade para GPT-4o atual é impreciso.

**5–8 chunks como universal:**
- Queries complexas como *"compare todas as tabelas de frete por região e tipo de cliente"* legitimamente precisam de 15–20 chunks. O limite rígido força o sistema a escolher entre cobertura ou qualidade — trade-off não discutido.

**Camelot para extração de tabelas:**
- Funciona bem para tabelas com bordas explícitas. Tabelas sem linhas (muito comuns em PDFs corporativos brasileiros) exigem detecção por whitespace — acurácia cai drasticamente. O doc não menciona essa limitação.

---

### 🟠 2. Riscos Ignorados

| Risco | Impacto |
|---|---|
| **Segurança/LGPD** | Documentos de frete podem conter PII de clientes, valores contratuais sigilosos. Embeddings no vector store = dados persistentes. Controle de acesso por nível de documento não mencionado. |
| **Seleção e lock-in do vector store** | Não há análise de qual vector store usar (Pinecone, Qdrant, Weaviate, pgvector). Migrar depois é custoso: re-embed tudo. |
| **Embedding drift** | Se o modelo de embedding for atualizado ou substituído (ada-002 → text-embedding-3-large), todos os ~9.333 chunks precisam ser re-embedados. Custo e downtime não estimados. |
| **Ausência de framework de avaliação** | O doc não menciona COMO medir se o RAG está funcionando. Sem RAGAS ou similar, não há como saber se o sistema regrediu após mudanças. |
| **Conflito de versões** | Quando um documento é atualizado, chunks antigos permanecem no índice até re-ingestão. O sistema pode misturar informação de versões diferentes na mesma resposta. |
| **Gestão de histórico multi-turn** | O orçamento menciona "2.000 tokens de histórico" mas não aborda como gerenciar conversas longas (summarization, windowing, selective memory). |
| **Custo incompleto** | O cálculo de custo cobre apenas tokens de entrada do GPT-4o. Faltam: embedding (input), re-ingestão periódica, vector store hosting, infraestrutura do pipeline, re-ranking model latency. |
| **Sem fallback de API** | Nenhuma estratégia para quando o GPT-4o estiver fora (rate limits, outage), que é comum em produção. |
| **Cold start sem baseline** | O sistema vai a produção sem saber qual é sua acurácia. Primeiro ajuste será baseado em reclamações de usuários, não métricas. |

---

### 🟡 3. O que ficou superficial

- **Re-ranking cross-encoder:** Citado como solução mas sem detalhe do modelo (`ms-marco-MiniLM` é mencionado casualmente), latência adicionada (~200–400ms por query), necessidade de fine-tuning para o domínio logístico ou uso de modelos out-of-box.

- **Busca híbrida BM25:** Mencionada sem discutir como calibrar os pesos (alpha entre vetorial e léxica), qual implementação usar (Elasticsearch, Weaviate hybrid, Qdrant sparse+dense), e quando a busca léxica realmente ajuda vs. atrapalha.

- **Design do system prompt:** Para um assistente de logística, o system prompt é crítico: formato de citação de fontes, como responder quando há incerteza, quando recusar uma pergunta fora do escopo, como lidar com dados numéricos (frete, prazos) que requerem precisão — nada disso é tratado.

- **Monitoramento e observabilidade:** Zero menção a logging de queries, rastreamento de retrieval quality ao longo do tempo, alertas de degradação, dashboards operacionais.

- **Loop de feedback do usuário:** Sem mecanismo de thumbs up/down ou feedback, não há como melhorar o sistema com dados reais de uso.

- **GraphRAG para Confluence:** A estrutura hierárquica do Confluence (espaço → página-pai → páginas-filhas) é exatamente o caso de uso do Microsoft GraphRAG ou de abordagens de knowledge graph — ignorado completamente.

---

### 🟢 4. Melhorias Técnicas Propostas

1. **Adicionar framework de avaliação RAG** (RAGAS) com métricas: faithfulness, answer relevancy, context precision, context recall — antes de ir a produção e em monitoramento contínuo.
2. **Análise comparativa de vector store** para ~10K chunks: pgvector (já em Postgres), Qdrant (self-hosted), Weaviate — com critérios de filtragem por metadados e hybrid search nativo.
3. **Modelo de custo completo** incluindo embedding, re-ingestão, infra e re-ranking.
4. **Seção de segurança e LGPD** com estratégia de controle de acesso por documento, exclusão de PII antes do embedding, política de retenção do vector store.
5. **Estratégia de avaliação pré-produção** com golden dataset de 80–120 perguntas respondidas manualmente pela equipe de negócio.
6. **Gerenciamento de histórico de conversação** com estratégia de summarization após N turnos.
7. **Seção de fases de implementação** com cronograma realista (ingestão primeiro, retrieval depois, interface por último).
8. **GraphRAG** para navegação hierárquica no Confluence.
9. **Detalhamento do re-ranker** com modelos recomendados, latência e estratégia de fine-tuning.
10. **Validação de parsers** com golden samples antes de escolher ferramentas.

---

### Arquivos gerados

| Arquivo | Descrição |
|---|---|
| `analise-tecnica-rag-novatech-revisao.html` | Versão revisada com todas as melhorias aplicadas: estimativas corrigidas com intervalos realistas, novos blocos 5 (Avaliação) e 6 (Segurança/LGPD), riscos expandidos de 3 para 6, fases de implementação, comparativo de vector stores, detalhamento de re-ranker e busca híbrida. |
| `prompt-revisao-tecnica.md` | Este arquivo — log de todas as iterações da conversa de revisão. |

---

### Resumo das mudanças aplicadas na revisão v2

#### Estimativas corrigidas
- Acurácia de parsers: removidos números de marketing; adicionados intervalos reais com contexto corporativo
- Tokens PDFs: intervalo otimista/conservador (250 vs 160 palavras/página)
- Overhead de metadados: +17% adicionado ao consolidado de tokens
- Lost in the Middle: nuançado para GPT-4o (não idêntico a modelos de 2023)
- Janela de chunks: alterada de rígida (5–8) para adaptativa (5–12 por tipo de query)

#### Novos blocos adicionados
- **Bloco 5 — Avaliação de Qualidade:** Framework RAGAS, 4 métricas com metas, golden dataset (especificação completa), monitoramento contínuo, loop de feedback
- **Bloco 6 — Segurança e Conformidade:** Mapeamento de dados sensíveis, controle de acesso no vector store, mascaramento de PII com presidio-analyzer, residência de dados LGPD/Azure

#### Riscos expandidos
- De 3 para 6 riscos na síntese
- Novos: Ausência de framework de avaliação (Alta), Segurança/LGPD (Média), Embedding drift (Média)

#### Conteúdo aprofundado
- Re-ranker: modelos específicos, latência esperada, estratégia de fine-tuning para português
- Busca híbrida: pesos recomendados, ferramentas com hybrid search nativo
- Vector store: tabela comparativa (pgvector, Qdrant, Weaviate, Azure AI Search)
- Custo: modelo completo incluindo embedding, re-ranking, infra e vector store hosting
- Gestão de histórico multi-turn: sliding window + summarization progressiva
- GraphRAG: mencionado para Confluence hierárquico profundo
- Validação de parsers: golden samples obrigatórios antes de escolher ferramenta
- xlwings vs openpyxl: detalhe sobre falha do data_only em planilhas não recalculadas

#### Fases de implementação
- Timeline de 12 semanas com 5 fases: Fundação → Ingestão → Baseline → Retrieval → Interface
- Critério de aceitação explícito antes de avançar de fase
