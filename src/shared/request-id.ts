// Formato de id de requisição aceito para correlação entre bot/painel e API.
// Restrito para ser seguro de logar e de reutilizar como referência (ex.: queryId do feedback).
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
