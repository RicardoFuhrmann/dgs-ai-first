# Exercício 2.2 — Revisão crítica do código gerado (QE-01)

**Ferramenta usada:** o código foi gerado com **Claude Code** (agente no terminal), e não com o GitHub Copilot indicado no enunciado. O agente trabalhou a partir de [`tasks.md`](../../specs/query-endpoint/tasks.md) (QE-01) e do `plan.md`. Ele executou os testes e o host local do Azure Functions ([execucao.md](execucao.md)).

A revisão separa **(A)** o que já foi encontrado e corrigido durante a implementação e **(B)** o que ainda precisa de ajuste antes de um code review real. Os itens de (B) foram confirmados executando o código, e não por suposição.

## A. Encontrado e corrigido durante a implementação

| # | Problema | Como apareceu | Correção |
|---|---|---|---|
| A1 | **`zod` estava em `devDependencies`** no `package.json` do starter | Leitura do `package.json`. Num deploy com `npm ci --omit=dev`, o validador quebraria em runtime com `Cannot find module 'zod'` | Movido para `dependencies` |
| A2 | **`tsconfig` com `moduleResolution: "Bundler"`** num projeto `"type": "module"` que roda direto no Node, sem bundler | Com `Bundler`, o TypeScript aceita `import "./validator"` sem extensão, mas o Node ESM não resolve esse import em runtime, e a Function não carregaria no Azure | Trocado para `NodeNext`. Imports com `.js` e `import()` do `dist/` validado no Node. Também foi incluído `noUncheckedIndexedAccess` e `src/web` (pacote React separado) foi excluído do build |
| A3 | Faltava `@types/node` e `host.json`, e o `package.json` não tinha `main` | O `tsc` falhou (`Cannot find name 'process'`), e o `func start` não encontraria as functions | Adicionados. O `main` aponta para `dist/src/functions/*/handler.js` |
| A4 | **Teste impossível gerado pelo próprio agente**: simular um `x-request-id` com `\n` para testar log injection | O teste falhou porque o `HttpRequest` do `@azure/functions` rejeita um header com quebra de linha. Esse caso nunca chega ao handler. O teste validava algo que não existe | Substituído por casos que chegam de verdade: id com 200 caracteres e id com espaço ou `<script>`. **Lição:** teste gerado por agente também precisa de revisão, porque pode "testar" um cenário irreal só para parecer completo |

## B. Ajustes necessários antes do code review

### B1. Logs do pino ficam fora da correlação do Application Insights (prioridade: alta)

```ts
// src/shared/logger.ts
export const logger = createLogger();   // pino → stdout
```

No Azure Functions, a correlação automática com a invocação (`operation_Id`, a telemetria da request) acontece nos logs emitidos por `context.log`. O pino escreve direto no stdout. Os logs aparecem (vimos no `func start`), mas **sem vínculo com a request no Application Insights**. Numa investigação de "o assistente respondeu errado para o chamado X", o time não conseguiria ir da request ao log.

- **Mitigação parcial já feita:** todo log carrega `invocationId` e `requestId`.
- **Ajuste proposto:** um `destination` do pino que encaminhe para `context.log`/`context.error` por invocação (o `createLogger(destination)` já aceita isso), ou instrumentação OpenTelemetry com o exporter do Azure Monitor. A decisão é do Tech Lead e vale para todos os endpoints, então deve entrar na skill Foundation de logging.

### B2. O corpo inteiro é lido e parseado antes de qualquer limite de tamanho (prioridade: alta)

```ts
// src/functions/query/handler.ts
body = await request.json();                 // lê e parseia tudo
const validation = validateQueryRequest(body); // só aqui o limite de 1000 caracteres vale
```

O Zod limita a pergunta a 1.000 caracteres e o histórico a 3 turnos, mas isso só acontece **depois** de `request.json()` ter lido e parseado o corpo inteiro. O host do Functions aceita corpos grandes por padrão, algo na casa de dezenas de MB. Um cliente com bug, ou mal-intencionado, pode enviar 50 MB de JSON, e cada chamada consome CPU e memória do worker antes de ser rejeitada. O `Content-Type` também não é verificado: um `text/plain` com JSON válido é aceito.

**Ajuste proposto:** antes do parse, rejeitar `content-length` acima de **64 KB** com `413 PAYLOAD_TOO_LARGE` e rejeitar `Content-Type` diferente de `application/json` com `415`. Os dois viram critérios de aceite na QE-01.

> **Como chegamos em 64 KB:** a primeira estimativa foi 16 KB (16 mil caracteres = 1.000 da pergunta + 3 × 5.000 do histórico). Medindo a maior requisição **válida** pelo schema, com texto em português acentuado (`ç` ocupa 2 bytes em UTF-8), o corpo tem **32.365 bytes**. Um limite de 16 KB rejeitaria requisições legítimas. 64 KB é o dobro do máximo válido e ainda fica três ordens de grandeza abaixo do que o host aceita hoje. O limite deve ficar como constante derivada do schema, com um teste que gere o maior corpo válido e verifique que ele passa.

### B3. Campo desconhecido é reportado como `path: "(body)"` (prioridade: média)

Confirmado na chamada real ([execucao.md](execucao.md), chamada 3):

```json
{"path":"(body)","message":"Unrecognized key(s) in object: 'systemPrompt'"}
```

O issue `unrecognized_keys` do Zod tem `path` vazio e traz o nome em `issue.keys`. O mapeamento em `validator.ts` só usa `issue.path`, então o consumidor (bot do Teams, painel) não sabe **qual** campo remover sem interpretar a mensagem em inglês. Para `ticket.extra` o problema é o mesmo: sai `path: "ticket"`.

**Ajuste proposto:**
```ts
if (issue.code === "unrecognized_keys") {
  return issue.keys.map((key) => ({ path: [...issue.path, key].join("."), message: "Campo não permitido." }));
}
```
Também foi uma falha da suíte de testes: o teste de campo extra só verificava `message.toContain("systemPrompt")` e deixou o `path` errado passar. O teste deve verificar `path === "systemPrompt"`.

### B4. `authLevel: "function"` depende de um segredo compartilhado (prioridade: média, decisão de arquitetura)

A function key protege o endpoint, mas vira uma **chave estática** na configuração do bot do Teams e do painel. Não identifica quem chamou, precisa de rotação manual e, se vazar, dá acesso ao endpoint que consulta toda a base da NovaTech. Localmente o host nem exige a chave, então o teste só verifica que a opção está registrada.

**Ajuste proposto:** registrar em ADR a troca para autenticação Entra ID (App Service Authentication), com o bot e o painel usando Managed Identity. O `authLevel` pode continuar `function` como camada extra. Enquanto a ADR não sai, a chave deve ficar em Key Vault e ser referenciada pela app setting, nunca em `local.settings.json` versionado (o arquivo já está no `.gitignore`).

### B5. Contrato de saída sem tipo (prioridade: baixa, já coberta pela QE-08)

```ts
export interface AnswerQueryResult { status: number; body: unknown; }
```

O handler repassa qualquer `body`. O plan pede Zod também para o **output**, mas nesta task nada impede a QE-09 de devolver uma resposta sem `source_documents`. **Ajuste proposto:** tipar `body` como `QueryResponse | ErrorBody` assim que o schema de saída da QE-08 existir. Não faz sentido fazer isso agora, porque criaria o schema de saída sem os critérios da QE-08.

## Resumo

| Item | Tipo | Bloqueia merge? |
|---|---|---|
| A1–A4 | Corrigidos | — |
| B1 logs sem correlação | Observabilidade | Sim, é decisão transversal a todos os endpoints |
| B2 corpo sem limite | Segurança/robustez | Sim |
| B3 `path` do campo extra | Contrato da API | Sim, o bot depende dele |
| B4 function key | Arquitetura/segurança | Não, vai para ADR |
| B5 output sem tipo | Contrato | Não, a QE-08 cobre |
