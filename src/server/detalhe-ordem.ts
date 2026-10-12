import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";

/*
 * Leitura de uma ordem de serviço completa (Fase 10.1).
 *
 * Usada pela tela de detalhe (RF09) e pela linha do tempo (RF11).
 * Só lê: nenhuma função deste arquivo grava no banco.
 *
 * Quem chama é responsável por exigir a sessão (exigirSessao).
 */

/** Maior valor da coluna "numero" (inteiro de 32 bits do PostgreSQL). */
const MAIOR_NUMERO_OS = 2_147_483_647;

/** Um acontecimento da linha do tempo: mudança de etapa ou de pagamento. */
export type EventoLinhaDoTempo =
  | {
      tipo: "servico";
      id: string;
      data: Date;
      usuario: string;
      correcao: boolean;
      /** null = criação da OS. */
      statusAnterior: StatusServico | null;
      statusNovo: StatusServico;
      observacao: string | null;
    }
  | {
      tipo: "pagamento";
      id: string;
      data: Date;
      usuario: string;
      correcao: boolean;
      statusAnterior: StatusPagamento;
      statusNovo: StatusPagamento;
      /** Só quando o evento registrou um sinal. */
      valorSinal: string | null;
    };

/** Tudo o que a tela de detalhe mostra. Valores como texto ("1850.00"). */
export type DetalheOS = {
  id: string;
  numero: number;
  statusServico: StatusServico;
  statusPagamento: StatusPagamento;
  descricaoServico: string;
  observacoes: string | null;
  valorOrcamento: string | null;
  valorSinal: string | null;
  /** Quanto falta receber. null quando a OS não tem orçamento. */
  saldo: string | null;
  dataEntrada: Date;
  previsaoEntrega: Date | null;
  dataEntrega: Date | null;
  veiculo: { placa: string; modelo: string; cor: string | null };
  /** Proprietário NA DATA DA OS: não muda se o carro for vendido depois. */
  proprietario: { nome: string; telefone: string };
  /** Quem trouxe o carro, quando não é o proprietário. */
  responsavel: { nome: string; telefone: string } | null;
  /** Do mais antigo para o mais recente. */
  linhaDoTempo: EventoLinhaDoTempo[];
};

/** Saldo a receber. Contas em Decimal, sem passar por number. */
function calcularSaldo(
  statusPagamento: StatusPagamento,
  orcamento: Prisma.Decimal | null,
  sinal: Prisma.Decimal | null,
): string | null {
  if (statusPagamento === "PAGO") return "0.00";
  if (!orcamento) return null;
  if (statusPagamento === "SINAL_PAGO" && sinal) return orcamento.minus(sinal).toFixed(2);
  return orcamento.toFixed(2);
}

export async function obterDetalheOrdem(numero: number): Promise<DetalheOS | null> {
  // Número vindo da URL: inválido ou fora do limite nem chega ao banco.
  if (!Number.isInteger(numero) || numero < 1 || numero > MAIOR_NUMERO_OS) return null;

  const os = await prisma.ordemServico.findUnique({
    where: { numero },
    select: {
      id: true,
      numero: true,
      statusServico: true,
      statusPagamento: true,
      descricaoServico: true,
      observacoes: true,
      valorOrcamento: true,
      valorSinal: true,
      dataEntrada: true,
      previsaoEntrega: true,
      dataEntrega: true,
      responsavelNome: true,
      responsavelTelefone: true,
      veiculo: { select: { placa: true, modelo: true, cor: true } },
      // Proprietário gravado na OS (data da entrada), não o dono atual do veículo.
      cliente: { select: { nome: true, telefone: true } },
      historicos: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          criadoEm: true,
          statusAnterior: true,
          statusNovo: true,
          correcao: true,
          observacao: true,
          usuario: { select: { nome: true } },
        },
      },
      historicosPagamento: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          criadoEm: true,
          statusAnterior: true,
          statusNovo: true,
          correcao: true,
          valorSinal: true,
          usuario: { select: { nome: true } },
        },
      },
    },
  });

  if (!os) return null;

  // Junta os dois históricos e ordena por data.
  // O sort do JavaScript é estável: num empate exato de horário,
  // a mudança de etapa aparece antes da de pagamento.
  const linhaDoTempo: EventoLinhaDoTempo[] = [
    ...os.historicos.map((h) => ({
      tipo: "servico" as const,
      id: h.id,
      data: h.criadoEm,
      usuario: h.usuario.nome,
      correcao: h.correcao,
      statusAnterior: h.statusAnterior,
      statusNovo: h.statusNovo,
      observacao: h.observacao,
    })),
    ...os.historicosPagamento.map((h) => ({
      tipo: "pagamento" as const,
      id: h.id,
      data: h.criadoEm,
      usuario: h.usuario.nome,
      correcao: h.correcao,
      statusAnterior: h.statusAnterior,
      statusNovo: h.statusNovo,
      valorSinal: h.valorSinal?.toFixed(2) ?? null,
    })),
  ].sort((a, b) => a.data.getTime() - b.data.getTime());

  return {
    id: os.id,
    numero: os.numero,
    statusServico: os.statusServico,
    statusPagamento: os.statusPagamento,
    descricaoServico: os.descricaoServico,
    observacoes: os.observacoes,
    valorOrcamento: os.valorOrcamento?.toFixed(2) ?? null,
    valorSinal: os.valorSinal?.toFixed(2) ?? null,
    saldo: calcularSaldo(os.statusPagamento, os.valorOrcamento, os.valorSinal),
    dataEntrada: os.dataEntrada,
    previsaoEntrega: os.previsaoEntrega,
    dataEntrega: os.dataEntrega,
    veiculo: os.veiculo,
    proprietario: os.cliente,
    responsavel:
      os.responsavelNome && os.responsavelTelefone
        ? { nome: os.responsavelNome, telefone: os.responsavelTelefone }
        : null,
    linhaDoTempo,
  };
}