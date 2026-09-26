import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const obterSessao = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function exigirSessao() {
  const sessao = await obterSessao();

  if (!sessao) {
    redirect("/login");
  }

  return sessao;
}