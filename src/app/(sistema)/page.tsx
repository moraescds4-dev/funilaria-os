import Link from "next/link";
import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";
import { ETAPAS_DO_QUADRO, ROTULO_PAGAMENTO, ROTULO_SERVICO } from "@/lib/fluxo-status";
import { exigirSessao } from "@/lib/sessao";
import { listarQuadro, type CartaoOS } from "@/server/quadro";
import { AcoesDaOrdem } from "./acoes-da-ordem";
import { CampoBusca } from "./listas";

export const dynamic = "force-dynamic";

const COR_PAGAMENTO: Record<StatusPagamento, string> = {
  NAO_PAGO: "border-gray-300 bg-white text-gray-700",
  SINAL_PAGO: "border-amber-300 bg-amber-50 text-amber-900",
  PAGO: "border-green-300 bg-green-50 text-green-800",
};

/** Um cartão do quadro: placa em destaque (pergunta 6 da entrevista). */
function Cartao({ os }: { os: CartaoOS }) {
  // Entregue e não paga: dinheiro a receber, destacado.
  const aReceber = os.statusServico === "ENTREGUE" && os.statusPagamento !== "PAGO";

    return (
    <article className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
      {/* Dados e etiquetas levam ao detalhe. Os botões ficam fora do link:
          o HTML não permite botão dentro de link. */}
      <Link
        href={`/ordens/${os.numero}`}
        className="-m-2 flex flex-col gap-3 rounded-lg p-2 hover:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-wider text-gray-900">{os.placa}</span>
            <span className="text-sm text-gray-700">
              {os.modelo}
              {os.cor ? ` · ${os.cor}` : ""}
            </span>
            <span className="text-sm text-gray-500">{os.cliente}</span>
          </div>
          <span className="shrink-0 text-xs text-gray-500">OS nº {os.numero} ›</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${COR_PAGAMENTO[os.statusPagamento]}`}
          >
            {ROTULO_PAGAMENTO[os.statusPagamento]}
          </span>
          {aReceber && (
            <span className="rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              A receber
            </span>
          )}
        </div>
      </Link>

      <AcoesDaOrdem os={os} />
    </article>
  );
}

export default async function Inicio(props: PageProps<"/">) {
  await exigirSessao();

  const { osCriada, etapa } = await props.searchParams;

  // ?osCriada=13 chega do redirect do cadastro
  const numeroCriado =
    typeof osCriada === "string" && /^\d+$/.test(osCriada) ? osCriada : null;

  // ?etapa=PRONTO vem dos filtros. Só aceita uma das 5 etapas do quadro.
  const etapaFiltro = ETAPAS_DO_QUADRO.find((s) => s === etapa) ?? null;

  const cartoes = await listarQuadro();
  const etapasVisiveis: readonly StatusServico[] = etapaFiltro ? [etapaFiltro] : ETAPAS_DO_QUADRO;
  const quantos = (status: StatusServico) =>
    cartoes.filter((c) => c.statusServico === status).length;

  const classeFiltro = (ativo: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm ${
      ativo ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700"
    }`;

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-4">
      {numeroCriado && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          OS nº {numeroCriado} cadastrada com sucesso.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Ordens de serviço</h1>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/arquivo"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
          >
            Arquivo
          </Link>
          <Link
            href="/ordens/nova"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Nova OS
          </Link>
        </div>
      </div>

      <CampoBusca />

      {/* Filtros por etapa (wireframe 4). Rolam para o lado no celular. */}
      <nav aria-label="Filtrar por etapa" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/" aria-current={!etapaFiltro ? "page" : undefined} className={classeFiltro(!etapaFiltro)}>
          Todos ({cartoes.length})
        </Link>
        {ETAPAS_DO_QUADRO.map((status) => (
          <Link
            key={status}
            href={`/?etapa=${status}`}
            aria-current={etapaFiltro === status ? "page" : undefined}
            className={classeFiltro(etapaFiltro === status)}
          >
            {ROTULO_SERVICO[status]} ({quantos(status)})
          </Link>
        ))}
      </nav>

      {/* Colunas: uma abaixo da outra no celular, lado a lado no computador. */}
      <div
        className={`grid grid-cols-1 items-start gap-6 ${etapaFiltro ? "" : "lg:grid-cols-5 lg:gap-4"}`}
      >
        {etapasVisiveis.map((status) => {
          const daEtapa = cartoes.filter((c) => c.statusServico === status);
          return (
            <div key={status} className="flex flex-col gap-3">
              <h2 className="flex items-center justify-between text-sm font-bold uppercase tracking-wide text-gray-700">
                {ROTULO_SERVICO[status]}
                <span className="rounded-full border border-gray-300 px-2 text-xs font-semibold">
                  {daEtapa.length}
                </span>
              </h2>
              {daEtapa.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                  Nenhuma OS
                </p>
                            ) : (
                <div
                  className={
                    etapaFiltro
                      ? "grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3"
                      : "flex flex-col gap-3"
                  }
                >
                  {daEtapa.map((os) => (
                    <Cartao key={os.id} os={os} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}