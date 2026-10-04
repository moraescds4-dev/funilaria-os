/*
 * Teste das tabelas de transição (Fase 9.1).
 * Uso: npx tsx scripts/testar-fluxo-status.ts
 *
 * Não acessa o banco. Os casos foram escritos a partir do diagrama
 * de estados da Tarefa 3, e não copiados da tabela do código.
 * Os mesmos casos vão virar testes automatizados com Vitest.
 */
import {
  ETAPAS_DO_QUADRO,
  TRANSICOES_SERVICO,
  ehStatusFinal,
  podeMudarPagamento,
  podeMudarServico,
  proximaEtapa,
} from "../src/lib/fluxo-status";
import type { StatusPagamento, StatusServico } from "../src/generated/prisma/enums";

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  if (!condicao) falhas++;
  console.log(`${condicao ? "✔" : "✘ FALHOU"}  ${descricao}`);
}

// Tabela impressa, para comparar a olho com o diagrama
console.log("Transições permitidas do serviço:");
for (const [de, para] of Object.entries(TRANSICOES_SERVICO)) {
  console.log(`  ${de.padEnd(12)} → ${para.length ? para.join(", ") : "(nenhuma)"}`);
}

// [de, para, deve permitir?, motivo]
const casosServico: [StatusServico, StatusServico, boolean, string][] = [
  ["ORCAMENTO", "APROVADO", true, "cliente aprova o orçamento"],
  ["ORCAMENTO", "RECUSADO", true, "cliente não aprova"],
  ["APROVADO", "EM_EXECUCAO", true, "começa o serviço"],
  ["APROVADO", "CANCELADO", true, "desistência antes de começar"],
  ["EM_EXECUCAO", "PRONTO", true, "serviço concluído"],
  ["EM_EXECUCAO", "CANCELADO", true, "desistência durante o serviço"],
  ["PRONTO", "ENTREGUE", true, "cliente retira o veículo"],
  ["ORCAMENTO", "EM_EXECUCAO", false, "não pula a aprovação"],
  ["ORCAMENTO", "CANCELADO", false, "orçamento não aprovado é RECUSADO"],
  ["APROVADO", "PRONTO", false, "não pula a execução"],
  ["EM_EXECUCAO", "APROVADO", false, "não volta etapa"],
  ["PRONTO", "EM_EXECUCAO", false, "não volta etapa"],
  ["PRONTO", "CANCELADO", false, "não está no diagrama"],
  ["ENTREGUE", "PRONTO", false, "ENTREGUE é o fim do fluxo"],
  ["RECUSADO", "APROVADO", false, "RN07: recusado não muda mais"],
  ["CANCELADO", "EM_EXECUCAO", false, "RN07: cancelado não muda mais"],
  ["APROVADO", "APROVADO", false, "não muda para o mesmo status"],
];

console.log("\n1) Transições do serviço (RN04)");
for (const [de, para, esperado, motivo] of casosServico) {
  const resultado = podeMudarServico(de, para);
  conferir(
    `${de} → ${para}: ${esperado ? "permitido" : "recusado"} (${motivo})`,
    resultado === esperado,
  );
}

console.log("\n2) Botão Avançar");
conferir("ORCAMENTO avança para APROVADO", proximaEtapa("ORCAMENTO") === "APROVADO");
conferir("APROVADO avança para EM_EXECUCAO", proximaEtapa("APROVADO") === "EM_EXECUCAO");
conferir("EM_EXECUCAO avança para PRONTO", proximaEtapa("EM_EXECUCAO") === "PRONTO");
conferir("PRONTO avança para ENTREGUE", proximaEtapa("PRONTO") === "ENTREGUE");
conferir(
  "ENTREGUE, RECUSADO e CANCELADO não têm Avançar",
  proximaEtapa("ENTREGUE") === null &&
    proximaEtapa("RECUSADO") === null &&
    proximaEtapa("CANCELADO") === null,
);

console.log("\n3) Status finais (RN07)");
const finais: StatusServico[] = ["ENTREGUE", "RECUSADO", "CANCELADO"];
const emAndamento: StatusServico[] = ["ORCAMENTO", "APROVADO", "EM_EXECUCAO", "PRONTO"];
conferir("ENTREGUE, RECUSADO e CANCELADO são finais", finais.every((s) => ehStatusFinal(s)));
conferir("os demais não são finais", emAndamento.every((s) => !ehStatusFinal(s)));

console.log("\n4) Colunas do quadro");
conferir(
  "as 5 colunas do wireframe, na ordem",
  ETAPAS_DO_QUADRO.join(",") === "ORCAMENTO,APROVADO,EM_EXECUCAO,PRONTO,ENTREGUE",
);

const casosPagamento: [StatusPagamento, StatusPagamento, boolean, string][] = [
  ["NAO_PAGO", "SINAL_PAGO", true, "cliente paga o sinal"],
  ["NAO_PAGO", "PAGO", true, "pagamento integral, sem sinal"],
  ["SINAL_PAGO", "PAGO", true, "cliente quita o saldo"],
  ["SINAL_PAGO", "NAO_PAGO", false, "não desfaz pagamento"],
  ["PAGO", "SINAL_PAGO", false, "não desfaz pagamento"],
  ["PAGO", "NAO_PAGO", false, "não desfaz pagamento"],
];

console.log("\n5) Situação do pagamento (independente do serviço)");
for (const [de, para, esperado, motivo] of casosPagamento) {
  const resultado = podeMudarPagamento(de, para);
  conferir(
    `${de} → ${para}: ${esperado ? "permitido" : "recusado"} (${motivo})`,
    resultado === esperado,
  );
}

const total = casosServico.length + 5 + 2 + 1 + casosPagamento.length;
console.log(
  falhas === 0
    ? `\nTodas as ${total} verificações conferem.`
    : `\n${falhas} de ${total} verificação(ões) falharam.`,
);