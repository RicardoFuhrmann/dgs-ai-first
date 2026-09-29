#### Exercício 2.1 — Configuração e uso real de MCP servers no projeto

**Contexto:** Antes de codar, você vai configurar e **efetivamente rodar** os MCP servers que dão aos agentes de IA acesso ao repositório, à documentação da NovaTech e ao corpus de busca. Tudo local e gratuito — nenhum serviço pago ou externo.

**Ferramentas a utilizar:** Claude (chat) + GitHub Copilot

**Inputs fornecidos:**
- O cenário completo.
- O **Anexo C** (estrutura do repositório e exemplo de `.mcp/mcp.json`) e o **Anexo D — Starter Repo**, que já traz a árvore, o `git init` e as pastas `docs/novatech/` (documentos do Anexo A) e `data/retrieval-corpus/` (chunks do Anexo B).
- A lista de necessidades do projeto que precisam de acesso via MCP:
  - Código, specs e skills do repositório (ler e escrever).
  - Documentação de negócio da NovaTech (ler — está em `docs/novatech/`).
  - Corpus de chunks para "recuperação" (ler — está em `data/retrieval-corpus/`).
  - Histórico/branches do repositório.
  - Memória persistente de decisões e linguagem ubíqua do projeto.
- Conceito de MCP: *"MCP (Model Context Protocol) padroniza como modelos de IA se conectam a ferramentas externas. Um MCP server expõe Tools (ações), Resources (dados read-only) e Prompts (templates). Servers podem rodar localmente — não precisam ser serviços na nuvem."*

**Tarefa:**
1. Usando o **Claude**, mapeie cada necessidade do projeto para um *reference server* gratuito e local (filesystem, git, memory, everything). Para cada um: o que ele expõe (tools/resources/prompts), quem consome, e qual pasta/escopo ele recebe.

2. Escreva o `.mcp/mcp.json` do projeto (preenchendo o scaffold vazio do starter repo). Aplique **least privilege** de forma concreta: o `filesystem` server deve receber só as pastas necessárias, e as fontes de leitura (`docs/novatech/`, `data/retrieval-corpus/`) devem ser tratadas como **read-only**; justifique por que cada escopo é o mínimo suficiente.

3. **Suba os servers e comprove o uso:** abra o agente (Claude/Copilot) com os servers ativos e demonstre, com evidência, que ele consegue (a) listar e ler um documento de `docs/novatech/`, (b) recuperar um chunk relevante de `data/retrieval-corpus/` para uma pergunta do domínio (use o mapa de cobertura do Anexo B como gabarito), e (c) ler o histórico do repositório via `git`.

4. Identifique ao menos 2 riscos de segurança no uso de MCP servers **neste contexto local** e proponha mitigações (ex.: um `filesystem` server com escopo amplo demais expõe `.env`/segredos; um server com escrita habilitada permite que o agente altere arquivos sem revisão).

**Entregável:** O mapeamento, o `.mcp/mcp.json` final, a **evidência de execução** (prints/exports mostrando o agente lendo doc, recuperando chunk e lendo o git), e a análise de riscos.

**Critérios de avaliação:**
- A configuração usa apenas servers locais e gratuitos (nenhum serviço pago/externo).
- O least privilege é concreto: escopos mínimos, fontes de negócio em read-only, justificativa por server.
- Há **evidência real de uso** (não só o arquivo de config): o agente leu documentação e recuperou chunk via MCP.
- Os riscos são específicos ao setup local (exposição de segredos por escopo amplo, escrita sem gate), com mitigação acionável.

