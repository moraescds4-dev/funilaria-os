"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

export type EstadoLogin = {
  erro: string | null;
  email: string;
};

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Preencha e-mail e senha.", email };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password: senha },
      headers: await headers(),
    });
  } catch (erro) {
    if (erro instanceof APIError) {
      return { erro: "E-mail ou senha incorretos.", email };
    }
    throw erro;
  }

  redirect("/");
}