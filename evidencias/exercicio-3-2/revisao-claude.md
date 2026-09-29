<!--
Revisão gerada por uma instância nova do Claude (Claude Code headless, `claude -p`), SEM acesso a arquivos
e SEM ver a revisão própria (minha-revisao.md): rodou fora do repositório, com Read/Bash/Grep/Edit/Write desabilitados.
Entrada: o código de feedback-handler.original.ts + o resumo do AGENTS.md do enunciado. Prompt completo em prompt-revisao-claude.txt.
Saída abaixo copiada sem edição.
-->

# Revisão de código: `feedback-handler.ts` (NovaTech Assistant)

**Recomendação: não aprovar o merge.** O módulo tem 4 violações diretas do AGENTS.md, e-mail registrado em log (risco de LGPD), um endpoint sem autenticação e bugs que vão aparecer em produção sob carga.

---

### 1. Nenhuma validação de input com Zod
- **Trecho:** `const body = await request.json() as any;` e o uso direto de `body.queryId`, `body.rating`...
- **Classificação:** violação do AGENTS.md + problema de segurança
- **Severidade:** **Alta**
- **Por que é um problema:** o AGENTS.md exige Zod para validar input. Do jeito que está, o cliente pode mandar qualquer coisa: `rating: "abc"`, `rating: 9999`, `queryId: {}` ou um `comment` de vários MB (o limite do Cosmos é 2 MB por documento, e o custo em RU cresce com o tamanho). Esses dados inválidos acabam nas métricas de qualidade do RAG.
- **Correção:**
  ```ts
  const FeedbackSchema = z.object({
    queryId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
  }).strict();

  const parsed = FeedbackSchema.safeParse(await request.json());
  if (!parsed.success) return { status: 400, jsonBody: { error: 'Payload inválido' } };
  ```

### 2. Uso de `as any`
- **Trecho:** `await request.json() as any`
- **Classificação:** violação do AGENTS.md (strict mode)
- **Severidade:** Média
- **Por que é um problema:** `any` desliga o type checker para todo o fluxo. Na prática, anula o strict mode, e o objeto `feedback` inteiro vira `any`.
- **Correção:** trate o retorno como `unknown` e use o tipo inferido pelo Zod (`z.infer<typeof FeedbackSchema>`), como no item 1.

### 3. `console.log` em vez de pino
- **Trecho:** `console.log('Feedback recebido:', ...)`
- **Classificação:** violação do AGENTS.md
- **Severidade:** Média
- **Por que é um problema:** o AGENTS.md proíbe `console.log`. Ele não gera log estruturado nem traz nível ou `invocationId` para correlação no Application Insights, e foge do padrão de observabilidade do projeto.
- **Correção:** use o logger pino compartilhado do projeto, com contexto: `logger.info({ queryId, rating, invocationId: context.invocationId }, 'feedback recebido')`.

### 4. Dados pessoais no log (e-mail do atendente)
- **Trecho:** `JSON.stringify(feedback)`, que inclui `attendantEmail`
- **Classificação:** violação do AGENTS.md + problema de segurança (LGPD)
- **Severidade:** **Alta**
- **Por que é um problema:** o AGENTS.md diz explicitamente para nunca logar e-mail. Logs costumam ser retidos por muito tempo, replicados e acessados por mais gente do que o banco, então isso configura tratamento indevido de dado pessoal.
- **Correção:** registre só campos não pessoais (`queryId`, `rating`, `invocationId`). Como proteção extra, configure `redact` no pino (`redact: ['*.attendantEmail', '*.email', '*.comment']`).

### 5. Comentário em texto livre também vai para o log
- **Trecho:** `comment: body.comment` dentro do objeto que é logado
- **Classificação:** problema de segurança (LGPD)
- **Severidade:** Média
- **Por que é um problema:** num atendimento de logística, o comentário tende a trazer nome de cliente, endereço, telefone, CPF ou código de rastreio. É dado pessoal que não dá para controlar.
- **Correção:** nunca registre `comment` no log. Se precisar de alguma informação, registre apenas `hasComment: true` ou o tamanho do texto.

### 6. `require` dinâmico dentro do handler
- **Trecho:** `const { CosmosClient } = require('@azure/cosmos');`
- **Classificação:** violação do AGENTS.md
- **Severidade:** Média
- **Por que é um problema:** o AGENTS.md exige imports estáticos no topo. O `require` devolve `any`, então perde a tipagem do SDK. Também esconde a dependência da análise estática e do tree-shaking, e pode quebrar se o projeto for compilado como ESM.
- **Correção:** `import { CosmosClient } from '@azure/cosmos';` no topo do arquivo.

### 7. `CosmosClient` criado a cada requisição
- **Trecho:** `const client = new CosmosClient(...)` dentro do handler
- **Classificação:** bug potencial (performance/estabilidade)
- **Severidade:** **Alta**
- **Por que é um problema:** a Microsoft recomenda um único `CosmosClient` por aplicação (singleton). Criar um por chamada repete a descoberta de metadados e o handshake TLS e abre conexões novas. Com volume de atendimento, isso aumenta a latência e pode esgotar portas/sockets (SNAT exhaustion) no plano Consumption.
- **Correção:** instancie o client e o `container` no escopo do módulo, fora do handler, para reaproveitar entre invocações.

### 8. Variável de ambiente usada sem checagem
- **Trecho:** `new CosmosClient(process.env.COSMOS_CONNECTION_STRING)`
- **Classificação:** bug potencial + violação do AGENTS.md (strict mode, mascarada pelo `any` do `require`)
- **Severidade:** Média
- **Por que é um problema:** o tipo é `string | undefined`. Com o import estático, o strict mode rejeitaria esse código. Em runtime, se a variável faltar, a falha vira um erro pouco claro a cada request em vez de aparecer no startup.
- **Correção:** valide a configuração na inicialização (por exemplo, `z.string().min(1).parse(process.env.COSMOS_CONNECTION_STRING)`) e falhe cedo, com mensagem clara.

### 9. Autenticação por connection string (chave primária)
- **Trecho:** `COSMOS_CONNECTION_STRING`
- **Classificação:** problema de segurança
- **Severidade:** Média
- **Por que é um problema:** a connection string carrega a chave mestre da conta, com acesso total a **todos** os bancos, inclusive o índice e os dados do RAG. Se vazar, o estrago é grande, e a rotação é manual.
- **Correção:** use Managed Identity com `new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() })` e um papel RBAC de dados restrito ao container `feedbacks`. Se a chave for mantida, deixe-a no Key Vault.

### 10. Endpoint sem autenticação explícita
- **Trecho:** `app.http('feedback', { methods: ['POST'], handler })`, sem `authLevel`
- **Classificação:** problema de segurança
- **Severidade:** **Alta**
- **Por que é um problema:** no modelo v4 do Node, o padrão é `anonymous`. Qualquer pessoa na internet pode gravar feedbacks. Isso polui as métricas do assistente, gera custo de RU no Cosmos e abre espaço para spam.
- **Correção:** proteja o endpoint com Easy Auth/Entra ID ou validação de JWT (no mínimo `authLevel: 'function'`) e defina `authLevel` explicitamente. Considere rate limiting via APIM.

### 11. Identidade do atendente vem do body (spoofing)
- **Trecho:** `attendantEmail: body.attendantEmail`
- **Classificação:** problema de segurança
- **Severidade:** **Alta**
- **Por que é um problema:** o cliente escolhe em nome de quem o feedback é registrado. Um atendente pode se passar por outro, o que compromete auditoria e qualquer métrica por atendente.
- **Correção:** tire a identidade do token autenticado (claims do JWT ou header `x-ms-client-principal` do Easy Auth) e remova esse campo do schema de entrada.

### 12. E-mail persistido no documento (minimização de dados)
- **Trecho:** `attendantEmail` gravado no Cosmos
- **Classificação:** problema de segurança (LGPD)
- **Severidade:** Média
- **Por que é um problema:** para feedback basta um identificador estável. Guardar o e-mail espalha dado pessoal por mais um repositório, que depois também entra em pedidos de exclusão/portabilidade.
- **Correção:** grave o `oid`/`userId` do Entra ID em vez do e-mail.

### 13. JSON malformado gera 500 em vez de 400
- **Trecho:** `await request.json()`
- **Classificação:** bug potencial
- **Severidade:** Média
- **Por que é um problema:** `request.json()` lança exceção com body vazio ou inválido. Sem tratamento, o cliente recebe 500, e um erro do cliente aparece como falha do servidor nos alertas.
- **Correção:** envolva a chamada em `try/catch` e devolva `{ status: 400 }`.

### 14. Nenhum tratamento de erro na escrita no Cosmos
- **Trecho:** `await container.items.create(feedback);`
- **Classificação:** bug potencial
- **Severidade:** Média
- **Por que é um problema:** throttling (429), timeout ou erro de permissão sobem como exceção sem log estruturado e devolvem 500 genérico. Sem o `invocationId`, fica difícil diagnosticar.
- **Correção:** use `try/catch`, com `logger.error({ err, invocationId }, 'falha ao gravar feedback')` e `{ status: 503 }` ou `500` com mensagem genérica, sem expor detalhes internos.

### 15. Chave de partição pode vir indefinida
- **Trecho:** documento criado sem garantir o campo de partition key
- **Classificação:** bug potencial
- **Severidade:** Baixa/Média
- **Por que é um problema:** se o container `feedbacks` for particionado por `/queryId` (ou outro campo) e o valor vier ausente, o documento cai na partição "undefined". Isso gera hot partition e consultas que não encontram o registro.
- **Correção:** torne o campo de partição obrigatório no schema Zod e confira a partition key definida no IaC.

### 16. Comentário armazenado sem tratamento (XSS armazenado / prompt injection)
- **Trecho:** `comment: body.comment`
- **Classificação:** problema de segurança
- **Severidade:** Média
- **Por que é um problema:** se o comentário aparecer num dashboard, pode causar XSS armazenado. Se os feedbacks forem reaproveitados no pipeline do RAG (reranking, avaliação por LLM), viram um caminho para prompt injection.
- **Correção:** limite o tamanho no Zod e trate o campo como não confiável em quem o consome: escape na renderização e delimitação clara quando for para prompt. Documente isso no módulo.

### 17. Não verifica se o `queryId` existe ou pertence ao atendente
- **Trecho:** `queryId: body.queryId`
- **Classificação:** problema de segurança / integridade
- **Severidade:** Baixa
- **Por que é um problema:** dá para registrar feedback de consultas inexistentes ou de outras pessoas, o que distorce as avaliações do assistente.
- **Correção:** confira se a consulta existe e pertence ao usuário autenticado antes de gravar. Se isso for caro, aceite de forma consciente e documente.

### 18. Nomes de banco e container fixos no código
- **Trecho:** `client.database('novatech')`, `.container('feedbacks')`
- **Classificação:** bug potencial (configuração)
- **Severidade:** Baixa
- **Por que é um problema:** atrapalha a separação entre ambientes (dev/hml/prod) e os testes.
- **Correção:** leia de variáveis de ambiente validadas na inicialização (item 8).

### 19. Resposta HTTP pouco informativa
- **Trecho:** `return { status: 200, body: 'OK' };`
- **Classificação:** bug potencial (contrato de API)
- **Severidade:** Baixa
- **Por que é um problema:** para criação de recurso, o semântico é `201 Created`. Texto puro também não combina com o resto de uma API JSON.
- **Correção:** `return { status: 201, jsonBody: { id: resource.id } };`

### 20. Arquivo no lugar e com nome errados
- **Trecho:** `// feedback-handler.ts`
- **Classificação:** violação de convenção do projeto
- **Severidade:** Baixa
- **Por que é um problema:** o esperado é `/src/functions/feedback/handler.ts`. Fora desse caminho, o arquivo pode não ser carregado pelo glob `main` do `package.json`, e a função simplesmente não é registrada.
- **Correção:** mova o arquivo para `src/functions/feedback/handler.ts` e confirme se o padrão de `main` o inclui.

### 21. `InvocationContext` ignorado
- **Trecho:** `feedbackHandler(request: HttpRequest)`
- **Classificação:** bug potencial (observabilidade)
- **Severidade:** Baixa
- **Por que é um problema:** sem o `context`, não há `invocationId` para correlacionar logs pino com o trace do Functions.
- **Correção:** use a assinatura `(request: HttpRequest, context: InvocationContext)` e passe um child logger com o `invocationId`.

---

## Resumo

| Severidade | Itens |
|---|---|
| **Alta** | 1, 4, 7, 10, 11 |
| **Média** | 2, 3, 5, 6, 8, 9, 12, 13, 14, 16 |
| **Baixa** | 15, 17, 18, 19, 20, 21 |

**Para liberar o merge:**
- Corrigir todas as de severidade alta.
- Corrigir as 4 violações diretas do AGENTS.md: itens 1, 3, 4 e 6.
- Tratar os erros HTTP (itens 13 e 14).

As demais podem virar itens de débito técnico com prazo.
