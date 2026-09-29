import { pino, type DestinationStream, type Logger } from "pino";

// Texto de pergunta/resposta pode conter dados do cliente (CT-e, contrato, nomes).
// Mesmo que alguém passe o objeto inteiro para o log por engano, estes campos saem mascarados.
const REDACTED_PATHS = ["question", "answer", "history", "*.question", "*.answer", "*.history"];

export function createLogger(destination?: DestinationStream): Logger {
  const options = {
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "novatech-assistant" },
    redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  };
  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();

export type { Logger };
