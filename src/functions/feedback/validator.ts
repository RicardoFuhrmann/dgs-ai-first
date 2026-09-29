import { z } from "zod";
import { toErrorDetails, type ErrorDetail } from "../../shared/errors.js";
import { REQUEST_ID_PATTERN } from "../../shared/request-id.js";

// Escala do formulário de feedback do painel/Teams. A confirmar com o Product Specialist.
export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_COMMENT_LENGTH = 2000;

// A identidade do atendente NÃO faz parte do corpo: vem do token autenticado (ver handler.ts).
export const FeedbackRequestSchema = z
  .object({
    // É o x-request-id devolvido pelo POST /api/query — aceita ids do bot, não só UUID.
    queryId: z.string().regex(REQUEST_ID_PATTERN),
    rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
    comment: z.string().trim().min(1).max(MAX_COMMENT_LENGTH).optional(),
  })
  .strict();

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export type FeedbackValidationResult =
  | { success: true; data: FeedbackRequest }
  | { success: false; details: ErrorDetail[] };

export function validateFeedbackRequest(body: unknown): FeedbackValidationResult {
  const result = FeedbackRequestSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, details: result.error.issues.flatMap(toErrorDetails) };
}
