// Contrato de erro HTTP compartilhado por todos os endpoints.
// O corpo nunca carrega stack trace nem mensagem interna — isso vai só para o log.

import type { ZodIssue } from "zod";

export type ErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "PAYLOAD_TOO_LARGE"
  | "STORAGE_UNAVAILABLE"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export interface ErrorDetail {
  path: string;
  message: string;
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

export function errorBody(code: ErrorCode, message: string, details?: ErrorDetail[]): ErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

// Revisão crítica 2.2 (B3): em "unrecognized_keys" o nome do campo está em issue.keys,
// e issue.path aponta para o objeto pai — sem este narrowing o consumidor recebe "(body)".
export function toErrorDetails(issue: ZodIssue): ErrorDetail[] {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({ path: [...issue.path, key].join("."), message: "Campo não permitido." }));
  }
  return [{ path: issue.path.join(".") || "(body)", message: issue.message }];
}
