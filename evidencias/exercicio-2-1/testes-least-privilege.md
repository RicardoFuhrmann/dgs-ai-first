# Exercício 2.1 — Testes de least privilege (execução real)

Estes testes provam que os escopos do [`.mcp/mcp.json`](../../.mcp/mcp.json) são **impostos**, e não apenas declarados. A evidência de uso pelo agente (ler doc, recuperar chunk, ler git) está nos prints desta pasta.

## 1. Barreiras de cada server

Executado na raiz do repo com o cliente MCP mínimo [`mcp-smoke.mjs`](mcp-smoke.mjs). Ele lê o `.mcp/mcp.json`, sobe o server por stdio e faz uma chamada JSON-RPC. Antes do teste foi criado um `.env` falso na raiz (`SECRET=teste-nao-real`), removido em seguida.

```text
$ node mcp-smoke.mjs fs-workspace list_allowed_directories {}
{"content":[{"type":"text","text":"Allowed directories:\n/projects"}]}

$ node mcp-smoke.mjs fs-workspace read_file {"path":"/projects/../.env"}
{"content":[{"type":"text","text":"Error: Access denied - path outside allowed directories: /.env not in /projects"}],"isError":true}

$ node mcp-smoke.mjs fs-workspace list_directory {"path":"/projects"}
{"content":[{"type":"text","text":"[DIR] prompts\n[DIR] skills\n[DIR] specs\n[DIR] src\n[DIR] tests"}]}

$ node mcp-smoke.mjs fs-knowledge list_directory {"path":"/projects/docs/novatech"}
{"content":[{"type":"text","text":"[FILE] FAQ-atendimento.md\n[FILE] POL-001-politica-devolucao.md\n[FILE] PROC-042-frete-especial-v1.md\n[FILE] PROC-042-v2-frete-especial-revisado.md\n[FILE] README.md\n[FILE] SLA-2024-tabela-sla-clientes.md"}]}

$ node mcp-smoke.mjs fs-knowledge write_file {"path":"/projects/docs/novatech/SLA-2024-tabela-sla-clientes.md","content":"adulterado"}
{"content":[{"type":"text","text":"Error: EROFS: read-only file system, open '/projects/docs/novatech/SLA-2024-tabela-sla-clientes.md'"}],"isError":true}

$ node mcp-smoke.mjs git git_log {"repo_path":"/repo","max_count":2}
{"content":[{"type":"text","text":"Commit history:\nCommit: 1b2b7c321ebde074c5ef16e7505556d5f0c3e02f\nAuthor: Ricardo Fuhrmann\nDate: 2026-09-29 17:02:58-04:00\nMessage: chore: starter repo do cenário 2 (Anexo D)\n\n\nCommit: 6c01f60dae93ac5cba3812236b2375b11eb530ed\nAuthor: Ricardo Fuhrmann\nDate: 2026-07-21 16:39:27-04:00\nMessage: Initial commit with empty README\n\n"}],"isError":false}

$ node mcp-smoke.mjs git git_create_branch {"repo_path":"/repo","branch_name":"agente-sem-revisao"}
{"content":[{"type":"text","text":"Lock at '/repo/.git/refs/heads/agente-sem-revisao.lock' could not be obtained"}],"isError":true}
```

| Verificação | Esperado | Resultado |
|---|---|---|
| `fs-workspace` enxerga só as 5 pastas de trabalho | `prompts skills specs src tests` | ✅ |
| `fs-workspace` lê `.env` da raiz | negado | ✅ `Access denied` |
| `fs-knowledge` lista docs de negócio | 6 arquivos | ✅ |
| `fs-knowledge` adultera a SLA-2024 | negado | ✅ `EROFS` (kernel) |
| `git` lê histórico | log | ✅ |
| `git` cria branch sem revisão | negado | ✅ lock negado (mount `ro`) |

## 2. Por que não bastaria `npx` com as pastas nos `args` (MCP Roots)

Hipótese tirada da leitura do código do `server-filesystem`: quando o cliente anuncia suporte a *Roots*, o server **troca** as pastas dos `args` pelos roots do cliente.

Teste: [`roots-test.mcp.json`](roots-test.mcp.json) sobe o server via `npx` com **apenas `src`** nos `args`, e o Claude Code (headless) chama `list_allowed_directories`:

```text
$ claude -p --mcp-config roots-test.mcp.json --strict-mcp-config \
    "Chame a tool mcp__fs-npx__list_allowed_directories e copie a saída literal."

Allowed directories:
/home/ricardo.fuhrmann@db1.com.br/Documentos/db1/ia-first/dgs/dgs-ai-first
```

**A hipótese se confirmou:** o escopo configurado (`src`) foi descartado, e o agente passou a ter leitura e escrita na **raiz inteira do repositório**: `.env`, `.git/`, `docs/novatech/` com escrita, `infra/`. Uma configuração que *parece* least privilege no JSON não é, na prática. É por isso que os servers de filesystem rodam em Docker com *bind mounts*: o container só tem as pastas montadas, e roots que apontam para caminhos do host não existem lá dentro.
