# Tasks — Query Endpoint

> Gerado a partir de [`plan.md`](plan.md). Aprovação: Tech Lead (convenção do Anexo C).
> Estimativa: **P** ≤ 0,5 dia · **M** ≤ 1,5 dia · **G** ≤ 3 dias.
> "Pronto" para qualquer task = `npm run build` sem erro + `npm test` verde + critérios de aceite abaixo cobertos por teste automatizado.

## Decisões que as tasks herdam

| Fonte | Decisão | Onde vira critério de aceite |
|---|---|---|
| ADR-0002 | Context budget: system prompt ≤ ~4K tokens, chunks ≤ ~8K tokens (top-5 de ~1.500), histórico ≤ 3 turnos | QE-01 (histórico), QE-06 |
| ADR-0003 | Documentos obsoletos são **marcados, não excluídos**; o modelo prioriza a versão vigente | QE-05, QE-06 |
| Cenário 1: engenharia de contexto | Ordem do contexto: chamado → cliente → histórico → chunks → pergunta. A data de abertura do chamado decide entre PROC-042 v1 e v2 (transição em 01/12/2023) | QE-01 (`ticket.openedAt` obrigatório), QE-06 |
| Discovery | Atendente precisa da resposta em < 30 s | QE-03, QE-09 |
| SLA-2024 §1 | Só existem 3 tiers: Gold, Silver, Standard | QE-01 (`enum`) |
| Requisito de RAG (cenário 1) | Toda resposta cita fonte; nunca inventa | QE-08 |

## Grafo de dependências

```
QE-01 ─────────────────────────────────────────────┐
QE-02 ──┬──► QE-04 ──┐                              │
QE-03 ──┤            ├──► QE-09 (orquestração) ◄────┘
        ├──► QE-05 ──┤          ▲
        └──► QE-07 ──┘          │
QE-06 ─────────────────────────┤
QE-08 ─────────────────────────┘
```

QE-01, QE-02, QE-03, QE-06 e QE-08 não dependem de nada e podem começar em paralelo. As integrações Azure (QE-04, QE-05, QE-07) são testadas com mocks HTTP e **não exigem** recurso Azure provisionado. A dependência externa "índice populado" só bloqueia o teste manual ponta a ponta, não as tasks.

## Resumo

| ID | Descrição | Deps | Est. |
|---|---|---|---|
| QE-01 ✅ | Endpoint `POST /api/query` com validação de input (Zod) e contrato de erro | — | M |
| QE-02 | Configuração de ambiente validada no startup | — | P |
| QE-03 | Utilitário de retry com exponential backoff e timeout | — | P |
| QE-04 | Serviço de embedding da pergunta (Azure OpenAI) | QE-02, QE-03 | P |
| QE-05 | Serviço de busca top-5 no Azure AI Search com metadados de vigência | QE-02, QE-03 | M |
| QE-06 | Prompt builder com context budget e ordem de contexto | — | M |
| QE-07 | Serviço de completion GPT-4o | QE-02, QE-03 | P |
| QE-08 | Response builder com `source_document` validado | — | M |
| QE-09 | Orquestração do fluxo no handler + mapeamento de erros upstream | QE-01, QE-04–QE-08 | M |

---

## QE-01 — Endpoint `POST /api/query` com validação de input

**Arquivos:** `src/functions/query/handler.ts`, `src/functions/query/validator.ts`, `src/shared/logger.ts`, `src/shared/errors.ts`, `tests/unit/functions/query/validator.test.ts`, `tests/unit/functions/query/handler.test.ts`

**Descrição:** Registrar o HTTP trigger no modelo de programação v4 e validar o corpo da requisição com Zod antes de qualquer chamada externa. A orquestração RAG é **injetada** no handler (`answerQuery`) e, nesta task, é um stub que responde `501`. O contrato HTTP fica estável desde já, e o bot e o painel podem integrar contra ele.

**Contrato de input** (`application/json`):

| Campo | Regra |
|---|---|
| `question` | string, `trim`, 3–1000 caracteres |
| `ticket.id` | string não vazia, ≤ 64 caracteres |
| `ticket.openedAt` | datetime ISO-8601 com offset (**obrigatório**, decide a versão da PROC-042) |
| `ticket.channel` | `"teams"` \| `"portal"` \| `"telefone"` |
| `customer` | opcional; `tier`: `"gold"` \| `"silver"` \| `"standard"`, `contractId` opcional |
| `history` | opcional, **no máximo 3** itens `{ question, answer }` (ADR-0002) |
| campos desconhecidos | **rejeitados** (`strict`); impede injetar, por exemplo, `systemPrompt` pelo corpo |

**Critérios de aceite:**
- [x] Função registrada como `POST` na rota `query` (servida em `/api/query`) com `authLevel: "function"`.
- [x] Corpo válido → `answerQuery` recebe o objeto **já parseado e normalizado** (pergunta com `trim`) e o handler repassa o status e o corpo que ela devolver.
- [x] Corpo que não é JSON → `400` com `error.code = "INVALID_JSON"`.
- [x] Corpo que viola o schema → `400` com `error.code = "VALIDATION_ERROR"` e `error.details[]` contendo `path` e `message` de **cada** campo inválido. `answerQuery` não é chamada.
- [x] Cada caso da tabela acima tem teste: pergunta vazia ou só espaços, 1001 caracteres, `openedAt` sem offset, tier `"platinum"`, 4 turnos de histórico, campo extra.
- [x] Toda resposta traz o header `x-request-id` (reaproveita o recebido ou gera um UUID).
- [x] Log estruturado (pino) com `requestId`, `status` e `durationMs`. **O texto da pergunta não é logado**, só o tamanho (`questionLength`), porque pode conter dados do cliente.
- [x] Erro inesperado em `answerQuery` → `500` com `error.code = "INTERNAL_ERROR"`, sem stack trace no corpo, e stack no log.
- [x] Stub de produção responde `501` com `error.code = "NOT_IMPLEMENTED"` até a QE-09.

**Deps:** — · **Est.:** M · **Status:** ✅ concluída (ver `evidencias/exercicio-2-2/`)

---

## QE-02 — Configuração de ambiente validada no startup

**Arquivos:** `src/shared/config.ts`, `tests/unit/shared/config.test.ts`

**Descrição:** Ler e validar com Zod as variáveis de ambiente: endpoint e deployments do Azure OpenAI (chat e embedding), endpoint e nome do índice do Azure AI Search, `SEARCH_TOP_K` (padrão 5), `REQUEST_TIMEOUT_MS` (padrão 25000) e `LOG_LEVEL`.

**Critérios de aceite:**
- [ ] `loadConfig(env)` é uma função pura: recebe o `env` como parâmetro, então o teste não depende de `process.env`.
- [ ] Variável obrigatória ausente → erro que lista **todas** as variáveis faltantes numa única mensagem.
- [ ] Os valores de segredos (chaves) nunca aparecem na mensagem de erro nem em log. Teste: a mensagem de erro não contém o valor passado.
- [ ] `SEARCH_TOP_K` fora de 1–7 é rejeitado (teto de 7 chunks definido no cenário 1).
- [ ] A autenticação prefere Managed Identity (`DefaultAzureCredential`). Chave por variável de ambiente só é aceita quando `NODE_ENV=development`.

**Deps:** — · **Est.:** P

---

## QE-03 — Retry com exponential backoff e timeout

**Arquivos:** `src/shared/retry.ts`, `tests/unit/shared/retry.test.ts`

**Descrição:** Criar o wrapper `withRetry(fn, opts)`, usado por todas as chamadas Azure.

**Critérios de aceite:**
- [ ] Faz retry apenas em `429`, `5xx` e erros de rede ou timeout. `4xx` (exceto 429) falha na primeira tentativa.
- [ ] No máximo 3 tentativas. O atraso segue `base × 2^n` com *jitter*, e o teste usa fake timers.
- [ ] Respeita o header `Retry-After` quando presente.
- [ ] Respeita o prazo total recebido (`deadline`) e não inicia uma tentativa que estouraria o limite de 30 s do discovery.
- [ ] Cada retry gera log `warn` com `attempt`, `delayMs` e `reason`.

**Deps:** — · **Est.:** P

---

## QE-04 — Serviço de embedding

**Arquivos:** `src/services/embedding.ts`, `tests/unit/services/embedding.test.ts`

**Critérios de aceite:**
- [ ] `embed(question)` retorna `number[]` com a dimensão configurada. Se vier outra dimensão, lança `UpstreamError("embedding")`.
- [ ] Usa `withRetry`. O teste com mock HTTP (msw) cobre sucesso, 429 seguido de sucesso e 3 falhas seguidas de erro.

**Deps:** QE-02, QE-03 · **Est.:** P

---

## QE-05 — Busca top-5 no Azure AI Search

**Arquivos:** `src/services/search.ts`, `tests/unit/services/search.test.ts`, `tests/fixtures/chunks.ts`

**Critérios de aceite:**
- [ ] Faz uma consulta vetorial com `k = SEARCH_TOP_K` e mapeia o resultado para `Chunk { chunkId, documentId, section, version, validFrom, status, score, content }`.
- [ ] **Não filtra** documentos obsoletos (ADR-0003: marcados, não excluídos). O `status` (`vigente` / `obsoleto`) chega ao prompt builder.
- [ ] Zero resultados → retorna `[]` sem lançar erro.
- [ ] As fixtures usam chunks reais do Anexo B (ex.: PROC-042v2-B e PROC-042-B para a pergunta do multiplicador do Sudeste).

**Deps:** QE-02, QE-03 · **Est.:** M

---

## QE-06 — Prompt builder com context budget

**Arquivos:** `src/services/prompt-builder.ts`, `tests/unit/services/prompt-builder.test.ts`

**Critérios de aceite:**
- [ ] Monta as mensagens na ordem do cenário 1: `system` = conteúdo de `prompts/system-prompt.md`; `user` = `[CONTEXTO DO CHAMADO]` → `[CONTEXTO DO CLIENTE]` → `[HISTÓRICO]` → `[DOCUMENTAÇÃO RECUPERADA]` → `[PERGUNTA]`. O teste verifica a ordem dos delimitadores.
- [ ] A contagem de tokens usa o tokenizer do GPT-4o (`o200k_base`), e não `length / 4`.
- [ ] System prompt acima de 4.000 tokens → erro de configuração. O system prompt **nunca** é truncado.
- [ ] Chunks acima de 8.000 tokens → remove os de **menor score** até caber. Não corta um chunk no meio. O teste usa 5 chunks de 2.000 tokens e espera que 4 sobrem.
- [ ] Cada chunk sai com metadados `documentId`, `section`, `version`, `validFrom` e `status`. Chunks `obsoleto` são rotulados como tal.
- [ ] Nenhuma entrada do usuário é interpolada no `system`.

**Deps:** — · **Est.:** M

---

## QE-07 — Completion GPT-4o

**Arquivos:** `src/services/completion.ts`, `tests/unit/services/completion.test.ts`

**Critérios de aceite:**
- [ ] Chama o deployment de chat configurado com `temperature: 0` e `max_tokens` configurável (padrão 1.000).
- [ ] Solicita saída em JSON (`response_format`), validada com Zod: `{ answer, sources: string[] }`. JSON inválido → `UpstreamError("completion")`.
- [ ] Usa `withRetry` e respeita o `deadline` da requisição.

**Deps:** QE-02, QE-03 · **Est.:** P

---

## QE-08 — Response builder com `source_document` validado

**Arquivos:** `src/functions/query/response-builder.ts`, `tests/unit/functions/query/response-builder.test.ts`

**Critérios de aceite:**
- [ ] Monta a resposta `{ answer, source_documents: [{ documentId, section, version }], requestId }`, validada por schema Zod de output.
- [ ] Toda fonte citada pelo modelo precisa estar entre os chunks enviados no prompt. Uma fonte desconhecida é removida e registrada em log `warn` (indício de alucinação).
- [ ] Se a resposta ficar sem **nenhuma** fonte válida → retorna a mensagem padrão de "não encontrei essa informação na base" e `source_documents: []`, nunca uma resposta sem fonte.
- [ ] Se a busca retornou 0 chunks, o builder devolve a mensagem padrão **sem chamar o modelo**. O caso de teste é o Anexo B: "Frete para 300 kg para Salvador?".

**Deps:** — · **Est.:** M

---

## QE-09 — Orquestração e erros upstream

**Arquivos:** `src/functions/query/answer-query.ts`, `src/functions/query/handler.ts` (substituir o stub), `tests/integration/query/query-endpoint.test.ts`

**Critérios de aceite:**
- [ ] O fluxo `embed → search → buildPrompt → complete → buildResponse` é executado com todas as dependências injetadas.
- [ ] O teste de integração (msw simulando Azure OpenAI e AI Search) cobre a pergunta "Qual o multiplicador para o Sudeste?", com resposta `200` citando `PROC-042-v2`.
- [ ] Falha upstream após retries → `503` com `error.code = "UPSTREAM_UNAVAILABLE"`. Prazo estourado → `504` com `error.code = "TIMEOUT"`.
- [ ] O log final por requisição inclui `chunksRetrieved`, `chunksInPrompt`, `promptTokens`, `completionTokens` e `durationMs`.
- [ ] O stub `501` da QE-01 foi removido.

**Deps:** QE-01, QE-04, QE-05, QE-06, QE-07, QE-08 · **Est.:** M
