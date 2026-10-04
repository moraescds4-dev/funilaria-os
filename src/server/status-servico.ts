import { prisma } from "@/lib/prisma";
import type { StatusServico } from "@/generated/prisma/enums";
import { podeMudarServico, ROTULO_SERVICO } from "@/lib/fluxo-status";
import { ErroDeRegra } from "@/server/erros";

/*
 * Regra de mudança do status do serviço (Fase 9.2).
 *
 * Recebe o id da OS, o status desejado e o id do usuário logado.
 * Quem chama é responsável por exigir a sessão (exigirSessao).
 *
 * Tudo acontece numa única transação: a OS só muda de status se o
 * registro no histórico também for gravado (RN05).
 */

/** O que a tela precisa saber depois da mudança. */
export type StatusAlterado = {
  numero: number;
  statusAnterior: StatusServico;
  statusNovo: StatusServico;
};

export async function mudarStatusServico(
  ordemServicoId: string,
  statusNovo: StatusServico,
  usuarioId: string,
  observacao?: string,
): Promise<StatusAlterado> {
  return prisma.$transaction(async (tx) => {
    // 1) Qual é o status atual?
    const ordem = await tx.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: { numero: true, statusServico: true },
    });
    if (!ordem) throw new ErroDeRegra("Ordem de serviço não encontrada.");

    const statusAnterior = ordem.statusServico;

    // 2) RN04 e RN07: só as transições previstas no diagrama.
    if (!podeMudarServico(statusAnterior, statusNovo)) {
      throw new ErroDeRegra(
        `Não é possível mudar de "${ROTULO_SERVICO[statusAnterior]}" ` +
          `para "${ROTULO_SERVICO[statusNovo]}".`,
      );
    }

    // 3) Grava só se o status ainda for o que acabamos de ler.
    //    Se outra pessoa mudou a OS entre o passo 1 e este, nenhuma
    //    linha é alterada (count = 0) e a mudança é recusada.
    const { count } = await tx.ordemServico.updateMany({
      where: { id: ordemServicoId, statusServico: statusAnterior },
      data: {
        statusServico: statusNovo,
        // undefined = o Prisma não mexe no campo.
        dataEntrega: statusNovo === "ENTREGUE" ? new Date() : undefined,
      },
    });
    if (count === 0) {
      throw new ErroDeRegra(
        "Esta OS acabou de ser alterada em outro aparelho. Atualize a tela e tente de novo.",
      );
    }

    // 4) RN05: o histórico entra na mesma transação.
    await tx.historicoStatus.create({
      data: { ordemServicoId, statusAnterior, statusNovo, observacao, usuarioId },
    });

    return { numero: ordem.numero, statusAnterior, statusNovo };
  });
}
  
/**
 * Desfaz a última mudança de status (botão "Corrigir").
 *
 * Volta para a etapa de onde a OS veio, descoberta pelo histórico.
 * Esta é a única operação que pode sair do diagrama de estados:
 * é uma exceção à RN04 e à RN07, decidida em 04/10/2026, para
 * corrigir enganos de quem usa o sistema.
 *
 * Nada é apagado: a correção grava uma linha nova no histórico,
 * marcada com correcao = true. Assim fica registrado que houve um
 * engano, quem corrigiu e quando.
 */
export async function corrigirStatusServico(
  ordemServicoId: string,
  usuarioId: string,
  observacao?: string,
): Promise<StatusAlterado> {
  return prisma.$transaction(async (tx) => {
    // 1) Qual é o status atual?
    const ordem = await tx.ordemServico.findUnique({
      where: { id: ordemServicoId },
      select: { numero: true, statusServico: true },
    });
    if (!ordem) throw new ErroDeRegra("Ordem de serviço não encontrada.");

    const statusAtual = ordem.statusServico;

    // 2) A linha do histórico que trouxe a OS até o status atual,
    //    ignorando as correções. Sem esse filtro, uma segunda
    //    correção seguida desfaria a primeira em vez de voltar mais.
    const origem = await tx.historicoStatus.findFirst({
      where: { ordemServicoId, statusNovo: statusAtual, correcao: false },
      orderBy: { criadoEm: "desc" },
      select: { statusAnterior: true },
    });

    // Sem origem, ou origem na criação da OS (statusAnterior vazio):
    // a OS está no início do fluxo e não há para onde voltar.
    if (!origem?.statusAnterior) {
      throw new ErroDeRegra("Esta OS está no início do fluxo. Não há o que corrigir.");
    }

    const statusDestino = origem.statusAnterior;

    // 3) Mesmo controle de concorrência da mudança normal.
    const { count } = await tx.ordemServico.updateMany({
      where: { id: ordemServicoId, statusServico: statusAtual },
      data: {
        statusServico: statusDestino,
        // Desfazer a entrega: o carro não foi retirado, a data volta a ficar vazia.
        // null = apaga o valor; undefined = não mexe no campo.
        dataEntrega: statusAtual === "ENTREGUE" ? null : undefined,
      },
    });
    if (count === 0) {
      throw new ErroDeRegra(
        "Esta OS acabou de ser alterada em outro aparelho. Atualize a tela e tente de novo.",
      );
    }

    // 4) A correção também vai para o histórico, marcada como tal.
    await tx.historicoStatus.create({
      data: {
        ordemServicoId,
        statusAnterior: statusAtual,
        statusNovo: statusDestino,
        correcao: true,
        observacao,
        usuarioId,
      },
    });

    return { numero: ordem.numero, statusAnterior: statusAtual, statusNovo: statusDestino };
  });
}
