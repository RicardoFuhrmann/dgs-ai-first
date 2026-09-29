// Contrato de erro HTTP compartilhado por todos os endpoints.
// O corpo nunca carrega stack trace nem mensagem interna — isso vai só para o log.

export type ErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
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
