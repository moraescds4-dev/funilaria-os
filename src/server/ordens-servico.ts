import { prisma } from "@/lib/prisma";
import type { NovaOrdemServico } from "@/lib/validacoes/ordem-servico";

/*
 * Regra de gravação da nova ordem de serviço (Fase 8.2).
 *
 * Recebe dados JÁ VALIDADOS pelo Zod e o id do usuário logado.
 * Não conhece cookies, formulário nem redirecionamento: por isso
 * pode ser chamada pela Server Action e também por scripts de teste.
 *
 * Tudo acontece numa única transação: se qualquer passo falhar,
 * nada é gravado (nem cliente, nem veículo, nem OS pela metade).
 */

/** O que a tela precisa saber depois de gravar. */
export type OrdemCriada = {
  id: string;
  numero: number;
};

export async function criarOrdemServico(
  dados: NovaOrdemServico,
  usuarioId: string,
): Promise<OrdemCriada> {
  return prisma.$transaction(async (tx) => {
    // 1) A placa já está cadastrada?
    const veiculo = await tx.veiculo.findUnique({
      where: { placa: dados.placa },
      select: { id: true, clienteId: true },
    });

    let veiculoId: string;
    let clienteId: string;

    if (!veiculo) {
      // 2a) Placa nova: cria o proprietário e o veículo.
      const cliente = await tx.cliente.create({
        data: { nome: dados.nomeCliente, telefone: dados.telefone },
        select: { id: true },
      });
      const novoVeiculo = await tx.veiculo.create({
        data: {
          placa: dados.placa,
          modelo: dados.modelo,
          cor: dados.cor,
          clienteId: cliente.id,
        },
        select: { id: true },
      });
      veiculoId = novoVeiculo.id;
      clienteId = cliente.id;
    } else if (dados.acaoProprietario === "trocar") {
      // 2b) Troca de proprietário: cria o novo dono e aponta o
      //     veículo para ele. As OS antigas continuam com o dono
      //     antigo, porque cada OS guarda o seu próprio clienteId.
      const novoDono = await tx.cliente.create({
        data: { nome: dados.nomeCliente, telefone: dados.telefone },
        select: { id: true },
      });
      await tx.veiculo.update({
        where: { id: veiculo.id },
        data: { clienteId: novoDono.id, modelo: dados.modelo, cor: dados.cor },
      });
      veiculoId = veiculo.id;
      clienteId = novoDono.id;
    } else {
      // 2c) Mantém o proprietário: só o telefone confirmado é
      //     atualizado. O nome não muda por aqui; troca de pessoa
      //     só acontece pela opção "trocar".
      await tx.cliente.update({
        where: { id: veiculo.clienteId },
        data: { telefone: dados.telefone },
      });
      await tx.veiculo.update({
        where: { id: veiculo.id },
        data: { modelo: dados.modelo, cor: dados.cor },
      });
      veiculoId = veiculo.id;
      clienteId = veiculo.clienteId;
    }

    // 3) Cria a OS e o primeiro registro do histórico, juntos.
    return tx.ordemServico.create({
      data: {
        descricaoServico: dados.descricaoServico,
        valorOrcamento: dados.valorOrcamento,
        previsaoEntrega: dados.previsaoEntrega,
        observacoes: dados.observacoes,
        responsavelNome: dados.responsavelNome,
        responsavelTelefone: dados.responsavelTelefone,
        veiculoId,
        clienteId,
        historicos: {
          create: {
            statusAnterior: null,
            statusNovo: "ORCAMENTO",
            usuarioId,
          },
        },
      },
      select: { id: true, numero: true },
    });
  });
}