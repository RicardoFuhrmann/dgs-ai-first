// HTTP trigger do feedback — POST /api/feedback.
// Reescrita do módulo gerado pelo Copilot (evidencias/exercicio-3-2/): Zod, pino, import estático,
// nenhum dado pessoal em log, identidade do atendente vinda do token e não do corpo.

import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { createCosmosFeedbackStore, type FeedbackRecord, type SaveFeedback } from "../../services/feedback-store.js";
import { loadCosmosConfig } from "../../shared/config.js";
import { errorBody } from "../../shared/errors.js";
import { logger as defaultLogger, type Logger } from "../../shared/logger.js";
import { validateFeedbackRequest } from "./validator.js";

// Maior corpo válido (comentário de 2.000 caracteres acentuados + campos) fica abaixo de 5 KB.
export const MAX_BODY_BYTES = 8 * 1024;

// Injetado pelo App Service Authentication (Entra ID). Com o Easy Auth ativo, a plataforma
// descarta esse header se vier do cliente — por isso ele só é confiável com o Easy Auth habilitado.
const PRINCIPAL_ID_HEADER = "x-ms-client-principal-id";

export interface FeedbackHandlerDeps {
  saveFeedback: SaveFeedback;
  logger: Logger;
  now?: () => Date;
}

export function createFeedbackHandler(deps: FeedbackHandlerDeps) {
  const now = deps.now ?? (() => new Date());

  return async function feedbackHandler(
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> {
    const startedAt = Date.now();
    const log = deps.logger.child({ invocationId: context.invocationId, fn: "feedback" });

    const respond = (status: number, jsonBody: unknown, fields: Record<string, unknown> = {}): HttpResponseInit => {
      log.info({ status, durationMs: Date.now() - startedAt, ...fields }, "feedback request completed");
      return { status, jsonBody };
    };

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return respond(413, errorBody("PAYLOAD_TOO_LARGE", "O corpo da requisição excede o tamanho permitido."));
    }

    const attendantId = request.headers.get(PRINCIPAL_ID_HEADER);
    if (!attendantId) {
      return respond(401, errorBody("UNAUTHENTICATED", "Autenticação obrigatória."));
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond(400, errorBody("INVALID_JSON", "O corpo da requisição deve ser um JSON válido."));
    }

    const validation = validateFeedbackRequest(body);
    if (!validation.success) {
      return respond(
        400,
        errorBody("VALIDATION_ERROR", "Requisição inválida.", validation.details),
        { invalidFields: validation.details.map((d) => d.path) },
      );
    }

    const { queryId, rating, comment } = validation.data;
    const record: FeedbackRecord = {
      id: randomUUID(),
      queryId,
      attendantId,
      rating,
      ...(comment ? { comment } : {}),
      createdAt: now().toISOString(),
    };

    try {
      await deps.saveFeedback(record);
    } catch (err) {
      log.error({ err, feedbackId: record.id }, "failed to persist feedback");
      return respond(503, errorBody("STORAGE_UNAVAILABLE", "Não foi possível registrar o feedback. Tente novamente."));
    }

    // Só metadados operacionais: nada de attendantId, e-mail ou texto do comentário.
    return respond(201, { feedbackId: record.id }, {
      feedbackId: record.id,
      queryId,
      rating,
      hasComment: comment !== undefined,
    });
  };
}

app.http("feedback", {
  methods: ["POST"],
  route: "feedback",
  authLevel: "function",
  handler: createFeedbackHandler({
    saveFeedback: createCosmosFeedbackStore(loadCosmosConfig()),
    logger: defaultLogger,
  }),
});
