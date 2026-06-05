# NovaTech RAG Pipeline — Prova de Conceito

## Objetivo

Pipeline local de RAG (Retrieval-Augmented Generation) para a documentação simulada da NovaTech. Ingere 5 documentos Markdown individuais, divide em chunks semânticos alinhados ao gabarito do Anexo B, gera embeddings locais com modelo multilingual, armazena em ChromaDB e recupera contexto relevante para perguntas de atendentes.

A resposta final pode ser gerada manualmente colando o prompt montado em um LLM (Claude, ChatGPT), ou opcionalmente via Ollama local.

## RAG como engenharia de dados

Esta PoC trata RAG como um **sistema de engenharia de dados**, não apenas como chamada de API. Cada etapa do pipeline é uma decisão de design com impacto direto na qualidade da resposta final:

| Etapa | Decisão de engenharia | Impacto |
|-------|----------------------|---------|
| **Ingestão** | 5 arquivos individuais em vez de documento consolidado | Metadados de documento de origem preservados com precisão |
| **Chunking** | Divisão semântica por seções `##`/`###` do Markdown, alinhada ao Anexo B | Chunks com fronteiras de negócio, não cortes arbitrários de tokens |
| **Seções de introdução** | Descartadas (Objetivo, Escopo não geram chunks) | Evita poluir o retrieval com texto genérico sem valor operacional |
| **Tabela de SLA** | Dividida em chamados gerais vs incidentes críticos | Permite recuperar SLA específico sem arrastar a tabela inteira |
| **FAQ** | Chunk por item com tag `is_informal_source=True` | Diferencia fontes formais de informais no prompt e no ranking |
| **Embeddings** | Modelo multilingual + prefixo de contexto nos embeddings | Melhora recall em português e associa chunk ao seu documento de origem |
| **Versionamento** | PROC-042 v1 e v2 coexistem com metadado `version` | Permite ao prompt sinalizar contradição entre versões |
| **Prompt** | System prompt v2 completo (559 linhas) com regras R1-R8, CF0-CF6 | Guardrails determinísticos: citação obrigatória, sinalização de contradição, recusa a inventar dados |

O modelo de embeddings **não é** a inteligência do sistema — é apenas o motor de busca. A qualidade do RAG depende da qualidade dos dados que entram no pipeline: como o texto é segmentado, quais metadados acompanham cada chunk, como versões são tratadas e como o prompt instrui o LLM a usar o contexto.

## Instalação

```bash
pip install -r requirements.txt
```

Dependências:
- `chromadb` — vector store local
- `sentence-transformers` — embeddings locais

> **Nota:** Na primeira execução, o modelo de embeddings `paraphrase-multilingual-MiniLM-L12-v2` (~471MB) será baixado automaticamente do Hugging Face. Após o download, funciona offline.

## Como usar

### 1. Ingestão

Carrega os 5 documentos individuais da pasta `docs/`, faz chunking semântico e indexa no ChromaDB:

```bash
python3 -m rag_novatech.cli ingest
```

### 2. Buscar chunks

Busca os chunks mais relevantes para uma pergunta:

```bash
python3 -m rag_novatech.cli search "Qual o prazo de devolução?"
```

### 3. Montar prompt manual

Monta o prompt completo para copiar e colar em um LLM:

```bash
python3 -m rag_novatech.cli build-prompt "Qual o SLA do cliente Gold?"
```

O prompt impresso pode ser copiado e colado diretamente no Claude ou ChatGPT.

### 4. Executar testes de retrieval

Executa os 5 testes obrigatórios, gera os arquivos `.md` de resultado e o `correction_proposals.md`:

```bash
python3 -m rag_novatech.cli run-tests
```

### 5. Geração local via Ollama (opcional)

Se o Ollama estiver instalado e configurado:

```bash
python3 -m rag_novatech.cli generate-local "Qual o SLA do cliente Gold?"
```

## Geração da resposta final

Esta PoC não depende de API de LLM.

O pipeline recupera os chunks relevantes e monta um prompt completo. A resposta final pode ser testada manualmente copiando o prompt gerado e colando em um chat de LLM, como Claude ou ChatGPT.

Opcionalmente, se o ambiente tiver Ollama instalado e configurado, o projeto pode usar um modelo local para gerar a resposta final. Essa integração é opcional e não faz parte do caminho obrigatório da PoC.

Isso foi feito intencionalmente para manter a solução gratuita, local e executável mesmo sem acesso a APIs externas.

## Arquitetura do pipeline

```
docs/                          ← 5 documentos Markdown individuais
  POL-001-politica-devolucao.md
  PROC-042-frete-especial-v1.md
  PROC-042-v2-frete-especial-revisado.md
  SLA-2024-tabela-sla-clientes.md
  FAQ-atendimento.md
       │
       ▼
┌─────────────────┐
│  document_loader │  ← Lê cada arquivo, preserva UTF-8 e estrutura
└────────┬────────┘
         ▼
┌─────────────────┐
│    chunker       │  ← Divisão semântica por seções ##/###
│                  │     Intro descartada, SLA table split, FAQ por item
│                  │     Alinhamento ao Anexo B (chunk IDs A, B, C...)
└────────┬────────┘
         ▼
┌─────────────────┐
│   embeddings     │  ← paraphrase-multilingual-MiniLM-L12-v2
│                  │     Prefixo de contexto (doc, tipo, seção)
└────────┬────────┘
         ▼
┌─────────────────┐
│  vector_store    │  ← ChromaDB local (cosine distance)
│                  │     Metadados: source_document, version, is_informal
└────────┬────────┘
         ▼
┌─────────────────┐
│ prompt_builder   │  ← System prompt v2 completo (559 linhas)
│                  │     Guardrails: R1-R8, C1-C5, CF0-CF6, AI1-AI7
└────────┬────────┘
         ▼
   Prompt pronto   → Copiar/colar no Claude ou ChatGPT
                    → Ou gerar localmente via Ollama (opcional)
```

## Estratégia de chunking

### Justificativa

A documentação da NovaTech é composta por documentos de negócio com estrutura hierárquica (seções, subseções, tabelas). Um chunking fixo de N tokens destruiria essa estrutura, misturando informações de seções diferentes e quebrando tabelas.

A estratégia foi definida por **análise do conteúdo**, não por parâmetros arbitrários:

- Documentos operacionais (POL, PROC) têm seções `##` com subseções `###` que correspondem a temas distintos (prazos, exceções, fórmulas, tabelas).
- Cada subseção contém informação suficiente para citação independente — é a unidade natural de retrieval.
- Seções de introdução (Objetivo, Escopo) não contêm informação operacional e diluiriam a relevância se virassem chunks.
- A tabela de SLAs precisa ser dividida por tipo de métrica, senão uma pergunta sobre "incidentes críticos" traria também "chamados gerais".
- O FAQ tem itens independentes que devem ser tratados individualmente e marcados como fonte informal.

### Abordagem adotada

1. **Ingestão individual**: Cada um dos 5 documentos Markdown é carregado separadamente, preservando seu ID original (POL-001, PROC-042, etc.).
2. **Divisão por seções (`##`)**: Cada seção de nível `##` é um chunk candidato.
3. **Divisão por subseções (`###`)**: Se uma seção `##` contém subseções `###`, cada uma gera um chunk separado. Texto introdutório antes da primeira `###` também gera um chunk.
4. **Descarte de seções de introdução**: Seções "Objetivo" e "Escopo" são descartadas — não geram chunks. Isso alinha os IDs de chunk (A, B, C...) com o gabarito do Anexo B.
5. **Tratamento especial para SLA-2024**: A seção "Tabela de SLAs" é dividida em dois chunks pela análise do conteúdo das linhas da tabela: "chamados gerais" (chunk B) e "incidentes críticos" (chunk C).
6. **FAQ por item**: Cada `### Item N` gera um chunk com ID `FAQ-NN` e tag `is_informal_source=True`.
7. **Prefixo `[Fonte: ...]`**: Chunks de FAQ recebem tag visual de "documento informal/não validado" no próprio texto.

### Metadados preservados

Cada chunk contém:
- `source_document` — ID do documento (POL-001, PROC-042-v2, etc.)
- `section` — Título da seção ou subseção
- `title` — Título completo do documento
- `document_type` — normativo, procedimento, contratual, faq
- `version` — Versão do documento (3.1, 1.0, 2.0, 2024.1, não controlada)
- `is_informal_source` — Flag para fontes não validadas (FAQ)
- `chunk_id` — Identificador único alinhado ao Anexo B (ex: POL-001-A, SLA-2024-B, FAQ-03)

### Enriquecimento para embedding

Cada chunk tem seu texto prefixado com metadados contextuais **antes** da geração de embedding:

```
Documento: POL-001. Tipo: normativo. Seção: Prazo geral. [texto do chunk]
```

O texto armazenado no ChromaDB permanece limpo (sem prefixo), mas o embedding captura o contexto do documento de origem. Isso melhora a relevância semântica da busca — uma pergunta sobre "prazo de devolução" tem mais afinidade com um chunk cujo embedding inclui "Tipo: normativo" e "Seção: Prazo geral".

## Modelo de embeddings

Utilizamos `paraphrase-multilingual-MiniLM-L12-v2` ao invés do `all-MiniLM-L6-v2` originalmente sugerido.

**Motivo:** A documentação da NovaTech é inteiramente em português. O modelo `all-MiniLM-L6-v2` é treinado em inglês e apresentou resultados muito ruins para similaridade semântica em português — queries como "prazo de devolução" não encontravam chunks relevantes.

A troca para o modelo multilingual foi a melhoria com maior impacto nos resultados de retrieval, demonstrando que a escolha do modelo de embeddings é uma decisão de engenharia de dados crítica, não um detalhe de configuração.

## System prompt v2

O prompt de geração usa o **system prompt v2 completo** (559 linhas) que inclui:

- Identidade e papel do assistente (IDENTIDADE E PAPEL)
- Verificação obrigatória antes de responder (VERIFICAÇÃO OBRIGATÓRIA)
- 8 regras obrigatórias (R1-R8) — citação de fonte, não inventar dados, escalar para supervisor
- 5 regras para uso dos chunks (C1-C5) — hierarquia, complemento, contradição
- 7 regras de conflito entre fontes (CF0-CF6) — vigência, prevalência formal
- 5 regras para fonte informal (FI1-FI5) — FAQ como complemento, nunca base
- 7 regras de ausência de informação (AI1-AI7) — recusa informada
- Checklist de cálculo (CÁLCULOS) — validação de dados antes de calcular
- Formato obrigatório de resposta
- Exemplos de comportamento esperado e proibido

## Resultados dos testes de retrieval

| # | Teste | Resultado | Observação |
|---|-------|-----------|------------|
| 1 | Prazo de devolução | ⚠️ Parcial | POL-001-A encontrado (#2), POL-001-B ausente no top 7 |
| 2 | Carga perigosa | ✅ Aprovado | POL-001-B e FAQ-03 encontrados |
| 3 | SLA do cliente Gold | ✅ Aprovado | SLA-2024-B e SLA-2024-A encontrados |
| 4 | Frete 600kg para Manaus | ⚠️ Parcial | PROC-042-v2-A encontrado, PROC-042-v2-B (tabela curta) ausente |
| 5 | Multiplicador Sudeste | ✅ Aprovado | PROC-042-v2-B encontrado (#1) |

## Limitações conhecidas

1. **Modelo de embeddings generalista**: Mesmo o modelo multilingual não é especializado em vocabulário logístico. Termos como "multiplicador regional" ou "fator de peso" podem não ter representação semântica ideal.
2. **Sem reranking**: A busca usa apenas distância coseno, sem cross-encoder para reranking. Isso pode deixar chunks menos relevantes em posições altas.
3. **Chunk IDs dependem da estrutura do Markdown**: A numeração (A, B, C...) depende da ordem de divisão dos headers. Variações na estrutura do documento podem alterar os IDs.
4. **Chunks curtos**: Tabelas isoladas (como multiplicadores regionais, ~209 chars) geram embeddings com menos sinal semântico, prejudicando o recall.
5. **Sem filtro de versão no retrieval**: PROC-042 v1 e v2 coexistem sem priorização. O prompt instrui o LLM a sinalizar contradições, mas o retrieval não filtra por vigência.
6. **Top-k fixo**: O pipeline recupera top 7 chunks sem adaptação ao tipo de pergunta.

## Próximos passos sugeridos

1. **Reranking com cross-encoder** — Adicionar `cross-encoder/ms-marco-MiniLM-L-6-v2` como segunda etapa para reordenar resultados por relevância par-a-par.
2. **Filtro de versão** — Implementar metadados de vigência (`status: vigente/obsoleto`) para priorizar documentos atuais no retrieval.
3. **Namespace para FAQ** — Separar fontes informais em collection dedicada com busca secundária e peso reduzido.
4. **Enriquecimento de chunks curtos** — Adicionar descrição semântica a tabelas isoladas para melhorar embedding.
5. **Validação determinística pré-LLM** — Checar contradições de versão antes de montar o prompt, alertando o LLM proativamente.
6. **Expansão de queries** — Usar sinônimos e reformulações para melhorar recall em perguntas curtas.
7. **Avaliação contínua** — Ampliar para os 10 cenários do Anexo B (atualmente 5 de 10 implementados).
