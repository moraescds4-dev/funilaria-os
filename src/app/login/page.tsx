import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { FormularioLogin } from "./formulario-login";

export default async function PaginaLogin() {
  const sessao = await auth.api.getSession({ headers: await headers() });

  if (sessao) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Funilaria OS</h1>
        <p className="mb-6 text-sm text-gray-600">Entre para acessar as ordens de serviço.</p>
        <FormularioLogin />
      </div>
    </main>
  );
}