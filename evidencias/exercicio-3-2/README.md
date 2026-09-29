# Exercício 3.2 — Revisão crítica de código gerado por IA

Enunciado: [enunciado.md](enunciado.md) · Código revisado: [feedback-handler.original.ts](feedback-handler.original.ts)

| Tarefa | Entregável |
|---|---|
| 1. Minha revisão **antes** do Claude, classificada | [minha-revisao.md](minha-revisao.md): 7 itens. Commit `a4e7bd6`, anterior a qualquer revisão por IA |
| 2. Segunda revisão com o Claude | [revisao-claude.md](revisao-claude.md): 21 itens. Feita por uma instância **isolada** (sem acesso à minha revisão nem ao repo) · [prompt](prompt-revisao-claude.txt) |
| Comparação | [comparacao.md](comparacao.md): o que cada um achou, o que o Claude errou (`.uuid()`, formato de erro) e o que só eu vi (testes) |
| 3. Código reescrito seguindo o AGENTS.md | [codigo-reescrito.md](codigo-reescrito.md) (rastreabilidade de cada problema → correção → teste + execução no host) · código em [`src/functions/feedback/`](../../src/functions/feedback/) |

**As 4 armadilhas obrigatórias** (`as any`, `console.log`, `require`, e-mail no log) aparecem na minha revisão, nos itens 3, 1, 4 e 2.
