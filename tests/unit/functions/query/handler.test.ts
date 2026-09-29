import { Writable } from "node:stream";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../../../src/shared/logger.js";
import { validQueryRequest } from "../../../fixtures/queries.js";

// O handler registra a function no import; aqui só interceptamos o registro para inspecioná-lo.
const { httpRegistrations } = vi.hoisted(() => ({ httpRegistrations: [] as Array<[string, unknown]> }));
vi.mock("@azure/functions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@azure/functions")>();
  return {
    ...original,
    app: { http: (name: string, options: unknown) => httpRegistrations.push([name, options]) },
  };
});

const { createQueryHandler, answerQueryNotImplemented } = await import(
  "../../../../src/functions/query/handler.js"
);

function captureLogs() {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, done: () => void) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  return { logger: createLogger(stream), lines, raw: () => lines.map((l) => JSON.stringify(l)).join("\n") };
}

function postQuery(body: string, headers: Record<string, string> = {}) {
  return new HttpRequest({
    method: "POST",
    url: "http://localhost:7071/api/query",
    headers: { "content-type": "application/json", ...headers },
    body: { string: body },
  });
}

const context = new InvocationContext({ invocationId: "test-invocation" });

describe("registro da function", () => {
  it("registra POST /api/query com authLevel function", () => {
    expect(httpRegistrations).toHaveLength(1);
    const [name, options] = httpRegistrations[0]!;
    expect(name).toBe("query");
    expect(options).toMatchObject({ methods: ["POST"], route: "query", authLevel: "function" });
  });

  it("em produção, responde 501 até a orquestração (QE-09) existir", async () => {
    const [, options] = httpRegistrations[0]!;
    const handler = (options as { handler: ReturnType<typeof createQueryHandler> }).handler;

    const response = await handler(postQuery(JSON.stringify(validQueryRequest)), context);

    expect(response.status).toBe(501);
    expect(response.jsonBody).toMatchObject({ error: { code: "NOT_IMPLEMENTED" } });
  });
});

describe("queryHandler", () => {
  it("repassa a requisição validada para answerQuery e devolve o resultado", async () => {
    const { logger } = captureLogs();
    const answerQuery = vi.fn().mockResolvedValue({ status: 200, body: { answer: "ok" } });
    const handler = createQueryHandler({ answerQuery, logger });

    const response = await handler(
      postQuery(JSON.stringify({ ...validQueryRequest, question: "  Qual o multiplicador para o Sudeste?  " })),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ answer: "ok" });
    expect(answerQuery).toHaveBeenCalledOnce();
    expect(answerQuery.mock.calls[0]![0]).toMatchObject({ question: "Qual o multiplicador para o Sudeste?" });
  });

  it("responde 400 INVALID_JSON quando o corpo não é JSON", async () => {
    const answerQuery = vi.fn();
    const handler = createQueryHandler({ answerQuery, logger: captureLogs().logger });

    const response = await handler(postQuery("{ isso não é json"), context);

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ error: { code: "INVALID_JSON" } });
    expect(answerQuery).not.toHaveBeenCalled();
  });

  it("responde 400 INVALID_JSON quando o corpo está vazio", async () => {
    const handler = createQueryHandler({ answerQuery: vi.fn(), logger: captureLogs().logger });

    const response = await handler(postQuery(""), context);

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ error: { code: "INVALID_JSON" } });
  });

  it("responde 400 VALIDATION_ERROR com os detalhes e não chama answerQuery", async () => {
    const answerQuery = vi.fn();
    const handler = createQueryHandler({ answerQuery, logger: captureLogs().logger });

    const response = await handler(
      postQuery(JSON.stringify({ ...validQueryRequest, customer: { tier: "platinum" } })),
      context,
    );

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: { code: "VALIDATION_ERROR", details: [{ path: "customer.tier" }] },
    });
    expect(answerQuery).not.toHaveBeenCalled();
  });

  it("responde 500 INTERNAL_ERROR sem vazar detalhes quando answerQuery lança", async () => {
    const { logger, lines } = captureLogs();
    const answerQuery = vi.fn().mockRejectedValue(new Error("connection string secreta na mensagem"));
    const handler = createQueryHandler({ answerQuery, logger });

    const response = await handler(postQuery(JSON.stringify(validQueryRequest)), context);

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Erro interno ao processar a pergunta." },
    });
    expect(lines.some((l) => l.level === 50 && (l.err as { stack?: string })?.stack)).toBe(true);
  });

  it("reaproveita um x-request-id válido e o devolve no header", async () => {
    const handler = createQueryHandler({ answerQuery: answerQueryNotImplemented, logger: captureLogs().logger });

    const response = await handler(
      postQuery(JSON.stringify(validQueryRequest), { "x-request-id": "teams-7f3a9c21" }),
      context,
    );

    expect(response.headers).toMatchObject({ "x-request-id": "teams-7f3a9c21" });
  });

  it.each([
    ["longo demais", "a".repeat(200)],
    ["com caracteres fora do padrão", "id com espaço; <script>"],
  ])("gera um novo request id quando o recebido é %s", async (_label, incoming) => {
    const handler = createQueryHandler({ answerQuery: answerQueryNotImplemented, logger: captureLogs().logger });

    const response = await handler(postQuery(JSON.stringify(validQueryRequest), { "x-request-id": incoming }), context);

    const requestId = (response.headers as Record<string, string>)["x-request-id"];
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("loga status, duração e tamanho da pergunta — mas nunca o texto da pergunta", async () => {
    const { logger, lines, raw } = captureLogs();
    const answerQuery = vi.fn().mockResolvedValue({ status: 200, body: {} });
    const handler = createQueryHandler({ answerQuery, logger });

    await handler(postQuery(JSON.stringify(validQueryRequest)), context);

    const completed = lines.find((l) => l.msg === "query request completed");
    expect(completed).toMatchObject({
      status: 200,
      questionLength: validQueryRequest.question.length,
      invocationId: "test-invocation",
    });
    expect(typeof completed?.durationMs).toBe("number");
    expect(raw()).not.toContain("multiplicador");
  });
});
