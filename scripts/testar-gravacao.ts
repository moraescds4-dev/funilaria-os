/*
 * Teste da regra de gravação da nova OS (Fase 8.2).
 * Uso: npx tsx scripts/testar-gravacao.ts
 *
 * ATENÇÃO: grava no banco apontado pela DATABASE_URL do .env.
 * Usa só dados fictícios (placa TST1A23) e apaga tudo o que criou
 * no final, mesmo se algum passo falhar.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { novaOrdemServicoSchema } from "../src/lib/validacoes/ordem-servico";
import { criarOrdemServico } from "../src/server/ordens-servico";

const PLACA = "TST1A23";
const NOMES_FICTICIOS = ["Dono Antigo", "Dono Novo"];

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  if (!condicao) falhas++;
  console.log(`${condicao ? "✔" : "✘ FALHOU"}  ${descricao}`);
}

/** Simula o formulário: passa pelo Zod, como a Server Action fará. */
function formulario(campos: Record<string, string>) {
  return novaOrdemServicoSchema.parse({
    placa: "tst-1a23",
    modelo: "Carro Fictício",
    descricaoServico: "Teste automatizado",
    responsavelEhProprietario: "sim",
    ...campos,
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

  // Trava de segurança: só apaga se todos os donos forem os fictícios
  // deste teste. Se a placa for de um cliente real, nada é apagado.
  const donos = await prisma.cliente.findMany({
    where: { id: { in: [...clientes] } },
    select: { nome: true },
  });
  if (donos.some((d) => !NOMES_FICTICIOS.includes(d.nome))) {
    throw new Error(`A placa ${PLACA} pertence a um cliente real. Nada foi apagado.`);
  }

  // Ordem importa: o histórico sai junto com a OS (Cascade);
  // veículo e cliente têm Restrict e só podem sair depois.
  await prisma.ordemServico.deleteMany({ where: { veiculoId: veiculo.id } });
  await prisma.veiculo.delete({ where: { id: veiculo.id } });
  await prisma.cliente.deleteMany({ where: { id: { in: [...clientes] } } });
}

async function main() {
  const usuario = await prisma.usuario.findFirst({ select: { id: true } });
  if (!usuario) throw new Error("Nenhum usuário cadastrado.");

  // Restos de uma execução anterior interrompida
  await limpar();

  // 1) Placa nova
  const os1 = await criarOrdemServico(
    formulario({ nomeCliente: "Dono Antigo", telefone: "11 91111-1111", cor: "Prata" }),
    usuario.id,
  );
  const v1 = await prisma.veiculo.findUniqueOrThrow({
    where: { placa: PLACA },
    include: { cliente: true },
  });
  console.log(`\n1) Placa nova → OS nº ${os1.numero}`);
  conferir("cria o veículo com a placa normalizada", v1.placa === PLACA);
  conferir("cria o proprietário", v1.cliente.nome === "Dono Antigo");
  const h1 = await prisma.historicoStatus.findMany({ where: { ordemServicoId: os1.id } });
  conferir(
    "cria 1 histórico ORCAMENTO com o usuário",
    h1.length === 1 &&
      h1[0].statusNovo === "ORCAMENTO" &&
      h1[0].statusAnterior === null &&
      h1[0].usuarioId === usuario.id,
  );

  // 2) Mesma placa, manter: telefone atualiza, nome não, cor vazia não apaga
  const os2 = await criarOrdemServico(
    formulario({ nomeCliente: "Nome Digitado Errado", telefone: "11 92222-2222", cor: "" }),
    usuario.id,
  );
  const v2 = await prisma.veiculo.findUniqueOrThrow({
    where: { placa: PLACA },
    include: { cliente: true },
  });
  const o2 = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os2.id } });
  console.log(`\n2) Manter proprietário → OS nº ${os2.numero}`);
  conferir("não cria outro veículo nem outro dono", v2.clienteId === v1.clienteId);
  conferir("atualiza o telefone", v2.cliente.telefone === "11922222222");
  conferir("não altera o nome", v2.cliente.nome === "Dono Antigo");
  conferir("cor vazia não apaga a cor salva", v2.cor === "Prata");
  conferir("OS fica com o dono atual", o2.clienteId === v1.clienteId);

  // 3) Mesma placa, trocar proprietário + responsável diferente
  const os3 = await criarOrdemServico(
    formulario({
      nomeCliente: "Dono Novo",
      telefone: "11 93333-3333",
      acaoProprietario: "trocar",
      responsavelEhProprietario: "nao",
      responsavelNome: "Motorista Fictício",
      responsavelTelefone: "11 94444-4444",
    }),
    usuario.id,
  );
  const v3 = await prisma.veiculo.findUniqueOrThrow({
    where: { placa: PLACA },
    include: { cliente: true },
  });
  const [o1, o2b, o3] = await Promise.all(
    [os1.id, os2.id, os3.id].map((id) =>
      prisma.ordemServico.findUniqueOrThrow({ where: { id } }),
    ),
  );
  console.log(`\n3) Trocar proprietário → OS nº ${os3.numero}`);
  conferir("veículo passa para o novo dono", v3.cliente.nome === "Dono Novo");
  conferir("dono antigo continua cadastrado", v3.clienteId !== v1.clienteId);
  conferir(
    "OS antigas continuam com o dono antigo",
    o1.clienteId === v1.clienteId && o2b.clienteId === v1.clienteId,
  );
  conferir("OS nova fica com o novo dono", o3.clienteId === v3.clienteId);
  conferir(
    "grava o responsável só nesta OS",
    o3.responsavelNome === "Motorista Fictício" &&
      o3.responsavelTelefone === "11944444444" &&
      o1.responsavelNome === null,
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