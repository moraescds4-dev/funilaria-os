"use client";

import { startTransition, useActionState, useState } from "react";
import type { StatusServico } from "@/generated/prisma/enums";
import { proximaEtapa, ROTULO_SERVICO } from "@/lib/fluxo-status";
import type { CartaoOS } from "@/server/quadro";
import {
  corrigirPagamentoAction,
  corrigirStatusAction,
  mudarStatusAction,
  registrarPagamentoAction,
  registrarSinalAction,
  type EstadoAcao,
} from "./ordens/actions";

/**
 * Só o que as ações usam. O quadro passa o cartão inteiro; a tela de
 * detalhe monta este objeto a partir dos dados dela.
 */
export type DadosAcoes = Pick<
  CartaoOS,
  "id" | "placa" | "statusServico" | "statusPagamento" | "valorOrcamento" | "valorSinal"
>;

const estadoInicial: EstadoAcao = { sucesso: null, erro: null, erros: {} };

type Acao = (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;

const classeBotaoPrincipal =
  "w-full rounded-lg bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60";
const classeBotaoSecundario =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 disabled:opacity-60";
const classeCampo =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-gray-900 focus:outline-none";

/** "1850.00" → "R$ 1.850,00". Só para exibir. */
function emReais(texto: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(texto),
  );
}

/** Saldo em centavos inteiros: "1850.00" − "600.00" → "1250.00", sem arredondamento. */
function saldo(orcamento: string, sinal: string): string {
  const centavos = (texto: string) => Number(texto.replace(".", ""));
  return ((centavos(orcamento) - centavos(sinal)) / 100).toFixed(2);
}

/** Mensagem de sucesso ou de erro devolvida pela action. */
function Mensagem({ estado }: { estado: EstadoAcao }) {
  if (estado.erro) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso) {
    return (
      <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

/**
 * Um botão = um formulário com a action e os campos ocultos.
 * Se `confirmar` vier preenchido, pergunta antes de enviar.
 */
function BotaoAcao({
  acao,
  ordemServicoId,
  campos = {},
  rotulo,
  confirmar,
  principal = false,
}: {
  acao: Acao;
  ordemServicoId: string;
  campos?: Record<string, string>;
  rotulo: string;
  confirmar?: string;
  principal?: boolean;
}) {
  const [estado, executar, enviando] = useActionState(acao, estadoInicial);

  return (
    <form
      action={executar}
      onSubmit={(evento) => {
        // Mesmo padrão do cadastro (02/10): envio manual, sem a limpeza do React 19.
        evento.preventDefault();
        if (confirmar && !window.confirm(confirmar)) return;
        const dados = new FormData(evento.currentTarget);
        startTransition(() => executar(dados));
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="ordemServicoId" value={ordemServicoId} />
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <button
        type="submit"
        disabled={enviando}
        className={principal ? classeBotaoPrincipal : classeBotaoSecundario}
      >
        {enviando ? "Salvando..." : rotulo}
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

/** Botão que abre o formulário do sinal. Pede o orçamento se a OS não tiver (decisão B). */
function FormularioSinal({ os }: { os: DadosAcoes }) {
  const [aberto, setAberto] = useState(false);
  const [estado, executar, enviando] = useActionState(registrarSinalAction, estadoInicial);
  const e = estado.erros;

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={classeBotaoSecundario}>
        Registrar sinal
      </button>
    );
  }

  return (
    <form
      action={executar}
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        startTransition(() => executar(dados));
      }}
      className="flex flex-col gap-3 rounded-lg border border-gray-300 bg-gray-50 p-3"
    >
      <input type="hidden" name="ordemServicoId" value={os.id} />

      {!os.valorOrcamento && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`orcamento-${os.id}`} className="text-sm font-medium text-gray-700">
            Valor do orçamento
          </label>
          <p className="text-xs text-gray-600">
            Esta OS ainda não tem orçamento. O sinal não pode passar dele.
          </p>
          <input
            id={`orcamento-${os.id}`}
            name="valorOrcamento"
            inputMode="decimal"
            placeholder="1.500,00"
            className={classeCampo}
          />
          {e.valorOrcamento?.[0] && <p className="text-sm text-red-700">{e.valorOrcamento[0]}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`sinal-${os.id}`} className="text-sm font-medium text-gray-700">
          Valor do sinal
        </label>
        {os.valorOrcamento && (
          <p className="text-xs text-gray-600">Orçamento: {emReais(os.valorOrcamento)}</p>
        )}
        <input
          id={`sinal-${os.id}`}
          name="valorSinal"
          inputMode="decimal"
          placeholder="600,00"
          className={classeCampo}
        />
        {e.valorSinal?.[0] && <p className="text-sm text-red-700">{e.valorSinal[0]}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={enviando} className={classeBotaoPrincipal}>
          {enviando ? "Salvando..." : "Salvar sinal"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className={classeBotaoSecundario}
        >
          Fechar
        </button>
      </div>
      <Mensagem estado={estado} />
    </form>
  );
}

/** Todas as ações de uma OS no quadro. */
export function AcoesDaOrdem({ os }: { os: DadosAcoes }) {
  const proxima = proximaEtapa(os.statusServico);

  // Encerrar a OS: recusar (só no orçamento) ou cancelar (aprovado ou em execução).
  const encerrar: { status: StatusServico; rotulo: string } | null =
    os.statusServico === "ORCAMENTO"
      ? { status: "RECUSADO", rotulo: "Cliente recusou" }
      : os.statusServico === "APROVADO" || os.statusServico === "EM_EXECUCAO"
        ? { status: "CANCELADO", rotulo: "Cancelar serviço" }
        : null;

  return (
    <div className="flex flex-col gap-2">
      {proxima && (
        <BotaoAcao
          acao={mudarStatusAction}
          ordemServicoId={os.id}
          campos={{ statusNovo: proxima }}
          rotulo={`Avançar → ${ROTULO_SERVICO[proxima]}`}
          principal
        />
      )}

      <details className="rounded-lg">
        <summary className="cursor-pointer py-1 text-sm text-gray-600">Mais ações</summary>

        <div className="mt-2 flex flex-col gap-3">
          {/* ── Etapa do serviço ── */}
          {encerrar && (
            <BotaoAcao
              acao={mudarStatusAction}
              ordemServicoId={os.id}
              campos={{ statusNovo: encerrar.status }}
              rotulo={encerrar.rotulo}
              confirmar={`Marcar a OS ${os.placa} como ${ROTULO_SERVICO[encerrar.status]}? Ela sai do quadro.`}
            />
          )}
          {os.statusServico !== "ORCAMENTO" && (
            <BotaoAcao
              acao={corrigirStatusAction}
              ordemServicoId={os.id}
              rotulo="Corrigir etapa (voltar)"
              confirmar={`Desfazer a última mudança de etapa da OS ${os.placa}?`}
            />
          )}

          {/* ── Pagamento ── */}
          {os.statusPagamento === "NAO_PAGO" && (
            <>
              <FormularioSinal os={os} />
              <BotaoAcao
                acao={registrarPagamentoAction}
                ordemServicoId={os.id}
                rotulo="Pagamento integral"
                confirmar={`Registrar o pagamento integral da OS ${os.placa}${
                  os.valorOrcamento ? ` (${emReais(os.valorOrcamento)})` : ""
                }?`}
              />
            </>
          )}
          {os.statusPagamento === "SINAL_PAGO" && (
            <BotaoAcao
              acao={registrarPagamentoAction}
              ordemServicoId={os.id}
              rotulo={`Quitar saldo${
                os.valorOrcamento && os.valorSinal
                  ? ` (${emReais(saldo(os.valorOrcamento, os.valorSinal))})`
                  : ""
              }`}
              confirmar={`Registrar a quitação do saldo da OS ${os.placa}?`}
            />
          )}
          {os.statusPagamento !== "NAO_PAGO" && (
            <BotaoAcao
              acao={corrigirPagamentoAction}
              ordemServicoId={os.id}
              rotulo="Corrigir pagamento"
              confirmar={`Desfazer o último registro de pagamento da OS ${os.placa}?`}
            />
          )}
        </div>
      </details>
    </div>
  );
}