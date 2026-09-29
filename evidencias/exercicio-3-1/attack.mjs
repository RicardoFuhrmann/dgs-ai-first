import { createResponseValidator } from "../../dist/src/services/response-validator.js";
import { createLogger } from "../../dist/src/shared/logger.js";
const v = createResponseValidator({ logger: createLogger() });
const r = (answer, source_document = "POL-001", confidence_score = 0.9) => v({ answer, source_document, confidence_score });
const cases = [
  ["A dupla negativa: 'não é proibido'", "Não é proibido devolver cargas perigosas: basta abrir o chamado no portal."],
  ["B 'não se aplica' invertido", "A exceção de carga perigosa não se aplica neste caso, então a devolução segue o prazo normal de 7 dias úteis."],
  ["C gás (classe 2) sem o termo 'perigosa'", "Sim, cilindros de gás podem ser devolvidos em até 7 dias úteis."],
  ["D verbo fora da lista após negativa", "Carga perigosa não pode ser devolvida pelo processo padrão. Porém, depois do contato com a Gestão de Riscos, a devolução pode ser feita normalmente."],
  ["E resposta correta (controle)", "Cargas perigosas das classes 1 a 6 da ANTT não são elegíveis para devolução pelo processo padrão. Contate a Gestão de Riscos (ramal 4500)."],
];
for (const [label, answer] of cases) { const x = r(answer); console.log(x.success ? "PASSA   " : "BLOQUEIA", "|", label, x.success ? "" : "→ " + x.reason); }
for (const src of ["POL-999", "POL-001 inventado pelo modelo", "FAQ-atendimento", "PROC-042v2-B"]) { const x = r("O prazo de devolução é de 7 dias úteis.", src); console.log(x.success ? "PASSA   " : "BLOQUEIA", "| source_document =", JSON.stringify(src)); }
const low = r("O prazo de devolução é de 7 dias úteis.", "POL-001", 0.05); console.log(low.success ? "PASSA   " : "BLOQUEIA", "| confidence_score = 0.05");
const ctx = { retrievedSources: ["POL-001-A", "POL-001-B", "FAQ-03"] };
for (const src of ["POL-999", "PROC-042v2-B", "POL-001 §3.2", "FAQ-03"]) { const x = v({ answer: "O prazo de devolução é de 7 dias úteis.", source_document: src, confidence_score: 0.9 }, ctx); console.log(x.success ? "PASSA   " : "BLOQUEIA", "| com retrievedSources=[POL-001-A,POL-001-B,FAQ-03] → source =", JSON.stringify(src), x.success ? "" : "→ " + x.reason); }
for (const a of ["A devolução padrão não se aplica a produtos perigosos. Contate a Gestão de Riscos (ramal 4500).", "Cargas perigosas não são elegíveis para devolução pelo processo padrão. As demais cargas podem ser devolvidas em 7 dias úteis."]) { const x = r(a); console.log(x.success ? "PASSA   " : "BLOQUEIA", "| correta:", a.slice(0, 70) + "…", x.success ? "" : "→ " + x.reason); }
