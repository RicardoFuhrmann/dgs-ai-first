#### Exercício 2.3 — Definição de estratégia de skills do projeto

**Contexto:** Você precisa definir quais skills o projeto precisa, quem as cria, e como são mantidas.

**Ferramentas a utilizar:** Claude (chat) + GitHub Copilot

**Inputs fornecidos:**
- O cenário completo.
- A estrutura do repositório (ver **Anexo C**) — as skills devem seguir a organização em `/skills/foundation/`, `/skills/domain/`, `/skills/artifact/`.
- A lista de artefatos que serão produzidos repetidamente no projeto:
  - Endpoints Azure Functions com padrão RAG (vários ao longo do projeto).
  - Testes de integração para endpoints (mesmo padrão para todos).
  - Componentes React para o painel web (cards de resposta, formulários de feedback).
  - Documentação técnica de endpoints (ADRs, README de módulos).
  - Specs de produto (seguindo template SDD).
- Conceito de skills: *"Skills são artefatos estruturados (tipicamente arquivos .md) que encapsulam como gerar tipos específicos de outputs. A hierarquia é Foundation (convenções globais) → Domain (padrões por camada) → Artifact (receitas de geração)."*

**Tarefa:**
1. Usando o **Claude**, defina a árvore de skills do projeto seguindo a hierarquia Foundation → Domain → Artifact:
   - Foundation: convenções globais (ex: error handling, logging, env config, TypeScript conventions).
   - Domain: padrões por camada (ex: como endpoints são estruturados, como testes são escritos, como componentes React são organizados).
   - Artifact: receitas de geração específicas (ex: skill para criar endpoint RAG, skill para criar teste de integração).

2. Para cada skill, defina: nome, descrição (frase-ativação que um agente reconheceria), quem cria (qual papel), quem consome (qual papel + quais agentes), e frequência de uso estimada.

3. Usando o **GitHub Copilot**, crie o SKILL.md da skill Foundation mais importante (a que será usada por todas as outras como base). O arquivo deve conter: contexto, regras prescritivas, exemplos concretos (DO/DON'T com código), e anti-padrões.

**Entregável:** A árvore de skills, o mapeamento de criação/consumo, e o SKILL.md Foundation gerado com o Copilot.

**Critérios de avaliação:**
- A árvore de skills é coerente com o projeto (não tem skills que ninguém usaria).
- A atribuição de criação e consumo por papel demonstra visão de time (não é só para devs).
- O SKILL.md Foundation é concreto e prescritivo (contém exemplos de código reais, não abstrações).
- Os anti-padrões são úteis (coisas que o Copilot realmente geraria de errado sem guidance).

