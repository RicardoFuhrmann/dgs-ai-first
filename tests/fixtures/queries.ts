// Perguntas de teste derivadas do mapa de cobertura do Anexo B (data/retrieval-corpus/chunks-novatech.md).

export const validQueryRequest = {
  question: "Qual o multiplicador para o Sudeste?",
  ticket: {
    id: "CH-2024-001234",
    openedAt: "2024-03-12T14:30:00-03:00",
    channel: "teams",
  },
  customer: { tier: "gold", contractId: "CT-88213" },
  history: [],
} as const;

export const coverageQuestions = {
  prazoDevolucao: "Qual o prazo de devolução?",
  cargaPerigosa: "Posso devolver carga perigosa?",
  slaGold: "Qual o SLA do cliente Gold?",
  slaPlatinum: "Qual o SLA do cliente Platinum?",
  frete600kgManaus: "Frete para 600kg para Manaus?",
  semCobertura300kgSalvador: "Frete para 300kg para Salvador?",
  multiplicadorSudeste: "Qual o multiplicador para o Sudeste?",
} as const;
