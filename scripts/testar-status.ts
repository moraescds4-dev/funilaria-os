/*
 * Teste da mudança e da correção de status no banco (Fase 9.2).
 * Uso: npx tsx scripts/testar-status.ts
 *
 * ATENÇÃO: grava no banco apontado pela DATABASE_URL do .env.
 * Usa só dados fictícios (placa TST2B34) e apaga tudo o que criou
 * no final, mesmo se algum passo falhar.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { novaOrdemServicoSchema } from "../src/lib/validacoes/ordem-servico";
import { criarOrdemServico } from "../src/server/ordens-servico";
import { corrigirStatusServico, mudarStatusServico } from "../src/server/status-servico";
import { ErroDeRegra } from "../src/server/erros";

const PLACA = "TST2B34";
const NOME_FICTICIO = "Cliente Teste Status";

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
async function novaOS(usuarioId: string) {
  const dados = novaOrdemServicoSchema.parse({
    nomeCliente: NOME_FICTICIO,
    telefone: "11 95555-5555",
    placa: PLACA,
    modelo: "Carro Fictício",
    descricaoServico: "Teste automatizado de status",
    responsavelEhProprietario: "sim",
  });
  return criarOrdemServico(dados, usuarioId);
}

async function statusDe(id: string) {
  return prisma.ordemServico.findUniqueOrThrow({
    where: { id },
    select: { statusServico: true, dataEntrega: true },
  });
}

async function historicoDe(id: string) {
  return prisma.historicoStatus.findMany({
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

  // Restos de uma execução anterior interrompida
  await limpar();

  // 1) Caminho principal
  const os1 = await novaOS(usuario.id);
  console.log(`\n1) Caminho principal → OS nº ${os1.numero}`);
  for (const status of ["APROVADO", "EM_EXECUCAO", "PRONTO", "ENTREGUE"] as const) {
    await mudarStatusServico(os1.id, status, usuario.id);
  }
  const s1 = await statusDe(os1.id);
  conferir("termina em ENTREGUE", s1.statusServico === "ENTREGUE");
  conferir("preenche a data de entrega", s1.dataEntrega !== null);
  const h1 = await historicoDe(os1.id);
  conferir(
    "histórico com 5 linhas, na ordem (criação + 4 mudanças)",
    h1.map((h) => h.statusNovo).join(",") === "ORCAMENTO,APROVADO,EM_EXECUCAO,PRONTO,ENTREGUE",
  );
  conferir(
    "cada linha guarda de onde a OS veio",
    h1.slice(1).every((h, i) => h.statusAnterior === h1[i].statusNovo),
  );
  conferir(
    "todas com o usuário e sem marca de correção",
    h1.every((h) => h.usuarioId === usuario.id && !h.correcao),
  );

  // 2) Correções seguidas
  console.log("\n2) Correções seguidas");
  const c1 = await corrigirStatusServico(os1.id, usuario.id);
  conferir("ENTREGUE volta para PRONTO", c1.statusNovo === "PRONTO");
  conferir("a data de entrega volta a ficar vazia", (await statusDe(os1.id)).dataEntrega === null);
  const c2 = await corrigirStatusServico(os1.id, usuario.id);
  conferir("2ª correção: PRONTO volta para EM_EXECUCAO (não desfaz a 1ª)", c2.statusNovo === "EM_EXECUCAO");
  const c3 = await corrigirStatusServico(os1.id, usuario.id);
  const c4 = await corrigirStatusServico(os1.id, usuario.id);
  conferir(
    "3ª e 4ª: EM_EXECUCAO → APROVADO → ORCAMENTO",
    c3.statusNovo === "APROVADO" && c4.statusNovo === "ORCAMENTO",
  );
  const erroInicio = await erroDe(() => corrigirStatusServico(os1.id, usuario.id));
  conferir("em ORCAMENTO não há o que corrigir", erroInicio !== null);
  const h2 = await historicoDe(os1.id);
  conferir("nada foi apagado: 5 linhas originais + 4 correções", h2.length === 9);
  conferir("as 4 linhas novas estão marcadas como correção", h2.slice(5).every((h) => h.correcao));

  // 3) Avançar depois de corrigir
  console.log("\n3) Avançar depois de corrigir");
  await mudarStatusServico(os1.id, "APROVADO", usuario.id);
  conferir("ORCAMENTO avança de novo para APROVADO", (await statusDe(os1.id)).statusServico === "APROVADO");
  const c5 = await corrigirStatusServico(os1.id, usuario.id);
  conferir("e a correção volta para ORCAMENTO", c5.statusNovo === "ORCAMENTO");

  // 4) Transições proibidas
  const os2 = await novaOS(usuario.id);
  console.log(`\n4) Transições proibidas → OS nº ${os2.numero}`);
  const erroPulo = await erroDe(() => mudarStatusServico(os2.id, "EM_EXECUCAO", usuario.id));
  conferir("ORCAMENTO → EM_EXECUCAO é recusado", erroPulo !== null);
  conferir(
    "status e histórico não mudam após a recusa",
    (await statusDe(os2.id)).statusServico === "ORCAMENTO" && (await historicoDe(os2.id)).length === 1,
  );
  await mudarStatusServico(os2.id, "RECUSADO", usuario.id);
  const erroRn07 = await erroDe(() => mudarStatusServico(os2.id, "APROVADO", usuario.id));
  conferir("RN07: RECUSADO → APROVADO é recusado", erroRn07 !== null);
  const c6 = await corrigirStatusServico(os2.id, usuario.id);
  conferir("mas a correção desfaz o RECUSADO (volta para ORCAMENTO)", c6.statusNovo === "ORCAMENTO");

  // 5) Dois aparelhos ao mesmo tempo
  console.log("\n5) Dois aparelhos ao mesmo tempo");
  const resultados = await Promise.allSettled([
    mudarStatusServico(os2.id, "APROVADO", usuario.id),
    mudarStatusServico(os2.id, "APROVADO", usuario.id),
  ]);
  const aceitas = resultados.filter((r) => r.status === "fulfilled").length;
  const recusadas = resultados.filter(
    (r) => r.status === "rejected" && r.reason instanceof ErroDeRegra,
  ).length;
  conferir("só uma das duas mudanças é aceita", aceitas === 1 && recusadas === 1);
  const h5 = await historicoDe(os2.id);
  conferir("o histórico ganha uma linha só", h5.filter((h) => h.statusNovo === "APROVADO").length === 1);

  // 6) OS inexistente
  console.log("\n6) OS inexistente");
  conferir(
    "recusa mudar uma OS que não existe",
    (await erroDe(() => mudarStatusServico("nao-existe", "APROVADO", usuario.id))) !== null,
  );
  conferir(
    "recusa corrigir uma OS que não existe",
    (await erroDe(() => corrigirStatusServico("nao-existe", usuario.id))) !== null,
  );
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