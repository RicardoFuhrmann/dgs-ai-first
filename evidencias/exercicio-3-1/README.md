# Exercício 3.1 — Structured output e verificações determinísticas

Enunciado: [enunciado.md](enunciado.md)

| Tarefa | Entregável |
|---|---|
| 1. Schema Zod do structured output (`answer`, `source_document`, `confidence_score`) | `AssistantResponseSchema` em [`src/services/response-validator.ts`](../../src/services/response-validator.ts) |
| 2. `response-validator.ts`: valida o schema + 2 guardrails, loga o motivo e devolve resposta padrão segura | Mesmo arquivo · testes em [`tests/unit/services/response-validator.test.ts`](../../tests/unit/services/response-validator.test.ts) (85 testes) |
| 3. Code review com ≥ 2 problemas reais + correções | [code-review.md](code-review.md): 4 problemas (R1–R4), todos reproduzidos por ataque ([attack.mjs](attack.mjs)) contra a v1 e corrigidos com teste de regressão |

## Evidência da geração

Gerado pelo Claude Code numa sessão separada (no papel do Copilot), seguindo a skill `typescript-conventions` do cenário 2:

| Print | O que mostra |
|---|---|
| [01a-geracao-prompt-e-write.png](01a-geracao-prompt-e-write.png) | Prompt, leitura do enunciado e da skill, `Write(src/services/response-validator.ts)` |
| [01b-geracao-autocorrecao-regex.png](01b-geracao-autocorrecao-regex.png) | O gerador corrigindo os próprios regex durante a geração |
| [01c-geracao-resumo-e-limitacoes.png](01c-geracao-resumo-e-limitacoes.png) | Resumo final, com as 3 "Known limitations" que o próprio gerador declarou |

## Linha do tempo no git

| Commit | O quê |
|---|---|
| `c87d987` | v1, **exatamente como gerada** (antes do review) |
| commit seguinte, `fix(dev-3.1): code review…` | v2 com as correções do review e 20 testes de regressão (10 falham contra a v1) |

## Os 2 guardrails realmente bloqueiam

Todo caminho de falha devolve `SAFE_FALLBACK_RESPONSE`, e o texto do modelo nunca chega a quem chama. O teste `bloqueia de fato: o texto do modelo não chega a quem chama` cobre isso. O log registra só o motivo (`reason`) e os campos inválidos, nunca o texto da resposta.
