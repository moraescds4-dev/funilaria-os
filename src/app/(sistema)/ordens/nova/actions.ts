"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { exigirSessao } from "@/lib/sessao";
import { novaOrdemServicoSchema } from "@/lib/validacoes/ordem-servico";
import { criarOrdemServico } from "@/server/ordens-servico";

/** O que a tela recebe de volta quando o cadastro não pode ser salvo. */
export type EstadoNovaOrdem = {
  /** Mensagens de erro por campo, ex.: { placa: ["Placa inválida..."] } */
  erros: Record<string, string[] | undefined>;
  /** Mensagem geral, exibida no topo do formulário. */
  mensagem: string | null;
  /** O que foi digitado, para preencher o formulário de novo. */
  valores: Record<string, string>;
};

export async function cadastrarOrdemServico(
  _estadoAnterior: EstadoNovaOrdem,
  formData: FormData,
): Promise<EstadoNovaOrdem> {
  // 1) Só usuário logado. A sessão vem do banco, nunca do formulário.
  const { user } = await exigirSessao();

  // 2) Copia só os campos de texto do formulário.
  const valores: Record<string, string> = {};
  for (const [campo, valor] of formData.entries()) {
    if (typeof valor === "string" && !campo.startsWith("$ACTION")) {
      valores[campo] = valor;
    }
  }

  // 3) Valida e normaliza com o schema da 8.1.
  const resultado = novaOrdemServicoSchema.safeParse(valores);
  if (!resultado.success) {
    return {
      erros: z.flattenError(resultado.error).fieldErrors,
      mensagem: "Confira os campos destacados.",
      valores,
    };
  }

  // 4) Grava. Erros do banco viram mensagem amigável.
  let numero: number;
  try {
    const ordem = await criarOrdemServico(resultado.data, user.id);
    numero = ordem.numero;
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      return {
        erros: {},
        mensagem:
          "Esta placa acabou de ser cadastrada. Envie de novo para usar o cadastro existente.",
        valores,
      };
    }
    console.error("Erro ao cadastrar OS:", erro);
    return {
      erros: {},
      mensagem: "Não foi possível salvar a OS. Tente novamente.",
      valores,
    };
  }

  // 5) Sucesso: atualiza a tela inicial e vai para ela.
  revalidatePath("/");
  redirect(`/?osCriada=${numero}`);
}