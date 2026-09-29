# Exercício 2.3 — Revisão da skill `typescript-conventions` (v1 → v2)

- **v1:** gerada pelo Claude Code numa sessão nova ([print](01-claude-code-gerando-skill.png)), a partir de [`skills-architecture.md`](../../skills/skills-architecture.md), do código real e da [revisão crítica do 2.2](../exercicio-2-2/revisao-critica.md). Commit `c243ffe`.
- **v2:** a versão atual, com as correções abaixo. O diff está em `git diff c243ffe -- skills/foundation/typescript-conventions.md`.

Cada afirmação da skill foi **verificada executando**, e não só lendo: os greps de "Verificar" contra o código, a API do Zod instalado e o histórico do git.

## O que a v1 acertou

- **Prescritiva de verdade:** são 26 regras numeradas (`TS-01`…`TS-26`), todas com MUST/MUST NOT e uma linha "Verificar". Um agente ou revisor consegue checar cada uma.
- **Ancorada no código real:** os DO vêm de `handler.ts`/`validator.ts`, e o DON'T da TS-17 é literalmente o código gerado na QE-01, com a saída `"path":"(body)"`.
- **Os greps funcionam:** o agente afirmou que o único resultado seria o `process.env` em `logger.ts`, a exceção documentada da TS-22. Rodei todos: confirmado.
- **Respeitou a hierarquia:** não repete regras de `error-handling`/`logging`, só referencia. Tem uma seção "O que NÃO está nesta skill" apontando para 9 skills da árvore.
- **Anti-padrões úteis:** são coisas que um agente realmente gera (`as QueryRequest` no `request.json()`, `enum Tier`, `export default` do modelo v3, `z.object` sem `.strict()`), cada uma explicando por que parece certa e o que quebra.

## Problemas encontrados na v1 e corrigidos na v2

| # | Problema | Como foi verificado | Correção |
|---|---|---|---|
| 1 | **Regra factualmente errada.** A TS-16 proibia `z.strictObject()` como "API exclusiva do Zod 4" | `node -e "typeof require('zod').z.strictObject"` → `function` no Zod **3.25.76** instalado. (`z.email` e `z.iso` → `undefined`: essa parte estava certa) | Removido da lista de proibidos e do grep. Registrado que `.strict()` é o padrão do projeto |
| 2 | **★ inventado.** A tabela marcava "o agente resolver com `declare const process: any`" como algo que *aconteceu de fato* no 2.2 | `git log -S "declare const process" --all` → nenhum resultado. No 2.2 o que aconteceu foi o erro `Cannot find name 'process'`, resolvido instalando `@types/node` | Linha reescrita. O ★ vale para o que aconteceu (falta de `@types/node`), e o `declare` aparece como tentação, sem ★ |
| 3 | **Verificação destrutiva.** A TS-20 mandava rodar `npm ci --omit=dev` no checkout de trabalho | Esse comando remove `typescript` e `vitest` do `node_modules`. Quem segue a skill quebra o próprio ambiente | Comando reescrito para rodar numa cópia temporária (`mktemp`). Testado: carrega o handler só com `dependencies`, e o ambiente local continua intacto |
| 4 | **Contradição interna.** A TS-11 dizia que "nenhuma função de validação lança", mas o DO do `loadConfig` usa `.parse()`, que lança | Leitura cruzada da regra com o exemplo. Ambos estão certos isoladamente: config precisa de fail-fast (QE-02) | TS-11 restrita a entrada de requisição, com exceção explícita para `loadConfig` |

**Lição para a manutenção da skill:** os problemas 1 e 2 são do tipo que um agente produz com **confiança**, um detalhe de API errado e uma "evidência" que não existe. Nenhum dos dois apareceria num teste. Por isso, toda afirmação factual numa skill (versão de API, "isso aconteceu", "este comando verifica X") precisa ser executada pelo revisor antes do merge.

## Propostas que ficam para o dono da skill (Tech Lead)

1. **Levar as regras mecânicas para o ESLint.** Nove regras são verificadas por grep: TS-02, 04, 05, 07, 09, 10, 13, 16 e 26. Um grep dentro de um `.md` nenhum CI aplica, e o agente não roda sozinho. O `package.json` já tem `"lint": "eslint ."`, mas o **ESLint nem está instalado**. Proposta: `typescript-eslint` com `no-explicit-any`, `consistent-type-imports`, `ban-ts-comment`, `no-non-null-assertion` e `import/no-default-export`, e a skill passa a citar a regra do ESLint no "Verificar".
2. **Tamanho.** São ~2.900 palavras (~4K tokens) carregadas em **toda** edição de `.ts`, porque a `description` ativa a skill para qualquer arquivo TypeScript. Proposta: manter no arquivo principal só as regras e os anti-padrões, e mover os exemplos DO/DON'T longos para um `typescript-conventions.examples.md` carregado sob demanda. É o mesmo raciocínio de context budget da ADR-0002, aplicado ao agente de desenvolvimento.
