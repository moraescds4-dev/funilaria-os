import Form from "next/form";
import Link from "next/link";
import { ROTULO_PAGAMENTO, ROTULO_SERVICO } from "@/lib/fluxo-status";
import { formatarData } from "@/lib/formatacao";
import type { ItemListaOS } from "@/server/consultas";

/*
 * Peças das telas de lista (Fases 10.5 e 10.6): quadro, busca e Arquivo.
 */

/** Campo de busca por placa. Formulário GET: o termo fica na URL (/busca?placa=...). */
export function CampoBusca({ valor = "" }: { valor?: string }) {
  return (
    <Form action="/busca" role="search" className="flex gap-2">
      <label htmlFor="busca-placa" className="sr-only">
        Buscar por placa
      </label>
      <input
        id="busca-placa"
        name="placa"
        defaultValue={valor}
        placeholder="Buscar placa (ex.: ADS ou 3R2)"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={9}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base uppercase placeholder:normal-case focus:border-gray-900 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg border border-gray-900 bg-white px-4 py-2 text-sm font-semibold text-gray-900"
      >
        Buscar
      </button>
    </Form>
  );
}

/** Lista de OS. Cada linha abre o detalhe. */
export function ListaDeOS({ ordens }: { ordens: ItemListaOS[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {ordens.map((os) => (
        <li key={os.numero}>
          <Link
            href={`/ordens/${os.numero}`}
            className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-lg font-bold tracking-wider text-gray-900">{os.placa}</span>
              <span className="text-sm text-gray-700">
                {os.modelo}
                {os.cor ? ` · ${os.cor}` : ""}
              </span>
              <span className="truncate text-sm text-gray-500">{os.cliente}</span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <span className="text-xs text-gray-500">OS nº {os.numero} ›</span>
              <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                {ROTULO_SERVICO[os.statusServico]}
              </span>
              <span className="text-xs text-gray-600">{ROTULO_PAGAMENTO[os.statusPagamento]}</span>
              <span className="text-xs text-gray-500">
                {os.dataEntrega
                  ? `Entregue em ${formatarData(os.dataEntrega)}`
                  : `Entrada em ${formatarData(os.dataEntrada)}`}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}