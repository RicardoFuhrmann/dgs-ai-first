# Exercício 3.2 — Comparação: minha revisão × revisão do Claude

| | Minha revisão | Revisão do Claude |
|---|---|---|
| Arquivo | [minha-revisao.md](minha-revisao.md) (commit `a4e7bd6`, **antes** da IA) | [revisao-claude.md](revisao-claude.md) |
| Como foi feita | Leitura do código contra o AGENTS.md | Instância nova do Claude em modo headless, **sem acesso à minha revisão** nem ao repositório ([prompt](prompt-revisao-claude.txt)) |
| Nº de itens | 7 | 21 |

## 1. As 4 armadilhas obrigatórias

| Armadilha | Minha revisão | Claude |
|---|---|---|
| `as any` sem validação Zod | ✅ item 3 | ✅ itens 1 e 2 |
| `console.log` em vez de pino | ✅ item 1 | ✅ item 3 |
| `require` dinâmico | ✅ item 4 | ✅ item 6 |
| `attendantEmail` (dado pessoal) no log | ✅ item 2 | ✅ item 4 |

Ambas encontraram as 4.

## 2. Encontrados pelas duas

| Problema | Minha | Claude | Observação |
|---|---|---|---|
| `comment` também é dado pessoal e vai para o log | item 2 | item 5 | Eu cobri dentro do mesmo item do e-mail. O Claude separou em outro |
| JSON inválido e campos fora do esperado sem resposta de erro | item 6 | item 13 | |
| Falha ao gravar no Cosmos sem tratamento, sem vazar detalhes | item 6 | item 14 | |
| `novatech`/`feedbacks` fixos no código | item 5 | item 18 | O Claude deu severidade baixa |

## 3. Só eu encontrei

| Problema | Por que importa |
|---|---|
| **Ausência de testes** (item 7): feedback válido, dado inválido, falha na gravação | Nenhum dos 21 itens do Claude fala em teste. O módulo entraria sem cobertura, e o cenário diz que os testes de integração cobrem ~75% do código. É uma lacuna real da revisão por IA: ela revisou só o que estava escrito, não o que faltava no PR |

## 4. Só o Claude encontrou (e eu não)

| # Claude | Problema | Sev. | Minha avaliação |
|---|---|---|---|
| 10 | **Endpoint sem `authLevel`**: qualquer pessoa pode gravar feedback | Alta | ✅ **Real. Eu não vi.** Conferi na fonte: o padrão é `anonymous` (`@azure/functions`, `http.d.ts:59`: *"Defaults to 'anonymous'"*). Para comparar: a revisão por IA do exemplo de referência afirmava o contrário, que o padrão seria `function`. Uma das duas IAs estava errada, e só a verificação resolveu |
| 11 | **Identidade do atendente vem do body** (spoofing): qualquer um registra feedback em nome de outro | Alta | ✅ **Real e o mais importante que perdi.** Eu tratei o e-mail só como problema de *log*. O Claude viu que, antes disso, o campo não deveria vir do cliente: a identidade tem que sair do token autenticado |
| 7 | `CosmosClient` criado a cada request | Alta | ✅ Real (recomendação oficial: singleton). Eu vi o `require` dentro da função, mas não o custo de criar o client ali |
| 8 | `COSMOS_CONNECTION_STRING` sem checagem (`string \| undefined`) | Média | ✅ Real. O `require` devolve `any` e mascara o erro que o strict mode pegaria. No nosso projeto isso é a QE-02 (`loadConfig`) |
| 9 | Connection string com chave mestre em vez de Managed Identity | Média | ✅ Real. É a mesma linha da decisão B4 do 2.2 (Entra ID/MI em vez de segredo compartilhado) |
| 12 | E-mail **persistido** no Cosmos (minimização de dados) | Média | ✅ Real. Complementa o item 11 |
| 21 | `InvocationContext` ignorado, sem correlação de log | Baixa | ✅ Real. Liga com o B1 do 2.2 |
| 20 | Nome e caminho errados (`feedback-handler.ts`) não são carregados pelo `main` | Baixa | ✅ Real **neste repo**: `main` é `dist/src/functions/*/handler.js`, então o arquivo com esse nome nunca seria registrado |
| 19 | `200 'OK'` texto em vez de `201` JSON | Baixa | 🟡 Válido, mas é preferência de contrato. Não bloqueia o merge |
| 15 | Partition key indefinida | Baixa/Média | 🟡 Especulativo: depende do IaC (`infra/modules/cosmos.bicep` está vazio). O próprio Claude condiciona ("se o container for particionado por…") |
| 16 | XSS armazenado / prompt injection via `comment` | Média | 🟡 Condicional ("se aparecer num dashboard", "se for para o RAG"). O limite de tamanho no Zod vale. O resto é responsabilidade de quem consome |
| 17 | `queryId` não verificado (existe? é do atendente?) | Baixa | 🟡 Real em tese, mas exige um store de queries que não existe no projeto. O próprio Claude sugere "aceitar de forma consciente" |

## 5. O que o Claude errou ou generalizou

| Item | Problema na sugestão |
|---|---|
| 1: `queryId: z.string().uuid()` | **Não se encaixa no projeto.** O `queryId` do feedback é o `x-request-id` do query endpoint (QE-01), que aceita ids do bot que não são UUID (`/^[A-Za-z0-9-]{8,64}$/`, ex.: `teams-7f3a9c21`). Com `.uuid()`, o feedback de toda resposta do Teams seria rejeitado. O Claude não conhecia o código e aplicou o padrão genérico |
| 1: `{ error: 'Payload inválido' }` | Diverge do contrato de erro do projeto (`{ error: { code, message, details } }` em `src/shared/errors.ts`). O mesmo desconhecimento de contexto |
| 6: "pode quebrar se o projeto for compilado como ESM" | Não é "pode": o projeto **é** ESM (`"type": "module"`), então `require` nem existe em runtime e lança `ReferenceError: require is not defined`. Aqui a IA foi menos severa do que devia |

## Conclusão honesta

- **Violações do AGENTS.md:** empate. As duas revisões pegaram as 4.
- **Onde eu fui melhor:** vi o que faltava no PR (testes), e não só o que estava escrito. A IA não cobrou teste nenhum.
- **Onde o Claude foi claramente melhor:** **segurança de acesso**. Autenticação do endpoint e spoofing da identidade do atendente são os dois problemas mais graves do módulo, e eu não vi nenhum dos dois. Minha revisão foi guiada pela checklist do AGENTS.md, enquanto o Claude pensou em "quem consegue chamar isto e o que consegue forjar".
- **Onde o Claude precisou de correção:** ele não conhecia o projeto. A sugestão do `.uuid()` quebraria o fluxo do Teams, e o formato de erro fugia do padrão. Também exagerou em itens condicionais (15, 16, 17), que dependem de coisas que não existem no projeto.
- **Lição:** a revisão por IA amplia a cobertura (21 itens contra 7), mas cada item precisa ser **verificado contra o projeto**. Três dos itens do Claude (o default do `authLevel`, o `.uuid()` e o caminho do `main`) só puderam ser confirmados ou refutados olhando o código real.
