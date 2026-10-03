import Form from "next/form";
import Link from "next/link";
import { exigirSessao } from "@/lib/sessao";
import { normalizarPlaca, PADRAO_PLACA } from "@/lib/validacoes/ordem-servico";
import { buscarVeiculoPorPlaca } from "@/server/veiculos";
import { FormularioNovaOrdem } from "./formulario-nova-ordem";

export const dynamic = "force-dynamic";

/** "11987654321" → "(11) 98765-4321" */
function formatarTelefone(digitos: string): string {
  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);
  const corte = numero.length === 9 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

export default async function PaginaNovaOrdem(props: PageProps<"/ordens/nova">) {
  await exigirSessao();

  // ?placa=... vem do formulário da etapa 1
  const { placa: parametro } = await props.searchParams;
  const placaDigitada = typeof parametro === "string" ? parametro : "";
  const placa = normalizarPlaca(placaDigitada);

  // ── Etapa 1: pedir a placa ─────────────────────────────────
  if (!PADRAO_PLACA.test(placa)) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-xl font-bold text-gray-900">Nova ordem de serviço</h1>
        <p className="text-sm text-gray-600">Comece pela placa do veículo.</p>

        <Form action="/ordens/nova" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="placa" className="text-sm font-medium text-gray-700">
              Placa
            </label>
            <input
              id="placa"
              name="placa"
              required
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="ABC1D23"
              defaultValue={placaDigitada}
              className="rounded-lg border border-gray-300 px-3 py-3 text-base uppercase focus:border-gray-900 focus:outline-none"
            />
          </div>

          {placaDigitada && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Placa inválida. Use o formato ABC1234 ou ABC1D23.
            </p>
          )}

          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-3 text-base font-semibold text-white"
          >
            Continuar
          </button>
        </Form>

        <Link href="/" className="text-center text-sm text-gray-600 underline">
          Voltar
        </Link>
      </section>
    );
  }

  // ── Etapa 2: placa válida, buscar no cadastro ──────────────
  const veiculo = await buscarVeiculoPorPlaca(placa);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-900">Nova ordem de serviço</h1>

      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col">
          <span className="text-xs text-gray-600">Placa</span>
          <span className="text-lg font-bold tracking-wider text-gray-900">{placa}</span>
        </div>
        <Link href="/ordens/nova" className="text-sm text-gray-600 underline">
          Trocar placa
        </Link>
      </div>

      {veiculo ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <p className="mb-2 font-semibold text-gray-900">Veículo já cadastrado</p>
          <p>
            {veiculo.modelo}
            {veiculo.cor ? ` · ${veiculo.cor}` : ""}
          </p>
          <p>Proprietário: {veiculo.proprietario.nome}</p>
          <p>Telefone: {formatarTelefone(veiculo.proprietario.telefone)}</p>
        </div>
      ) : (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          Placa nova: preencha os dados do veículo e do proprietário.
        </p>
      )}

      <FormularioNovaOrdem
        placa={placa}
        veiculo={veiculo}
        telefoneProprietario={veiculo ? formatarTelefone(veiculo.proprietario.telefone) : ""}
      />
    </section>
  );
}