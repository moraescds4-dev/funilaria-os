/*
 * Teste da leitura do detalhe da OS e da linha do tempo (Fase 10.1).
 * Uso: npx tsx scripts/testar-detalhe.ts
 *
 * ATENÇÃO: grava no banco apontado pela DATABASE_URL do .env.
 * Usa só dados fictícios (placa TST4D56) e apaga tudo o que criou
 * no final, mesmo se algum passo falhar.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { novaOrdemServicoSchema } from "../src/lib/validacoes/ordem-servico";
import { criarOrdemServico } from "../src/server/ordens-servico";
import { corrigirStatusServico, mudarStatusServico } from "../src/server/status-servico";
import { registrarPagamento, registrarSinal } from "../src/server/pagamento";
import { obterDetalheOrdem } from "../src/server/detalhe-ordem";

const PLACA = "TST4D56";
const DONO = "Cliente Teste Detalhe";
const DONO_NOVO = "Dono Novo Detalhe";
const NOMES_FICTICIOS = [DONO, DONO_NOVO];

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  if (!condicao) falhas++;
  console.log(`${condicao ? "✔" : "✘ FALHOU"}  ${descricao}`);
}

/** Simula o formulário: passa pelo Zod, como a Server Action faz. */
function formulario(campos: Record<string, string>) {
  return novaOrdemServicoSchema.parse({
    placa: PLACA,
    modelo: "Carro Fictício",
    cor: "Prata",
    descricaoServico: "Teste automatizado do detalhe",
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

  // Trava de segurança: só apaga se todos os donos forem os fictícios.
  const donos = await prisma.cliente.findMany({
    where: { id: { in: [...clientes] } },
    select: { nome: true },
  });
  if (donos.some((d) => !NOMES_FICTICIOS.includes(d.nome))) {
    throw new Error(`A placa ${PLACA} pertence a um cliente real. Nada foi apagado.`);
  }

  // Os dois históricos saem junto com a OS (Cascade).
  await prisma.ordemServico.deleteMany({ where: { veiculoId: veiculo.id } });
  await prisma.veiculo.delete({ where: { id: veiculo.id } });
  await prisma.cliente.deleteMany({ where: { id: { in: [...clientes] } } });
}

async function main() {
  const usuario = await prisma.usuario.findFirst({ select: { id: true, nome: true } });
  if (!usuario) throw new Error("Nenhum usuário cadastrado.");
  const u = usuario.id;

  // Restos de uma execução anterior interrompida
  await limpar();

  // 1) OS recém-criada, com responsável diferente do proprietário
  const os1 = await criarOrdemServico(
    formulario({
      nomeCliente: DONO,
      telefone: "11 97777-7777",
      valorOrcamento: "1.850,00",
      responsavelEhProprietario: "nao",
      responsavelNome: "Motorista Teste Detalhe",
      responsavelTelefone: "11 98888-8888",
    }),
    u,
  );
  console.log(`\n1) OS recém-criada → OS nº ${os1.numero}`);
  const d1 = await obterDetalheOrdem(os1.numero);
  conferir("encontra a OS pelo número", d1?.id === os1.id && d1.numero === os1.numero);
  conferir(
    "traz o veículo",
    d1?.veiculo.placa === PLACA && d1.veiculo.modelo === "Carro Fictício" && d1.veiculo.cor === "Prata",
  );
  conferir(
    "traz o proprietário com o telefone",
    d1?.proprietario.nome === DONO && d1.proprietario.telefone === "11977777777",
  );
  conferir(
    "traz o responsável com o telefone",
    d1?.responsavel?.nome === "Motorista Teste Detalhe" &&
      d1.responsavel.telefone === "11988888888",
  );
  conferir(
    "orçamento e saldo em texto, sem sinal",
    d1?.valorOrcamento === "1850.00" && d1.valorSinal === null && d1.saldo === "1850.00",
  );
  conferir(
    "linha do tempo com 1 evento: a criação",
    d1?.linhaDoTempo.length === 1 &&
      d1.linhaDoTempo[0].tipo === "servico" &&
      d1.linhaDoTempo[0].statusAnterior === null &&
      d1.linhaDoTempo[0].statusNovo === "ORCAMENTO",
  );

  // 2) Etapas e pagamento misturados, com uma correção
  console.log("\n2) Linha do tempo com os dois históricos");
  await mudarStatusServico(os1.id, "APROVADO", u);
  await registrarSinal(os1.id, "600.00", u);
  await mudarStatusServico(os1.id, "EM_EXECUCAO", u);
  await corrigirStatusServico(os1.id, u); // volta para APROVADO

  const d2 = await obterDetalheOrdem(os1.numero);
  const eventos = d2?.linhaDoTempo ?? [];
  conferir(
    "5 eventos, na ordem em que aconteceram",
    eventos.map((e) => `${e.tipo}:${e.statusNovo}`).join(",") ===
      "servico:ORCAMENTO,servico:APROVADO,pagamento:SINAL_PAGO,servico:EM_EXECUCAO,servico:APROVADO",
  );
  conferir(
    "datas em ordem crescente",
    eventos.every((e, i) => i === 0 || e.data.getTime() >= eventos[i - 1].data.getTime()),
  );
  conferir(
    "só o último evento está marcado como correção",
    eventos.map((e) => e.correcao).join(",") === "false,false,false,false,true",
  );
  const eventoSinal = eventos[2];
  conferir(
    "o evento do sinal guarda o valor de R$ 600,00",
    eventoSinal?.tipo === "pagamento" && eventoSinal.valorSinal === "600.00",
  );
  conferir("todos os eventos têm o nome de quem mudou", eventos.every((e) => e.usuario === usuario.nome));

  // 3) Saldo
  console.log("\n3) Saldo");
  conferir(
    "situação atual: APROVADO e SINAL_PAGO",
    d2?.statusServico === "APROVADO" && d2.statusPagamento === "SINAL_PAGO",
  );
  conferir("com sinal: 1850,00 − 600,00 = 1250,00", d2?.valorSinal === "600.00" && d2.saldo === "1250.00");
  await registrarPagamento(os1.id, u);
  const d3 = await obterDetalheOrdem(os1.numero);
  conferir("depois da quitação: saldo 0,00", d3?.statusPagamento === "PAGO" && d3.saldo === "0.00");

  // 4) Carro vendido, OS sem orçamento e sem responsável
  const os2 = await criarOrdemServico(
    formulario({ nomeCliente: DONO_NOVO, telefone: "11 96666-0000", acaoProprietario: "trocar" }),
    u,
  );
  console.log(`\n4) Carro vendido → OS nº ${os2.numero}`);
  const d4 = await obterDetalheOrdem(os2.numero);
  const d1Depois = await obterDetalheOrdem(os1.numero);
  conferir("a OS nova mostra o dono novo", d4?.proprietario.nome === DONO_NOVO);
  conferir("a OS antiga continua com o dono da época", d1Depois?.proprietario.nome === DONO);
  conferir("sem orçamento: sem saldo", d4?.valorOrcamento === null && d4.saldo === null);
  conferir("sem responsável: responsável vazio", d4?.responsavel === null);

  // 5) Números que podem chegar pela URL
  console.log("\n5) Números inválidos ou inexistentes");
  const invalidos = await Promise.all(
    [0, -1, 1.5, Number.NaN, 2_147_483_648].map((n) => obterDetalheOrdem(n)),
  );
  conferir("0, −1, 1,5, NaN e acima do limite devolvem null", invalidos.every((d) => d === null));
  conferir(
    "número válido que não existe devolve null",
    (await obterDetalheOrdem(2_147_483_647)) === null,
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