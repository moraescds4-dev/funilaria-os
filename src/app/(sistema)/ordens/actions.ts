"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { ROTULO_PAGAMENTO, ROTULO_SERVICO } from "@/lib/fluxo-status";
import {
  acaoNaOrdemSchema,
  mudarStatusSchema,
  registrarSinalSchema,
} from "@/lib/validacoes/acoes-ordem";
import { ErroDeRegra } from "@/server/erros";
import { corrigirStatusServico, mudarStatusServico } from "@/server/status-servico";
import { corrigirPagamento, registrarPagamento, registrarSinal } from "@/server/pagamento";

/** O que a tela recebe de volta depois de cada ação. */
export type EstadoAcao = {
  /** Mensagem de sucesso, ex.: "OS nº 12: Pronto → Entregue." */
  sucesso: string | null;
  /** Mensagem geral de erro, exibida perto do botão. */
  erro: string | null;
  /** Erros por campo (só no formulário do sinal). */
  erros: Record<string, string[] | undefined>;
};

/** Formulário com dados inválidos. */
function invalido(erro: z.ZodError): EstadoAcao {
  return {
    sucesso: null,
    erro: "Confira os campos destacados.",
    erros: z.flattenError(erro).fieldErrors,
  };
}

/**
 * Roda a regra e traduz o resultado para a tela.
 * ErroDeRegra: a mensagem foi escrita para o usuário e vai para a tela.
 * Qualquer outro erro: mensagem genérica na tela, detalhe no log.
 */
async function executar<T>(
  operacao: () => Promise<T>,
  mensagemSucesso: (resultado: T) => string,
): Promise<EstadoAcao> {
  try {
    const resultado = await operacao();
    // Atualiza todas as telas do sistema que mostram OS (quadro e detalhe).
    revalidatePath("/", "layout");
    return { sucesso: mensagemSucesso(resultado), erro: null, erros: {} };
  } catch (erro) {
    if (erro instanceof ErroDeRegra) {
      return { sucesso: null, erro: erro.message, erros: {} };
    }
    console.error("Erro na ação da OS:", erro);
    return { sucesso: null, erro: "Não foi possível salvar. Tente novamente.", erros: {} };
  }
}

// ── Status do serviço ───────────────────────────────────────

export async function mudarStatusAction(
  _estadoAnterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const { user } = await exigirSessao();

  const resultado = mudarStatusSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) return invalido(resultado.error);
  const { ordemServicoId, statusNovo } = resultado.data;

  return executar(
    () => mudarStatusServico(ordemServicoId, statusNovo, user.id),
    (s) => `OS nº ${s.numero}: ${ROTULO_SERVICO[s.statusAnterior]} → ${ROTULO_SERVICO[s.statusNovo]}.`,
  );
}

export async function corrigirStatusAction(
  _estadoAnterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const { user } = await exigirSessao();

  const resultado = acaoNaOrdemSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) return invalido(resultado.error);
  const { ordemServicoId } = resultado.data;

  return executar(
    () => corrigirStatusServico(ordemServicoId, user.id),
    (s) =>
      `OS nº ${s.numero} corrigida: voltou de ${ROTULO_SERVICO[s.statusAnterior]} ` +
      `para ${ROTULO_SERVICO[s.statusNovo]}.`,
  );
}

// ── Pagamento ───────────────────────────────────────────────

export async function registrarSinalAction(
  _estadoAnterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const { user } = await exigirSessao();

  const resultado = registrarSinalSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) return invalido(resultado.error);
  const { ordemServicoId, valorSinal, valorOrcamento } = resultado.data;

  return executar(
    () => registrarSinal(ordemServicoId, valorSinal, user.id, valorOrcamento),
    (p) => `OS nº ${p.numero}: sinal registrado.`,
  );
}

export async function registrarPagamentoAction(
  _estadoAnterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const { user } = await exigirSessao();

  const resultado = acaoNaOrdemSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) return invalido(resultado.error);
  const { ordemServicoId } = resultado.data;

  return executar(
    () => registrarPagamento(ordemServicoId, user.id),
    (p) => `OS nº ${p.numero}: pagamento registrado.`,
  );
}

export async function corrigirPagamentoAction(
  _estadoAnterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const { user } = await exigirSessao();

  const resultado = acaoNaOrdemSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) return invalido(resultado.error);
  const { ordemServicoId } = resultado.data;

  return executar(
    () => corrigirPagamento(ordemServicoId, user.id),
    (p) =>
      `OS nº ${p.numero} corrigida: pagamento voltou de ${ROTULO_PAGAMENTO[p.statusAnterior]} ` +
      `para ${ROTULO_PAGAMENTO[p.statusNovo]}.`,
  );
}