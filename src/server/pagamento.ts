import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";
import { aceitaPagamentoNovo, podeMudarPagamento, ROTULO_PAGAMENTO, ROTULO_SERVICO, SERVICO_SEM_PAGAMENTO_NOVO, } from "@/lib/fluxo-status";
import { ErroDeRegra } from "@/server/erros";

/*
 * Regras da situação de pagamento (Fase 9.3).
 *
 * Independentes do status do serviço (RN02 e RN03): uma OS pode estar
 * ENTREGUE e NAO_PAGO. Exceção (06/10/2026): OS recusada ou cancelada
 * não aceita pagamento novo. A correção do pagamento continua permitida.
 *
 * Os valores chegam como texto decimal já validado pelo Zod
 * ("600.00"), como o valorOrcamento do cadastro, e viram Decimal
 * para as contas: nunca passam por number, para não perder centavos.
 *
 * Quem chama é responsável por exigir a sessão (exigirSessao).
/

/** Exceção de 06/10: OS recusada ou cancelada não recebe pagamento novo. */
function exigirServicoQueAceitaPagamento(statusServico: StatusServico) {
  if (!aceitaPagamentoNovo(statusServico)) {
    throw new ErroDeRegra(
      `Esta OS está como "${ROTULO_SERVICO[statusServico]}" e não aceita pagamento. ` +
        "Se foi engano, corrija a etapa primeiro.",
    );
  }
}
/** O que a tela precisa saber depois da mudança. */
export type PagamentoAlterado = {
  numero: number;
  statusAnterior: StatusPagamento;
  statusNovo: StatusPagamento;
};

/** Decimal → "R$ 1.850,00". Só para exibir na mensagem, nunca para contas. */
function emReais(valor: Prisma.Decimal): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    valor.toNumber(),
  );
}

/**
 * Registra o sinal pago pelo cliente (NAO_PAGO → SINAL_PAGO).
 *
 * RN06: o sinal deve ser maior que zero e não pode passar do
 * orçamento. Se a OS ainda não tem orçamento, ele precisa ser
 * informado agora (valorOrcamentoInformado) e fica gravado na OS.
 */
export async function registrarSinal(
  ordemServicoId: string,
  valorSinal: string,
  usuarioId: string,
  valorOrcamentoInformado?: string,
): Promise<PagamentoAlterado> {
  return prisma.$transaction(async (tx) => {
    // 1) Situação atual da OS
    const ordem = await tx.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: { numero: true, statusPagamento: true, valorOrcamento: true, statusServico: true },
    });
    if (!ordem) throw new ErroDeRegra("Ordem de serviço não encontrada.");
    exigirServicoQueAceitaPagamento(ordem.statusServico);

    const statusAnterior = ordem.statusPagamento;

    // 2) Só a partir de NAO_PAGO (tabela do 9.1)
    if (!podeMudarPagamento(statusAnterior, "SINAL_PAGO")) {
      throw new ErroDeRegra(
        `Não é possível registrar sinal: a OS já está como "${ROTULO_PAGAMENTO[statusAnterior]}".`,
      );
    }

    // 3) RN06 precisa de um orçamento para comparar.
    //    O da OS tem prioridade; o informado só vale se a OS não tiver.
    const orcamento =
      ordem.valorOrcamento ??
      (valorOrcamentoInformado ? new Prisma.Decimal(valorOrcamentoInformado) : null);
    if (!orcamento) {
      throw new ErroDeRegra("Informe o valor do orçamento antes de registrar o sinal.");
    }

    const sinal = new Prisma.Decimal(valorSinal);
    if (sinal.lte(0)) {
      throw new ErroDeRegra("O sinal deve ser maior que zero.");
    }
    if (sinal.gt(orcamento)) {
      throw new ErroDeRegra(`O sinal não pode passar do orçamento (${emReais(orcamento)}).`);
    }

    // 4) Grava só se a situação ainda for a que lemos (concorrência).
    const { count } = await tx.ordemServico.updateMany({
      where: {
        id: ordemServicoId,
        statusPagamento: statusAnterior,
        // Se a OS for cancelada em outro aparelho nesse meio-tempo, não grava.
        statusServico: { notIn: [...SERVICO_SEM_PAGAMENTO_NOVO] },
      },
      data: {
        statusPagamento: "SINAL_PAGO",
        valorSinal: sinal,
        // undefined = não mexe: a OS já tinha orçamento.
        valorOrcamento: ordem.valorOrcamento ? undefined : orcamento,
      },
    });
    if (count === 0) {
      throw new ErroDeRegra(
        "Esta OS acabou de ser alterada em outro aparelho. Atualize a tela e tente de novo.",
      );
    }

    // 5) Histórico na mesma transação, com o valor informado.
    await tx.historicoPagamento.create({
      data: {
        ordemServicoId,
        statusAnterior,
        statusNovo: "SINAL_PAGO",
        valorSinal: sinal,
        usuarioId,
      },
    });

    return { numero: ordem.numero, statusAnterior, statusNovo: "SINAL_PAGO" };
  });
}


/**
 * Registra o pagamento completo (→ PAGO).
 *
 * Vale para os dois caminhos do diagrama: quitar o saldo depois do
 * sinal (SINAL_PAGO → PAGO) ou pagar tudo de uma vez, sem sinal
 * (NAO_PAGO → PAGO). Não pede valor: o saldo é calculado pela tela
 * (orçamento − sinal).
 */
export async function registrarPagamento(
  ordemServicoId: string,
  usuarioId: string,
): Promise<PagamentoAlterado> {
  return prisma.$transaction(async (tx) => {
    const ordem = await tx.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: { numero: true, statusPagamento: true, statusServico: true },
    });
    if (!ordem) throw new ErroDeRegra("Ordem de serviço não encontrada.");
    exigirServicoQueAceitaPagamento(ordem.statusServico);

    const statusAnterior = ordem.statusPagamento;
    if (!podeMudarPagamento(statusAnterior, "PAGO")) {
      throw new ErroDeRegra("Esta OS já está paga.");
    }

    const { count } = await tx.ordemServico.updateMany({
      where: {
        id: ordemServicoId,
        statusPagamento: statusAnterior,
        statusServico: { notIn: [...SERVICO_SEM_PAGAMENTO_NOVO] },
      },
      data: { statusPagamento: "PAGO" },
    });
    if (count === 0) {
      throw new ErroDeRegra(
        "Esta OS acabou de ser alterada em outro aparelho. Atualize a tela e tente de novo.",
      );
    }

    await tx.historicoPagamento.create({
      data: { ordemServicoId, statusAnterior, statusNovo: "PAGO", usuarioId },
    });

    return { numero: ordem.numero, statusAnterior, statusNovo: "PAGO" };
  });
}
/**
 * Desfaz a última mudança do pagamento (botão "Corrigir").
 *
 * Mesma lógica da correção do status do serviço: volta para a
 * situação de onde o pagamento veio, descoberta pelo histórico
 * (ignorando as correções), e grava uma linha nova marcada com
 * correcao = true. Nada é apagado.
 */
export async function corrigirPagamento(
  ordemServicoId: string,
  usuarioId: string,
): Promise<PagamentoAlterado> {
  return prisma.$transaction(async (tx) => {
    const ordem = await tx.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: { numero: true, statusPagamento: true },
    });
    if (!ordem) throw new ErroDeRegra("Ordem de serviço não encontrada.");

    const statusAtual = ordem.statusPagamento;

    // A linha que trouxe o pagamento até a situação atual.
    // NAO_PAGO inicial não tem linha: a OS já nasce assim.
    const origem = await tx.historicoPagamento.findFirst({
      where: { ordemServicoId, statusNovo: statusAtual, correcao: false },
      orderBy: { criadoEm: "desc" },
      select: { statusAnterior: true },
    });
    if (!origem) {
      throw new ErroDeRegra("Não há pagamento registrado para corrigir.");
    }

    const statusDestino = origem.statusAnterior;

    const { count } = await tx.ordemServico.updateMany({
      where: { id: ordemServicoId, statusPagamento: statusAtual },
      data: {
        statusPagamento: statusDestino,
        // Desfazer o sinal apaga o valor da OS; o histórico guarda o que foi informado.
        // Desfazer o PAGO mantém o sinal que já existia.
        valorSinal: statusAtual === "SINAL_PAGO" ? null : undefined,
      },
    });
    if (count === 0) {
      throw new ErroDeRegra(
        "Esta OS acabou de ser alterada em outro aparelho. Atualize a tela e tente de novo.",
      );
    }

    await tx.historicoPagamento.create({
      data: {
        ordemServicoId,
        statusAnterior: statusAtual,
        statusNovo: statusDestino,
        correcao: true,
        usuarioId,
      },
    });

    return { numero: ordem.numero, statusAnterior: statusAtual, statusNovo: statusDestino };
  });
}