# Criação do Prompt Inicial — Assistente RAG NovaTech

**Data:** 2026-05-27  
**Projeto:** DGS AI First — Assistente de IA para Atendimento NovaTech

---

## Conversa

---

### 👤 Usuário

A NovaTech é uma empresa de médio porte do setor de logística com 1.200 funcionários. Sua operação depende de um conjunto extenso de documentação interna: manuais de procedimento operacional, políticas de compliance, tabelas de SLA por tipo de cliente, regras de cálculo de frete, e normas de segurança de carga.

Hoje, essa documentação está espalhada em três fontes: um SharePoint corporativo com ~800 documentos (PDFs e Word), uma wiki interna no Confluence com ~400 páginas, e uma pasta de rede com planilhas de referência atualizadas mensalmente.

O problema: a equipe de atendimento ao cliente (45 pessoas) gasta em média 12 minutos por chamado buscando informações nessas fontes para responder dúvidas de clientes sobre prazos, regras de frete, políticas de devolução e procedimentos de reclamação. Isso gera atrasos, respostas inconsistentes e frustração tanto dos atendentes quanto dos clientes.

A NovaTech contratou a DB1 para construir um assistente de IA que permita aos atendentes fazer perguntas em linguagem natural e receber respostas fundamentadas na documentação oficial da empresa, com indicação da fonte. O assistente será integrado ao ambiente Microsoft da NovaTech (Teams + SharePoint).

### Informações adicionais fornecidas pela NovaTech

- O volume médio é de 320 chamados/dia, dos quais ~60% envolvem consulta a documentação.
- A documentação é atualizada mensalmente por 3 áreas diferentes (Operações, Compliance, Comercial), sem processo unificado de revisão.
- Alguns documentos se contradizem entre versões — a equipe de atendimento hoje resolve isso "perguntando para quem sabe".
- A NovaTech já tem licenças Microsoft 365 E3 e está disposta a provisionar Azure AI Services.
- O projeto tem orçamento para 3 meses de discovery + desenvolvimento + go-live.
- A expectativa da diretoria é reduzir o tempo médio de busca de 12 para menos de 2 minutos por chamado.

Os PDFs do SharePoint incluem documentos com tabelas complexas (tabelas de frete com 15+ colunas), fluxogramas embutidos como imagens, e alguns documentos escaneados (OCR necessário). A wiki do Confluence tem links internos entre páginas e usa macros customizadas. As planilhas têm fórmulas interdependentes. O contexto que o LLM recebe a cada pergunta é limitado pela janela de contexto do modelo. A qualidade da resposta depende de: quais chunks são selecionados (relevância), quantos chunks cabem no contexto (orçamento de atenção), onde ficam posicionados no prompt (informação no meio de contextos longos é 'esquecida' — o efeito 'lost in the middle'), e o que mais está no contexto competindo por atenção (system prompt, histórico de conversa, instruções).

Preciso que você me ajude a montar um prompt para IA que no final irá produzir uma análise técnica que cubra:

- Para cada tipo de fonte (PDFs com tabelas, PDFs escaneados, wiki com links, planilhas com fórmulas): qual o desafio para o pipeline de RAG, como isso afeta a qualidade das respostas, e uma estratégia de tratamento.
- Estimativa do tamanho aproximado da base em tokens considerando ~800 documentos PDF (média de 10 páginas cada), ~400 páginas wiki (média de 1.500 palavras cada), e ~50 planilhas. Use a regra prática de ~0.75 palavras por token.
- Análise de orçamento de contexto: dado que o GPT-4o tem 128K tokens de janela e o system prompt + instruções consomem ~2K tokens, quantos chunks de ~500 tokens cabem em cada query? Como isso afeta a estratégia de chunking e retrieval?
- Recomendação de estratégia de chunking justificada pelo tipo de pergunta que o usuário fará e pelo conceito de *lost in the middle*.

Me mande apenas o prompt.

---

### 🤖 Assistente

```
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
```

---

### 👤 Usuário

Salva essa nova sessão/conversa em um arquivo .md nesta pasta, chamado criacao-prompt-inicial.md. Adicione as minhas e suas respostas nele.

---

### 🤖 Assistente

Arquivo criado em `/home/ricardo.fuhrmann@db1.com.br/projetos/dgs-ai-first/criacao-prompt-inicial.md` com toda a conversa registrada — sua mensagem com o contexto do projeto e o prompt gerado.
