import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";
import { normalizarPlaca } from "@/lib/validacoes/ordem-servico";
import { condicaoDoArquivo } from "@/server/quadro";

/*
 * Listas de OS além do quadro (Fases 10.5 e 10.6):
 * - busca parcial por placa (RF08), em TODAS as OS, inclusive arquivadas;
 * - Arquivo: as OS que saíram do quadro (entregues e pagas antigas,
 *   recusadas e canceladas).
 *
 * Só leem. Quem chama é responsável por exigir a sessão (exigirSessao).
 */

/**
 * Trecho aceito na busca: 2 a 7 letras ou números, já normalizado.
 * Só letras e números: % e _ não chegam ao SQL e não mudam a busca.
 */
const PADRAO_TRECHO_PLACA = /^[A-Z0-9]{2,7}$/;

/** Máximo de linhas por lista: protege o celular de uma página enorme. */
export const LIMITE_LISTA = 100;

/** Uma linha das listas de busca e do Arquivo. */
export type ItemListaOS = {
  numero: number;
  placa: string;
  modelo: string;
  cor: string | null;
  /** Proprietário na data da OS. */
  cliente: string;
  statusServico: StatusServico;
  statusPagamento: StatusPagamento;
  dataEntrada: Date;
  dataEntrega: Date | null;
};

async function listar(
  where: Prisma.OrdemServicoWhereInput,
  orderBy: Prisma.OrdemServicoOrderByWithRelationInput,
): Promise<ItemListaOS[]> {
  const ordens = await prisma.ordemServico.findMany({
    where,
    orderBy,
    take: LIMITE_LISTA,
    select: {
      numero: true,
      statusServico: true,
      statusPagamento: true,
      dataEntrada: true,
      dataEntrega: true,
      veiculo: { select: { placa: true, modelo: true, cor: true } },
      cliente: { select: { nome: true } },
    },
  });

  return ordens.map((o) => ({
    numero: o.numero,
    placa: o.veiculo.placa,
    modelo: o.veiculo.modelo,
    cor: o.veiculo.cor,
    cliente: o.cliente.nome,
    statusServico: o.statusServico,
    statusPagamento: o.statusPagamento,
    dataEntrada: o.dataEntrada,
    dataEntrega: o.dataEntrega,
  }));
}

/**
 * Busca parcial por placa em todas as OS (RF08).
 * Devolve null quando o trecho é inválido (a tela pede para corrigir),
 * e lista vazia quando é válido mas nada foi encontrado.
 */
export async function buscarOrdensPorPlaca(trechoDigitado: string): Promise<ItemListaOS[] | null> {
  const trecho = normalizarPlaca(trechoDigitado);
  if (!PADRAO_TRECHO_PLACA.test(trecho)) return null;

  return listar({ veiculo: { placa: { contains: trecho } } }, { dataEntrada: "desc" });
}

/** OS que saíram do quadro, as movimentadas por último primeiro. */
export async function listarArquivo(): Promise<ItemListaOS[]> {
  return listar(condicaoDoArquivo(), { atualizadoEm: "desc" });
}