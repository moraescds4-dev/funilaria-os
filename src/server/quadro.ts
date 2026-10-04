import { prisma } from "@/lib/prisma";
import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";
import { ETAPAS_DO_QUADRO } from "@/lib/fluxo-status";

/*
 * Dados do quadro de status (Fase 9.5).
 *
 * Quem chama é responsável por exigir a sessão (exigirSessao).
 */

/**
 * Por quantos dias uma OS ENTREGUE e PAGA continua no quadro.
 * Entregue e não paga fica até ser paga: é dinheiro a receber.
 */
const DIAS_ENTREGUE_NO_QUADRO = 7;

/** Só o que o cartão mostra. Valores como texto ("1850.00"). */
export type CartaoOS = {
  id: string;
  numero: number;
  placa: string;
  modelo: string;
  cor: string | null;
  cliente: string;
  statusServico: StatusServico;
  statusPagamento: StatusPagamento;
  valorOrcamento: string | null;
  valorSinal: string | null;
};

export async function listarQuadro(): Promise<CartaoOS[]> {
  const limiteEntregues = new Date(Date.now() - DIAS_ENTREGUE_NO_QUADRO * 24 * 60 * 60 * 1000);

  const ordens = await prisma.ordemServico.findMany({
    where: {
      // Só as 5 etapas do quadro: RECUSADO e CANCELADO ficam de fora.
      statusServico: { in: [...ETAPAS_DO_QUADRO] },
      // Das entregues, só as recentes ou as que ainda não foram pagas.
      OR: [
        { statusServico: { not: "ENTREGUE" } },
        { statusPagamento: { not: "PAGO" } },
        { dataEntrega: { gte: limiteEntregues } },
      ],
    },
    // Ordem de chegada: o carro que entrou primeiro aparece primeiro.
    orderBy: { dataEntrada: "asc" },
    select: {
      id: true,
      numero: true,
      statusServico: true,
      statusPagamento: true,
      valorOrcamento: true,
      valorSinal: true,
      veiculo: { select: { placa: true, modelo: true, cor: true } },
      cliente: { select: { nome: true } },
    },
  });

  return ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    placa: o.veiculo.placa,
    modelo: o.veiculo.modelo,
    cor: o.veiculo.cor,
    cliente: o.cliente.nome,
    statusServico: o.statusServico,
    statusPagamento: o.statusPagamento,
    // Decimal não atravessa para o navegador: vira texto com 2 casas.
    valorOrcamento: o.valorOrcamento?.toFixed(2) ?? null,
    valorSinal: o.valorSinal?.toFixed(2) ?? null,
  }));
}