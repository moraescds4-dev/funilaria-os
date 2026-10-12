import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";
import { ETAPAS_DO_QUADRO } from "@/lib/fluxo-status";

/*
 * Dados do quadro de status (Fase 9.5) e regra do que fica nele.
 *
 * Quadro e Arquivo (Fase 10.6) são exatamente um o contrário do outro:
 * toda OS está em um, e só um, dos dois. As duas condições ficam aqui,
 * lado a lado, e o teste confere isso em todas as OS do banco.
 *
 * Quem chama é responsável por exigir a sessão (exigirSessao).
 */

/**
 * Por quantos dias uma OS ENTREGUE e PAGA continua no quadro.
 * Entregue e não paga fica até ser paga: é dinheiro a receber.
 */
export const DIAS_ENTREGUE_NO_QUADRO = 7;

function limiteEntregues(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_ENTREGUE_NO_QUADRO * 24 * 60 * 60 * 1000);
}

/** OS que aparecem no quadro. */
export function condicaoDoQuadro(agora = new Date()): Prisma.OrdemServicoWhereInput {
  return {
    // Só as 5 etapas do quadro: RECUSADO e CANCELADO ficam de fora.
    statusServico: { in: [...ETAPAS_DO_QUADRO] },
    // Das entregues, só as recentes ou as que ainda não foram pagas.
    OR: [
      { statusServico: { not: "ENTREGUE" } },
      { statusPagamento: { not: "PAGO" } },
      { dataEntrega: { gte: limiteEntregues(agora) } },
    ],
  };
}

/**
 * OS que saíram do quadro: o contrário exato de condicaoDoQuadro.
 * Escrita por extenso (e não como NOT) porque, no SQL, comparar com
 * dataEntrega vazia não dá verdadeiro nem falso: com NOT, uma OS
 * assim sumiria das duas telas.
 */
export function condicaoDoArquivo(agora = new Date()): Prisma.OrdemServicoWhereInput {
  return {
    OR: [
      // Recusadas e canceladas (tudo o que não é etapa do quadro).
      { statusServico: { notIn: [...ETAPAS_DO_QUADRO] } },
      // Entregues e pagas há mais tempo que o prazo (ou sem data, por segurança).
      {
        statusServico: "ENTREGUE",
        statusPagamento: "PAGO",
        OR: [{ dataEntrega: { lt: limiteEntregues(agora) } }, { dataEntrega: null }],
      },
    ],
  };
}

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
  const ordens = await prisma.ordemServico.findMany({
    where: condicaoDoQuadro(),
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