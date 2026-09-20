import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const totalOrdens = await prisma.ordemServico.count();
  const totalClientes = await prisma.cliente.count();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Sistema de Ordens de Serviço</h1>
      <p className="text-gray-600">Terrinha e filho funilaria e pintura</p>
      <div className="mt-4 rounded border border-gray-300 p-6 text-center">
        <p>Conexão com o banco: funcionando</p>
        <p className="mt-2 text-sm text-gray-600">
          {totalClientes} clientes · {totalOrdens} ordens de serviço
        </p>
      </div>
    </main>
  );
}