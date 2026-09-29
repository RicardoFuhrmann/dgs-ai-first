import { z } from "zod";

// Único ponto do código que lê process.env (skill typescript-conventions, TS-22).
// Config inválida lança no startup da Function (fail-fast), não na primeira request.

type Env = Record<string, string | undefined>;

const CosmosConfigSchema = z.object({
  COSMOS_ENDPOINT: z.string().url(),
  // Sem default: um ambiente com nome errado precisa falhar, não gravar no container de outro ambiente.
  COSMOS_DATABASE: z.string().min(1),
  COSMOS_FEEDBACK_CONTAINER: z.string().min(1),
});

export type CosmosConfig = z.infer<typeof CosmosConfigSchema>;

export function loadCosmosConfig(env: Env = process.env): CosmosConfig {
  const result = CosmosConfigSchema.safeParse(env);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Configuração do Cosmos inválida ou ausente: ${missing}`);
  }
  return result.data;
}
