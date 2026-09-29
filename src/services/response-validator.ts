// Harness determinístico da saída do modelo (exercício 3.1).
// O system prompt pede JSON e pede para citar a fonte, mas isso é probabilístico: o modelo pode
// obedecer ou não. Este módulo é a parte determinística: o que não passa aqui não chega ao atendente.

import { z } from "zod";
import type { Logger } from "../shared/logger.js";

// Mesmo limite do `answer` em HistoryTurnSchema (functions/query/validator.ts): a resposta
// volta como turno do histórico na próxima pergunta e não pode ser recusada lá.
export const MAX_ANSWER_LENGTH = 4000;

// Guardrail 1: a fonte precisa ser um código de documento da base (docs/novatech/: POL-001,
// PROC-042, SLA-2024, FAQ-NN). Sem isso, "N/A", "nenhum" ou "documentação interna" passariam
// como fonte preenchida.
export const SOURCE_DOCUMENT_PATTERN = /^(POL|PROC|SLA|FAQ)-\d+/;

export const AssistantResponseSchema = z
  .object({
    answer: z.string().trim().min(1).max(MAX_ANSWER_LENGTH),
    source_document: z
      .string()
      .trim()
      .regex(SOURCE_DOCUMENT_PATTERN, "A fonte deve ser um código de documento da base (ex.: POL-001)."),
    confidence_score: z.number().min(0).max(1),
  })
  // Campo extra na saída do modelo (ex.: "reasoning", "internal_notes") é rejeitado, e não
  // repassado em silêncio ao consumidor.
  .strict();

export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

// Resposta montada pelo código, e não pelo modelo: não cita fonte porque não afirma nada de negócio.
export const SAFE_FALLBACK_RESPONSE = Object.freeze({
  answer:
    "Não consegui gerar uma resposta confiável para esta pergunta. " +
    "Consulte o documento oficial ou encaminhe o chamado ao supervisor.",
  source_document: null,
  confidence_score: 0,
} as const);

export type FallbackResponse = typeof SAFE_FALLBACK_RESPONSE;

export type RejectionReason =
  | "INVALID_JSON"
  | "SCHEMA_MISMATCH"
  | "SOURCE_DOCUMENT_MISSING"
  | "DANGEROUS_CARGO_RETURN_AFFIRMED"
  | "DANGEROUS_CARGO_RETURN_DENIAL_MISSING";

export type ResponseValidationResult =
  | { success: true; response: AssistantResponse }
  | { success: false; reason: RejectionReason; response: FallbackResponse };

export type ValidateAssistantResponse = (raw: unknown) => ResponseValidationResult;

export interface ResponseValidatorDeps {
  logger: Logger;
}

// POL-001 §3.2: classes 1 a 6 da ANTT. O modelo nem sempre usa o termo "carga perigosa";
// quem pergunta "posso devolver explosivos?" recebe uma resposta que fala em "explosivos".
const DANGEROUS_CARGO_PATTERN =
  /\b(perigos[ao]s?|explosiv\w*|inflamave\w*|oxidante\w*|peroxido\w*|toxic[ao]s?|infectante\w*)\b/;

// "devolução", "devoluções", "devolver", "devolvida"... e o vocabulário do procedimento (POL-001 §3.3).
const RETURN_PATTERN = /\b(devoluc\w*|devolv\w*|(coleta|logistica|frete)\s+revers[ao])\b/;

// Afirmações de que a devolução é possível. A mesma lista serve para achar a negativa: uma
// afirmação precedida de "não" ("não são elegíveis", "não pode ser devolvida") é a negativa.
// Uma lista solta de negativas ("não é", "não há") aceitaria "Não há problema em devolver".
// A última alternativa cobre a armadilha do FAQ-03 ("Riscos já autorizou exceção"), que
// contradiz a POL-001 §3.2.
const AFFIRMATION_PATTERNS: readonly RegExp[] = [
  /\bpode(m|ra|rao)?\s+(ser\s+)?devolvid\w*/g,
  /\bpode(m|ra|rao)?\s+(devolver|solicitar\s+(a\s+)?devoluc\w*|fazer\s+(a\s+)?devoluc\w*)/g,
  /\b(e|sao|esta|estao)\s+(possivel|permitid\w*|elegive\w*|aceit\w*|liberad\w*|autorizad\w*)/g,
  /\b(aceita|aceitamos|aceitam)\s+(a\s+)?devoluc\w*/g,
  /\bautoriz\w*\s+(a\s+)?(devoluc\w*|excec\w*)/g,
];

// Negativas que não são uma afirmação invertida.
const EXPLICIT_DENIAL_PATTERN =
  /\b(inelegive\w*|nao\s+elegive\w*|nao\s+se\s+aplica|vedad[ao]s?|proibid[ao]s?|impossivel)\b/;

// O "não" precisa estar colado na afirmação (no máximo um pronome no meio: "não se pode").
// Uma janela de palavras livres aceitaria "Não há problema: pode ser devolvida" como negativa.
const NEGATOR_BEFORE_PATTERN = /\b(nao|nem|nunca|jamais)(\s+(se|lhe|mais))?\s*$/;

// Frase seguinte que continua falando da mesma carga ("Mas ela pode ser devolvida...").
const CONTINUATION_PATTERN = /^(mas|porem|contudo|entretanto|no entanto|mesmo assim|ela|elas|esta|estas|essa|essas|nesse caso|neste caso)\b/;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Só as frases que falam da carga perigosa (e a continuação delas) são avaliadas. Assim uma
// resposta multi-domínio pode dizer que "as demais cargas podem ser devolvidas em 7 dias úteis".
function dangerousCargoScope(sentences: string[]): string[] {
  const scope: string[] = [];
  sentences.forEach((sentence, i) => {
    if (DANGEROUS_CARGO_PATTERN.test(sentence)) {
      scope.push(sentence);
      const next = sentences[i + 1];
      if (next && CONTINUATION_PATTERN.test(next)) scope.push(next);
    }
  });
  return scope;
}

function isNegated(sentence: string, matchIndex: number): boolean {
  return NEGATOR_BEFORE_PATTERN.test(sentence.slice(0, matchIndex));
}

function returnStatements(sentence: string): { affirmed: boolean; denied: boolean } {
  const negated = AFFIRMATION_PATTERNS.flatMap((pattern) =>
    [...sentence.matchAll(pattern)].map((match) => isNegated(sentence, match.index ?? 0)),
  );
  return {
    affirmed: negated.includes(false),
    denied: negated.includes(true) || EXPLICIT_DENIAL_PATTERN.test(sentence),
  };
}

// Guardrail 2 (POL-001 §3.2): resposta que fala de carga perigosa e de devolução DEVE conter a
// negativa, e não pode afirmar que a devolução é possível.
function checkDangerousCargoReturn(answer: string): RejectionReason | null {
  const text = normalize(answer);
  if (!DANGEROUS_CARGO_PATTERN.test(text) || !RETURN_PATTERN.test(text)) return null;

  const statements = dangerousCargoScope(splitSentences(text)).map(returnStatements);
  if (statements.some((s) => s.affirmed)) return "DANGEROUS_CARGO_RETURN_AFFIRMED";
  if (!statements.some((s) => s.denied)) return "DANGEROUS_CARGO_RETURN_DENIAL_MISSING";
  return null;
}

function parseIfString(raw: unknown): { success: true; value: unknown } | { success: false } {
  if (typeof raw !== "string") return { success: true, value: raw };
  try {
    return { success: true, value: JSON.parse(raw) };
  } catch {
    return { success: false };
  }
}

function issuePaths(issues: z.ZodIssue[]): string[] {
  return issues.flatMap((issue) =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => [...issue.path, key].join("."))
      : [issue.path.join(".") || "(root)"],
  );
}

export function createResponseValidator(deps: ResponseValidatorDeps): ValidateAssistantResponse {
  const log = deps.logger.child({ component: "response-validator" });

  // O log leva só o motivo e os campos inválidos: o texto da resposta pode conter dados do cliente.
  const reject = (reason: RejectionReason, fields: Record<string, unknown> = {}): ResponseValidationResult => {
    log.warn({ reason, ...fields }, "model response rejected, returning safe fallback");
    return { success: false, reason, response: SAFE_FALLBACK_RESPONSE };
  };

  return function validateAssistantResponse(raw: unknown): ResponseValidationResult {
    const parsed = parseIfString(raw);
    if (!parsed.success) return reject("INVALID_JSON");

    // Formato antes do conteúdo: os guardrails só rodam sobre uma resposta com formato válido.
    const result = AssistantResponseSchema.safeParse(parsed.value);
    if (!result.success) {
      const invalidFields = issuePaths(result.error.issues);
      const reason = invalidFields.includes("source_document") ? "SOURCE_DOCUMENT_MISSING" : "SCHEMA_MISMATCH";
      return reject(reason, { invalidFields });
    }

    const dangerousCargoViolation = checkDangerousCargoReturn(result.data.answer);
    if (dangerousCargoViolation) {
      return reject(dangerousCargoViolation, { sourceDocument: result.data.source_document });
    }

    return { success: true, response: result.data };
  };
}
