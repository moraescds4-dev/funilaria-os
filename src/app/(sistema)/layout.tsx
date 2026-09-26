import { exigirSessao } from "@/lib/sessao";
import { sair } from "./actions";

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const { user } = await exigirSessao();
  const primeiroNome = user.name.split(" ")[0];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-col">
          <span className="text-base font-bold text-gray-900">Funilaria OS</span>
          <span className="text-xs text-gray-600">Olá, {primeiroNome}</span>
        </div>

        <form action={sair}>
          <button
            type="submit"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
          >
            Sair
          </button>
        </form>
      </header>

      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}