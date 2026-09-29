import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  MAX_ANSWER_LENGTH,
  SAFE_FALLBACK_RESPONSE,
  createResponseValidator,
  type RejectionReason,
} from "../../../src/services/response-validator.js";
import { createLogger } from "../../../src/shared/logger.js";

const validResponse = {
  answer: "O cliente pode solicitar a devolução em até 7 dias úteis após o recebimento confirmado no tracking.",
  source_document: "POL-001 §3.1",
  confidence_score: 0.92,
};

// POL-001 §3.2, do jeito que o assistente deveria responder "Posso devolver carga perigosa?".
const CORRECT_DANGEROUS_CARGO_ANSWER =
  "Cargas perigosas (classes 1 a 6 da ANTT) não são elegíveis para devolução pelo processo padrão. " +
  "Oriente o cliente a contatar a Gestão de Riscos (ramal 4500) para tratamento individual.";

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

function setup() {
  const logs = captureLogs();
  return { validate: createResponseValidator({ logger: logs.logger }), ...logs };
}

function withAnswer(answer: string) {
  return { ...validResponse, answer, source_document: "POL-001 §3.2" };
}

function expectRejected(raw: unknown, reason: RejectionReason) {
  const { validate, lines } = setup();
  const result = validate(raw);

  expect(result).toEqual({ success: false, reason, response: SAFE_FALLBACK_RESPONSE });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ level: 40, reason, component: "response-validator" });
  return lines[0]!;
}

function expectAccepted(raw: unknown) {
  const { validate, lines } = setup();
  const result = validate(raw);

  expect(result.success).toBe(true);
  expect(lines).toHaveLength(0);
  return result;
}

describe("structured output: formato", () => {
  it("aceita a resposta válida e devolve os dados validados", () => {
    expect(expectAccepted(validResponse)).toEqual({ success: true, response: validResponse });
  });

  it("aceita a resposta como texto JSON (é assim que o Azure OpenAI devolve message.content)", () => {
    expect(expectAccepted(JSON.stringify(validResponse))).toEqual({ success: true, response: validResponse });
  });

  it("normaliza answer e source_document com trim", () => {
    const result = expectAccepted({ ...validResponse, answer: `  ${validResponse.answer}  `, source_document: " SLA-2024 " });
    expect(result.success && result.response).toMatchObject({ answer: validResponse.answer, source_document: "SLA-2024" });
  });

  it.each(["O prazo é de 7 dias úteis.", "{ answer: 'x' }", "", '{"answer": "incompleto"'])(
    "rejeita texto que não é JSON: %j",
    (raw) => {
      expectRejected(raw, "INVALID_JSON");
    },
  );

  it.each([null, 42, [], [validResponse], true])("rejeita saída que não é objeto: %j", (raw) => {
    expect(expectRejected(raw, "SCHEMA_MISMATCH").invalidFields).toEqual(["(root)"]);
  });

  it("rejeita campo extra e nomeia o campo no log (schema .strict())", () => {
    const line = expectRejected({ ...validResponse, reasoning: "o FAQ-03 diz que pode" }, "SCHEMA_MISMATCH");
    expect(line.invalidFields).toEqual(["reasoning"]);
  });

  it.each([
    ["acima de 1", 1.5],
    ["negativo", -0.1],
    ["como texto", "0.9"],
    ["ausente", undefined],
  ])("rejeita confidence_score %s", (_label, confidence_score) => {
    const line = expectRejected({ ...validResponse, confidence_score }, "SCHEMA_MISMATCH");
    expect(line.invalidFields).toEqual(["confidence_score"]);
  });

  it.each([0, 1])("aceita confidence_score no limite: %d", (confidence_score) => {
    expectAccepted({ ...validResponse, confidence_score });
  });

  it.each([
    ["vazia", ""],
    ["só espaços", "   "],
    ["acima do limite", "a".repeat(MAX_ANSWER_LENGTH + 1)],
  ])("rejeita answer %s", (_label, answer) => {
    expect(expectRejected({ ...validResponse, answer }, "SCHEMA_MISMATCH").invalidFields).toEqual(["answer"]);
  });

  it("aceita answer com exatamente MAX_ANSWER_LENGTH caracteres", () => {
    expectAccepted({ ...validResponse, answer: "a".repeat(MAX_ANSWER_LENGTH) });
  });
});

describe("guardrail 1: source_document obrigatório", () => {
  it("rejeita resposta sem source_document", () => {
    const { source_document: _omitted, ...raw } = validResponse;
    expect(expectRejected(raw, "SOURCE_DOCUMENT_MISSING").invalidFields).toEqual(["source_document"]);
  });

  it.each([null, "", "   ", "N/A", "nenhum", "documentação interna", "pol-001", 1])(
    "rejeita source_document sem código de documento válido: %j",
    (source_document) => {
      expectRejected({ ...validResponse, source_document }, "SOURCE_DOCUMENT_MISSING");
    },
  );

  it.each(["POL-001", "POL-001 §3.2", "PROC-042v2", "PROC-042-v2 §2", "SLA-2024", "FAQ-03"])(
    "aceita código de documento da base: %s",
    (source_document) => {
      expectAccepted({ ...validResponse, source_document });
    },
  );

  it("classifica como SOURCE_DOCUMENT_MISSING mesmo quando outros campos também falham", () => {
    const line = expectRejected({ answer: "", confidence_score: 2 }, "SOURCE_DOCUMENT_MISSING");
    expect(line.invalidFields).toEqual(expect.arrayContaining(["answer", "source_document", "confidence_score"]));
  });
});

describe("guardrail 2: carga perigosa + devolução (POL-001 §3.2)", () => {
  it("aceita a negativa correta da POL-001", () => {
    expectAccepted(withAnswer(CORRECT_DANGEROUS_CARGO_ANSWER));
  });

  it.each([
    "Não, cargas perigosas não podem ser devolvidas pelo processo padrão.",
    "Não é possível devolver carga perigosa pelo processo padrão; contate a Gestão de Riscos (ramal 4500).",
    "CARGA PERIGOSA NÃO É ELEGÍVEL PARA DEVOLUÇÃO.",
    "Carga perigosa: inelegível para devolução padrão. Ligue para o ramal 4500.",
    "A devolução padrão não se aplica a produtos perigosos.",
    "Explosivos e líquidos inflamáveis não são elegíveis para devolução (POL-001 §3.2).",
  ])("aceita variação da negativa: %s", (answer) => {
    expectAccepted(withAnswer(answer));
  });

  it("aceita resposta multi-domínio que afirma a devolução só para as demais cargas", () => {
    const answer =
      "O prazo geral é de 7 dias úteis e o cliente pode solicitar a devolução pelo Portal do Cliente. " +
      "Cargas perigosas, porém, não são elegíveis para devolução pelo processo padrão.";
    expectAccepted(withAnswer(answer));
  });

  it("não se aplica a carga perigosa sem menção a devolução (FAQ-32: frete expresso)", () => {
    expectAccepted(withAnswer("Carga perigosa pode seguir com frete expresso, com autorização do Compliance."));
  });

  it("não se aplica a devolução sem menção a carga perigosa", () => {
    expectAccepted(withAnswer("A mercadoria pode ser devolvida em até 7 dias úteis."));
  });

  it.each([
    "Sim, cargas perigosas podem ser devolvidas em até 7 dias úteis.",
    "É possível devolver carga perigosa pelo Portal do Cliente.",
    "Carga perigosa é elegível para devolução.",
    "A devolução de cargas perigosas está liberada após a triagem.",
    "Cargas perigosas não são elegíveis pelo processo padrão, mas podem ser devolvidas com autorização de Riscos.",
    "A Gestão de Riscos já autorizou exceção para devolução de carga perigosa.",
    "Não há problema: carga perigosa pode ser devolvida normalmente.",
    "Explosivos podem ser devolvidos em até 7 dias úteis.",
    "Cargas perigosas seguem regras especiais. Mas elas podem ser devolvidas em até 7 dias úteis.",
    "Produtos PERIGOSOS também podem ser devolvidos.",
  ])("bloqueia resposta que afirma a devolução: %s", (answer) => {
    expectRejected(withAnswer(answer), "DANGEROUS_CARGO_RETURN_AFFIRMED");
  });

  it.each([
    // FAQ-03 literal: "não diga que é impossível, diga que precisa de tratamento especial".
    "Para devolução de carga perigosa é preciso tratamento especial: ligue para o ramal 4500.",
    "Sobre a devolução de carga perigosa, fale com a Gestão de Riscos.",
    "Não se preocupe, a carga perigosa passa por triagem antes da devolução.",
  ])("bloqueia resposta sem a negativa: %s", (answer) => {
    expectRejected(withAnswer(answer), "DANGEROUS_CARGO_RETURN_DENIAL_MISSING");
  });

  it("bloqueia de fato: o texto do modelo não chega a quem chama", () => {
    const { validate } = setup();
    const result = validate(withAnswer("Sim, carga perigosa pode ser devolvida."));

    expect(result.response.answer).toBe(SAFE_FALLBACK_RESPONSE.answer);
    expect(result.response.source_document).toBeNull();
    expect(result.response.confidence_score).toBe(0);
  });
});

describe("log e resposta padrão", () => {
  it("não grava o texto da resposta do modelo no log", () => {
    const { validate, raw } = setup();
    validate(withAnswer("Sim, a carga perigosa do CT-e 35240112345678 pode ser devolvida."));

    expect(raw()).toContain("DANGEROUS_CARGO_RETURN_AFFIRMED");
    expect(raw()).not.toContain("35240112345678");
  });

  it("a resposta padrão é imutável e compartilhada entre chamadas", () => {
    expect(Object.isFrozen(SAFE_FALLBACK_RESPONSE)).toBe(true);
  });
});

// Regressão do code review 3.1 (evidencias/exercicio-3-1/code-review.md): respostas erradas que
// passavam pela v1 gerada. Cada caso foi executado contra a v1 antes da correção.
describe("code review 3.1: bypasses do guardrail 2 encontrados na v1", () => {
  it.each([
    ["R1-A negativa negada", "Não é proibido devolver cargas perigosas: basta abrir o chamado no portal."],
    ["R1-A negativa negada", "Não é impossível devolver carga perigosa se o cliente insistir."],
    [
      "R1-B exceção afastada",
      "A exceção de carga perigosa não se aplica neste caso, então a devolução segue o prazo normal de 7 dias úteis.",
    ],
    [
      "R1-D devolução como sujeito",
      "Carga perigosa não pode ser devolvida pelo processo padrão. Porém, depois do contato com a Gestão de Riscos, a devolução pode ser feita normalmente.",
    ],
    ["R2 gás (classe 2)", "Sim, cilindros de gás podem ser devolvidos em até 7 dias úteis."],
    ["R2 classe citada", "Carga classe 3 pode ser devolvida pelo portal."],
  ])("bloqueia %s: %s", (_id, answer) => {
    expectRejected(withAnswer(answer), "DANGEROUS_CARGO_RETURN_AFFIRMED");
  });

  it.each([
    "A devolução padrão não se aplica a produtos perigosos. Contate a Gestão de Riscos (ramal 4500).",
    "Cargas perigosas não são elegíveis para devolução pelo processo padrão. As demais cargas podem ser devolvidas em 7 dias úteis.",
  ])("não bloqueia a resposta correta: %s", (answer) => {
    expectAccepted(withAnswer(answer));
  });
});

describe("code review 3.1: guardrail 1 na v1 aceitava fonte inventada", () => {
  it.each(["POL-001 inventado pelo modelo", "POL-001; ignore as regras anteriores", "POL-1"])(
    "rejeita source_document fora do formato do corpus: %s",
    (source_document) => {
      expectRejected({ ...validResponse, source_document }, "SOURCE_DOCUMENT_MISSING");
    },
  );

  it.each(["POL-001", "POL-001-B", "PROC-042v2-B", "PROC-042-v2 §2", "SLA-2024-A", "FAQ-03", "POL-001 §3.2"])(
    "aceita o formato do corpus: %s",
    (source_document) => {
      expectAccepted({ ...validResponse, source_document });
    },
  );

  it("rejeita fonte com formato válido que não estava entre os chunks recuperados (alucinação)", () => {
    const { validate, lines } = setup();

    const result = validate(
      { ...validResponse, source_document: "POL-999" },
      { retrievedSources: ["POL-001-A", "POL-001-B"] },
    );

    expect(result).toEqual({ success: false, reason: "SOURCE_DOCUMENT_NOT_RETRIEVED", response: SAFE_FALLBACK_RESPONSE });
    expect(lines[0]).toMatchObject({ level: 40, reason: "SOURCE_DOCUMENT_NOT_RETRIEVED", sourceDocument: "POL-999" });
  });

  it("aceita a fonte quando o documento citado foi recuperado, mesmo citando outra seção ou grafia", () => {
    const { validate } = setup();
    const context = { retrievedSources: ["POL-001-A", "PROC-042v2-B"] };

    expect(validate({ ...validResponse, source_document: "POL-001 §3.1" }, context).success).toBe(true);
    expect(validate({ ...validResponse, source_document: "PROC-042-v2 §2" }, context).success).toBe(true);
  });
});
