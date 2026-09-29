import { Writable } from "node:stream";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it, vi } from "vitest";
import type { FeedbackRecord } from "../../../../src/services/feedback-store.js";
import { createLogger } from "../../../../src/shared/logger.js";

// O handler registra a function e valida a config do Cosmos no import (fail-fast).
const { httpRegistrations } = vi.hoisted(() => ({ httpRegistrations: [] as Array<[string, unknown]> }));
vi.mock("@azure/functions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@azure/functions")>();
  return {
    ...original,
    app: { http: (name: string, options: unknown) => httpRegistrations.push([name, options]) },
  };
});
vi.stubEnv("COSMOS_ENDPOINT", "https://novatech-dev.documents.azure.com:443/");
vi.stubEnv("COSMOS_DATABASE", "novatech");
vi.stubEnv("COSMOS_FEEDBACK_CONTAINER", "feedbacks");

const { createFeedbackHandler, MAX_BODY_BYTES } = await import("../../../../src/functions/feedback/handler.js");

const ATTENDANT_OID = "7b3e1c2a-9f4d-4e8b-a1c6-2d5f8e9a0b13";
const validFeedback = { queryId: "teams-7f3a9c21", rating: 4, comment: "Resposta correta, citou a POL-001." };
const context = new InvocationContext({ invocationId: "test-invocation" });

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

function postFeedback(body: string, headers: Record<string, string> = { "x-ms-client-principal-id": ATTENDANT_OID }) {
  return new HttpRequest({
    method: "POST",
    url: "http://localhost:7071/api/feedback",
    headers: { "content-type": "application/json", ...headers },
    body: { string: body },
  });
}

function setup(saveFeedback = vi.fn<(record: FeedbackRecord) => Promise<void>>().mockResolvedValue()) {
  const logs = captureLogs();
  const handler = createFeedbackHandler({
    saveFeedback,
    logger: logs.logger,
    now: () => new Date("2026-09-29T12:00:00.000Z"),
  });
  return { handler, saveFeedback, ...logs };
}

describe("registro da function", () => {
  it("registra POST /api/feedback com authLevel explícito (o default do v4 é anonymous)", () => {
    expect(httpRegistrations).toHaveLength(1);
    const [name, options] = httpRegistrations[0]!;
    expect(name).toBe("feedback");
    expect(options).toMatchObject({ methods: ["POST"], route: "feedback", authLevel: "function" });
  });
});

describe("feedbackHandler", () => {
  it("grava o feedback válido e responde 201 com o id gerado", async () => {
    const { handler, saveFeedback } = setup();

    const response = await handler(postFeedback(JSON.stringify(validFeedback)), context);

    expect(response.status).toBe(201);
    const { feedbackId } = response.jsonBody as { feedbackId: string };
    expect(saveFeedback).toHaveBeenCalledWith({
      id: feedbackId,
      queryId: "teams-7f3a9c21",
      attendantId: ATTENDANT_OID,
      rating: 4,
      comment: "Resposta correta, citou a POL-001.",
      createdAt: "2026-09-29T12:00:00.000Z",
    });
  });

  it("não persiste e-mail: a identidade vem do token, não do corpo", async () => {
    const { handler, saveFeedback } = setup();

    const response = await handler(
      postFeedback(JSON.stringify({ ...validFeedback, attendantEmail: "ana.souza@novatech.com.br" })),
      context,
    );

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: { code: "VALIDATION_ERROR", details: [{ path: "attendantEmail" }] },
    });
    expect(saveFeedback).not.toHaveBeenCalled();
  });

  it("responde 401 sem o principal do Easy Auth e não lê o corpo", async () => {
    const { handler, saveFeedback } = setup();

    const response = await handler(postFeedback(JSON.stringify(validFeedback), {}), context);

    expect(response.status).toBe(401);
    expect(response.jsonBody).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(saveFeedback).not.toHaveBeenCalled();
  });

  it("responde 400 INVALID_JSON para corpo malformado", async () => {
    const { handler } = setup();

    const response = await handler(postFeedback("{ rating: 5"), context);

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ error: { code: "INVALID_JSON" } });
  });

  it.each([
    ["rating fora da escala", { ...validFeedback, rating: 9 }, "rating"],
    ["rating não inteiro", { ...validFeedback, rating: 3.5 }, "rating"],
    ["rating como texto", { ...validFeedback, rating: "5" }, "rating"],
    ["queryId com caracteres inválidos", { ...validFeedback, queryId: "abc; DROP" }, "queryId"],
    ["comentário acima de 2000 caracteres", { ...validFeedback, comment: "a".repeat(2001) }, "comment"],
  ])("responde 400 VALIDATION_ERROR para %s", async (_label, body, path) => {
    const { handler, saveFeedback } = setup();

    const response = await handler(postFeedback(JSON.stringify(body)), context);

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ error: { code: "VALIDATION_ERROR", details: [{ path }] } });
    expect(saveFeedback).not.toHaveBeenCalled();
  });

  it("responde 413 quando o corpo excede o limite, sem parsear", async () => {
    const { handler, saveFeedback } = setup();
    const request = postFeedback(JSON.stringify(validFeedback), {
      "x-ms-client-principal-id": ATTENDANT_OID,
      "content-length": String(MAX_BODY_BYTES + 1),
    });

    const response = await handler(request, context);

    expect(response.status).toBe(413);
    expect(saveFeedback).not.toHaveBeenCalled();
  });

  it("responde 503 sem vazar detalhes quando o Cosmos falha, e loga o erro", async () => {
    const failing = vi.fn<(record: FeedbackRecord) => Promise<void>>().mockRejectedValue(
      new Error("Request rate is large (429) AccountEndpoint=https://novatech-dev..."),
    );
    const { handler, lines } = setup(failing);

    const response = await handler(postFeedback(JSON.stringify(validFeedback)), context);

    expect(response.status).toBe(503);
    expect(response.jsonBody).toEqual({
      error: { code: "STORAGE_UNAVAILABLE", message: "Não foi possível registrar o feedback. Tente novamente." },
    });
    expect(lines.some((l) => l.msg === "failed to persist feedback" && l.level === 50)).toBe(true);
  });

  it("aceita feedback sem comentário", async () => {
    const { handler, saveFeedback } = setup();
    const { comment: _omitted, ...withoutComment } = validFeedback;

    const response = await handler(postFeedback(JSON.stringify(withoutComment)), context);

    expect(response.status).toBe(201);
    expect(saveFeedback.mock.calls[0]![0]).not.toHaveProperty("comment");
  });

  it("nunca loga o id do atendente nem o texto do comentário", async () => {
    const { handler, lines, raw } = setup();

    await handler(postFeedback(JSON.stringify(validFeedback)), context);

    expect(lines.find((l) => l.msg === "feedback request completed")).toMatchObject({
      status: 201,
      queryId: "teams-7f3a9c21",
      rating: 4,
      hasComment: true,
    });
    expect(raw()).not.toContain(ATTENDANT_OID);
    expect(raw()).not.toContain("citou a POL-001");
  });
});
