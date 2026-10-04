/*
 * Teste do sinal, do pagamento e da correção no banco (Fase 9.3).
 * Uso: npx tsx scripts/testar-pagamento.ts
 *
 * ATENÇÃO: grava no banco apontado pela DATABASE_URL do .env.
 * Usa só dados fictícios (placa TST3C45) e apaga tudo o que criou
 * no final, mesmo se algum passo falhar.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { novaOrdemServicoSchema } from "../src/lib/validacoes/ordem-servico";
import { criarOrdemServico } from "../src/server/ordens-servico";
import { mudarStatusServico } from "../src/server/status-servico";
import { corrigirPagamento, registrarPagamento, registrarSinal } from "../src/server/pagamento";
import { ErroDeRegra } from "../src/server/erros";

const PLACA = "TST3C45";
const NOME_FICTICIO = "Cliente Teste Pagamento";

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  if (!condicao) falhas++;
  console.log(`${condicao ? "✔" : "✘ FALHOU"}  ${descricao}`);
}

/** Roda a operação e devolve o ErroDeRegra lançado, ou null se não lançou. */
async function erroDe(operacao: () => Promise<unknown>): Promise<ErroDeRegra | null> {
  try {
    await operacao();
    return null;
  } catch (erro) {
    if (erro instanceof ErroDeRegra) return erro;
    throw erro; // erro inesperado: deixa o teste falhar
  }
}

/** Cria uma OS fictícia passando pelo Zod, como o formulário faz. */
async function novaOS(usuarioId: string, valorOrcamento = "") {
  const dados = novaOrdemServicoSchema.parse({
    nomeCliente: NOME_FICTICIO,
    telefone: "11 96666-6666",
    placa: PLACA,
    modelo: "Carro Fictício",
    descricaoServico: "Teste automatizado de pagamento",
    valorOrcamento,
    responsavelEhProprietario: "sim",
  });
  return criarOrdemServico(dados, usuarioId);
}

async function estadoDe(id: string) {
  return prisma.ordemServico.findUniqueOrThrow({
    where: { id },
    select: { statusServico: true, statusPagamento: true, valorSinal: true, valorOrcamento: true },
  });
}

async function historicoDe(id: string) {
  return prisma.historicoPagamento.findMany({
    where: { ordemServicoId: id },
    orderBy: { criadoEm: "asc" },
  });
}

async function limpar() {
  const veiculo = await prisma.veiculo.findUnique({ where: { placa: PLACA } });
  if (!veiculo) return;

  const ordens = await prisma.ordemServico.findMany({
    where: { veiculoId: veiculo.id },
    select: { clienteId: true },
  });
  const clientes = new Set([veiculo.clienteId, ...ordens.map((o) => o.clienteId)]);

  // Trava de segurança: só apaga se todos os donos forem o fictício.
  const donos = await prisma.cliente.findMany({
    where: { id: { in: [...clientes] } },
    select: { nome: true },
  });
  if (donos.some((d) => d.nome !== NOME_FICTICIO)) {
    throw new Error(`A placa ${PLACA} pertence a um cliente real. Nada foi apagado.`);
  }

  // Os dois históricos saem junto com a OS (Cascade).
  await prisma.ordemServico.deleteMany({ where: { veiculoId: veiculo.id } });
  await prisma.veiculo.delete({ where: { id: veiculo.id } });
  await prisma.cliente.deleteMany({ where: { id: { in: [...clientes] } } });
}

async function main() {
  const usuario = await prisma.usuario.findFirst({ select: { id: true } });
  if (!usuario) throw new Error("Nenhum usuário cadastrado.");
  const u = usuario.id;

  // Restos de uma execução anterior interrompida
  await limpar();

  // 1) Sinal com orçamento na OS
  const os1 = await novaOS(u, "1.850,00");
  console.log(`\n1) Sinal com orçamento de R$ 1.850,00 → OS nº ${os1.numero}`);
  conferir(
    "sinal maior que o orçamento é recusado (RN06)",
    (await erroDe(() => registrarSinal(os1.id, "2000.00", u))) !== null,
  );
  conferir("sinal zero é recusado (RN06)", (await erroDe(() => registrarSinal(os1.id, "0.00", u))) !== null);
  conferir(
    "nada muda após as recusas",
    (await estadoDe(os1.id)).statusPagamento === "NAO_PAGO" && (await historicoDe(os1.id)).length === 0,
  );
  const r1 = await registrarSinal(os1.id, "600.00", u);
  conferir("sinal de R$ 600,00 aceito → SINAL_PAGO", r1.statusNovo === "SINAL_PAGO");
  const e1 = await estadoDe(os1.id);
  const h1 = await historicoDe(os1.id);
  conferir(
    "valor do sinal gravado na OS e no histórico",
    e1.valorSinal?.toFixed(2) === "600.00" && h1[0]?.valorSinal?.toFixed(2) === "600.00",
  );
  conferir("não registra um segundo sinal", (await erroDe(() => registrarSinal(os1.id, "100.00", u))) !== null);

  // 2) Quitação
  console.log("\n2) Quitação");
  const r2 = await registrarPagamento(os1.id, u);
  conferir("SINAL_PAGO → PAGO", r2.statusAnterior === "SINAL_PAGO" && r2.statusNovo === "PAGO");
  conferir("o sinal continua registrado na OS", (await estadoDe(os1.id)).valorSinal?.toFixed(2) === "600.00");
  conferir("não paga duas vezes", (await erroDe(() => registrarPagamento(os1.id, u))) !== null);

  // 3) Correções seguidas
  console.log("\n3) Correções seguidas");
  const c1 = await corrigirPagamento(os1.id, u);
  conferir(
    "1ª: PAGO volta para SINAL_PAGO, sinal mantido",
    c1.statusNovo === "SINAL_PAGO" && (await estadoDe(os1.id)).valorSinal?.toFixed(2) === "600.00",
  );
  const c2 = await corrigirPagamento(os1.id, u);
  conferir(
    "2ª: SINAL_PAGO volta para NAO_PAGO, sinal apagado da OS",
    c2.statusNovo === "NAO_PAGO" && (await estadoDe(os1.id)).valorSinal === null,
  );
  conferir("em NAO_PAGO não há o que corrigir", (await erroDe(() => corrigirPagamento(os1.id, u))) !== null);
  const h3 = await historicoDe(os1.id);
  conferir("nada foi apagado: 2 linhas originais + 2 correções", h3.length === 4);
  conferir(
    "o histórico ainda guarda o sinal de R$ 600,00, e as correções estão marcadas",
    h3[0].valorSinal?.toFixed(2) === "600.00" && h3[2].correcao && h3[3].correcao,
  );

  // 4) Pagamento integral, sem sinal
  console.log("\n4) Pagamento integral, sem sinal");
  const r4 = await registrarPagamento(os1.id, u);
  conferir(
    "NAO_PAGO → PAGO direto, sem valor de sinal",
    r4.statusAnterior === "NAO_PAGO" && (await estadoDe(os1.id)).valorSinal === null,
  );
  const c4 = await corrigirPagamento(os1.id, u);
  conferir("a correção volta para NAO_PAGO", c4.statusNovo === "NAO_PAGO");

  // 5) OS sem orçamento (decisão B)
  const os2 = await novaOS(u);
  console.log(`\n5) OS sem orçamento → OS nº ${os2.numero}`);
  conferir(
    "sinal sem orçamento é recusado",
    (await erroDe(() => registrarSinal(os2.id, "300.00", u))) !== null,
  );
  await registrarSinal(os2.id, "300.00", u, "1000.00");
  const e5 = await estadoDe(os2.id);
  conferir(
    "com orçamento informado: aceito, e o orçamento fica na OS",
    e5.statusPagamento === "SINAL_PAGO" &&
      e5.valorSinal?.toFixed(2) === "300.00" &&
      e5.valorOrcamento?.toFixed(2) === "1000.00",
  );
  await corrigirPagamento(os2.id, u);
  conferir(
    "corrigir o sinal não apaga o orçamento",
    (await estadoDe(os2.id)).valorOrcamento?.toFixed(2) === "1000.00",
  );
  await registrarSinal(os2.id, "1000.00", u);
  conferir("sinal igual ao orçamento é aceito", (await estadoDe(os2.id)).statusPagamento === "SINAL_PAGO");

  // 6) Independência entre serviço e pagamento (RN02 e RN03)
  console.log("\n6) Independência entre serviço e pagamento");
  conferir(
    "sinal e pagamento não mudam o status do serviço",
    (await estadoDe(os1.id)).statusServico === "ORCAMENTO" &&
      (await estadoDe(os2.id)).statusServico === "ORCAMENTO",
  );
  for (const status of ["APROVADO", "EM_EXECUCAO", "PRONTO", "ENTREGUE"] as const) {
    await mudarStatusServico(os2.id, status, u);
  }
  const e6 = await estadoDe(os2.id);
  conferir(
    "RN03: OS ENTREGUE continua com o pagamento como estava",
    e6.statusServico === "ENTREGUE" && e6.statusPagamento === "SINAL_PAGO",
  );

  // 7) Dois aparelhos ao mesmo tempo
  console.log("\n7) Dois aparelhos ao mesmo tempo");
  const resultados = await Promise.allSettled([
    registrarPagamento(os2.id, u),
    registrarPagamento(os2.id, u),
  ]);
  const aceitos = resultados.filter((r) => r.status === "fulfilled").length;
  const recusados = resultados.filter(
    (r) => r.status === "rejected" && r.reason instanceof ErroDeRegra,
  ).length;
  conferir("só um dos dois pagamentos é aceito", aceitos === 1 && recusados === 1);
  const h7 = await historicoDe(os2.id);
  conferir("o histórico ganha uma linha só", h7.filter((h) => h.statusNovo === "PAGO").length === 1);

  // 8) OS inexistente
  console.log("\n8) OS inexistente");
  const erros = await Promise.all([
    erroDe(() => registrarSinal("nao-existe", "100.00", u)),
    erroDe(() => registrarPagamento("nao-existe", u)),
    erroDe(() => corrigirPagamento("nao-existe", u)),
  ]);
  conferir("sinal, pagamento e correção recusam uma OS que não existe", erros.every((e) => e !== null));
}

main()
  .catch((erro) => {
    falhas++;
    console.error("\nErro inesperado:", erro);
  })
  .finally(async () => {
    await limpar();
    const sobrou = await prisma.veiculo.count({ where: { placa: PLACA } });
    console.log(`\nLimpeza: ${sobrou === 0 ? "dados de teste apagados" : "ATENÇÃO, sobrou dado de teste"}`);
    console.log(falhas === 0 ? "\nTodas as verificações conferem." : `\n${falhas} verificação(ões) falharam.`);
    await prisma.$disconnect();
  });