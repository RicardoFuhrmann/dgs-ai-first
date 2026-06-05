# Análise Crítica — Falhas do System Prompt v1

## Premissa da análise

Um system prompt não é avaliado pelo que ele diz — é avaliado pelo que o modelo faz quando o contexto é ambíguo, incompleto ou conflitante. As falhas identificadas abaixo são situações em que o prompt v1 falha em guiar o modelo para a resposta correta, mesmo que o texto do prompt pareça cobrir o caso.

---

## Falha central: tratamento de exceção como exceção, não como inversão de regra

### O caso da carga perigosa (POL-001)

**A resposta correta para "Qual o prazo de devolução para carga perigosa?":**

Carga perigosa das classes 1 a 6 da ANTT **não tem prazo de devolução** porque **não é elegível para o processo padrão**. A pergunta pelo "prazo" pressupõe elegibilidade — e essa premissa está errada. A resposta correta não é "o prazo é X com condições especiais"; é "não se aplica processo padrão, contato obrigatório com Gestão de Riscos (ramal 4500)".

**Por que modelos erram aqui:**

A estrutura da POL-001 é:
- Seção 3.1: regra geral — 7 dias úteis
- Seção 3.2: exceção — cargas perigosas classes 1-6 não são elegíveis
- FAQ-03: orientação informal — "não diga que é impossível, diga que precisa de tratamento especial"

O risco não é o modelo ignorar a Seção 3.2. O risco é o modelo usar o FAQ-03 para suavizar a exceção da Seção 3.2 e produzir algo como: "Cargas perigosas não seguem o processo padrão, mas podem ter devolução mediante autorização do setor de Riscos — entre em contato pelo ramal 4500."

Essa resposta parece razoável. Ela está errada porque:
1. Trata como processo possível algo que a documentação formal classifica como exceção individual de tratamento especial, não como devolução;
2. Amplifica a exceção informal (FAQ-03 cita casos históricos) para criar uma regra implícita de "devolução com autorização";
3. Inverte a hierarquia: regra formal (não elegível) subordinada a orientação informal (pode acontecer).

**O que o prompt v1 faz — e onde falha:**

O prompt v1 tem a regra R5 ("não extrapole exceções") e FI2 ("priorize documentação formal"). Mas não instrui o modelo sobre o que fazer quando a fonte informal **atenua** uma regra formal. A distinção entre "complementar" e "atenuar" não está no prompt. O modelo pode interpretar o FAQ-03 como contexto operacional válido que informa como aplicar a exceção da Seção 3.2 — em vez de tratá-lo como orientação de tom que não altera a regra.

**O que precisa mudar no v2:**

Adicionar instrução explícita: "Quando uma fonte informal atenuar, suavizar ou criar exceção a uma regra de fonte formal, a fonte formal prevalece sem modificação. A fonte informal pode informar o tom da comunicação com o cliente, mas não altera o conteúdo da regra."

---

## F1 — Alucinação residual em perguntas abertas

**Mecanismo de falha:** O prompt instrui "nunca invente", mas não define um passo de verificação pré-resposta. Modelos completam lacunas para parecer úteis, especialmente quando o tema é familiar ao treinamento (ex.: logística, normas ANTT). A instrução negativa ("não faça X") é menos eficaz que uma instrução processual ("antes de afirmar Y, verifique que Y está em qual chunk").

**Cenário de risco:** "Qual a documentação necessária para devolução?" — o modelo pode combinar POL-001-C (procedimento documentado) com conhecimento paramétrico sobre documentação de transporte para acrescentar requisitos que não estão no chunk.

**Severidade:** Média. Mais provável em perguntas procedurais abertas do que em perguntas sobre valores específicos.

---

## F2 — Cálculo parcialmente indevido por "valor encontrado" em chunk adjacente

**Mecanismo de falha:** A regra CA1 lista os elementos necessários para calcular, mas não tem um protocolo de checklist que force o modelo a verificar cada elemento individualmente antes de calcular. Em cadeias longas, o modelo pode "encontrar" um valor em um chunk que não é o parâmetro correto.

**Cenário de risco concreto:** Um contexto com SLA-2024-A (que menciona R$ 500.000 como critério de tier) e PROC-042v2-A (que exige valor base para cálculo). O modelo pode, em uma query mal delimitada, usar o R$ 500.000 como proxy de "valor base" para o cálculo de frete — porque é o único valor monetário nos chunks.

**Severidade:** Média-alta. Qualquer erro de cálculo em frete tem impacto financeiro direto.

---

## F3 — Amplificação de exceção em contexto multi-turno

**Mecanismo de falha:** A regra R5 ("não extrapole exceções") é eficaz em queries isoladas. Em conversas com múltiplos turnos, o atendente pode perguntar "então há alguma possibilidade?", "o cliente já conseguiu antes?", "e se for urgente?". Cada pergunta convida o modelo a ampliar ligeiramente o escopo da exceção. Após 3 ou 4 turnos, o modelo pode ter construído uma "política de exceção" que não existe em nenhum chunk.

**Cenário de risco:** Turno 1: "Carga perigosa pode ser devolvida?" → Resposta correta: não pelo processo padrão. Turno 2: "Mas o FAQ diz que o pessoal de Riscos já autorizou antes" → Resposta arriscada: o modelo pode confirmar que exceções existem. Turno 3: "Como eu peço essa exceção?" → Resposta inventada: o modelo cria um procedimento para exceção que não está documentado.

**Severidade:** Alta em contexto conversacional. O prompt v1 não tem instrução para manter a consistência de regras ao longo dos turnos.

---

## F4 — Citação de fonte incompleta

**Mecanismo de falha:** O formato obrigatório especifica "[ID, Seção X.X, versão]", mas não cobre chunks sem número de seção formal (ex.: FAQ-03 tem "Item 3", não "Seção 3.X") nem chunks cuja versão é implícita no ID (PROC-042 vs. PROC-042v2). O modelo pode simplificar a citação e omitir a versão quando ela é parte do ID.

**Impacto:** Auditabilidade comprometida. Um atendente que recebe "conforme PROC-042, Seção 2.1" não sabe se está lendo a versão v1 ou v2, e o valor do multiplicador muda entre elas.

**Severidade:** Baixa-média. Não afeta a correção da resposta, mas afeta a rastreabilidade em caso de contestação.

---

## F5 — Uso de conhecimento externo para validar chunk

**Mecanismo de falha:** A regra R3 proíbe usar conhecimento externo para completar lacunas, mas não proíbe usar conhecimento externo para validar ou reforçar o que está no chunk. O modelo pode acrescentar contexto sobre a Resolução ANTT nº 5.947/2021 (mencionada no POL-001-B) que não está no chunk — por exemplo, listando classes adicionais de carga perigosa além das mencionadas.

**Cenário de risco:** "O que são cargas perigosas classe 1?" — o modelo pode responder com sua memória sobre a ANTT em vez de se limitar ao que o chunk descreve ("explosivos (classe 1)").

**Severidade:** Baixa em queries diretas. Média se o atendente fizer perguntas interpretativas sobre a legislação citada.

---

## F6 — Confiança excessiva com chunks parcialmente suficientes

**Mecanismo de falha:** O fallback de ausência de informação (AI1–AI4) é ativado quando o modelo avalia que não há resposta. Mas o modelo pode avaliar que uma resposta parcial é suficiente — e responder com confiança sem sinalizar o que ficou de fora.

**Cenário de risco concreto:** No Teste 2, apenas SLA-2024-A e SLA-2024-B foram fornecidos. O modelo respondeu corretamente sobre chamados gerais e apontou que SLA de incidente crítico estava ausente. Mas em uma implementação real, sem instrução explícita, o modelo poderia simplesmente omitir a ressalva e o atendente ficaria com a impressão de ter recebido o SLA completo do cliente Gold.

**Severidade:** Média. O risco é proporcional à granularidade do que está ausente — quando falta um tipo de chamado (geral vs. crítico), o gap pode não ser percebido.

---

## F7 — Mistura de versões por similaridade de ID

**Mecanismo de falha:** O prompt instrui CF5 (nunca misturar versões), mas não define um protocolo de desambiguação quando o modelo encontra chunks com IDs próximos (PROC-042 e PROC-042v2). Em janelas de contexto longas, o modelo pode tratar PROC-042-B como parte da família PROC-042v2 por similaridade lexical — especialmente se os metadados de versão não forem explícitos no texto do chunk.

**Cenário de risco:** Se o pipeline RAG injetar PROC-042-B sem o metadado "versão v1" explícito no texto, o modelo pode confundir os multiplicadores v1 com os v2 ao calcular frete.

**Severidade:** Alta. Um cálculo com multiplicadores misturados produz um valor financeiro errado comunicado ao cliente.

---

## F8 — FAQ como autoridade única sem documentação formal disponível

**Mecanismo de falha:** As regras FI1–FI4 cobrem o conflito formal vs. informal. Mas quando o chunk informal é a única fonte disponível (como no Teste 7, sobre carga danificada), o modelo pode apresentar o FAQ como "a resposta" sem sinalização adequada — porque não há fonte formal para comparar.

**Cenário de risco:** O modelo usa FAQ-38 e produz: "O procedimento para carga danificada é: registrar em 48h, enviar fotos, encaminhar para sinistros@novatech.com.br." Sem a sinalização de fonte informal, o atendente trata isso como política oficial e comunica ao cliente como garantia.

**Severidade:** Média. O risco é que o atendente não perceba que precisa validar — e a ausência de sinalização no output é o fator que elimina esse aviso.

---

## F9 — Lacuna de frete abaixo de 500kg não coberta por regra explícita

**Mecanismo de falha:** O prompt não contém instrução específica sobre o fato de que toda a documentação de frete disponível (PROC-042 e PROC-042v2) cobre apenas cargas acima de 500kg. A ausência de cobertura para frete padrão depende de o modelo identificar o limiar de 500kg no chunk e conectá-lo ao peso da carga informada.

**Cenário de risco:** "Frete para 499kg para Curitiba?" — o modelo pode aplicar a fórmula de frete especial por estar 1kg abaixo do limiar (interpretando "acima de 500kg" como "a partir de 500kg"), ou pode aplicar o multiplicador mais próximo por analogia.

**Severidade:** Média. Depende de ambiguidade na formulação da pergunta e de como o modelo interpreta o limiar.

---

## F10 — Tier inexistente sem documentação disponível

**Mecanismo de falha:** A regra AI5 cobre classificadores inexistentes, mas não menciona o tier Platinum explicitamente. Se a query não incluir SLA-2024-A nos chunks recuperados, o modelo não tem documentação que afirme "Platinum não existe". Nesse caso, pode tentar inferir um SLA plausível — especialmente porque "Platinum" é um nome de tier comum em programas de fidelidade.

**Cenário de risco:** Query: "Qual o SLA do cliente Platinum?" com chunks SLA-2024-B e SLA-2024-C (sem SLA-2024-A). O modelo vê a tabela de SLAs mas não tem a afirmação explícita de que só existem três tiers. Pode tentar inferir que Platinum seria "acima de Gold" e inventar SLAs mais restritivos.

**Severidade:** Alta quando o chunk correto não está disponível. A defesa atual depende de o pipeline RAG sempre recuperar SLA-2024-A junto com qualquer query sobre tier.

---

## Síntese das falhas por risco

| Falha | Risco | Impacto | Mitigação principal |
|---|---|---|---|
| Exceção de carga perigosa atenuada por FAQ | **Alto** | Atendente comunica possibilidade de devolução que não existe | Regra explícita: FAQ não atenua regra formal |
| Cálculo sem valor base | **Alto** | Valor financeiro errado ao cliente | Checklist de pré-cálculo obrigatório |
| Mistura de versões PROC-042 | **Alto** | Valor financeiro errado ao cliente | Protocolo de desambiguação de versão por metadado |
| Tier inexistente sem chunk confirmador | **Alto** | Invenção de SLA | Regra explícita independente de chunk |
| Amplificação de exceção em multi-turno | **Alto** | "Política de exceção" inventada ao longo da conversa | Instrução de consistência entre turnos |
| Alucinação em perguntas abertas | **Médio** | Procedimentos inventados | Passo de verificação pré-resposta |
| Confiança com chunks parciais | **Médio** | SLA incompleto apresentado como completo | Critério de suficiência por tipo de query |
| FAQ como autoridade única | **Médio** | Orientação informal tratada como garantia | Exemplo explícito de FAQ-como-única-fonte |
| Lacuna de frete < 500kg | **Médio** | Fórmula errada aplicada a peso fora do escopo | Regra de limiar explícita para PROC-042 |
| Citação de fonte incompleta | **Baixo** | Rastreabilidade comprometida | Formato de citação para fontes informais |
| Uso de conhecimento externo para validar | **Baixo** | Informações não documentadas adicionadas | Extensão da regra R3 |
