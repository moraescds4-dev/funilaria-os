import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  // 1. Banco de dados: usa o mesmo Prisma Client do resto da aplicação
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // 2. Forma de login: e-mail e senha, sem autocadastro
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },

  // 3. Mapeamento para o nosso modelo Usuario
  user: {
    modelName: "usuario",
    fields: {
      name: "nome",
      emailVerified: "emailVerificado",
      image: "imagem",
      createdAt: "criadoEm",
      updatedAt: "atualizadoEm",
    },
    additionalFields: {
      papel: {
        type: ["ADMIN", "OPERADOR"],
        required: false,
        defaultValue: "OPERADOR",
        input: false,
      },
    },
  },

  // 4. Sessão: dura 7 dias e é renovada a cada 24 horas de uso
  session: {
    modelName: "sessao",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  // 5. Demais tabelas com nomes em português
  account: { modelName: "conta" },
  verification: { modelName: "verificacao" },

  // 6. Integração com o Next.js (deve ser sempre o último plugin)
  plugins: [nextCookies()],
});

export type Sessao = typeof auth.$Infer.Session;