import { prisma } from "@/lib/prisma";
import { normalizarPlaca, PADRAO_PLACA } from "@/lib/validacoes/ordem-servico";

/*
 * Busca prévia por placa (Fase 8.3).
 *
 * Usada pela tela de nova OS antes do formulário: se a placa já
 * existe, a tela mostra o proprietário e o veículo cadastrados
 * para o usuário confirmar ou trocar o proprietário.
 *
 * Quem chama é responsável por exigir a sessão (exigirSessao).
 */

/** Só o que a tela precisa mostrar: sem ids internos. */
export type VeiculoCadastrado = {
  placa: string;
  modelo: string;
  cor: string | null;
  proprietario: {
    nome: string;
    telefone: string;
  };
};

export async function buscarVeiculoPorPlaca(
  placaDigitada: string,
): Promise<VeiculoCadastrado | null> {
  const placa = normalizarPlaca(placaDigitada);

  // Placa em formato inválido nem chega ao banco.
  if (!PADRAO_PLACA.test(placa)) return null;

  const veiculo = await prisma.veiculo.findUnique({
    where: { placa },
    select: {
      placa: true,
      modelo: true,
      cor: true,
      cliente: { select: { nome: true, telefone: true } },
    },
  });

  if (!veiculo) return null;

  return {
    placa: veiculo.placa,
    modelo: veiculo.modelo,
    cor: veiculo.cor,
    proprietario: veiculo.cliente,
  };
}