---
name: typescript-conventions
description: Use ao escrever, alterar ou revisar qualquer arquivo .ts/.tsx do NovaTech Assistant (src/ ou tests/) — imports ESM, tipos, validação de dados externos com Zod, constantes de domínio e dependências do package.json.
owner: Tech Lead
---

# typescript-conventions

> Skill **Foundation**. Todas as skills que geram código (`azure-functions-endpoint`, `azure-ai-search-integration`, `testing-patterns`, `react-components` e as receitas de `artifact/`) partem desta. Elas **referenciam** as regras daqui e não podem contradizê-las.

## Contexto

**Stack (fonte: `package.json` e `tsconfig.json`):**

| Item | Valor | Consequência para quem gera código |
|---|---|---|
| Runtime | Node.js, `"type": "module"`, **sem bundler** | O que o `tsc` emite em `dist/` é exatamente o que o Node executa |
| TypeScript | `^5.5`, `module`/`moduleResolution: "NodeNext"` | Import relativo sem `.js` não compila |
| Rigor | `strict: true` + `noUncheckedIndexedAccess: true` | `arr[0]` e `record[key]` são `T \| undefined` |
| Validação | `zod` `^3.25` (API v3), em `dependencies` | Todo dado externo passa por um schema |
| Functions | `@azure/functions` `^4` (modelo v4, `app.http`) | Detalhes na skill `azure-functions-endpoint` |
| Log | `pino` | Regras na skill `logging` |
| Testes | `vitest` `^2` | Regras na skill `testing-patterns` |
| Build | `npm run build` (`tsc -p .`), saída em `dist/src/...` | `main` aponta para `dist/src/functions/*/handler.js` |

**Por que esta skill existe.** No exercício 2.2 (QE-01), o Claude Code gerou o endpoint de query e a revisão crítica ([`evidencias/exercicio-2-2/revisao-critica.md`](../../evidencias/exercicio-2-2/revisao-critica.md)) encontrou erros que **não aparecem nos testes unitários** e só quebram no deploy ou no consumidor:

- `zod` em `devDependencies` (A1): com `npm ci --omit=dev`, a Function cai com `Cannot find module 'zod'`.
- `moduleResolution: "Bundler"` (A2): o TypeScript aceitou `import "./validator"`, mas o Node ESM não resolve esse import e a Function não carrega no Azure.
- Faltava `@types/node` (A3): `Cannot find name 'process'`.
- O `ZodIssue` foi mapeado sem distinguir o `issue.code` (B3): campo desconhecido sai como `path: "(body)"`.
- O contrato de saída ficou como `body: unknown` (B5): nada impede uma resposta sem `source_documents`.

Esta skill transforma esses erros em regras verificáveis. O código de referência é o que já passou na revisão: `src/functions/query/validator.ts`, `src/functions/query/handler.ts`, `src/shared/errors.ts` e `tests/unit/functions/query/`.

## Regras

Cada regra tem um **como verificar**. Uma regra sem verificação não é regra, é sugestão.

### Módulos e imports

**TS-01 — MUST** escrever todo import relativo com a extensão **`.js`**, mesmo que o arquivo seja `.ts`.
Verificar: `npm run typecheck` (com `NodeNext`, o import sem extensão falha com `TS2835`).

**TS-02 — MUST** importar os módulos nativos do Node com o prefixo `node:` (`node:crypto`, `node:stream`).
Verificar: `grep -rnE "from \"(crypto|stream|fs|path|url|util)\"" src tests` não retorna nada.

**TS-03 — MUST** marcar imports usados só como tipo com `type`, seja no import inteiro (`import type { X }`) ou por item (`import { app, type HttpRequest }`).
Verificar: revisão. Nenhum import de valor pode ser usado só em posição de tipo.

**TS-04 — MUST NOT** usar CommonJS: `require`, `module.exports`, `__dirname` ou `__filename`.
Verificar: `grep -rnE "require\(|module\.exports|__dirname|__filename" src tests` não retorna nada.

**TS-05 — MUST** usar apenas named exports. **MUST NOT** usar `export default`.
Verificar: `grep -rn "export default" src tests` não retorna nada. Exceção: arquivos de configuração de ferramenta que exigem default (`vitest.config.ts`).

**TS-06 — MUST NOT** alterar `module`, `moduleResolution`, `strict`, `noUncheckedIndexedAccess` ou `target` no `tsconfig.json` para "fazer compilar". Uma mudança nessas opções exige ADR.
Verificar: diff do `tsconfig.json` no PR.

### Tipos

**TS-07 — MUST NOT** usar `any` (explícito, `as any` ou `catch (err: any)`). Dado de origem desconhecida é `unknown` e só é usado depois de validado (TS-11).
Verificar: `grep -rnE ":\s*any\b|as any|<any>" src tests` não retorna nada.

**TS-08 — MUST NOT** usar `unknown` como tipo de **saída** de um contrato. `unknown` só é aceito na fronteira de entrada, antes da validação. Quando o schema de saída existir, o tipo é a união dos tipos concretos (ex.: `QueryResponse | ErrorBody`).
Verificar: revisão dos tipos exportados. `AnswerQueryResult.body: unknown` é uma dívida conhecida, registrada para a QE-08 (revisão crítica, B5). Não é um exemplo a copiar.

**TS-09 — MUST NOT** usar o operador non-null `!` nem `as` para silenciar o compilador em `src/`. Resolva o `T | undefined` do `noUncheckedIndexedAccess` com checagem explícita, `?.` ou `??`. Nos testes, `!` é aceito **depois** de uma asserção que garanta o valor (ex.: `expect(list).toHaveLength(1)` seguido de `list[0]!`).
Verificar: `grep -rnE "\w!(\.|\[|\))" src` e revisão de todo `as` em `src/` (`as const` é permitido).

**TS-10 — MUST** representar conjuntos fechados como união de literais (`type ErrorCode = "INVALID_JSON" | ...`) ou como `z.enum([...])`. **MUST NOT** usar a palavra-chave `enum` do TypeScript.
Verificar: `grep -rnE "^\s*(export )?(const )?enum " src tests` não retorna nada.

**TS-11 — MUST** usar uniões discriminadas para resultados que podem falhar, com o discriminante `success` (o mesmo padrão do `safeParse`): `{ success: true; data: T } | { success: false; details: ErrorDetail[] }`. Quem consome faz o narrowing pelo discriminante, sem cast.
Verificar: revisão. Nenhuma função que valida **entrada de requisição** retorna `T | null` ou lança para sinalizar entrada inválida.
Exceção: `loadConfig` (TS-22) **deve** lançar. Config inválida precisa derrubar a Function no startup (fail-fast), e não virar um resultado a ser tratado.

**TS-12 — MUST** declarar o tipo de retorno de toda função exportada de `src/shared/` e de todo validador. Factories (`createXHandler`) podem inferir o retorno quando a função interna já está anotada.
Verificar: revisão.

### Dados externos e Zod

**TS-13 — MUST** validar com Zod **todo dado que entra no processo** antes de usá-lo: corpo HTTP, variáveis de ambiente, resposta do Azure AI Search/Azure OpenAI e saída do modelo. **MUST NOT** fazer `JSON.parse(x) as T` ou `(await request.json()) as T`.
Verificar: `grep -rnE "json\(\)\) as|JSON\.parse\(.*\) as" src` não retorna nada.

**TS-14 — MUST** derivar o tipo do schema com `z.infer<typeof XSchema>`. **MUST NOT** escrever uma `interface` à mão que duplique um schema.
Verificar: para cada `XSchema` exportado existe `export type X = z.infer<typeof XSchema>` e nenhuma `interface X`.

**TS-15 — MUST** usar `.strict()` em todo `z.object` que valida entrada de cliente (corpo HTTP e objetos aninhados). Campo desconhecido é rejeitado, não ignorado em silêncio.
Verificar: `grep -n "z.object" src/functions/*/validator.ts` e checar que cada ocorrência termina em `.strict()`.

**TS-16 — MUST** usar a API do **Zod 3** importando de `"zod"`. **MUST NOT** importar de `"zod/v4"` nem usar APIs exclusivas do Zod 4 (`z.iso.datetime()`, `z.email()` no nível raiz, parâmetro `{ error: ... }`). Para objeto estrito, use `z.object({...}).strict()`, que é o padrão do projeto (`z.strictObject()` também existe no Zod 3, mas não é usado aqui).
Verificar: `grep -rn "zod/v4\|z\.iso\.\|z\.email(" src tests` não retorna nada.

**TS-17 — MUST** fazer o narrowing do `ZodIssue` pelo `issue.code` quando o issue tiver campos próprios. Em `unrecognized_keys`, o nome do campo está em `issue.keys`, não em `issue.path`. O formato do `ErrorDetail` produzido é definido em `error-handling`.
Verificar: teste do validador que envia um campo extra deve verificar `path === "<nome do campo>"`, e não só `message.toContain(...)` (revisão crítica, B3).

### Constantes e valores de domínio

**TS-18 — MUST** declarar limites numéricos e de domínio como constantes nomeadas e exportadas em `UPPER_SNAKE_CASE`, com um comentário que cita a origem (ADR, SLA, procedimento). O schema e os testes usam a constante, não o número literal.
Verificar: revisão. Nenhum `.max(3)` ou `.max(1000)` solto quando a constante existe (`MAX_HISTORY_TURNS`, `MAX_QUESTION_LENGTH`).

**TS-19 — MUST** tirar os valores de `z.enum` de domínio (tier, canal, status) do glossário. **MUST NOT** inventar valores ("platinum", "premium", "whatsapp"). A lista válida está na skill `novatech-glossary`.
Verificar: todo `z.enum` de domínio tem um comentário apontando a fonte (ex.: `// SLA-2024 §1`).

### Dependências e ambiente

**TS-20 — MUST** declarar em `dependencies` todo pacote importado por arquivo de `src/`. `devDependencies` é só para build, teste e tipos (`typescript`, `vitest`, `@types/*`).
Verificar (no CI ou numa cópia temporária, **nunca** no checkout de trabalho, porque `--omit=dev` remove `typescript` e `vitest` do `node_modules`):
```bash
npm run build && tmp=$(mktemp -d) && cp -r package.json package-lock.json dist "$tmp" \
  && (cd "$tmp" && npm ci --omit=dev --silent && node -e "import('./dist/src/functions/query/handler.js')")
```
Carrega sem `ERR_MODULE_NOT_FOUND`.

**TS-21 — MUST NOT** adicionar dependência quando o Node ou uma dependência já instalada resolve. Ex.: `randomUUID` de `node:crypto` em vez do pacote `uuid`. Toda dependência nova é justificada na descrição do PR.
Verificar: diff do `package.json` no PR.

**TS-22 — MUST** ler `process.env` apenas em `src/shared/config.ts`, por meio de `loadConfig(env)`, uma função pura que recebe o `env` como parâmetro e o valida com Zod (QE-02). O resto do código recebe a config já tipada.
Verificar: `grep -rn "process.env" src` retorna apenas `src/shared/config.ts`. Exceção temporária: `src/shared/logger.ts` lê `LOG_LEVEL` e deve migrar quando a QE-02 for concluída.

### Estilo

**TS-23 — MUST** receber dependências externas (serviços, logger, config) por parâmetro, com uma interface `XDeps`, e não por import de singleton dentro da lógica. Singletons (`logger`, `app.http`) só aparecem no ponto de composição, no fim do arquivo do handler.
Verificar: a lógica é testável sem `vi.mock` do módulo da dependência. `vi.mock` só é aceito para `@azure/functions` (registro no import).

**TS-24 — MUST** seguir estas convenções de nome: variáveis e funções em `camelCase`; tipos, interfaces e schemas em `PascalCase`, com o sufixo `Schema` no schema (`QueryRequestSchema` → `QueryRequest`); constantes em `UPPER_SNAKE_CASE`. Identificadores em **inglês**. Mensagens ao usuário e comentários em **pt-BR**.
Verificar: revisão.

**TS-25 — MUST** usar comentários para explicar o **porquê**, citando a regra de negócio ou a ADR. **MUST NOT** narrar o que o código faz.
Verificar: revisão. `// ADR-0002: histórico limitado a 3 turnos.` é bom. `// valida o body` não acrescenta nada.

**TS-26 — MUST NOT** usar `// @ts-ignore` ou `// @ts-nocheck`. `// @ts-expect-error` só é aceito em teste, com o motivo na mesma linha.
Verificar: `grep -rn "@ts-ignore\|@ts-nocheck" src tests` não retorna nada.

**Gate mínimo antes de abrir PR:** `npm run typecheck && npm test` sem erro.

## Exemplos DO / DON'T

### Imports (TS-01 a TS-05)

```ts
// DO — src/functions/query/handler.ts
import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { errorBody } from "../../shared/errors.js";
import { logger as defaultLogger, type Logger } from "../../shared/logger.js";
import { validateQueryRequest, type QueryRequest } from "./validator.js";
```

```ts
// DON'T
import { v4 as uuid } from "uuid";                    // TS-21: node:crypto já resolve
import { HttpRequest, InvocationContext } from "@azure/functions"; // TS-03: só usados como tipo
import { errorBody } from "../../shared/errors";      // TS-01: sem .js, quebra no Node ESM
import validator from "./validator";                  // TS-05 + TS-01
```

### Schema, tipo derivado e constante com origem (TS-14, TS-15, TS-18, TS-19)

```ts
// DO — src/functions/query/validator.ts
import { z } from "zod";

// ADR-0002: histórico limitado a 3 turnos.
export const MAX_HISTORY_TURNS = 3;
export const MAX_QUESTION_LENGTH = 1000;

export const QueryRequestSchema = z
  .object({
    question: z.string().trim().min(3).max(MAX_QUESTION_LENGTH),
    customer: z
      .object({
        // SLA-2024 §1: não existem outros tiers além destes três.
        tier: z.enum(["gold", "silver", "standard"]),
      })
      .strict()
      .optional(),
    history: z.array(HistoryTurnSchema).max(MAX_HISTORY_TURNS).default([]),
  })
  .strict();

export type QueryRequest = z.infer<typeof QueryRequestSchema>;
```

```ts
// DON'T
export interface QueryRequest {          // TS-14: duplica o schema e diverge dele no primeiro PR
  question: string;
  customer?: { tier: "gold" | "silver" | "standard" | "platinum" }; // TS-19: "platinum" não existe
  history: HistoryTurn[];
}

export const QueryRequestSchema = z.object({   // TS-15: sem .strict(), "systemPrompt" passa calado
  question: z.string().max(1000),              // TS-18: número mágico, sem origem
  history: z.array(HistoryTurnSchema).max(3),
});
```

### Resultado como união discriminada (TS-11, TS-12)

```ts
// DO — src/functions/query/validator.ts
export type ValidationResult =
  | { success: true; data: QueryRequest }
  | { success: false; details: ErrorDetail[] };

export function validateQueryRequest(body: unknown): ValidationResult {
  const result = QueryRequestSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, details: result.error.issues.flatMap(toErrorDetails) };
}
```

```ts
// DON'T
export function validateQueryRequest(body: any): QueryRequest | null {  // TS-07 + TS-11: perde o motivo da falha
  try {
    return QueryRequestSchema.parse(body);
  } catch {
    return null;
  }
}
```

### Narrowing do `ZodIssue` (TS-17): correção do item B3

```ts
// DO
import type { ZodIssue } from "zod";

function toErrorDetails(issue: ZodIssue): ErrorDetail[] {
  if (issue.code === "unrecognized_keys") {
    // O nome do campo vem em issue.keys; issue.path aponta para o objeto pai.
    return issue.keys.map((key) => ({ path: [...issue.path, key].join("."), message: "Campo não permitido." }));
  }
  return [{ path: issue.path.join(".") || "(body)", message: issue.message }];
}
```

```ts
// DON'T — código gerado na QE-01: { "path": "(body)", "message": "Unrecognized key(s) in object: 'systemPrompt'" }
details: result.error.issues.map((issue) => ({
  path: issue.path.join(".") || "(body)",
  message: issue.message,
})),
```

### Dado externo (TS-13, TS-07)

```ts
// DO — src/functions/query/handler.ts
let body: unknown;
try {
  body = await request.json();
} catch {
  return respond(400, errorBody("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."));
}
const validation = validateQueryRequest(body);
if (!validation.success) { /* ... */ }
const query = validation.data; // QueryRequest, sem cast
```

```ts
// DON'T
const query = (await request.json()) as QueryRequest;   // TS-13: o cast não valida nada
const tier = query.customer!.tier;                      // TS-09: customer é opcional
```

### Acesso indexado com `noUncheckedIndexedAccess` (TS-09)

```ts
// DO — src/
const first = chunks[0];
if (!first) return emptyResult;

// DO — teste, depois de uma asserção que garante o valor
expect(httpRegistrations).toHaveLength(1);
const [name, options] = httpRegistrations[0]!;
```

```ts
// DON'T — src/
const first = chunks[0]!;               // em runtime, com zero chunks, vira TypeError
const score = (result as any).score;    // TS-07
```

### Configuração (TS-22, TS-23)

```ts
// DO — src/shared/config.ts (QE-02)
export const ConfigSchema = z.object({
  SEARCH_TOP_K: z.coerce.number().int().positive().default(5),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  // ...
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  return ConfigSchema.parse(env); // falha no startup, não na primeira request
}
```

```ts
// DON'T — em src/services/search.ts
const topK = parseInt(process.env.SEARCH_TOP_K!);   // TS-22 + TS-09: NaN silencioso se faltar
```

## Anti-padrões

O que um agente (Copilot ou Claude Code) gera **sem esta skill**. Os itens marcados com ★ aconteceram de fato no exercício 2.2.

| Anti-padrão gerado | Por que parece certo | O que quebra | Regra |
|---|---|---|---|
| ★ `zod` (ou outro pacote de runtime) em `devDependencies` | `npm install` e os testes passam localmente | Deploy com `--omit=dev`: `Cannot find module 'zod'` | TS-20 |
| ★ `moduleResolution: "Bundler"` e imports sem `.js` | O `tsc` compila e o Vitest (via Vite) resolve | O Node ESM não carrega `dist/`, e a Function não sobe no Azure | TS-01, TS-06 |
| ★ Faltar `@types/node` (`Cannot find name 'process'`) | O código roda no Node, então parece que os tipos "vêm junto" | O `typecheck` falha. A "solução" tentadora é `declare const process: any`, que espalha `any` | TS-07, TS-20 |
| ★ Mapear `ZodIssue` só por `issue.path` | Funciona para 90% dos erros | Campo extra vira `path: "(body)"`, e o bot não sabe qual campo remover | TS-17 |
| ★ `body: unknown` no contrato de saída | "Genérico" e compila | Resposta sem `source_documents` passa sem erro de tipo | TS-08 |
| Mudar `strict` ou `noUncheckedIndexedAccess` para `false` para destravar o build | Some com dezenas de erros de uma vez | Volta o `undefined` em runtime que a opção existia para pegar | TS-06 |
| `interface QueryRequest` escrita ao lado do `QueryRequestSchema` | Parece mais legível | As duas divergem, e o tipo mente sobre o que foi validado | TS-14 |
| `z.object({...})` sem `.strict()` | É o default do Zod | Aceita `systemPrompt` e outros campos de injeção de prompt em silêncio | TS-15 |
| `(await request.json()) as QueryRequest` | É o que mais aparece em exemplos da internet | Nenhuma validação acontece. O tipo é só uma promessa | TS-13 |
| `catch (err: any) { err.message }` | Padrão antigo de TypeScript | `any` se propaga. Em TS 5 com `strict`, `err` é `unknown` e deve ficar assim | TS-07 |
| `enum Tier { Gold = "gold", ... }` | Estilo de C#/Java | Gera código em runtime, não casa com o `z.enum`, e o agente acrescenta `Platinum` | TS-10, TS-19 |
| `export default function handler` | Template antigo do Azure Functions (modelo v3) | Quebra o padrão do modelo v4 e dificulta o grep e o refactor | TS-05 |
| `import { v4 } from "uuid"` | Hábito | Dependência nova para algo que `node:crypto` já faz | TS-21 |
| `process.env.X!` espalhado pelos services | Rápido de escrever | A config inválida só aparece na primeira request em produção. O teste depende de `process.env` | TS-22 |
| `import ... from "zod/v4"` ou `z.iso.datetime()` | O agente mistura a documentação do Zod 4 | A API diverge do resto do código (Zod 3). Os tipos de `ZodIssue` mudam | TS-16 |
| `// @ts-ignore` na linha que não compila | Faz o CI passar | Esconde exatamente o tipo de erro desta tabela | TS-26 |

## O que NÃO está nesta skill

| Assunto | Skill responsável |
|---|---|
| Contrato `{ error: { code, message, details } }`, lista de `ErrorCode`, status HTTP, quando usar `try/catch`, o que nunca vai para o corpo da resposta | `error-handling` |
| Uso do `pino`, campos obrigatórios (`requestId`, `invocationId`), `redact` da pergunta e da resposta, correlação com o Application Insights | `logging` |
| Onde criar arquivo ou pasta, nome de arquivo, proibição de `utils/` e `helpers/`, README de módulo | `project-structure` |
| Valores válidos de tier, canal e status, e o significado de termos como frete especial, SLA e vigência | `novatech-glossary` |
| `app.http`, `authLevel`, padrão `createXHandler(deps)` + registro, `x-request-id`, limites de payload (`413`/`415`) | `azure-functions-endpoint` |
| Mapear resultados do índice para `Chunk`, metadados de vigência | `azure-ai-search-integration` |
| Limites de tokens, ordem do contexto, número de turnos (o **valor**; esta skill só exige que o limite seja uma constante com origem) | `prompt-context-budget` |
| Estrutura de teste no Vitest, fixtures em `tests/fixtures/`, mocks HTTP, o que um teste deve verificar | `testing-patterns` |
| Componentes React em `src/web/` (pacote próprio, fora do `tsconfig` raiz). As regras de tipos daqui valem lá. As de módulo (TS-01, TS-06) valem só para o backend | `react-components` |
