import Link from "next/link";
import { exigirSessao } from "@/lib/sessao";
import { LIMITE_LISTA, listarArquivo } from "@/server/consultas";
import { DIAS_ENTREGUE_NO_QUADRO } from "@/server/quadro";
import { CampoBusca, ListaDeOS } from "../listas";

export const dynamic = "force-dynamic";

export default async function PaginaArquivo() {
  await exigirSessao();

  const ordens = await listarArquivo();

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/" className="text-sm text-gray-600 underline">
        ← Voltar ao quadro
      </Link>
      <h1 className="text-xl font-bold text-gray-900">Arquivo</h1>
      <p className="text-sm text-gray-600">
        OS que saíram do quadro: entregues e pagas há mais de {DIAS_ENTREGUE_NO_QUADRO} dias,
        recusadas e canceladas. Nada é apagado: toque numa OS para ver tudo.
      </p>
      <CampoBusca />

      {ordens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600">
          Nenhuma OS no Arquivo.
        </p>
      ) : (
        <>
          {ordens.length === LIMITE_LISTA && (
            <p className="text-sm text-gray-600">
              Mostrando as {LIMITE_LISTA} mais recentes. Use a busca para encontrar as mais antigas.
            </p>
          )}
          <ListaDeOS ordens={ordens} />
        </>
      )}
    </section>
  );
}