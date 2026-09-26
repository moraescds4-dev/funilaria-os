import { prisma } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  await exigirSessao();

  const [totalClientes, totalOrdens] = await Promise.all([
    prisma.cliente.count(),
    prisma.ordemServico.count(),
  ]);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-900">Ordens de serviço</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">
          {totalClientes} clientes · {totalOrdens} ordens de serviço
        </p>
      </div>
    </section>
  );
}