# Exercício 2.2 — Implementação de spec com Spec Driven Development

Enunciado: [enunciado.md](enunciado.md)

| Tarefa | Entregável |
|---|---|
| 1. `plan.md` → `tasks.md` com tasks atômicas (ID, descrição, critérios de aceite, dependências, estimativa) | [`specs/query-endpoint/tasks.md`](../../specs/query-endpoint/tasks.md): 9 tasks (QE-01 a QE-09), grafo de dependências e rastreabilidade para ADR-0002/0003 · plan de origem: [`plan.md`](../../specs/query-endpoint/plan.md) |
| 2. Implementar a primeira task (QE-01) | [`handler.ts`](../../src/functions/query/handler.ts) · [`validator.ts`](../../src/functions/query/validator.ts) · [`logger.ts`](../../src/shared/logger.ts) · [`errors.ts`](../../src/shared/errors.ts) · testes em [`tests/unit/functions/query/`](../../tests/unit/functions/query/) |
| 3. Revisão crítica (≥ 2 ajustes) | [revisao-critica.md](revisao-critica.md): 4 problemas corrigidos durante a implementação e 5 ajustes pendentes, 3 deles bloqueando o merge |
| Evidência de execução | [execucao.md](execucao.md): 30 testes verdes e o endpoint rodando no host real do Azure Functions, testado com `curl` · prints [02-testes-passando.png](02-testes-passando.png) e [03-endpoint-azure-functions.png](03-endpoint-azure-functions.png) |

**Ferramenta:** Claude Code, e não o Copilot. Ver nota em [revisao-critica.md](revisao-critica.md).

## Como reproduzir

```bash
npm install
npm test                 # 30 testes
npm run build && func start   # requer Azure Functions Core Tools 4 + local.settings.json com FUNCTIONS_WORKER_RUNTIME=node
```
