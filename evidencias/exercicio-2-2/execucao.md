# Exercício 2.2 — Evidência de execução da QE-01

## 1. Testes automatizados

```text
$ npm test
 ✓ tests/unit/functions/query/validator.test.ts (19 tests)
 ✓ tests/unit/functions/query/handler.test.ts (11 tests)
      Tests  30 passed (30)

$ npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
(sem erros)
```

## 2. Endpoint rodando no host real do Azure Functions (Core Tools 4.15.1, local)

```bash
npm run build
func start --port 7071      # local.settings.json: FUNCTIONS_WORKER_RUNTIME=node (fora do git)
```

```text
[2026-09-29T21:20:52.104Z] Worker process started and initialized.
query: [POST] http://localhost:7071/api/query

$ curl -X POST /api/query # 1) requisição válida
HTTP/1.1 501 Not Implemented
x-request-id: demo-qe01-0001
{"error":{"code":"NOT_IMPLEMENTED","message":"O fluxo de resposta ainda não foi implementado."}}

$ curl -X POST /api/query # 2) JSON malformado
HTTP/1.1 400 Bad Request
x-request-id: demo-qe01-0001
{"error":{"code":"INVALID_JSON","message":"O corpo da requisição deve ser um JSON válido."}}

$ curl -X POST /api/query # 3) tier inexistente + histórico > 3 + campo extra
HTTP/1.1 400 Bad Request
x-request-id: demo-qe01-0001
{"error":{"code":"VALIDATION_ERROR","message":"Requisição inválida.","details":[{"path":"customer.tier","message":"Invalid enum value. Expected 'gold' | 'silver' | 'standard', received 'platinum'"},{"path":"history","message":"Array must contain at most 3 element(s)"},{"path":"(body)","message":"Unrecognized key(s) in object: 'systemPrompt'"}]}}

$ curl -X POST /api/query # 4) sem ticket.openedAt com offset
HTTP/1.1 400 Bad Request
x-request-id: demo-qe01-0001
{"error":{"code":"VALIDATION_ERROR","message":"Requisição inválida.","details":[{"path":"ticket.openedAt","message":"Invalid datetime"}]}}

$ curl -X GET /api/query
HTTP/1.1 404 Not Found
# logs do host (pino)
{"level":30,"time":1790716862258,"service":"novatech-assistant","requestId":"demo-qe01-0001","invocationId":"d82695b1-3850-48c3-83c8-914ba5ef2efb","fn":"query","status":501,"durationMs":2,"questionLength":36,"msg":"query request completed"}
{"level":30,"time":1790716862292,"service":"novatech-assistant","requestId":"demo-qe01-0001","invocationId":"a1340c4b-6f2d-4e06-9725-5fe6faa1196e","fn":"query","status":400,"durationMs":0,"msg":"query request completed"}
{"level":30,"time":1790716862305,"service":"novatech-assistant","requestId":"demo-qe01-0001","invocationId":"2fa35dda-9971-45ab-9024-90a57056f93d","fn":"query","status":400,"durationMs":1,"invalidFields":["customer.tier","history","(body)"],"msg":"query request completed"}
{"level":30,"time":1790716862313,"service":"novatech-assistant","requestId":"demo-qe01-0001","invocationId":"fc1563c7-4e5f-49b6-9594-000e7e58a114","fn":"query","status":400,"durationMs":0,"invalidFields":["ticket.openedAt"],"msg":"query request completed"}
```

Observações:
- Localmente, o host não exige a *function key*, então o `authLevel: "function"` só vale no Azure. O teste unitário verifica que a opção está registrada.
- Chamada 3: o campo extra `systemPrompt` saiu com `path: "(body)"`. Isso é um defeito real, tratado no item R3 de [revisao-critica.md](revisao-critica.md).
