# Exercício 2.1 — Mapeamento de MCP servers (NovaTech Assistant)

Configuração final: [`.mcp/mcp.json`](../../.mcp/mcp.json) · Controle no cliente: [`.claude/settings.json`](../../.claude/settings.json)

Todos os servers são *reference servers* do repositório `modelcontextprotocol/servers`, locais e gratuitos. Nenhum depende de conta, token ou serviço externo.

## 1. Necessidade → server

| Necessidade do projeto | Server (instância) | Substitui (no cenário real) |
|---|---|---|
| Código, specs e skills (ler e escrever) | `filesystem` → **`fs-workspace`** | GitHub (conteúdo do repo) |
| Documentação de negócio NovaTech (ler) | `filesystem` → **`fs-knowledge`** | Confluence da NovaTech |
| Corpus de chunks para recuperação (ler) | `filesystem` → **`fs-knowledge`** | Azure AI Search |
| Histórico/branches do repositório | **`git`** | GitHub (histórico, PRs) |
| Memória de decisões e linguagem ubíqua | **`memory`** | — (glossário/ADR vivos) |
| Explorar primitivas de MCP | `everything` | **Não incluído no projeto** (ver §4) |

O `filesystem` aparece **duas vezes, de propósito**: uma instância com escrita para o que o agente produz e outra somente leitura para as fontes de verdade do negócio. Um único server não permite escopos com permissões diferentes, porque o `server-filesystem` não tem flag de read-only por pasta.

## 2. O que cada server expõe e quem consome

| Instância | Tools | Resources / Prompts | Quem consome |
|---|---|---|---|
| `fs-workspace` | `read_file`, `read_multiple_files`, `list_directory`, `directory_tree`, `search_files`, `get_file_info`, `list_allowed_directories` · **escrita:** `write_file`, `edit_file`, `create_directory`, `move_file` | — | Devs e Tech Lead (Claude Code / Copilot) gerando código, specs SDD e skills; QA gerando testes em `tests/` |
| `fs-knowledge` | as mesmas tools, mas **as de escrita falham** (`EROFS`) | — | Agente de dev consultando regras de negócio (POL-001, PROC-042, SLA-2024, FAQ); Product Specialist e QA validando guardrails e golden queries contra o corpus |
| `git` | `git_status`, `git_log`, `git_show`, `git_diff`, `git_diff_staged`, `git_diff_unstaged` · **escrita:** `git_add`, `git_commit`, `git_reset`, `git_checkout`, `git_create_branch`, `git_init` | — | Devs e Tech Lead revisando histórico e diffs em code review; Delivery Manager rastreando o que mudou por spec |
| `memory` | `create_entities`, `create_relations`, `add_observations`, `delete_*` · **leitura:** `read_graph`, `search_nodes`, `open_nodes` | Resource `memory://knowledge-graph` | Todo o time. Termos da linguagem ubíqua (ex.: *frete especial* = carga > 500 kg, *tier* Gold/Platinum) e decisões (ADR-0001..0004) registrados como entidades, para o agente não "reinventar" um termo a cada sessão |

## 3. Escopo de cada server: por que é o mínimo suficiente

| Instância | Escopo concedido | Por que é o mínimo | Como o escopo é **imposto** |
|---|---|---|---|
| `fs-workspace` | `src/`, `specs/`, `skills/`, `tests/`, `prompts/` (leitura e escrita) | São as únicas pastas em que o agente cria ou altera artefatos nesta fase: código (2.2), `tasks.md` (2.2), skills (2.3), testes (QA) e system prompt versionado (ADR-0002). **Ficam de fora:** `docs/` (fonte de negócio, só leitura), `data/` (corpus, só leitura), `infra/` (Bicep: mudança de infra não passa por agente sem revisão do TL), `.github/` (CI/CD) e a raiz (`.env`, `local.settings.json`, `.git/`) | O container Docker só enxerga esses 5 *bind mounts*. O `.env` da raiz **não existe** dentro do container |
| `fs-knowledge` | `docs/novatech/` e `data/retrieval-corpus/`, **read-only** | São as fontes que o agente precisa consultar para responder perguntas do domínio. `docs/adr/` e `docs/runbooks/` ficam de fora porque não são conhecimento de negócio da NovaTech. Nada ali deve ser escrito por agente: alterar um valor da SLA-2024 ou o multiplicador da PROC-042v2 contaminaria o gabarito do RAG (Anexo B) | Mount `ro` no Docker, então a escrita falha no **kernel** (`EROFS`), qualquer que seja o cliente (Claude Code, Copilot). Além disso, as tools de escrita estão em `deny` no `.claude/settings.json` |
| `git` | Repositório inteiro, **read-only** | O `mcp-server-git` só aceita o repositório como unidade, sem escopo por subpasta. O agente precisa ler log, show e diff; **commit, branch e reset são decisão humana** | Mount `ro`: `git_create_branch` falha com `Lock ... could not be obtained`. Tools de escrita em `deny` |
| `memory` | Um único arquivo: `.mcp/memory/novatech-memory.jsonl` | O server não recebe diretório nenhum, só o próprio arquivo de grafo. O arquivo é versionado, então as decisões registradas passam por PR como qualquer outro artefato | `MEMORY_FILE_PATH`. Remoções (`delete_*`) em `ask` |

Controles comuns a todos os containers:
- **`--network=none`**: o server não tem rede. Mesmo que uma dependência seja comprometida, não consegue exfiltrar o conteúdo lido.
- **Imagens fixadas por digest `sha256`** e o pacote npm do `memory` com versão fixa (`@2026.8.31`), nunca `latest`.

## 4. Decisões e trade-offs

- **Por que Docker e não `npx` para o `filesystem`?** Lendo o código do server (`dist/index.js`, função `oninitialized`), vi que, quando o cliente suporta **MCP Roots** (Claude Code e VS Code suportam), o server **substitui** as pastas passadas nos `args` pelos roots enviados pelo cliente, que normalmente são o workspace inteiro. Com `npx`, o escopo `src specs skills...` pode virar silenciosamente "a raiz do repo", `.env` incluso. Dentro do container, mesmo que o cliente mande roots, só os mounts existem. O custo é exigir Docker na máquina do dev, o que já é um pré-requisito comum no time.
- **Por que não usar só `deny` no `.claude/settings.json`?** O `deny` vale apenas no Claude Code. O Copilot ignora esse arquivo. O mount `ro` protege no nível do sistema operacional, e o `deny` fica como segunda camada: evita que o agente gaste chamadas tentando escrever.
- **Por que o `everything` ficou fora?** Ele é um server de demonstração das primitivas do MCP e não atende nenhuma necessidade do projeto. Além disso, expõe a tool **`get-env`**, que devolve **todas as variáveis de ambiente** do processo para o modelo. Numa máquina de dev, isso inclui tokens e chaves. Para estudar as primitivas, rode-o isolado, fora do projeto: `npx @modelcontextprotocol/server-everything` com o MCP Inspector.
- **Atrito observado no uso real:** como os servers rodam em container, os caminhos que o agente enxerga são os de dentro do container (`/projects/...` no filesystem e `/repo` no git), e não os do host. No teste (c), o agente primeiro passou o caminho local como `repo_path`, recebeu erro e só acertou `/repo` depois de algumas tentativas (6 chamadas ao `git`). Mitigação: registrar no AGENTS.md que o `git` usa `repo_path: /repo` e o filesystem usa `/projects/<pasta>`.
- **"Recuperação" via filesystem não é RAG:** no teste (b), o agente explicou que o `search_files` só busca por **nome de arquivo**, então precisou ler o `chunks-novatech.md` inteiro e fazer a seleção do chunk dentro do próprio contexto. Acertou o gabarito (PROC-042v2-B, com o PROC-042-B apontado como versão antiga contraditória). Isso funciona com um arquivo de cerca de 10 KB, mas não escala: com os 847 documentos, o custo seria de tokens, e o *context budget* da ADR-0002 (~8K para chunks) seria estourado. Esse é o motivo pelo qual o produto usa Azure AI Search com busca vetorial. O `fs-knowledge` serve para o **dev** consultar a base, não como mecanismo de retrieval do assistente.
- **Limitação observada:** a imagem Docker `mcp/filesystem` está atrás do pacote npm. Ela expõe `read_file` em vez de `read_text_file`/`read_media_file` e não publica *tool annotations* (`readOnlyHint`). Por isso o cliente não consegue distinguir sozinho as tools de leitura das de escrita, e a lista de `deny`/`ask` teve de ser explícita.

## 5. Como subir

Pré-requisitos: Docker, Node 20+ (`npx`).

```bash
docker pull mcp/filesystem && docker pull mcp/git   # uma vez
claude --mcp-config .mcp/mcp.json                   # na raiz do repo; ${PWD} precisa ser a raiz
```

Dentro do Claude Code, `/mcp` deve mostrar os 4 servers como `connected`.
