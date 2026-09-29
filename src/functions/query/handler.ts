// HTTP trigger do query endpoint — POST /api/query (spec: specs/query-endpoint/tasks.md, QE-01).
// Esta task entrega o contrato HTTP e a validação; a orquestração RAG é injetada (QE-09).

import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { errorBody } from "../../shared/errors.js";
import { logger as defaultLogger, type Logger } from "../../shared/logger.js";
import { validateQueryRequest, type QueryRequest } from "./validator.js";

export interface AnswerQueryResult {
  status: number;
  body: unknown;
}

export type AnswerQuery = (
  query: QueryRequest,
  ctx: { requestId: string; logger: Logger },
) => Promise<AnswerQueryResult>;

export interface QueryHandlerDeps {
  answerQuery: AnswerQuery;
  logger: Logger;
}

// Reaproveita o id vindo do bot/painel para correlação, mas só se for seguro de logar.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function resolveRequestId(request: HttpRequest): string {
  const incoming = request.headers.get("x-request-id");
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export function createQueryHandler(deps: QueryHandlerDeps) {
  return async function queryHandler(
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> {
    const startedAt = Date.now();
    const requestId = resolveRequestId(request);
    const log = deps.logger.child({ requestId, invocationId: context.invocationId, fn: "query" });

    const respond = (status: number, jsonBody: unknown, fields: Record<string, unknown> = {}): HttpResponseInit => {
      log.info({ status, durationMs: Date.now() - startedAt, ...fields }, "query request completed");
      return { status, jsonBody, headers: { "x-request-id": requestId } };
    };

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond(400, errorBody("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."));
    }

    const validation = validateQueryRequest(body);
    if (!validation.success) {
      return respond(
        400,
        errorBody("VALIDATION_ERROR", "Requisição inválida.", validation.details),
        { invalidFields: validation.details.map((d) => d.path) },
      );
    }

    const query = validation.data;
    try {
      const result = await deps.answerQuery(query, { requestId, logger: log });
      return respond(result.status, result.body, { questionLength: query.question.length });
    } catch (err) {
      log.error({ err }, "unhandled error while answering query");
      return respond(500, errorBody("INTERNAL_ERROR", "Erro interno ao processar a pergunta."));
    }
  };
}

// Stub até a QE-09 conectar embedding → search → prompt → completion → response.
export const answerQueryNotImplemented: AnswerQuery = async () => ({
  status: 501,
  body: errorBody("NOT_IMPLEMENTED", "O fluxo de resposta ainda não foi implementado."),
});

app.http("query", {
  methods: ["POST"],
  route: "query",
  authLevel: "function",
  handler: createQueryHandler({ answerQuery: answerQueryNotImplemented, logger: defaultLogger }),
});
