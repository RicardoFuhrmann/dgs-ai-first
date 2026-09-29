CODE REVIEW feedback-handler.ts
Pontos pra ajustar
1. [Violação do AGENTS.md] Trocar o console.log pelo pino. Vamos manter o padrão de logs do projeto, em vez de cada handler fazer de um jeito.
2. [Segurança · também viola o AGENTS.md] Não jogar o feedback inteiro no log. Esse objeto tem o e-mail do usuário, e o comentário também pode conter dados pessoais. Melhor registrar só o necessário pra acompanhar a operação.
3. [Violação do AGENTS.md · também é segurança] Validar o body com Zod antes de usar os dados. O as any não valida nada, só deixa o TypeScript aceitar o acesso aos campos. Hoje estamos pegando o que chega na requisição e mandando direto pro banco.
4. [Violação do AGENTS.md] Levar a importação do Cosmos pro topo. O require('@azure/cosmos') está dentro da função, misturado com o processamento do feedback. Melhor organizar essa dependência junto dos outros imports.
5. [Bug potencial] Tirar os nomes fixos de dentro do handler. novatech e feedbacks poderiam ficar em constantes ou na configuração, em vez de ficarem espalhados na implementação.
6. [Bug potencial] Definir como responder quando der erro. Só temos o caminho de sucesso. Falta tratar situações como JSON inválido, campos fora do esperado e falha ao salvar no Cosmos, sem devolver detalhes internos pro usuário.
7. [Qualidade — fora das 3 categorias do enunciado] Garantir os testes desse fluxo. Precisamos cobrir pelo menos o feedback válido, a rejeição de dados inválidos e a falha na gravação. Não basta testar só o retorno OK.

---
> Nota de transparência: os 7 itens e o texto de cada um são a revisão própria, feita antes de qualquer análise por IA. As etiquetas de classificação entre colchetes foram acrescentadas depois, pelo Claude Code, a pedido do autor, sem adicionar nem alterar nenhum problema.
