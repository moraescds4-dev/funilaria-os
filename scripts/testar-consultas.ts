/*
 * Teste da busca por placa e do Arquivo (Fases 10.5 e 10.6).
 * Uso: npx tsx scripts/testar-consultas.ts
 *
 * ATENÇÃO: grava no banco apontado pela DATABASE_URL do .env.
 * Usa só dados fictícios (placa TST5E67) e apaga tudo o que criou
 * no final, mesmo se algum passo falhar. O cenário 4 só lê.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { novaOrdemServicoSchema } from "../src/lib/validacoes/ordem-servico";
import { criarOrdemServico } from "../src/server/ordens-servico";
import { mudarStatusServico } from "../src/server/status-servico";
import { registrarPagamento } from "../src/server/pagamento";
import { condicaoDoArquivo, condicaoDoQuadro, listarQuadro } from "../src/server/quadro";
import { buscarOrdensPorPlaca, listarArquivo } from "../src/server/consultas";

const PLACA = "TST5E67";
const NOME_FICTICIO = "Cliente Teste Consultas";
const DIA = 24 * 60 * 60 * 1000;

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  if (!condicao) falhas++;
  console.log(`${condicao ? "✔" : "✘ FALHOU"}  ${descricao}`);
}

async function novaOS(usuarioId: string) {
  const dados = novaOrdemServicoSchema.parse({
    nomeCliente: NOME_FICTICIO,
    telefone: "11 97777-0000",
    placa: PLACA,
    modelo: "Carro Fictício",
    descricaoServico: "Teste automatizado de consultas",
    responsavelEhProprietario: "sim",
  });
  return criarOrdemServico(dados, usuarioId);
}

/** Leva a OS de ORCAMENTO até ENTREGUE pelo caminho normal. */
async function entregar(id: string, u: string) {
  for (const status of ["APROVADO", "EM_EXECUCAO", "PRONTO", "ENTREGUE"] as const) {
    await mudarStatusServico(id, status, u);
  }
}

async function noQuadro(numero: number) {
  return (await listarQuadro()).some((c) => c.numero === numero);
}
async function noArquivo(numero: number) {
  return (await listarArquivo()).some((o) => o.numero === numero);
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

  // 1) OS em andamento + busca
  const osA = await novaOS(u);
  console.log(`\n1) OS em andamento e busca → OS nº ${osA.numero}`);
  conferir("está no quadro e não no Arquivo", (await noQuadro(osA.numero)) && !(await noArquivo(osA.numero)));
  const achou = async (trecho: string) =>
    (await buscarOrdensPorPlaca(trecho))?.some((o) => o.numero === osA.numero) === true;
  conferir('placa inteira em minúsculas: "tst5e67"', await achou("tst5e67"));
  conferir('trecho do meio: "5E6"', await achou("5E6"));
  conferir('com espaço e hífen: "t s t-5"', await achou("t s t-5"));
  conferir(
    'trecho inválido devolve null: "X", 8 caracteres e "AB%"',
    (await buscarOrdensPorPlaca("X")) === null &&
      (await buscarOrdensPorPlaca("TST5E678")) === null &&
      (await buscarOrdensPorPlaca("AB%")) === null,
  );

  // 2) OS cancelada
  const osB = await novaOS(u);
  console.log(`\n2) OS cancelada → OS nº ${osB.numero}`);
  await mudarStatusServico(osB.id, "APROVADO", u);
  await mudarStatusServico(osB.id, "CANCELADO", u);
  conferir("sai do quadro e vai para o Arquivo", !(await noQuadro(osB.numero)) && (await noArquivo(osB.numero)));
  const busca2 = (await buscarOrdensPorPlaca(PLACA)) ?? [];
  conferir(
    "a busca encontra as duas, a mais recente primeiro",
    busca2.map((o) => o.numero).join(",") === `${osB.numero},${osA.numero}`,
  );

  // 3) Entregues: paga (recente e antiga) e não paga (antiga)
  const osC = await novaOS(u);
  console.log(`\n3) Entregues → OS nº ${osC.numero} (paga)`);
  await entregar(osC.id, u);
  await registrarPagamento(osC.id, u);
  conferir("entregue e paga há pouco: continua no quadro", (await noQuadro(osC.numero)) && !(await noArquivo(osC.numero)));
  // Simula uma entrega antiga: não dá para esperar 8 dias.
  await prisma.ordemServico.update({
    where: { id: osC.id },
    data: { dataEntrega: new Date(Date.now() - 8 * DIA) },
  });
  conferir("entregue e paga há 8 dias: vai para o Arquivo", !(await noQuadro(osC.numero)) && (await noArquivo(osC.numero)));

  const osD = await novaOS(u);
  console.log(`   → OS nº ${osD.numero} (não paga)`);
  await entregar(osD.id, u);
  await prisma.ordemServico.update({
    where: { id: osD.id },
    data: { dataEntrega: new Date(Date.now() - 30 * DIA) },
  });
  conferir(
    "entregue e não paga há 30 dias: continua no quadro (a receber)",
    (await noQuadro(osD.numero)) && !(await noArquivo(osD.numero)),
  );
  conferir(
    "a busca encontra também as arquivadas",
    (await buscarOrdensPorPlaca(PLACA))?.length === 4,
  );

  // 4) Todas as OS do banco (só leitura)
  console.log("\n4) Regra 'um lugar só' em todas as OS do banco");
  const [total, quadro, arquivo, ambos] = await Promise.all([
    prisma.ordemServico.count(),
    prisma.ordemServico.count({ where: condicaoDoQuadro() }),
    prisma.ordemServico.count({ where: condicaoDoArquivo() }),
    prisma.ordemServico.count({ where: { AND: [condicaoDoQuadro(), condicaoDoArquivo()] } }),
  ]);
  console.log(`   ${total} OS: ${quadro} no quadro + ${arquivo} no Arquivo`);
  conferir("nenhuma OS está nos dois lugares", ambos === 0);
  conferir("nenhuma OS ficou de fora dos dois", quadro + arquivo === total);
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