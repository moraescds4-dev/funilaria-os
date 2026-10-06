import Link from "next/link";
import { notFound } from "next/navigation";
import { ROTULO_PAGAMENTO, ROTULO_SERVICO } from "@/lib/fluxo-status";
import { emReais, formatarData, formatarDataHora, formatarTelefone } from "@/lib/formatacao";
import { exigirSessao } from "@/lib/sessao";
import { obterDetalheOrdem, type EventoLinhaDoTempo } from "@/server/detalhe-ordem";

export const dynamic = "force-dynamic";

/** Frase de cada acontecimento da linha do tempo. */
function descreverEvento(e: EventoLinhaDoTempo): string {
  if (e.tipo === "servico") {
    if (e.statusAnterior === null) return `OS cadastrada em ${ROTULO_SERVICO[e.statusNovo]}`;
    if (e.correcao) {
      return `Etapa corrigida: voltou de ${ROTULO_SERVICO[e.statusAnterior]} para ${ROTULO_SERVICO[e.statusNovo]}`;
    }
    return `Etapa: ${ROTULO_SERVICO[e.statusAnterior]} → ${ROTULO_SERVICO[e.statusNovo]}`;
  }

  if (e.correcao) {
    return `Pagamento corrigido: voltou de ${ROTULO_PAGAMENTO[e.statusAnterior]} para ${ROTULO_PAGAMENTO[e.statusNovo]}`;
  }
  if (e.statusNovo === "SINAL_PAGO") {
    return `Sinal recebido${e.valorSinal ? `: ${emReais(e.valorSinal)}` : ""}`;
  }
  if (e.statusNovo === "PAGO") {
    return e.statusAnterior === "SINAL_PAGO" ? "Saldo quitado" : "Pagamento integral recebido";
  }
  return `Pagamento: ${ROTULO_PAGAMENTO[e.statusAnterior]} → ${ROTULO_PAGAMENTO[e.statusNovo]}`;
}

/** Um bloco de informações (proprietário, serviço, valores...). */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">{titulo}</h2>
      {children}
    </section>
  );
}

/** Rótulo à esquerda, valor à direita. */
function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-600">{rotulo}</span>
      <span className="text-right font-medium text-gray-900">{valor}</span>
    </div>
  );
}

export default async function PaginaDetalheOrdem(props: PageProps<"/ordens/[numero]">) {
  await exigirSessao();

  // /ordens/31. Só dígitos: "1e3", " 12" e "12abc" não viram número por engano.
  const { numero: parametro } = await props.params;
  if (!/^\d{1,10}$/.test(parametro)) notFound();

  const os = await obterDetalheOrdem(Number(parametro));
  if (!os) notFound();

  // Mais recente em cima.
  const eventos = [...os.linhaDoTempo].reverse();

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/" className="text-sm text-gray-600 underline">
        ← Voltar ao quadro
      </Link>

      {/* ── Cabeçalho ── */}
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-2xl font-bold tracking-wider text-gray-900">{os.veiculo.placa}</span>
            <span className="text-sm text-gray-700">
              {os.veiculo.modelo}
              {os.veiculo.cor ? ` · ${os.veiculo.cor}` : ""}
            </span>
          </div>
          <span className="shrink-0 text-sm text-gray-500">OS nº {os.numero}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-gray-900 bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white">
            {ROTULO_SERVICO[os.statusServico]}
          </span>
          <span className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-700">
            {ROTULO_PAGAMENTO[os.statusPagamento]}
          </span>
        </div>
      </div>

      {/* ── Pessoas ── */}
      <Bloco titulo="Proprietário">
        <Linha rotulo="Nome" valor={os.proprietario.nome} />
        <Linha rotulo="Telefone" valor={formatarTelefone(os.proprietario.telefone)} />
      </Bloco>

      <Bloco titulo="Responsável pela OS">
        {os.responsavel ? (
          <>
            <Linha rotulo="Nome" valor={os.responsavel.nome} />
            <Linha rotulo="Telefone" valor={formatarTelefone(os.responsavel.telefone)} />
          </>
        ) : (
          <p className="text-sm text-gray-700">O próprio proprietário.</p>
        )}
      </Bloco>

      {/* ── Serviço ── */}
      <Bloco titulo="Serviço">
        <p className="whitespace-pre-line text-sm text-gray-900">{os.descricaoServico}</p>
        {os.observacoes && (
          <p className="whitespace-pre-line text-sm text-gray-600">Obs.: {os.observacoes}</p>
        )}
        <Linha rotulo="Entrada" valor={formatarData(os.dataEntrada)} />
        {os.previsaoEntrega && (
          <Linha rotulo="Previsão de entrega" valor={formatarData(os.previsaoEntrega)} />
        )}
        {os.dataEntrega && <Linha rotulo="Entregue em" valor={formatarData(os.dataEntrega)} />}
      </Bloco>

      {/* ── Valores ── */}
      <Bloco titulo="Valores">
        <Linha
          rotulo="Orçamento"
          valor={os.valorOrcamento ? emReais(os.valorOrcamento) : "Não informado"}
        />
        {os.valorSinal && <Linha rotulo="Sinal" valor={emReais(os.valorSinal)} />}
        {os.saldo !== null && <Linha rotulo="Saldo a receber" valor={emReais(os.saldo)} />}
      </Bloco>

      {/* ── Linha do tempo (RF11) ── */}
      <Bloco titulo="Linha do tempo">
        <ol className="flex flex-col gap-3">
          {eventos.map((e) => (
            <li
              key={e.id}
              className={`border-l-2 pl-3 ${e.correcao ? "border-amber-400" : "border-gray-300"}`}
            >
              <p className="text-sm font-medium text-gray-900">{descreverEvento(e)}</p>
              <p className="text-xs text-gray-600">
                {formatarDataHora(e.data)} · {e.usuario}
              </p>
              {e.tipo === "servico" && e.observacao && (
                <p className="text-xs text-gray-600">{e.observacao}</p>
              )}
            </li>
          ))}
        </ol>
      </Bloco>
    </section>
  );
}