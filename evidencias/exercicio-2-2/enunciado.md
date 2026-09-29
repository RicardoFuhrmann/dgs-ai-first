#### Exercício 2.2 — Implementação de spec com Spec Driven Development

**Contexto:** O Product Specialist escreveu o requirements.md do query endpoint. O Tech Lead converteu em plan.md. Agora você precisa converter o plan em tasks.md e implementar a primeira task. Lembre-se de que na fase anterior você construiu um protótipo de RAG com ferramentas open-source — agora o código é de produção, com Azure e padrões do projeto.

**Ferramentas a utilizar:** Claude (chat) + GitHub Copilot

**Inputs fornecidos:**
- O cenário completo.
- A estrutura do repositório (ver **Anexo C**) — o código deve seguir a organização de diretórios definida.
- O plan.md simulado do query endpoint:
  ```markdown
  # Plan — Query Endpoint
  
  ## Approach
  Azure Function HTTP trigger que:
  1. Recebe pergunta do atendente via POST /api/query
  2. Converte pergunta em embedding via Azure OpenAI
  3. Busca top-5 chunks no Azure AI Search
  4. Monta prompt com chunks + system prompt + pergunta
     (respeitando context budget: ~4K system + ~8K chunks + pergunta)
  5. Envia ao GPT-4o e retorna resposta com source_document
  
  ## Technical Decisions
  - TypeScript com Azure Functions v4
  - Zod para validação de input/output
  - Retry com exponential backoff para chamadas Azure
  - Structured logging com pino
  
  ## Prior Decisions (do cenário 1)
  - Context budget definido na ADR-0002: ~4K system + ~8K chunks
  - Documentos contraditórios tratados com metadado de vigência (ADR-0003)
  - System prompt versionado em /prompts/system-prompt.md
  
  ## Dependencies
  - Azure AI Search index must be populated (pipeline de ingestão)
  - System prompt must be finalized (ver /prompts/system-prompt.md)
  ```

**Tarefa:**
1. Usando o **Claude**, converta o plan.md em um `tasks.md` com tasks atômicas. Cada task deve ter: ID, descrição, critérios de aceite, dependências (quais tasks precisam estar prontas antes), e estimativa (P/M/G).

2. Usando o **GitHub Copilot**, implemente a primeira task da lista — tipicamente o setup do endpoint com validação de input. O código deve seguir os padrões definidos no plan (TypeScript, Zod, Azure Functions v4).

3. Revise criticamente o código gerado pelo Copilot: identifique ao menos 2 pontos que precisariam de ajuste antes de um code review real.

**Entregável:** O tasks.md, o código implementado com o Copilot, e a revisão crítica com os ajustes propostos.

**Critérios de avaliação:**
- As tasks são realmente atômicas (cada uma pode ser implementada e testada independentemente).
- Os critérios de aceite são verificáveis (não são vagos como "funcionar corretamente").
- O código gerado pelo Copilot é funcional e segue os padrões do plan.
- A revisão crítica identifica problemas reais (não inventa problemas para cumprir a tarefa).

