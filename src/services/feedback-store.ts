import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import type { CosmosConfig } from "../shared/config.js";

export interface FeedbackRecord {
  id: string;
  queryId: string;
  // Object id (oid) do Entra ID — pseudônimo estável; o e-mail do atendente não é persistido.
  attendantId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export type SaveFeedback = (record: FeedbackRecord) => Promise<void>;

// Chamado uma vez no ponto de composição: o CosmosClient é reaproveitado entre invocações
// (recomendação do SDK), e a autenticação é por Managed Identity — sem connection string com chave mestre.
export function createCosmosFeedbackStore(config: CosmosConfig): SaveFeedback {
  const client = new CosmosClient({
    endpoint: config.COSMOS_ENDPOINT,
    aadCredentials: new DefaultAzureCredential(),
  });
  const container = client.database(config.COSMOS_DATABASE).container(config.COSMOS_FEEDBACK_CONTAINER);

  return async (record) => {
    await container.items.create(record);
  };
}
