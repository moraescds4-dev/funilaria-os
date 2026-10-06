import Link from "next/link";
import { exigirSessao } from "@/lib/sessao";
import { buscarOrdensPorPlaca, LIMITE_LISTA } from "@/server/consultas";
import { CampoBusca, ListaDeOS } from "../listas";

export const dynamic = "force-dynamic";

export default async function PaginaBusca(props: PageProps<"/busca">) {
  await exigirSessao();

  // /busca?placa=ADS
  const { placa } = await props.searchParams;
  const digitado = typeof placa === "string" ? placa.trim() : "";
  const ordens = digitado ? await buscarOrdensPorPlaca(digitado) : null;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/" className="text-sm text-gray-600 underline">
        ← Voltar ao quadro
      </Link>
      <h1 className="text-xl font-bold text-gray-900">Buscar por placa</h1>
      <CampoBusca valor={digitado} />

      {!digitado ? (
        <p className="text-sm text-gray-600">
          Digite a placa inteira ou só um pedaço dela. A busca inclui as OS do Arquivo.
        </p>
      ) : ordens === null ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Busca inválida. Use de 2 a 7 letras ou números da placa.
        </p>
      ) : ordens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600">
          Nenhuma OS encontrada para &quot;{digitado}&quot;.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            {ordens.length} {ordens.length === 1 ? "OS encontrada" : "OS encontradas"}
            {ordens.length === LIMITE_LISTA ? ` (mostrando as ${LIMITE_LISTA} mais recentes)` : ""}
          </p>
          <ListaDeOS ordens={ordens} />
        </>
      )}
    </section>
  );
}