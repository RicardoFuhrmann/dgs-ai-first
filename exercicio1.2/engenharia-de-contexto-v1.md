# Engenharia de Contexto — Mapeamento Estático e Dinâmico (v1)

## O problema central da engenharia de contexto

Em um assistente RAG de produção, o modelo não recebe "um prompt". Ele recebe uma janela de contexto montada dinamicamente a cada query, composta de partes com origens, ciclos de vida e prioridades diferentes. A qualidade da resposta depende tanto do conteúdo de cada parte quanto de como essas partes são ordenadas e delimitadas entre si.

Dois problemas emergem quando a composição é feita ingenuamente:

1. **Contaminação**: chunks de uma query anterior ou metadados irrelevantes distraem o modelo do que importa na query atual.
2. **Perda de ancoragem**: o system prompt fica soterrado por chunks longos, e o modelo perde referência às regras de comportamento definidas.

A engenharia de contexto resolve esses problemas definindo, para cada componente: o que ele é, onde mora no contexto, qual é sua prioridade e quanto espaço pode ocupar.

---

## Componentes do contexto e suas propriedades

| Componente | Tipo | Descrição | Tokens estimados | Observações |
|---|---|---|---|---|
| System prompt (identidade + escopo + regras + formato + exemplos) | **Estático** | Comportamento completo do assistente: quem é, o que faz, regras invioláveis, formato de saída e exemplos de comportamento proibido | ~1.050–1.150 | Imutável entre queries. Ocupa a `system message` da API, separada do contexto da human message. Nunca truncar. |
| Metadados do chamado | **Dinâmico** | Número do chamado, data e hora de abertura, canal de origem (Teams, portal, telefone) | ~40–80 | Necessário para aplicar regras de transição (ex.: chamados abertos antes/depois de 01/12/2023 para PROC-042). Sem esse dado, a escolha de versão fica impossibilitada. |
| Metadados do cliente | **Dinâmico** | Tier (Gold/Silver/Standard), número do contrato, volume de operações/mês, chamados abertos no mês corrente | ~50–100 | Necessário para SLA e descontos de volume (PROC-042v2, Seção 4). Ausência implica que o assistente não pode resolver perguntas de tier sem pedir o dado ao atendente. |
| Histórico recente da conversa | **Dinâmico** | Últimas 3 trocas entre atendente e assistente no mesmo chamado | ~150–500 | Limitar a 3 turnos. Mais turnos aumentam risco de o modelo referenciar chunks de turnos anteriores como se fossem o contexto atual. Cada turno deve ter delimitadores claros (`[TURNO N]`). |
| Documentação recuperada (chunks RAG) | **Dinâmico** | 3 a 7 chunks relevantes com metadados: ID do documento, seção, versão, data de vigência e score de relevância do reranker | ~400–1.400 | Componente mais variável em tamanho e o maior risco de contaminação. Controlar via reranking + filtro de score mínimo. Incluir metadados de versão nos chunks é obrigatório para que o modelo possa aplicar as regras de conflito. |
| Pergunta do atendente | **Dinâmico** | Query do turno atual, em linguagem natural, claramente delimitada | ~20–60 | Deve aparecer por último, após os chunks, para forçar o modelo a "ler" a documentação antes de formular a resposta. |

---

## Por que a ordem importa

A ordem dos componentes na human message não é arbitrária. Ela reflete um modelo de atenção:

```
[SYSTEM MESSAGE]
  → System prompt completo
    (regras, formato, exemplos — imutável)

[HUMAN MESSAGE — montada a cada query]
  1. [CONTEXTO DO CHAMADO]
     Número, data de abertura, canal
     → Estabelece o frame antes de qualquer documentação.
       Sem a data do chamado, o modelo não pode escolher
       entre versões PROC-042 v1 e v2.

  2. [CONTEXTO DO CLIENTE]
     Tier, contrato, volume mensal
     → Necessário para filtrar quais regras se aplicam
       (SLA por tier, desconto de volume).

  3. [HISTÓRICO DA CONVERSA]
     Últimos 3 turnos, delimitados
     → Contexto de continuidade. Vem antes dos chunks para
       que o modelo entenda o que já foi dito antes de ler
       a documentação nova.

  4. [DOCUMENTAÇÃO RECUPERADA]
     Chunks com metadados completos, ordenados por score
     → Fonte de verdade factual do turno atual. Vem antes
       da pergunta para que o modelo processe os chunks
       no contexto das regras, não no contexto da pergunta.

  5. [PERGUNTA DO ATENDENTE]
     Query atual, delimitada
     → Por último. Força o modelo a responder com base
       no que foi estabelecido nos passos anteriores,
       não por memória paramétrica.
```

**Princípio subjacente:** tudo que precisa ser processado antes da resposta deve aparecer antes da pergunta. Colocar a pergunta no início ou no meio do contexto incentiva o modelo a buscar a resposta na memória paramétrica em vez de nos chunks.

---

## Prioridade das informações

| Prioridade | Componente | Razão |
|---|---|---|
| 1 (máxima) | System prompt — regras | Define o comportamento. Sobrepõe qualquer instrução implícita em chunks. |
| 2 | Chunk formal com metadado de vigência mais recente | Fonte de verdade. Versão mais recente vence quando há conflito com data clara. |
| 3 | Chunk formal sem metadado de vigência claro | Fonte de verdade, mas requer atenção a conflitos. |
| 4 | Disposições transitórias documentadas no chunk | Regra de aplicação de versão. Determina qual chunk de nível 2/3 usar. |
| 5 | Metadados do cliente e do chamado | Necessários para seleção das regras aplicáveis, não são fonte de política. |
| 6 | Chunk informal (FAQ, comunicado interno) | Complemento contextual. Nunca autoridade. Sempre sinalizado. |
| 7 | Histórico da conversa | Continuidade. Menor prioridade que documentação. |

---

## Orçamento de tokens por cenário

| Cenário | Tokens de contexto | Reserva para resposta | Total estimado |
|---|---|---|---|
| Query simples — 1 a 2 chunks, sem conflito de versão | ~1.500–1.900 | ~400–600 | ~2.000–2.500 |
| Query moderada — 3 a 5 chunks, um conflito de versão | ~2.100–2.900 | ~600–900 | ~2.700–3.800 |
| Query complexa — 5 a 7 chunks, múltiplos conflitos ou cálculo multi-parâmetro | ~2.900–3.900 | ~800–1.200 | ~3.700–5.100 |

**Recomendação de orçamento máximo para v1:** 4.000 tokens de contexto por chamada. Acima disso, a atenção do modelo sobre as regras do system prompt degrada em modelos de capacidade intermediária, aumentando o risco de alucinação e descumprimento de guardrails.

---

## Controle de qualidade do pipeline RAG

A engenharia de contexto não começa no prompt — começa no pipeline de recuperação. Chunk ruim no contexto é pior que chunk ausente, porque o modelo pode usar o chunk ruim com confiança.

| Decisão de pipeline | Impacto no contexto |
|---|---|
| Reranking com score mínimo configurável | Elimina chunks tangencialmente relacionados que "contaminam" a resposta |
| Máximo de 5 chunks por default, 7 como teto absoluto | Preserva a atenção do modelo sobre as regras do system prompt |
| Metadados obrigatórios no chunk: ID, seção, versão, data | Permite que o modelo aplique CF2/CF3 (conflito entre versões) corretamente |
| Identificação explícita de fonte informal no metadado | Dispara automaticamente as regras FI1–FI4 no modelo |
| Janela deslizante de 3 turnos para histórico | Evita que chunks antigos sejam reativados em turnos novos |

---

## O que NÃO é engenharia de contexto

Para delimitar o escopo:

- **Não é apenas "o prompt completo"**: o system prompt é um componente estático; o contexto é a composição dinâmica de múltiplos componentes por query.
- **Não é só quanto tokens usar**: é sobre quais informações entram, em que ordem, com que metadados e com que prioridade relativa.
- **Não é responsabilidade exclusiva do prompt**: o pipeline RAG (retrieval, reranking, filtragem) é parte da engenharia de contexto tanto quanto o texto do prompt.
- **Não é estática**: a composição muda a cada query com base no chamado, no cliente e nos chunks recuperados. O que não muda são as regras de composição.
