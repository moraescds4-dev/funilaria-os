/*
 * Preenche o banco de DEMONSTRAÇÃO com ordens de serviço fictícias.
 *
 * Uso (na aba do PowerShell com $env:DATABASE_URL apontando para o banco demo):
 *   npx tsx scripts/popular-demo.ts demo@example.com
 *
 * Como funciona:
 * - Cada OS passa pelas mesmas regras dos botões do sistema: o
 *   formulário pelo Zod, o cadastro, a mudança de etapa e os
 *   pagamentos. Assim os dados nascem coerentes e com histórico.
 * - As regras gravam sempre "agora". Depois de cada ação, a data é
 *   ajustada para simular o uso do sistema nas últimas semanas.
 * - Nomes, placas e serviços são inventados. Os telefones começam com
 *   0 depois do DDD: nenhum número de assinante no Brasil começa com 0
 *   (é o prefixo de chamada interurbana), então não pertencem a ninguém.
 *
 * ATENÇÃO: grava no banco da DATABASE_URL e não apaga nada. Rodar duas
 * vezes duplica as OS. Sem trava de segurança (decisão de 12/10/2026).
 */
import "dotenv/config";
import type { StatusServico } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import { novaOrdemServicoSchema } from "../src/lib/validacoes/ordem-servico";
import { criarOrdemServico } from "../src/server/ordens-servico";
import { registrarPagamento, registrarSinal } from "../src/server/pagamento";
import { mudarStatusServico } from "../src/server/status-servico";

// ── Auxiliares ──────────────────────────────────────────────

/** DDD usado em todos os telefones fictícios. */
const DDD = "11";

/** "0101" → "1100000101", exibido como (11) 0000-0101. */
function telefone(final: string): string {
  return `${DDD}0000${final}`;
}

/** Hoje no fuso de São Paulo, como [ano, mês, dia]. */
function hojeEmSaoPaulo(): [number, number, number] {
  const texto = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
  const [ano, mes, dia] = texto.split("-").map(Number);
  return [ano, mes, dia];
}

/** Momento "n dias atrás", às hh horas no horário de Brasília (UTC−3). */
function diasAtras(dias: number, hora: number): Date {
  const [ano, mes, dia] = hojeEmSaoPaulo();
  return new Date(Date.UTC(ano, mes - 1, dia - dias, hora + 3));
}

/** Data "daqui a n dias" no formato do formulário (AAAA-MM-DD). */
function daquiA(dias: number): string {
  const [ano, mes, dia] = hojeEmSaoPaulo();
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** As regras gravam "agora"; aqui a última linha recebe a data simulada. */
async function datarUltimoHistoricoStatus(ordemServicoId: string, quando: Date) {
  const ultimo = await prisma.historicoStatus.findFirstOrThrow({
    where: { ordemServicoId },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });
  await prisma.historicoStatus.update({ where: { id: ultimo.id }, data: { criadoEm: quando } });
}

async function datarUltimoHistoricoPagamento(ordemServicoId: string, quando: Date) {
  const ultimo = await prisma.historicoPagamento.findFirstOrThrow({
    where: { ordemServicoId },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });
  await prisma.historicoPagamento.update({ where: { id: ultimo.id }, data: { criadoEm: quando } });
}

// ── Cenários ────────────────────────────────────────────────

/** dia = quantos dias atrás; hora = horário de Brasília. */
type Momento = { dia: number; hora: number };

type Passo = Momento & ({ etapa: StatusServico } | { sinal: string } | { pagamento: true });

type Cenario = {
  entrada: Momento;
  formulario: Record<string, string>; // como viria da tela de Nova OS
  passos: Passo[];
};

const CENARIOS: Cenario[] = [
  // Carro vendido (1/2): OS antiga, com a dona anterior. Vai para o Arquivo.
  {
    entrada: { dia: 45, hora: 9 },
    formulario: {
      placa: "FGH-4E21", modelo: "Ford Ka", cor: "Prata",
      nomeCliente: "Márcia Lopes", telefone: telefone("0101"),
      descricaoServico: "Reparo de amassado no capô e pintura.",
      valorOrcamento: "1.200,00",
    },
    passos: [
      { dia: 44, hora: 10, etapa: "APROVADO" },
      { dia: 42, hora: 8, etapa: "EM_EXECUCAO" },
      { dia: 38, hora: 16, etapa: "PRONTO" },
      { dia: 37, hora: 10, pagamento: true },
      { dia: 37, hora: 11, etapa: "ENTREGUE" },
    ],
  },
  // Recusado: o cliente não aprovou o orçamento. Arquivo.
  {
    entrada: { dia: 30, hora: 14 },
    formulario: {
      placa: "JKL-2B45", modelo: "Honda Civic", cor: "Preto",
      nomeCliente: "Paulo Mendes", telefone: telefone("0102"),
      descricaoServico: "Pintura geral do veículo.",
      valorOrcamento: "6.800,00",
    },
    passos: [{ dia: 28, hora: 11, etapa: "RECUSADO" }],
  },
  // Entregue e pago há 10 dias: já saiu do quadro. Arquivo.
  {
    entrada: { dia: 24, hora: 8 },
    formulario: {
      placa: "QWE-5F67", modelo: "Renault Sandero", cor: "Vermelho",
      nomeCliente: "Juliana Castro", telefone: telefone("0103"),
      descricaoServico: "Troca do para-choque traseiro e pintura.",
      valorOrcamento: "1.450,00",
    },
    passos: [
      { dia: 23, hora: 9, etapa: "APROVADO" },
      { dia: 23, hora: 10, sinal: "500.00" },
      { dia: 21, hora: 8, etapa: "EM_EXECUCAO" },
      { dia: 12, hora: 17, etapa: "PRONTO" },
      { dia: 10, hora: 15, pagamento: true },
      { dia: 10, hora: 16, etapa: "ENTREGUE" },
    ],
  },
  // Entregue e NÃO pago há 12 dias: continua no quadro como "A receber".
  {
    entrada: { dia: 22, hora: 10 },
    formulario: {
      placa: "RTY-8C90", modelo: "VW Saveiro", cor: "Branca",
      nomeCliente: "Sérgio Nunes", telefone: telefone("0105"),
      descricaoServico: "Funilaria e pintura da porta do motorista.",
      valorOrcamento: "1.800,00",
    },
    passos: [
      { dia: 21, hora: 9, etapa: "APROVADO" },
      { dia: 20, hora: 8, etapa: "EM_EXECUCAO" },
      { dia: 13, hora: 17, etapa: "PRONTO" },
      { dia: 12, hora: 11, etapa: "ENTREGUE" },
    ],
  },
  // Cancelado: desistência depois de aprovar. Arquivo.
  {
    entrada: { dia: 20, hora: 15 },
    formulario: {
      placa: "MNB-3478", modelo: "Fiat Palio", cor: "Branco",
      nomeCliente: "Ricardo Almeida", telefone: telefone("0104"),
      descricaoServico: "Recuperação do para-lama dianteiro direito.",
      valorOrcamento: "900,00",
    },
    passos: [
      { dia: 19, hora: 10, etapa: "APROVADO" },
      { dia: 17, hora: 14, etapa: "CANCELADO" },
    ],
  },
  // Pronto com saldo a pagar: mensagem "pronto" do WhatsApp com o saldo.
  {
    entrada: { dia: 14, hora: 9 },
    formulario: {
      placa: "HJK-2345", modelo: "Fiat Uno", cor: "Azul",
      nomeCliente: "Carlos Eduardo Lima", telefone: telefone("0107"),
      descricaoServico: "Troca do para-lama e pintura da lateral esquerda.",
      valorOrcamento: "2.300,00",
    },
    passos: [
      { dia: 13, hora: 10, etapa: "APROVADO" },
      { dia: 13, hora: 11, sinal: "800.00" },
      { dia: 11, hora: 8, etapa: "EM_EXECUCAO" },
      { dia: 2, hora: 17, etapa: "PRONTO" },
    ],
  },
  // Em execução com sinal.
  {
    entrada: { dia: 10, hora: 8 },
    formulario: {
      placa: "ZXC-4H56", modelo: "Fiat Strada", cor: "Branca",
      nomeCliente: "Antônio Ferreira", telefone: telefone("0108"),
      descricaoServico: "Recuperação da caçamba e pintura.",
      valorOrcamento: "3.200,00",
      previsaoEntrega: daquiA(5),
    },
    passos: [
      { dia: 9, hora: 9, etapa: "APROVADO" },
      { dia: 9, hora: 10, sinal: "1000.00" },
      { dia: 7, hora: 8, etapa: "EM_EXECUCAO" },
    ],
  },
  // Pronto e pago integral, sem sinal.
  {
    entrada: { dia: 9, hora: 11 },
    formulario: {
      placa: "PLM-6G12", modelo: "Toyota Corolla", cor: "Prata",
      nomeCliente: "Fernanda Rocha", telefone: telefone("0106"),
      descricaoServico: "Polimento e cristalização da pintura.",
      valorOrcamento: "650,00",
    },
    passos: [
      { dia: 9, hora: 15, etapa: "APROVADO" },
      { dia: 8, hora: 8, etapa: "EM_EXECUCAO" },
      { dia: 3, hora: 16, etapa: "PRONTO" },
      { dia: 3, hora: 17, pagamento: true },
    ],
  },
  // Em execução sem nenhum pagamento (RN02: pagamento independe da etapa).
  {
    entrada: { dia: 8, hora: 14 },
    formulario: {
      placa: "BNM-7J89", modelo: "Hyundai HB20", cor: "Cinza",
      nomeCliente: "Luciana Pereira", telefone: telefone("0109"),
      descricaoServico: "Reparo de amassados no teto causados por granizo.",
      valorOrcamento: "1.600,00",
      previsaoEntrega: daquiA(4),
    },
    passos: [
      { dia: 7, hora: 9, etapa: "APROVADO" },
      { dia: 5, hora: 8, etapa: "EM_EXECUCAO" },
    ],
  },
  // Aprovado com sinal.
  {
    entrada: { dia: 5, hora: 14 },
    formulario: {
      placa: "DFG-5K12", modelo: "Chevrolet Onix", cor: "Branco",
      nomeCliente: "Roberto Silva", telefone: telefone("0110"),
      descricaoServico: "Funilaria e pintura da lateral direita após colisão.",
      valorOrcamento: "3.500,00",
      previsaoEntrega: daquiA(10),
      observacoes: "Cliente pediu para guardar as peças trocadas.",
    },
    passos: [
      { dia: 4, hora: 9, etapa: "APROVADO" },
      { dia: 4, hora: 10, sinal: "1200.00" },
    ],
  },
  // Carro vendido (2/2): mesma placa, agora com o dono novo.
  {
    entrada: { dia: 4, hora: 15 },
    formulario: {
      placa: "FGH-4E21", modelo: "Ford Ka", cor: "Prata",
      acaoProprietario: "trocar",
      nomeCliente: "Thiago Barbosa", telefone: telefone("0111"),
      descricaoServico: "Pintura do para-choque dianteiro.",
      valorOrcamento: "750,00",
    },
    passos: [],
  },
  // Orçamento com valor e responsável diferente do proprietário.
  {
    entrada: { dia: 2, hora: 10 },
    formulario: {
      placa: "VBN-9L34", modelo: "Renault Kwid", cor: "Laranja",
      nomeCliente: "Helena Martins", telefone: telefone("0112"),
      responsavelEhProprietario: "nao",
      responsavelNome: "Gustavo Martins", responsavelTelefone: telefone("0113"),
      descricaoServico: "Retoque de pintura e polimento do capô.",
      valorOrcamento: "480,00",
    },
    passos: [],
  },
  // Orçamento ainda sem valor: carro recém-chegado.
  {
    entrada: { dia: 1, hora: 16 },
    formulario: {
      placa: "CVB-2M78", modelo: "VW Gol", cor: "Prata",
      nomeCliente: "Marcos Vieira", telefone: telefone("0114"),
      descricaoServico: "Avaliar amassado na porta traseira esquerda.",
    },
    passos: [],
  },
];

// ── Execução ────────────────────────────────────────────────

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error("Informe o e-mail do usuário: npx tsx scripts/popular-demo.ts demo@example.com");
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, nome: true },
  });
  if (!usuario) throw new Error(`Usuário ${email} não encontrado neste banco.`);

  console.log(`Gravando como: ${usuario.nome}\n`);

  // Mais antigas primeiro: a numeração das OS segue a ordem de chegada.
  const ordenados = [...CENARIOS].sort(
    (a, b) => b.entrada.dia - a.entrada.dia || a.entrada.hora - b.entrada.hora,
  );

  for (const cenario of ordenados) {
    const dados = novaOrdemServicoSchema.parse({
      responsavelEhProprietario: "sim",
      ...cenario.formulario,
    });
    const { id, numero } = await criarOrdemServico(dados, usuario.id);

    // Entrada: a primeira linha do histórico (a criação) recebe a data simulada.
    const entrada = diasAtras(cenario.entrada.dia, cenario.entrada.hora);
    await prisma.historicoStatus.updateMany({
      where: { ordemServicoId: id },
      data: { criadoEm: entrada },
    });

    let ultimaMudanca = entrada;
    let dataEntrega: Date | undefined;

    for (const passo of cenario.passos) {
      const quando = diasAtras(passo.dia, passo.hora);
      if ("etapa" in passo) {
        await mudarStatusServico(id, passo.etapa, usuario.id);
        await datarUltimoHistoricoStatus(id, quando);
        if (passo.etapa === "ENTREGUE") dataEntrega = quando;
      } else if ("sinal" in passo) {
        await registrarSinal(id, passo.sinal, usuario.id);
        await datarUltimoHistoricoPagamento(id, quando);
      } else {
        await registrarPagamento(id, usuario.id);
        await datarUltimoHistoricoPagamento(id, quando);
      }
      ultimaMudanca = quando;
    }

    // Datas da OS. atualizadoEm = última mudança (ordena a lista do Arquivo).
    const final = await prisma.ordemServico.update({
      where: { id },
      data: { dataEntrada: entrada, criadoEm: entrada, dataEntrega, atualizadoEm: ultimaMudanca },
      select: { statusServico: true, statusPagamento: true },
    });

    console.log(`✔  OS nº ${numero}  ${dados.placa}  ${final.statusServico} / ${final.statusPagamento}`);
  }

  console.log(`\n${ordenados.length} OS fictícias criadas.`);
}

main()
  .catch((erro: unknown) => {
    console.error(`\nErro: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });