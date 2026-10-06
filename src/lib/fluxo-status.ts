import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";

/*
 * Fluxo de status da ordem de serviço (Fase 9.1).
 *
 * Tradução direta do diagrama de estados da Tarefa 3 (seção 8.3).
 * O servidor usa estas tabelas para validar cada mudança (RN04) e a
 * tela usa as mesmas tabelas para decidir quais botões mostrar.
 *
 * Não acessa o banco: pode ser importado no servidor e no navegador.
 *
 * Serviço e pagamento são independentes (RN02 e RN03): uma OS pode ser
 * ENTREGUE e NAO_PAGO. Única exceção, no fim do arquivo: OS recusada ou
 * cancelada não aceita pagamento novo (decisão de 06/10/2026).
/

// ── Status do serviço ───────────────────────────────────────

/** Caminho principal, em ordem. Também são as colunas do quadro. */
export const ETAPAS_DO_QUADRO: readonly StatusServico[] = [
  "ORCAMENTO",
  "APROVADO",
  "EM_EXECUCAO",
  "PRONTO",
  "ENTREGUE",
];

/** Para cada status, os status para os quais ele pode ir. */
export const TRANSICOES_SERVICO: Record<StatusServico, readonly StatusServico[]> = {
  ORCAMENTO: ["APROVADO", "RECUSADO"], // cliente aprova ou não aprova
  APROVADO: ["EM_EXECUCAO", "CANCELADO"], // começa ou desiste
  EM_EXECUCAO: ["PRONTO", "CANCELADO"], // termina ou desiste
  PRONTO: ["ENTREGUE"], // cliente retira
  ENTREGUE: [], // fim do fluxo
  RECUSADO: [], // RN07: não aceita novas transições
  CANCELADO: [], // RN07: não aceita novas transições
};

/** A mudança de `atual` para `novo` está prevista no diagrama? */
export function podeMudarServico(atual: StatusServico, novo: StatusServico): boolean {
  return TRANSICOES_SERVICO[atual].includes(novo);
}

/**
 * Próxima etapa do caminho principal (botão "Avançar").
 * Devolve null em ENTREGUE, RECUSADO e CANCELADO.
 */
export function proximaEtapa(atual: StatusServico): StatusServico | null {
  const indice = ETAPAS_DO_QUADRO.indexOf(atual);
  if (indice === -1 || indice === ETAPAS_DO_QUADRO.length - 1) return null;

  const proxima = ETAPAS_DO_QUADRO[indice + 1];
  // Garantia extra: nunca oferecer algo que o servidor recusaria.
  return podeMudarServico(atual, proxima) ? proxima : null;
}

/** Status que não muda mais: fim do fluxo ou RN07. */
export function ehStatusFinal(status: StatusServico): boolean {
  return TRANSICOES_SERVICO[status].length === 0;
}

// ── Situação do pagamento ───────────────────────────────────

export const TRANSICOES_PAGAMENTO: Record<StatusPagamento, readonly StatusPagamento[]> = {
  NAO_PAGO: ["SINAL_PAGO", "PAGO"], // PAGO direto = pagamento integral, sem sinal
  SINAL_PAGO: ["PAGO"],
  PAGO: [],
};

export function podeMudarPagamento(atual: StatusPagamento, novo: StatusPagamento): boolean {
  return TRANSICOES_PAGAMENTO[atual].includes(novo);
}

// ── Rótulos para a tela ─────────────────────────────────────

export const ROTULO_SERVICO: Record<StatusServico, string> = {
  ORCAMENTO: "Orçamento",
  APROVADO: "Aprovado",
  EM_EXECUCAO: "Em execução",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
};

export const ROTULO_PAGAMENTO: Record<StatusPagamento, string> = {
  NAO_PAGO: "Não pago",
  SINAL_PAGO: "Sinal pago",
  PAGO: "Pago",
};


// ── Exceção à independência (decisão de 06/10/2026) ─────────

/**
 * OS recusada ou cancelada não aceita pagamento NOVO (sinal, integral
 * ou quitação). Corrigir o pagamento continua permitido, para desfazer
 * um sinal registrado antes do cancelamento.
 */
export const SERVICO_SEM_PAGAMENTO_NOVO: readonly StatusServico[] = ["RECUSADO", "CANCELADO"];

export function aceitaPagamentoNovo(statusServico: StatusServico): boolean {
  return !SERVICO_SEM_PAGAMENTO_NOVO.includes(statusServico);
}