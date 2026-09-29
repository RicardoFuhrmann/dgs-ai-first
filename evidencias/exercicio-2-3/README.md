# Exercício 2.3 — Definição de estratégia de skills do projeto

Enunciado: [enunciado.md](enunciado.md)

| Tarefa | Entregável |
|---|---|
| 1. Árvore Foundation → Domain → Artifact | [`skills/skills-architecture.md`](../../skills/skills-architecture.md), seção "Árvore": 17 skills (as 10 do starter + 7 acréscimos justificados) e uma seção de skills que **não** vamos criar |
| 2. Nome, descrição (frase de ativação), quem cria, quem consome (papel + agentes), frequência | Mesmo arquivo, seção "Mapeamento criação × consumo". Tem skills com dono fora do time de dev: Product Specialist (`novatech-glossary`), QA (`testing-patterns`) e Delivery Manager (`sdd-specs`) |
| 3. SKILL.md da Foundation mais importante | [`skills/foundation/typescript-conventions.md`](../../skills/foundation/typescript-conventions.md): 26 regras verificáveis, DO/DON'T com código real e 16 anti-padrões |
| Evidência e iteração | [01-claude-code-gerando-skill.png](01-claude-code-gerando-skill.png) (geração v1) · [revisao-skill.md](revisao-skill.md) (verificação executada, 4 correções v1 → v2 e 2 propostas) |

**Por que `typescript-conventions` é a Foundation mais importante:** é a única da qual **todas** as skills que geram código dependem (endpoint, search, testes, React e as receitas). `error-handling` e `logging` não se aplicam a componentes React nem a specs.

**Ferramenta:** Claude Code, e não o Copilot.
