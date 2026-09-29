#### Exercício 3.1 — Structured output e verificações determinísticas (harness de código)

**Tópico:** Harness Engineering

**Contexto:** Hoje as respostas do assistente são texto livre — nada garante que a fonte sempre venha preenchida. Você vai (a) forçar um structured output com formato validável e (b) adicionar duas verificações determinísticas que complementam o que o prompt faz de forma probabilística.

**Ferramentas a utilizar:** Claude (chat) + GitHub Copilot

**Inputs fornecidos:**
- O cenário completo.
- A documentação da NovaTech (ver **Anexo A**) — use para entender as regras que os guardrails protegem (ex: a exceção de carga perigosa na POL-001).
- A estrutura do repositório (ver **Anexo C**) — o módulo vai em `/src/services/response-validator.ts`.
- Os 2 guardrails a implementar (subconjunto dos guardrails que o PS formalizou no cenário 2):
  1. *"Toda resposta DEVE conter o campo `source_document` — se não tiver, a resposta é rejeitada e substituída por mensagem padrão."*
  2. *"Respostas que mencionam 'carga perigosa' junto com 'devolução' DEVEM conter a negativa — se afirmarem que a devolução é possível, a resposta é bloqueada."*
- Conceito de structured output: *"Em vez de texto livre, o modelo responde em JSON com formato fixo: { answer, source_document, confidence_score }. Valida-se com Zod. Se não bate com o formato, rejeita-se antes de checar o conteúdo."*

**Tarefa:**
1. Usando o **GitHub Copilot**, defina o schema Zod do structured output (campos: answer, source_document, confidence_score).

2. Usando o **GitHub Copilot**, implemente o `response-validator.ts` que: valida a resposta contra o schema, e aplica os 2 guardrails. Em qualquer falha, registra o motivo em log e retorna uma resposta padrão segura.

3. Usando o **Claude**, faça um code review rápido do que o Copilot gerou: identifique ao menos 2 problemas (ex: o schema aceita campos extras? o regex de "carga perigosa + devolução" cobre variações?) e corrija.

**Entregável:** O schema Zod, o código do response-validator, e o code review com as correções.

**Critérios de avaliação:**
- O schema de structured output é válido e usa Zod corretamente.
- Os 2 guardrails realmente bloqueiam respostas inválidas (não apenas logam).
- O code review identifica problemas reais (não inventados).
- A distinção entre prompt (probabilístico) e código (determinístico) fica clara.

