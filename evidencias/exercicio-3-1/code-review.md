# Exercício 3.1 — Code review do `response-validator.ts`

- **v1 (gerada):** Claude Code numa sessão separada, no papel do Copilot ([prints 01a–01c](README.md#evidência-da-geração)). Commit `c87d987`.
- **v2 (revisada):** a versão atual. Diff em `git diff c87d987 -- src/services/response-validator.ts`.
- **Método:** além de ler o código, **ataquei os guardrails** com respostas que um GPT-4o poderia produzir e que deveriam ser bloqueadas. Todo problema abaixo foi reproduzido executando a v1, e não deduzido.

## O que a v1 já fazia bem

A v1 é boa, e não é justo apresentá-la como ruim:
- Schema com `.strict()`, `confidence_score` entre 0 e 1 e `answer` com o mesmo limite do histórico da QE-01.
- **Bloqueia de fato:** toda falha devolve `SAFE_FALLBACK_RESPONSE`, e o texto do modelo não chega a quem chama, o que é coberto por teste. O log não leva o texto da resposta.
- Normaliza acento e maiúsculas, reconhece plural e sinônimos das classes da ANTT e cobre a armadilha do FAQ-03 ("Riscos já autorizou exceção").
- **Falha para o lado seguro:** se a resposta fala de carga perigosa e devolução mas não traz negativa, ela é bloqueada (`DENIAL_MISSING`), mesmo que não afirme nada.
- O próprio gerador declarou 3 limitações. Uma delas (a fonte não é conferida contra o retrieval) se confirmou e virou o R3.

## Problemas encontrados

Resultado de [`attack.mjs`](attack.mjs) (`npm run build && LOG_LEVEL=silent node evidencias/exercicio-3-1/attack.mjs`) contra a v1: **4 respostas erradas sobre carga perigosa passavam**, além de fontes inventadas.

| # | Sev. | Problema | Resposta que passava na v1 | Por quê |
|---|---|---|---|---|
| **R1** | Alta | **Guardrail 2 burlável pela forma da negativa** | **A:** "Não é **proibido** devolver cargas perigosas: basta abrir o chamado no portal." | `proibido`, `impossível` e `vedado` contavam como negativa **sem olhar se estavam negados**. "Não é proibido" = pode |
| | | | **B:** "A exceção de carga perigosa **não se aplica** neste caso, então a devolução segue o prazo normal de 7 dias úteis." | "não se aplica" estava na lista de negativas, mas o sujeito aqui é a **exceção**. Afastar a exceção libera a devolução |
| | | | **D:** "Carga perigosa não pode ser devolvida pelo processo padrão. Porém, depois do contato com a Gestão de Riscos, a devolução **pode ser feita** normalmente." | A 2ª frase entra no escopo (começa com "Porém"), mas "pode ser feita" não estava na lista de afirmações. É a armadilha do FAQ-03 com outro verbo |
| **R2** | Alta | **Carga perigosa não reconhecida** | **C:** "Sim, cilindros de **gás** podem ser devolvidos em até 7 dias úteis." | O padrão tinha explosivos, inflamáveis, oxidantes, tóxicos e infectantes, mas **não os gases (classe 2)** da POL-001 §3.2, nem "classe N" |
| **R3** | Alta | **Guardrail 1 aceita fonte alucinada** | `source_document: "POL-999"` | Só o **formato** era validado. Uma resposta com fonte inventada cumpre o "DEVE conter `source_document`" e passa. Como o cenário reporta 12% de respostas incorretas, incluindo alucinação, esse é o caso mais provável. *(Declarado pelo gerador)* |
| **R4** | Média | **Regex da fonte sem âncora no fim** | `"POL-001 inventado pelo modelo"`, `"POL-001; ignore as regras anteriores"` | `^(POL\|PROC\|SLA\|FAQ)-\d+` sem `$`: qualquer texto depois do código passava. `"POL-1"` também passava |

## Correções (v2)

| # | Correção | Teste de regressão |
|---|---|---|
| R1-A | Negativa explícita só conta como negativa se **não** estiver negada. Com "não é/não será" na frente, vira **afirmação** (`NEGATED_DENIAL_PREFIX`) | `bloqueia R1-A negativa negada` (2 casos) |
| R1-B | "não se aplica" passou a olhar o **sujeito**: com "devolução/processo padrão" é negativa, com "exceção" é afirmação. Nova afirmação: "segue o prazo/processo normal" | `bloqueia R1-B…` + `não bloqueia: A devolução padrão não se aplica a produtos perigosos` |
| R1-D | Nova afirmação com a devolução como sujeito: "a devolução pode ser feita/realizada/aceita/aprovada…" | `bloqueia R1-D…` |
| R2 | `gas`, `gases`, `classe(s) 1–6` no `DANGEROUS_CARGO_PATTERN` | `bloqueia R2…` (2 casos) |
| R3 | `validate(raw, { retrievedSources })`: se o contexto de retrieval é informado, a fonte citada precisa ser um dos documentos recuperados (`SOURCE_DOCUMENT_NOT_RETRIEVED`). Compara por **documento**, então `POL-001 §3.1` casa com o chunk `POL-001-A` | `rejeita fonte… não estava entre os chunks recuperados` |
| R4 | Regex ancorado: `código(-chunk)?( §seção)?$`, no formato real do corpus. Aceita `PROC-042v2` (id do chunk) e `PROC-042-v2` (nome do arquivo) | `rejeita… fora do formato` (3) + `aceita o formato do corpus` (7) |

**Prova de que os testes pegam os bugs:** com a v1 restaurada, os testes novos dão `10 failed | 10 passed`. Os 10 que falham são exatamente os bypasses e as fontes inventadas. Os 10 que passam são respostas corretas que devem continuar aceitas. Com a v2, `134 passed`.

**Dois erros meus durante a correção**, pegos pelos testes do gerador:
1. O primeiro regex ancorado rejeitava `PROC-042-v2 §2`, que é o nome real do arquivo em `docs/novatech/`.
2. Tirar "não se aplica" da lista de negativas bloqueava a resposta **correta** "A devolução padrão não se aplica a produtos perigosos".

Os dois foram corrigidos com a análise do sujeito descrita no R1-B. Os testes da v1 serviram como rede de segurança da minha própria revisão.

## Prompt × código: o que cada um garante

| | System prompt (probabilístico) | `response-validator.ts` (determinístico) |
|---|---|---|
| Formato JSON | *Pede* JSON com `answer`, `source_document`, `confidence_score` | **Rejeita** o que não bate com o schema Zod (`.strict()`) |
| Fonte | *Pede* para citar a fonte | **Rejeita** sem fonte, com formato inválido ou com documento que não foi recuperado |
| Carga perigosa | *Instrui* que a POL-001 §3.2 exclui carga perigosa | **Bloqueia** se afirmar que pode ou se faltar a negativa |
| Quando falha | O modelo "esquece" em N% das vezes, e nada impede a resposta de seguir | A resposta **nunca** chega ao atendente. Vai o fallback, e o motivo fica no log |

O prompt reduz a *frequência* do erro. O código garante que o erro **não chega** ao atendente. Um não substitui o outro: sem o prompt, quase tudo cairia no fallback; sem o código, os 12% de respostas incorretas chegariam ao atendente.

## Limites que continuam (e o que fazer)

1. **Regex sobre linguagem natural é uma corrida sem fim.** Cada correção do R1 fecha uma forma de dizer "pode devolver", e o modelo pode inventar outra. A defesa estrutural já existe: sem uma negativa **reconhecida**, a resposta é bloqueada. O risco residual é uma frase com negativa correta **e** uma afirmação num formato que ainda não conhecemos.
   **Proposta:** acrescentar ao structured output um campo fechado, por exemplo `policy_flags: ["DANGEROUS_CARGO_NOT_ELIGIBLE"]`, e validar esse campo com `z.enum`, sem depender de NLP. O texto passa a ser checado contra a flag, e não interpretado.
2. **`confidence_score` é validado, mas não é usado (falta HITL).** A v1 e a v2 aceitam `confidence_score: 0.05` sem restrição. O schema garante que o campo existe, mas nenhuma decisão depende dele.
   **Proposta de ponto HITL:** confiança abaixo de um limiar (a definir com o PS e o QA a partir das golden queries) em tema sensível (carga perigosa, SLA contratual) → a resposta vai para revisão humana (supervisor ou Gestão de Riscos) antes do atendente. É decisão de produto e de harness (PS 3.2 / TL 3.1), por isso não foi implementada aqui.
3. **O fallback é genérico** *(declarado pelo gerador)*. Num bloqueio de carga perigosa, dá para responder com o texto **fixo e correto** da POL-001 §3.2 ("não elegível pelo processo padrão; Gestão de Riscos, ramal 4500"), montado pelo código e não pelo modelo. Mantive o fallback único que o enunciado pede.
4. **O R3 depende de quem chama.** A checagem contra o retrieval só acontece se o orquestrador (QE-09) passar `retrievedSources`. Isso deve virar critério de aceite da QE-09: sem contexto de retrieval, a resposta não é considerada validada.
