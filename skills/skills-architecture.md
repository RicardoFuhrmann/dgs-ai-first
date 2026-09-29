# Arquitetura de Skills — NovaTech Assistant

> Hierarquia **Foundation → Domain → Artifact**. Uma skill de nível inferior **referencia** as de nível superior, nunca as repete nem as contradiz.
> Formato (Anexo C): um `.md` por skill em `skills/<nível>/<slug>.md`, com frontmatter `name` + `description`. A `description` é a frase de ativação que o agente usa para decidir quando carregar a skill.

## Árvore

```
skills/
├── foundation/                      convenções globais — valem para qualquer artefato
│   ├── typescript-conventions       ◄── BASE de todas as skills que geram código
│   ├── error-handling
│   ├── logging
│   ├── project-structure
│   └── novatech-glossary            linguagem ubíqua (única Foundation não técnica)
│
├── domain/                          padrões por camada
│   ├── azure-functions-endpoint     ← typescript-conventions, error-handling, logging
│   ├── azure-ai-search-integration  ← typescript-conventions, error-handling
│   ├── prompt-context-budget        ← novatech-glossary · ADR-0002/0003
│   ├── testing-patterns             ← typescript-conventions, novatech-glossary
│   ├── react-components             ← typescript-conventions
│   └── sdd-specs                    ← novatech-glossary
│
└── artifact/                        receitas de geração (passo a passo + checklist)
    ├── create-rag-endpoint          ← azure-functions-endpoint, azure-ai-search-integration, prompt-context-budget
    ├── create-integration-test      ← testing-patterns
    ├── create-react-card            ← react-components
    ├── create-tasks-from-plan       ← sdd-specs
    ├── create-requirements-spec     ← sdd-specs, novatech-glossary
    └── create-adr                   ← project-structure
```

**Núcleo herdado:** as 10 skills do starter (`typescript-conventions` … `create-react-card`), que são a árvore usada como input pelo Tech Lead no exercício TL 2.3.
**Acréscimos (7):** cada um corresponde a um artefato da lista do enunciado ou a um problema observado nos exercícios 2.1 e 2.2. A justificativa está na coluna "Por que existe".

## Mapeamento criação × consumo

Legenda de agentes: **CP** = GitHub Copilot · **CC** = Claude Code · **CW** = Claude Cowork · **CL** = Claude (chat).
Frequência estimada para a fase de construção (~8 semanas, 5 módulos em `specs/`).

### Foundation

| Skill | Descrição (frase de ativação) | Cria / mantém | Consome | Frequência | Por que existe |
|---|---|---|---|---|---|
| `typescript-conventions` | Use ao escrever ou revisar **qualquer** arquivo `.ts`/`.tsx` do projeto: tipos, imports ESM, validação com Zod, dependências do `package.json` | Tech Lead | Devs, QA (testes) · CP, CC | Toda geração de código (dezenas por dia) | Base de todas as skills técnicas. O 2.2 mostrou erros de TS que o agente comete sem orientação (imports sem `.js`, `zod` em devDeps) |
| `error-handling` | Use ao tratar falhas, lançar ou capturar erros, ou devolver erro HTTP em handlers e services | Tech Lead | Devs · CP, CC | Todo handler e service | Contrato `{ error: { code, message, details } }` único para bot e painel |
| `logging` | Use ao adicionar logs, métricas ou correlação (`requestId`) em qualquer função | Dev sênior | Devs, Tech Lead (troubleshooting) · CP, CC | Todo handler e service | **Acréscimo.** No starter, o logging estava dentro de `error-handling`. O 2.2 (item B1) mostrou que logging tem regras próprias: não logar a pergunta, correlação com App Insights |
| `project-structure` | Use ao criar arquivo, pasta ou módulo novo, ou ao decidir onde algo deve ficar | Tech Lead | Todos · CP, CC, CW | A cada módulo ou arquivo novo | Espelha o Anexo C, para o agente não criar `utils/` ou `helpers/` soltos |
| `novatech-glossary` | Use sempre que o texto ou o código mencionar termos de negócio da NovaTech: tier, frete especial, carga perigosa, SLA, vigência, CT-e | **Product Specialist** | **Todos os papéis** · CP, CC, CW, CL | Toda spec, teste, prompt e resposta de negócio | **Acréscimo.** É o recorte de domínio do PS 2.1 em formato consumível por agente. Sem ele, o agente trata "Gold" como adjetivo e aceita um tier "Platinum" |

### Domain

| Skill | Descrição (frase de ativação) | Cria / mantém | Consome | Frequência | Por que existe |
|---|---|---|---|---|---|
| `azure-functions-endpoint` | Use ao criar ou alterar um HTTP trigger em `src/functions/` | Dev sênior (revisão TL) | Devs · CP, CC | 1 por endpoint (query, feedback, health) + cada alteração | Padrão `createXHandler(deps)` + registro `app.http` validado na QE-01 |
| `azure-ai-search-integration` | Use ao consultar o índice, mapear resultados para `Chunk` ou alterar o schema do índice | Dev sênior | Devs · CC, CP | Baixa (search service + pipeline de ingestão) | Metadados obrigatórios de vigência, sem filtrar obsoletos (ADR-0003) |
| `prompt-context-budget` | Use ao montar mensagens para o GPT-4o, alterar `prompts/system-prompt.md` ou mexer em limites de tokens | Tech Lead + Product Specialist (guardrails) | Devs, PS, QA (eval) · CC, CL | Baixa em volume, **alta em impacto**: cada mudança de prompt | **Acréscimo.** Transforma a ADR-0002 (4K/8K, 3 turnos) e a ordem de contexto do cenário 1 em regras verificáveis. Hoje isso está espalhado em ADR e em documentos de exercício |
| `testing-patterns` | Use ao escrever qualquer teste (unit, integration, e2e) ou fixture | **QA** (co-autoria TL) | Devs, QA · CP, CC, CW | Todo PR | Vitest, `tests/fixtures/` com dados do Anexo B e mocks HTTP (msw) para Azure |
| `react-components` | Use ao criar ou alterar componente do painel web em `src/web/` | Dev pleno | Dev pleno · CP | Média (painel web: ~10 componentes) | Painel é o 4º componente da arquitetura |
| `sdd-specs` | Use ao escrever ou revisar `requirements.md`, `plan.md` ou `tasks.md` em `specs/` | **Delivery Manager** + Product Specialist | PS, TL, Devs, DM · CW, CL, CC | 5 módulos × 3 artefatos + revisões | **Acréscimo.** O artefato "Specs de produto (template SDD)" da lista do enunciado. Define o que cada arquivo contém e quem aprova (Anexo C) |

### Artifact

| Skill | Descrição (frase de ativação) | Cria / mantém | Consome | Frequência | Por que existe |
|---|---|---|---|---|---|
| `create-rag-endpoint` | Use quando pedirem "crie um endpoint que responde perguntas com a base NovaTech" | Dev sênior | Devs · CC, CP | Baixa (query + variações) | Receita que encadeia 3 skills Domain na ordem da QE-09 |
| `create-integration-test` | Use quando pedirem teste de integração de um endpoint | QA | QA, Devs · CP, CC, CW | 1 por endpoint + cada bug corrigido | Todos os endpoints seguem o mesmo padrão (enunciado) |
| `create-react-card` | Use quando pedirem card de resposta ou formulário de feedback no painel | Dev pleno | Dev pleno · CP | ~5–8 cards | Cards de resposta e feedback repetem estrutura (fonte, versão, ação) |
| `create-tasks-from-plan` | Use quando pedirem para quebrar um `plan.md` em `tasks.md` | Dev (autor do 2.2) | Devs, TL · CC, CL | 5 módulos + replanejamentos | **Acréscimo.** Receita do 2.2: task atômica, critério verificável, rastreio para ADR |
| `create-requirements-spec` | Use quando pedirem o `requirements.md` de um módulo novo | Product Specialist | PS · CW, CL | 5 módulos | **Acréscimo.** Complementa `sdd-specs` com o passo a passo e um checklist de outcomes testáveis |
| `create-adr` | Use quando uma decisão técnica precisar ser registrada ("vamos decidir X", "por que escolhemos Y") | Tech Lead | TL, Devs · CC, CL | ~1 a cada 2 semanas | **Acréscimo.** O artefato "Documentação técnica (ADRs)" da lista. O 2.2 já gerou duas ADRs pendentes (Entra ID, logging) |

**README de módulo** não virou skill própria: é um arquivo curto por módulo, coberto por uma seção em `project-structure`.

## Decisões de escopo: skills que **não** vamos criar

| Candidata | Por que não |
|---|---|
| `env-config` (Foundation) | Um único arquivo (`src/shared/config.ts`, QE-02) escrito uma vez. Uma regra em `typescript-conventions` e outra em `error-handling` bastam |
| `bicep-infra` | Nesta fase a infra é narrativa (Anexo C). Não há geração repetida e toda mudança de infra passa pelo TL |
| `teams-bot-card` | Os Adaptive Cards são 2 arquivos (`response-card`, `feedback-card`). Criar uma skill para 2 artefatos custa mais do que escrever os dois |
| `mcp-config` | Configuração feita uma vez (Dev 2.1), já documentada em `evidencias/exercicio-2-1/` |

## Manutenção

| Regra | Como funciona |
|---|---|
| Dono | Cada skill tem um dono (coluna "Cria / mantém"), registrado no frontmatter (`owner`) |
| Mudança | Só via PR, com revisão do dono. Mudança em Foundation exige também o TL, porque impacta todas as outras |
| Gatilho de atualização | (1) o agente gerou um erro que a skill deveria ter evitado → vira anti-padrão; (2) duas implementações divergem do padrão → a skill é atualizada ou uma delas é corrigida; (3) nova ADR que afete a camada |
| Teste | Toda skill Domain/Artifact passa pelo ciclo do TL 2.3: gerar com a skill, avaliar se as regras foram seguidas, reescrever o que não foi seguido |
| Obsolescência | Skill sem uso em 4 semanas (nenhum PR citando) é revisada na retrospectiva: fundir, reescrever ou remover |
