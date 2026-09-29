# Exercício 3.2 — Código reescrito

**Antes:** [feedback-handler.original.ts](feedback-handler.original.ts) (gerado pelo Copilot, simulado) · **Depois:** [`src/functions/feedback/handler.ts`](../../src/functions/feedback/handler.ts) + [`validator.ts`](../../src/functions/feedback/validator.ts) + [`src/services/feedback-store.ts`](../../src/services/feedback-store.ts) + [`src/shared/config.ts`](../../src/shared/config.ts)

**Ferramenta:** Claude Code (no papel do Copilot), seguindo o AGENTS.md do enunciado e a skill [`typescript-conventions`](../../skills/foundation/typescript-conventions.md) do cenário 2.

## Rastreabilidade: problema → correção

| Problema | Origem | Como foi resolvido | Teste |
|---|---|---|---|
| `console.log` | Minha #1 · Claude #3 | `pino` via `logger` injetado, com `invocationId` | `nunca loga o id do atendente…` |
| Feedback inteiro no log (e-mail, comentário) | Minha #2 · Claude #4, #5 | O log só leva `feedbackId`, `queryId`, `rating`, `hasComment`. Nenhum dado pessoal | `nunca loga…` + evidência abaixo: `grep` = 0 |
| `as any` sem Zod | Minha #3 · Claude #1, #2 | `FeedbackRequestSchema` com `.strict()`, `unknown` até validar, tipo `z.infer` | `responde 400 VALIDATION_ERROR para…` (5 casos) |
| `require` dinâmico | Minha #4 · Claude #6 | `import { CosmosClient } from "@azure/cosmos"` estático. No projeto (ESM), o `require` original lançaria `ReferenceError` | typecheck + build |
| `novatech`/`feedbacks` fixos | Minha #5 · Claude #18 | `COSMOS_DATABASE`/`COSMOS_FEEDBACK_CONTAINER` na config, **sem default** | `config.test.ts` |
| Sem tratamento de erro | Minha #6 · Claude #13, #14 | `400 INVALID_JSON`, `400 VALIDATION_ERROR` com o `path` de cada campo, `503 STORAGE_UNAVAILABLE` genérico (o erro real vai só para o log) | `INVALID_JSON`, `503 sem vazar detalhes` |
| Sem testes | Minha #7 | 14 testes do handler + 4 de config: válido, inválido, falha na gravação, 401, 413, log sem dados pessoais | `npm test` (49 no total) |
| Endpoint anônimo | Claude #10 | `authLevel: "function"` explícito (o default do v4 é `anonymous`, conferido no SDK) + exige o principal do Easy Auth → `401` | `registra … authLevel explícito`, `responde 401…` |
| Identidade forjável no corpo | Claude #11 | `attendantEmail` **removido do schema** (se vier, `400`). O atendente é o `x-ms-client-principal-id` do Easy Auth | `não persiste e-mail…` |
| E-mail persistido | Claude #12 | Persiste o `attendantId` (oid do Entra ID), que é um pseudônimo, e não o e-mail | `grava o feedback válido…` |
| `CosmosClient` por request | Claude #7 | Criado **uma vez**, no ponto de composição (`createCosmosFeedbackStore`) | revisão |
| Connection string com chave mestre | Claude #9 | `aadCredentials: new DefaultAzureCredential()` (Managed Identity). A config só aceita `COSMOS_ENDPOINT` como URL | `não aceita connection string…` |
| Env sem checagem | Claude #8 | `loadCosmosConfig()` com Zod no startup (fail-fast) | `config.test.ts` |
| `InvocationContext` ignorado | Claude #21 | Assinatura `(request, context)`, `invocationId` em todo log | logs abaixo |
| Nome/caminho errados | Claude #20 | `src/functions/feedback/handler.ts`, carregado pelo `main` (`dist/src/functions/*/handler.js`) | `func start` lista `feedback: [POST]` |
| `200 'OK'` texto | Claude #19 | `201 { feedbackId }` | `grava o feedback válido…` |
| Tamanho do corpo | Revisão 2.2 (B2) | `413` acima de 8 KB, antes do parse | `responde 413…` |

## Não adotado (decisão consciente)

| Item | Por quê |
|---|---|
| Claude #1: `queryId: z.string().uuid()` | Quebraria o fluxo do Teams: o `queryId` é o `x-request-id` do query endpoint, que aceita `teams-7f3a9c21`. Usado o `REQUEST_ID_PATTERN` compartilhado com a QE-01 |
| Claude #15: partition key | `infra/modules/cosmos.bicep` está vazio, então não há partition key definida para validar. O documento já tem `id` próprio e `queryId` obrigatório. Fica para quando o IaC existir |
| Claude #16: XSS / prompt injection via `comment` | Aplicado só o que cabe ao endpoint (limite de 2.000 caracteres e `trim`). O escape é responsabilidade de quem renderiza (painel) |
| Claude #17: validar se o `queryId` existe e é do atendente | Não existe store de queries no projeto. Registrado como débito |

## Efeito colateral no query endpoint (QE-01)

O mapeamento de erro do Zod foi para `src/shared/errors.ts` (`toErrorDetails`), e o padrão de id foi para `src/shared/request-id.ts`. Com isso, o **B3 da revisão do 2.2 foi corrigido no query endpoint também**: campo extra agora sai como `path: "systemPrompt"`, e não `"(body)"`. O teste ficou mais rígido (verifica o `path`, não só a mensagem) e ganhou um caso aninhado (`ticket.extra`).

## Evidência de execução

```text
$ npm test
 ✓ tests/unit/shared/config.test.ts (4 tests)
 ✓ tests/unit/functions/query/validator.test.ts (20 tests)
 ✓ tests/unit/functions/query/handler.test.ts (11 tests)
 ✓ tests/unit/functions/feedback/handler.test.ts (14 tests)
      Tests  49 passed (49)
```

Host real do Azure Functions (Core Tools 4.15.1) + `curl`:

```text
feedback: [POST] http://localhost:7072/api/feedback
query: [POST] http://localhost:7072/api/query

$ # 1) sem autenticação (sem x-ms-client-principal-id)
HTTP/1.1 401 Unauthorized
{"error":{"code":"UNAUTHENTICATED","message":"Autenticação obrigatória."}}

$ # 2) tentativa do código original: attendantEmail no corpo
HTTP/1.1 400 Bad Request
{"error":{"code":"VALIDATION_ERROR","message":"Requisição inválida.","details":[{"path":"attendantEmail","message":"Campo não permitido."}]}}

$ # 3) rating fora da escala + JSON válido
HTTP/1.1 400 Bad Request
{"error":{"code":"VALIDATION_ERROR","message":"Requisição inválida.","details":[{"path":"rating","message":"Number must be less than or equal to 5"}]}}

$ # 4) JSON malformado
HTTP/1.1 400 Bad Request
{"error":{"code":"INVALID_JSON","message":"O corpo da requisição deve ser um JSON válido."}}

$ # 5) válido — sem Cosmos real, a gravação falha
HTTP/1.1 503 Service Unavailable
{"error":{"code":"STORAGE_UNAVAILABLE","message":"Não foi possível registrar o feedback. Tente novamente."}}

# logs do host (pino) — err truncado
{"level":30,"time":1790718565945,"service":"novatech-assistant","invocationId":"239217b9-1728-487f-af87-1a63db69a3d6","fn":"feedback","status":401,"durationMs":0,"msg":"feedback request completed"}
{"level":30,"time":1790718565980,"service":"novatech-assistant","invocationId":"77dc34c1-18ba-4706-9756-069b31f69fc1","fn":"feedback","status":400,"durationMs":1,"invalidFields":["attendantEmail"],"msg":"feedback request completed"}
{"level":30,"time":1790718565991,"service":"novatech-assistant","invocationId":"4e44c1c2-2a71-4413-a7c6-3ecbbd4b3553","fn":"feedback","status":400,"durationMs":1,"invalidFields":["rating"],"msg":"feedback request completed"}
{"level":30,"time":1790718565998,"service":"novatech-assistant","invocationId":"f80bee5f-8bf3-45c2-98e2-fe282b8d9c7d","fn":"feedback","status":400,"durationMs":0,"msg":"feedback request completed"}
{"level":50,"time":1790718566025,"service":"novatech-assistant","invocationId":"0fc435e5-9a11-43d7-97b7-8cb7ee8f5da1","fn":"feedback","err":{"type":"AggregateAuthenticationError","message":"ChainedTokenCredential authentication failed. …","stack":"AggregateAuthenticationError: ChainedTokenCredential authentication failed.\nCre
{"level":30,"time":1790718566025,"service":"novatech-assistant","invocationId":"0fc435e5-9a11-43d7-97b7-8cb7ee8f5da1","fn":"feedback","status":503,"durationMs":19,"msg":"feedback request completed"}

$ grep -c "ana.souza\|7b3e1c2a\|citou a POL" func.log
0
```

- O `503` do caso 5 é **real**: sem credencial Azure local, o `DefaultAzureCredential` falha (`AggregateAuthenticationError`). Isso prova que o código não usa connection string, que o erro vai só para o log e que o cliente recebe uma mensagem genérica.
- O `201` não pôde ser exercitado no host sem um Cosmos real. Ele está coberto pelo teste `grava o feedback válido e responde 201`.
