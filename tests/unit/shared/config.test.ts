import { describe, expect, it } from "vitest";
import { loadCosmosConfig } from "../../../src/shared/config.js";

const validEnv = {
  COSMOS_ENDPOINT: "https://novatech-dev.documents.azure.com:443/",
  COSMOS_DATABASE: "novatech",
  COSMOS_FEEDBACK_CONTAINER: "feedbacks",
};

describe("loadCosmosConfig", () => {
  it("devolve a config tipada quando o ambiente está completo", () => {
    expect(loadCosmosConfig(validEnv)).toEqual(validEnv);
  });

  it("lista todas as variáveis ausentes numa única mensagem (fail-fast no startup)", () => {
    expect(() => loadCosmosConfig({ COSMOS_ENDPOINT: validEnv.COSMOS_ENDPOINT })).toThrow(
      "Configuração do Cosmos inválida ou ausente: COSMOS_DATABASE, COSMOS_FEEDBACK_CONTAINER",
    );
  });

  it("rejeita endpoint que não é URL", () => {
    expect(() => loadCosmosConfig({ ...validEnv, COSMOS_ENDPOINT: "novatech-dev" })).toThrow("COSMOS_ENDPOINT");
  });

  it("não aceita connection string no lugar do endpoint (autenticação é por Managed Identity)", () => {
    const connectionString = "AccountEndpoint=https://x.documents.azure.com:443/;AccountKey=abc==;";
    expect(() => loadCosmosConfig({ ...validEnv, COSMOS_ENDPOINT: connectionString })).toThrow();
  });
});
