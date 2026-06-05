# Análise Técnica RAG — Assistente NovaTech

**Data:** 2026-05-27  
**Projeto:** DGS AI First — Assistente de IA para Atendimento NovaTech  
**Arquivo HTML gerado:** `analise-tecnica-rag-novatech.html`

---

## Conversa

---

### 👤 Usuário

Você é um arquiteto de soluções especialista em sistemas RAG (Retrieval-Augmented Generation) e processamento de documentos corporativos. Analise o cenário abaixo e produza uma análise técnica estruturada.

---

## CONTEXTO DO PROJETO

A NovaTech (empresa de logística, 1.200 funcionários) precisa de um assistente de IA para sua equipe de atendimento ao cliente (45 pessoas). O assistente deve responder perguntas em linguagem natural com base em documentação interna, com citação de fonte.

**Base documental:**
- ~800 documentos PDF no SharePoint (média de 10 páginas cada), incluindo:
  - Tabelas complexas de frete (15+ colunas)
  - Fluxogramas embutidos como imagens
  - Documentos escaneados (requerem OCR)
- ~400 páginas no Confluence (wiki), incluindo:
  - Links internos entre páginas
  - Macros customizadas
- ~50 planilhas Excel com fórmulas interdependentes, atualizadas mensalmente

**Perfil das perguntas dos usuários:**
- "Qual o prazo de entrega para cliente tipo X na região Y?"
- "Qual a política de devolução para produto Z?"
- "Como calcular o frete para envio com seguro?"
- "Qual o procedimento para registrar uma reclamação de carga danificada?"

---

## ANÁLISE SOLICITADA

Produza uma análise técnica completa cobrindo obrigatoriamente os quatro blocos a seguir. Seja preciso, quantitativo onde possível, e justifique cada recomendação.

---

### BLOCO 1 — Desafios de ingestão por tipo de fonte

Para cada um dos quatro tipos de fonte abaixo, detalhe:
1. O desafio específico que esse tipo representa para o pipeline de RAG
2. Como esse desafio afeta diretamente a qualidade das respostas geradas
3. Uma estratégia concreta de tratamento (ferramentas, técnicas, abordagens)

**Tipos de fonte a analisar:**
- PDFs com tabelas complexas (ex: tabelas de frete com 15+ colunas)
- PDFs escaneados (com necessidade de OCR)
- Wiki do Confluence com links internos e macros
- Planilhas Excel com fórmulas interdependentes

---

### BLOCO 2 — Estimativa de tamanho da base em tokens

Calcule o tamanho total estimado da base documental em tokens usando as seguintes premissas:
- Regra prática: 1 token ≈ 0,75 palavras (ou seja, 1 palavra ≈ 1,33 tokens)
- PDFs: 800 documentos × 10 páginas × 250 palavras por página
- Wiki: 400 páginas × 1.500 palavras por página
- Planilhas: estime com base em uma média razoável de células com conteúdo textual relevante (justifique sua estimativa)

Apresente o cálculo passo a passo para cada fonte e some ao total consolidado. Interprete o resultado: o que esse volume significa em termos práticos para o sistema?

---

### BLOCO 3 — Análise de orçamento de contexto

Dado que:
- O modelo utilizado é o GPT-4o com janela de contexto de 128.000 tokens
- O system prompt + instruções do assistente consomem aproximadamente 2.000 tokens
- O histórico da conversa pode consumir de 0 a 4.000 tokens adicionais
- Cada chunk de documento tem em média 500 tokens

Calcule e responda:
1. Quantos chunks cabem em uma única query no melhor caso (sem histórico) e no caso típico (com histórico moderado)?
2. O que acontece com a qualidade da resposta quando muitos chunks são inseridos no contexto? Explique o fenômeno *lost in the middle* e suas implicações práticas para este projeto.
3. Qual o impacto disso na estratégia de retrieval — quantos chunks devem ser efetivamente enviados ao LLM, e por quê esse número não deve ser simplesmente "o máximo possível"?

---

### BLOCO 4 — Recomendação de estratégia de chunking

Com base no perfil das perguntas dos usuários (identificadas no contexto acima) e nas conclusões dos blocos anteriores, recomende uma estratégia de chunking justificada. Sua recomendação deve:

1. Definir o tamanho ideal de chunk (em tokens) e justificar com base no tipo de pergunta esperada
2. Indicar se deve haver overlap entre chunks, em que proporção, e por quê
3. Diferenciar a estratégia por tipo de fonte (PDFs narrativos vs. tabelas vs. planilhas vs. wiki)
4. Explicar como a estratégia proposta mitiga o efeito *lost in the middle*
5. Recomendar se deve ser usada chunking fixo, semântico ou hierárquico — e justificar

---

## FORMATO DA RESPOSTA

- Use headings para separar os quatro blocos
- Dentro de cada bloco, use subtítulos por tipo de fonte ou por subtópico quando aplicável
- Seja direto: prefira listas e tabelas onde ajudem a clareza
- Inclua os cálculos explícitos no Bloco 2 (não apenas o resultado final)
- Conclua com um parágrafo de síntese destacando os 3 principais riscos técnicos do projeto e como a estratégia recomendada os mitiga
- Crie uma versão em HTML com a análise final
- Depois de criar a versão em HTML, salve nossa conversa em um arquivo md nesta pasta analise-tecnica.md com tudo que conversamos, incluindo todas as nossas iterações, veja criacao-prompt-inicial.md para modelo de uma conversa ja existente.

---

### 🤖 Assistente

---

## BLOCO 1 — Desafios de Ingestão por Tipo de Fonte

Cada tipo de fonte da NovaTech impõe obstáculos distintos ao pipeline RAG.

| Fonte | Desafio-raiz | Impacto na resposta | Criticidade |
|---|---|---|---|
| PDFs com tabelas complexas | Perda de estrutura tabular no parse | Dados de frete truncados ou embaralhados | Alta |
| PDFs escaneados (OCR) | Texto inexistente — apenas pixels | Documento invisível ao retrieval | Alta |
| Wiki Confluence (links + macros) | Contexto distribuído; HTML proprietário | Resposta incompleta sem páginas-filhas | Média-Alta |
| Planilhas Excel (fórmulas) | Valores computados ausentes; dimensão perdida | Cálculos incorretos ou impossíveis | Média-Alta |

---

### 📊 PDFs com Tabelas Complexas (15+ colunas)

**Desafio:**  
Parsers PDF padrão (PyMuPDF, pdfplumber) extraem texto linha a linha, destruindo a relação coluna → valor. Uma tabela de frete com 15 colunas e 80 linhas (= 1.200 células) se torna uma sequência de tokens sem semântica posicional. Células mescladas e cabeçalhos multilinha ampliam o problema.

**Impacto na qualidade:**
- A pergunta "frete para cliente Tipo B, Região Sudeste, carga > 500 kg" exige cruzar três dimensões; sem estrutura tabular o modelo não consegue navegar corretamente.
- Risco de alucinação: o LLM "inventa" um valor plausível quando os dados estão embaralhados.
- Retrieval prejudicado: embeddings de texto desestruturado têm baixa precisão semântica para perguntas numéricas.

**Estratégia de tratamento:**
- **Parser especializado:** `pdfplumber` com extração por bbox ou `Camelot` para tabelas com linhas; `Azure Document Intelligence (Form Recognizer)` para tabelas complexas/mistas — acurácia de 90–95% em tabelas bem formatadas.
- **Conversão para Markdown:** cada tabela vira um bloco `| col1 | col2 | … |` antes de ser chunkeada; o LLM interpreta Markdown tabular nativamente.
- **Chunk por tabela inteira:** não quebrar tabelas no meio; manter cada tabela como um único chunk (mesmo que ultrapasse 500 tokens).
- **Metadados enriquecidos:** tag `tipo=tabela_frete`, `num_colunas=15`, `pagina=3` para filtrar antes do retrieval.

---

### 🔍 PDFs Escaneados (OCR necessário)

**Desafio:**  
Documentos escaneados são imagens; não há texto extraível. O pipeline padrão de PDF → texto retorna vazio ou ruído. Qualidade da digitalização (DPI, inclinação, manchas) varia enormemente. Estima-se que, sem tratamento, 20–40% do conteúdo desses documentos fique inacessível ao retrieval.

**Impacto na qualidade:**
- Documentos inteiros ausentes do índice vetorial — o assistente responde "não encontrei informações" para conteúdo que existe.
- OCR com baixa qualidade introduz tokens corrompidos (*"frefe" por "frete"*), degradando embeddings e retrieval.
- Fluxogramas/imagens incorporadas permanecem opacos mesmo com OCR textual.

**Estratégia de tratamento:**
- **Pipeline OCR dedicado:** `Azure AI Document Intelligence` (melhor para documentos corporativos) ou `Google Document AI`; acurácia >98% em documentos limpos, 85–92% em escaneados comuns.
- **Pré-processamento de imagem:** deskew + denoising com `OpenCV` antes do OCR para documentos de baixa qualidade.
- **Confiança mínima:** threshold de confiança OCR (ex.: ≥ 0,80); chunks abaixo desse limiar recebem flag `ocr_quality=low`.
- **Fluxogramas:** usar Vision API (GPT-4o com visão ou Azure AI Vision) para descrever a imagem em texto antes de indexar.
- **Revisão humana:** listar documentos com confiança baixa para revisão periódica.

---

### 📚 Wiki Confluence (links internos + macros)

**Desafio:**  
Uma página Confluence pode ser um sumário que referencia 10 sub-páginas via links internos. As macros customizadas são renderizadas dinamicamente — o HTML bruto exportado contém tags proprietárias sem conteúdo textual. Se cada página for ingerida isoladamente, o contexto fica fragmentado.

**Impacto na qualidade:**
- Pergunta "qual o procedimento completo de reclamação?" retorna apenas o trecho da página-pai, ignorando os detalhes nas páginas-filhas.
- Macros não renderizadas geram lixo textual que polui embeddings.
- Links internos quebram após exportação, impossibilitando rastreamento de fonte.

**Estratégia de tratamento:**
- **API Confluence:** usar a API REST v2 para extrair conteúdo renderizado (`body.storage` + `body.view`), não o HTML bruto.
- **Grafo de páginas:** ao ingerir, rastrear `parent_id` e `child_pages`; incluir contexto da página-pai no metadata de cada chunk filho.
- **Stripping de macros:** pipeline de limpeza com regex + BeautifulSoup para remover tags Confluence.
- **Chunking hierárquico:** dividir por seção H2/H3, mantendo título da página como cabeçalho de cada chunk.
- **Webhook de atualização:** re-ingestão incremental via webhooks Confluence em vez de re-ingerir tudo mensalmente.

---

### 📋 Planilhas Excel (fórmulas interdependentes)

**Desafio:**  
O RAG trabalha com texto; fórmulas Excel são procedimentos computacionais, não dados. Ao exportar para texto/CSV, a fórmula aparece literalmente sem o valor calculado. Em planilhas com múltiplas abas e fórmulas interdependentes, o valor de uma célula pode depender de 5 outras abas.

**Impacto na qualidade:**
- O LLM não consegue executar fórmulas; responde com o texto da fórmula em vez do resultado.
- Perda dimensional: uma tabela 2D (linhas × colunas) vira uma sequência linear.
- Desatualização: planilhas atualizadas mensalmente sem re-ingestão automática geram respostas baseadas em dados obsoletos.

**Estratégia de tratamento:**
- **Exportar valores, não fórmulas:** usar `openpyxl` com `data_only=True` ou `xlwings` para capturar resultados reais.
- **Conversão a Markdown tabular:** cada aba relevante vira uma tabela com cabeçalhos explícitos.
- **Separação de abas por domínio:** cada aba = um documento independente com metadata.
- **Tabelas pequenas como contexto fixo:** planilhas ≤ 2.000 tokens podem ser injetadas diretamente no system prompt.
- **Pipeline de re-ingestão mensal:** integrar ao SharePoint via Microsoft Graph API.

---

## BLOCO 2 — Estimativa de Tamanho da Base em Tokens

**Premissa de conversão:** 1 token ≈ 0,75 palavras → fator de multiplicação = **1,333×**

---

### 📄 Fonte 1 — PDFs (SharePoint)

```
800 documentos
× 10 páginas/documento
× 250 palavras/página
= 2.000.000 palavras
× 1,333 (fator tokens)
= 2.666.667 tokens
```

---

### 📚 Fonte 2 — Wiki Confluence

```
400 páginas
× 1.500 palavras/página
= 600.000 palavras
× 1,333 (fator tokens)
= 800.000 tokens
```

---

### 📋 Fonte 3 — Planilhas Excel

**Estimativa justificada:**
- 50 planilhas com média de 5 abas relevantes cada
- Cada aba: ~200 linhas × 10 colunas = 2.000 células
- ~60% das células com conteúdo útil = 1.200 células
- Média de 3 palavras/célula (valores como "Sudeste", "R$ 45,00", "até 3 dias úteis")

```
50 planilhas
× 5 abas relevantes
× 1.200 células úteis
× 3 palavras/célula
= 900.000 palavras
× 1,333 (fator tokens)
= 1.200.000 tokens
```

---

### ∑ Consolidado

| Fonte | Palavras | Tokens | % do Total |
|---|---|---|---|
| PDFs (SharePoint) | 2.000.000 | 2.666.667 | 57% |
| Wiki (Confluence) | 600.000 | 800.000 | 17% |
| Planilhas (Excel) | 900.000 | 1.200.000 | 26% |
| **TOTAL** | **3.500.000** | **4.666.667** | **100%** |

**Interpretação prática:**
- A base tem **~36× o tamanho da janela de contexto do GPT-4o** (128K tokens)
- Com ~9.333 chunks de 500 tokens, a qualidade depende diretamente da precisão do retrieval
- A abordagem "enviar tudo no contexto" é inviável — pipeline de retrieval seletivo é obrigatório
- Recuperar os 5–10 chunks certos entre 9.333 é o desafio central do projeto

---

## BLOCO 3 — Análise de Orçamento de Contexto

### 3.1 — Quantos chunks cabem por query?

**Melhor caso (sem histórico):**
```
128.000 tokens (janela total GPT-4o)
–  2.000 tokens (system prompt + instruções)
–    200 tokens (pergunta do usuário)
–  1.000 tokens (reserva para resposta)
= 124.800 tokens disponíveis para chunks
÷      500 tokens/chunk
≈  249 chunks cabem (melhor caso)
```

**Caso típico (histórico moderado de ~2.000 tokens):**
```
128.000 tokens (janela total GPT-4o)
–  2.000 tokens (system prompt + instruções)
–  2.000 tokens (histórico da conversa)
–    200 tokens (pergunta do usuário)
–  1.000 tokens (reserva para resposta)
= 122.800 tokens disponíveis para chunks
÷      500 tokens/chunk
≈  245 chunks cabem (caso típico)
```

> ⚠️ **Atenção:** embora 245 chunks *caibam* na janela do GPT-4o, inserir esse volume degradaria drasticamente a qualidade das respostas.

---

### 3.2 — O fenômeno *Lost in the Middle*

Pesquisas publicadas (Liu et al., 2023 — *"Lost in the Middle: How Language Models Use Long Contexts"*) demonstram que LLMs têm desempenho de atenção **não uniforme** ao longo do contexto:

- **Posições inicial e final** recebem maior atenção
- **Posições intermediárias** sofrem queda severa de atenção — informação crítica no meio de um contexto longo é frequentemente *ignorada*
- O efeito é agravado com o aumento do número de documentos: com 20+ chunks, a precisão de recuperação de informação do modelo cai significativamente

| Nº de chunks enviados | Comportamento esperado | Risco |
|---|---|---|
| 3 – 5 chunks | Atenção uniforme; alta precisão | Baixo |
| 6 – 10 chunks | Leve degradação em chunks intermediários | Médio |
| 11 – 20 chunks | Chunks do meio frequentemente ignorados | Alto |
| 20+ chunks | Resposta baseia-se apenas nos primeiros e últimos | Crítico |

**Exemplo prático para NovaTech:** para "Como calcular o frete para envio com seguro?", se o chunk com a fórmula correta estiver na posição 12 de 20, o modelo provavelmente o ignorará e fabricará uma resposta — gerando alucinação com aparência de confiança.

---

### 3.3 — Impacto na Estratégia de Retrieval

**✅ Recomendação: enviar entre 5 e 8 chunks por query**

Por que **não** enviar o máximo possível:
- **Efeito lost in the middle:** mais chunks = mais probabilidade de a informação relevante ficar no meio e ser ignorada
- **Ruído semântico:** chunks marginalmente relevantes introduzem informação contraditória, confundindo o modelo
- **Custo proporcional:** 245 chunks = ~122.500 tokens/query × ~192 queries documentais/dia = ~23,5M tokens de entrada/dia — potencialmente proibitivo
- **Latência:** processar 122K tokens aumenta o tempo de resposta

**Estratégia complementar:**
- **Re-ranking:** recuperar 20–30 candidatos via busca vetorial + cross-encoder (ex.: `ms-marco-MiniLM`) para selecionar os top 5–8
- **Posicionamento estratégico:** chunk com maior score de relevância *primeiro* no contexto
- **Busca híbrida:** combinar busca vetorial (semântica) com BM25 (léxica) para termos técnicos precisos

---

## BLOCO 4 — Recomendação de Estratégia de Chunking

### 4.1 — Tamanho ideal de chunk

As perguntas são **factuais e específicas** — requerem *o parágrafo ou a linha de tabela certa*, não 10 páginas de contexto.

**✅ Recomendação: 300 – 500 tokens por chunk**
- **300 tokens:** para tabelas e planilhas (preservar linhas completas; evitar excesso de ruído)
- **400–500 tokens:** para texto narrativo (PDFs e wiki)
- **Exceção:** tabelas inteiras que ultrapassem 500 tokens → chunk único (até 1.000 tokens), priorizando integridade estrutural

**Justificativa:**
- Chunks < 150 tokens: perdem contexto da frase — resposta sem informação suficiente
- Chunks > 800 tokens: aumentam ruído e reduzem precisão do embedding
- 300–500 tokens é o sweet spot empiricamente validado para QA sobre documentação operacional

---

### 4.2 — Overlap entre chunks

**✅ Overlap recomendado: 10–15% do tamanho do chunk**
Para chunks de 400 tokens → overlap de 40–60 tokens (3–4 frases).

**Por quê overlap é necessário:**
- Informação-chave frequentemente aparece na *fronteira* entre dois chunks
- Sem overlap, essas informações nunca são recuperadas completas
- Com overlap de ~50 tokens, ambos os chunks capturam a informação de fronteira
- Overlap > 20% não recomendado: aumenta redundância sem benefício proporcional

---

### 4.3 — Estratégia diferenciada por tipo de fonte

| Fonte | Tipo de Chunking | Tamanho | Overlap | Tratamento especial |
|---|---|---|---|---|
| PDFs narrativos (manuais, políticas) | Semântico por parágrafo | 400–500 tokens | 50 tokens (~12%) | Preservar cabeçalho H1/H2 no metadata; não quebrar enumerações |
| PDFs com tabelas (tabelas de frete) | Chunk por tabela inteira | Variável (até 1.000 tokens) | 0 (tabelas não se dividem) | Converter para Markdown tabular; metadata: `tipo=tabela` |
| PDFs escaneados (pós-OCR) | Semântico (após limpeza OCR) | 300–400 tokens | 60 tokens (~18%) | Overlap maior compensa erros residuais de OCR; flag `ocr_quality` |
| Wiki Confluence (procedimentos) | Hierárquico por seção (H2/H3) | 400–500 tokens | 40 tokens (~10%) | Incluir breadcrumb no chunk; rastrear links filhos |
| Planilhas Excel (fórmulas/tabelas) | Fixo por aba convertida | 300 tokens | 2–3 linhas de header | Repetir cabeçalhos de coluna a cada chunk; metadata: `aba`, `versão` |

---

### 4.4 — Mitigação do efeito *Lost in the Middle*

A estratégia combate *lost in the middle* em três frentes:

1. **Chunks menores e mais precisos (300–500 tokens):** cada chunk carrega alta densidade semântica → eleva o score de relevância no retrieval → chunk certo é selecionado e posicionado no início do contexto.

2. **Limite rígido de 5–8 chunks por query:** com poucos chunks no contexto, não há "meio profundo" — mesmo o chunk na posição 5 está suficientemente próximo do início para receber atenção adequada.

3. **Re-ranking + posicionamento por relevância:** o chunk com maior score de re-ranking é posicionado primeiro no contexto, explorando o viés de atenção inicial a favor do sistema.

---

### 4.5 — Chunking fixo, semântico ou hierárquico?

**✅ Recomendação: abordagem híbrida**

| Abordagem | Quando usar neste projeto | Vantagem | Limitação |
|---|---|---|---|
| **Fixo** | PDFs escaneados pós-OCR; planilhas simples | Simples; previsível | Pode cortar no meio de frase crítica |
| **Semântico** (por parágrafo/sentença) | PDFs narrativos (manuais, políticas) | Preserva unidades de significado; melhor embedding | Tamanho variável; mais complexo |
| **Hierárquico** (seção → sub-seção → parágrafo) | Wiki Confluence; PDFs com estrutura clara | Preserva contexto navegacional; suporta multi-hop | Depende de estrutura documental consistente |

**Implementação prática:**
- **LangChain:** `RecursiveCharacterTextSplitter` (semântico), `MarkdownHeaderTextSplitter` (hierárquico)
- **LlamaIndex:** `HierarchicalNodeParser`

---

## Síntese Final — 3 Principais Riscos Técnicos

---

### 🔴 Risco 1 (Alta) — Perda de estrutura em tabelas e planilhas

As perguntas mais críticas do atendimento (cálculos de frete, SLAs por região) dependem exatamente das fontes mais difíceis de ingerir: tabelas PDF e planilhas Excel.

**Mitigação:** Azure Document Intelligence para extração de tabelas + conversão para Markdown tabular + chunking por tabela inteira + exportação de valores calculados das planilhas (não fórmulas).

---

### 🔴 Risco 2 (Alta) — Alucinação por retrieval impreciso + lost in the middle

Com 9.333 chunks na base, enviar chunks irrelevantes ou muitos chunks ao LLM gera respostas incorretas com aparência de confiança — especialmente perigoso em logística (valores errados de frete, prazos incorretos).

**Mitigação:** Retrieval em dois estágios (busca vetorial → re-ranking); limite de 5–8 chunks/query; posicionamento do chunk mais relevante no início do contexto.

---

### 🟡 Risco 3 (Média) — Desatualização silenciosa da base

Documentação atualizada mensalmente por 3 áreas sem processo unificado pode gerar contradições. O assistente pode responder com base em dados desatualizados sem nenhum aviso ao usuário.

**Mitigação:** Metadata de `data_ingestão` e `versão` em todos os chunks; pipeline de re-ingestão incremental via Microsoft Graph API + webhooks Confluence; instrução no system prompt para citar data do documento na resposta.

---

### Conclusão arquitetural

O projeto NovaTech é viável tecnicamente, mas seu sucesso depende criticamente do **investimento na camada de ingestão** (estimativa: 40–50% do esforço técnico total) — não no LLM em si. Um modelo menor com dados bem estruturados supera consistentemente um modelo melhor com dados mal ingeridos. A estratégia de chunking híbrida proposta, combinada com retrieval em dois estágios e metadados ricos por tipo de fonte, endereça os três riscos e cria a base para que o assistente atinja a meta de redução de 12 → 2 minutos por chamado.

---

### 🤖 Assistente (continuação)

Arquivo HTML criado em `/home/ricardo.fuhrmann@db1.com.br/projetos/dgs-ai-first/analise-tecnica-rag-novatech.html` com a análise técnica completa em formato visual estruturado.

Arquivo de conversa salvo em `/home/ricardo.fuhrmann@db1.com.br/projetos/dgs-ai-first/analise-tecnica.md`.
