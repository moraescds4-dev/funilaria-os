import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** 1 → "1 cliente"; 2 → "2 clientes" */
function contar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

export default async function Inicio(props: PageProps<"/">) {
  await exigirSessao();

  // ?osCriada=13 chega do redirect da Server Action
  const { osCriada } = await props.searchParams;
  const numeroCriado =
    typeof osCriada === "string" && /^\d+$/.test(osCriada) ? osCriada : null;

  const [totalClientes, totalOrdens] = await Promise.all([
    prisma.cliente.count(),
    prisma.ordemServico.count(),
  ]);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4">
      {numeroCriado && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          OS nº {numeroCriado} cadastrada com sucesso.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Ordens de serviço</h1>
        <Link
          href="/ordens/nova"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Nova OS
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">
          {contar(totalClientes, "cliente", "clientes")} ·{" "}
          {contar(totalOrdens, "ordem de serviço", "ordens de serviço")}
        </p>
      </div>
    </section>
  );
}