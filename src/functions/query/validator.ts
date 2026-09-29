import { z } from "zod";
import { toErrorDetails, type ErrorDetail } from "../../shared/errors.js";

// ADR-0002: histórico limitado a 3 turnos.
export const MAX_HISTORY_TURNS = 3;
export const MAX_QUESTION_LENGTH = 1000;

const HistoryTurnSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    answer: z.string().trim().min(1).max(4000),
  })
  .strict();

export const QueryRequestSchema = z
  .object({
    question: z.string().trim().min(3).max(MAX_QUESTION_LENGTH),
    ticket: z
      .object({
        id: z.string().trim().min(1).max(64),
        // Obrigatório: a data de abertura decide entre PROC-042 v1 e v2 (transição em 01/12/2023).
        openedAt: z.string().datetime({ offset: true }),
        channel: z.enum(["teams", "portal", "telefone"]),
      })
      .strict(),
    customer: z
      .object({
        // SLA-2024 §1: não existem outros tiers além destes três.
        tier: z.enum(["gold", "silver", "standard"]),
        contractId: z.string().trim().min(1).max(64).optional(),
      })
      .strict()
      .optional(),
    history: z.array(HistoryTurnSchema).max(MAX_HISTORY_TURNS).default([]),
  })
  .strict();

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export type ValidationResult =
  | { success: true; data: QueryRequest }
  | { success: false; details: ErrorDetail[] };

export function validateQueryRequest(body: unknown): ValidationResult {
  const result = QueryRequestSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    details: result.error.issues.flatMap(toErrorDetails),
  };
}
