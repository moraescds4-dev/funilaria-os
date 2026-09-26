# ADR 0001 — Autenticação com Better Auth

- **Status:** aceita
- **Data:** 26/09/2026
- **Fase:** 7 — Autenticação

## Contexto

O sistema guarda dados pessoais de clientes da oficina (nome, telefone, placa),
e a regra RN09 exige que somente usuários autenticados vejam ou alterem qualquer
dado. Na entrevista (pergunta 13), o responsável informou que apenas ele e o
filho usarão o sistema, principalmente pelo celular (pergunta 12), e que o uso
precisa ser mais rápido que o caderno (pergunta 18).

Requisitos envolvidos: RF01 (login por e-mail e senha), RNF04 (senha com hash),
RNF05 (validação no servidor), RNF08 (custo zero) e RN09.

## Decisão

Usar a biblioteca **Better Auth 1.7.6** (versão fixada), com o adapter oficial
do Prisma e o banco PostgreSQL já existente no Neon.

Configuração adotada:

1. **Login por e-mail e senha, sem autocadastro** (`disableSignUp: true`).
   Usuários são criados por um script de terminal (`npm run usuario:criar`),
   que lê a senha sem exibi-la e nunca a grava em arquivo.
2. **Senhas com hash scrypt**, armazenadas na tabela `Conta`, separada de
   `Usuario`. O mesmo usuário poderia ter outras formas de login no futuro.
3. **Nomes dos modelos em português** (`Usuario`, `Sessao`, `Conta`,
   `Verificacao`), mapeados por `modelName`. Os campos das três tabelas técnicas
   mantêm os nomes em inglês esperados pela biblioteca.
4. **Campo `papel` protegido** com `input: false`: não pode ser enviado por
   requisição, só alterado no banco.
5. **Sessão de 7 dias, renovada a cada 24 horas de uso**, para que o
   responsável não precise digitar a senha a todo momento no celular.
6. **Proteção em duas camadas:**
   - `src/proxy.ts` faz uma checagem rápida da existência do cookie e redireciona
     visitantes para `/login`;
   - `exigirSessao()` valida a sessão no banco em cada página e Server Action.
     O proxy é apenas otimista; a segurança real está na segunda camada.
7. **Login e logout por Server Actions**, com mensagem de erro genérica
   ("E-mail ou senha incorretos") para evitar a enumeração de usuários.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| **Auth.js (NextAuth)** | Desde setembro de 2025 o projeto passou a ser mantido pela equipe do Better Auth, que recomenda o Better Auth para projetos novos. |
| **Clerk / Auth0** | Serviços externos: os dados dos usuários ficariam fora do banco do projeto, e os planos gratuitos têm limites e dependência de terceiros. Contraria o objetivo de demonstrar o back-end escrito no próprio projeto. |
| **Implementação própria** | Hash, sessões, cookies e proteção CSRF são fáceis de errar. Uma biblioteca mantida e auditada reduz o risco. |

## Consequências

**Positivas**

- As tabelas de autenticação ficam no mesmo banco e no mesmo schema Prisma do
  restante do sistema, com migração versionada.
- Hash de senha, sessão, cookies e proteção CSRF ficam a cargo de uma biblioteca
  mantida e testada.
- Nenhuma senha aparece no código, no repositório ou no histórico do terminal.

**Negativas e cuidados**

- **Não usar o gerador `npx auth generate`.** Em teste, ele acrescentou
  `@@map("usuario")` ao modelo existente, o que renomearia a tabela no banco.
  As mudanças no schema foram escritas à mão.
- **No Prisma 7, rodar `npx prisma generate` depois de todo `migrate dev`.**
  O Better Auth verifica o schema pelo Prisma Client gerado. Com o client
  desatualizado, a aplicação falha na inicialização com `SCHEMA_MISMATCH`.
- A variável `BETTER_AUTH_URL` só está definida em produção; nos deploys de
  preview, a biblioteca usa o endereço da própria requisição e registra um aviso.
- Desenvolvimento e produção usam chaves `BETTER_AUTH_SECRET` diferentes.

## Referências

- Documentação do Better Auth — adapter Prisma e integração com Next.js
- Anúncio "Auth.js is now part of Better Auth" (blog do Better Auth)
- Levantamento de Requisitos — Tarefa 3: RF01, RNF04, RNF05, RNF08, RN09