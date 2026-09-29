# Exercício 2.1 — Configuração e uso real de MCP servers

Enunciado: [enunciado.md](enunciado.md)

| Tarefa | Entregável |
|---|---|
| 1. Mapear necessidades → reference servers | [mapeamento-mcp.md](mapeamento-mcp.md) §1–§2 |
| 2. `.mcp/mcp.json` com least privilege justificado | [`.mcp/mcp.json`](../../.mcp/mcp.json) · [`.claude/settings.json`](../../.claude/settings.json) · justificativas em [mapeamento-mcp.md](mapeamento-mcp.md) §3–§4 |
| 3. Subir os servers e comprovar uso | Prints abaixo · barreiras testadas em [testes-least-privilege.md](testes-least-privilege.md) |
| 4. Riscos de segurança + mitigações | [riscos.md](riscos.md) |

## Evidência de execução (Claude Code + `claude --mcp-config .mcp/mcp.json`)

| Print | O que mostra |
|---|---|
| [01-mcp-servers-conectados.png](01-mcp-servers-conectados.png) | `/mcp` com `fs-workspace`, `fs-knowledge`, `git` e `memory` conectados |
| [02a](02a-leitura-documento-chamada-mcp.png) · [02b](02b-leitura-documento-resultado.png) | **(a)** o agente lista `docs/novatech/` e lê a POL-001 via `fs-knowledge` |
| [03-recuperacao-chunk-mcp.png](03-recuperacao-chunk-mcp.png) | **(b)** pergunta "multiplicador do Sudeste?": recupera o **PROC-042v2-B (1.1)** e aponta o contraditório **PROC-042-B (1.0)**, como no gabarito do Anexo B |
| [04-historico-git-mcp.png](04-historico-git-mcp.png) | **(c)** `git_log` e `git_status` via server `git` |
| [05-escrita-bloqueada.png](05-escrita-bloqueada.png) | Pedido para alterar a SLA-2024: as tools de escrita não estão disponíveis para o agente, e ele recusa |

Apoio: [mcp-smoke.mjs](mcp-smoke.mjs) (cliente MCP mínimo usado nos testes) · [roots-test.mcp.json](roots-test.mcp.json) (config que reproduz o bypass de escopo via MCP Roots)
