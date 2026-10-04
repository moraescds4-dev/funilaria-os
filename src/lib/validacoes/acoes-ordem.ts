import { z } from "zod";
import { StatusServico } from "@/generated/prisma/enums";
import { valorEmReaisObrigatorio, valorEmReaisOpcional } from "@/lib/validacoes/ordem-servico";

/*
 * Validação do que os botões da OS enviam (Fase 9.4).
 *
 * Os botões ficam no navegador, que pode ser manipulado: tudo é
 * validado aqui, no servidor (RNF05). Se a transição é permitida,
 * quem decide são as regras em src/server/, não este arquivo.
 */

const ordemServicoId = z
  .string({ error: "OS não informada." })
  .min(1, "OS não informada.");

/** Corrigir status, registrar pagamento, corrigir pagamento. */
export const acaoNaOrdemSchema = z.object({ ordemServicoId });

/** Avançar, recusar, cancelar. */
export const mudarStatusSchema = z.object({
  ordemServicoId,
  statusNovo: z.enum(StatusServico, { error: "Status inválido." }),
});

/** Registrar sinal. O orçamento só é pedido quando a OS não tem (decisão B). */
export const registrarSinalSchema = z.object({
  ordemServicoId,
  valorSinal: valorEmReaisObrigatorio,
  valorOrcamento: valorEmReaisOpcional,
});