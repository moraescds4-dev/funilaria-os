import type { StatusPagamento, StatusServico } from "@/generated/prisma/enums";
import { emReais } from "@/lib/formatacao";

/*
 * Contato com o cliente pelo WhatsApp e por ligação (Fase 10.3).
 *
 * Funções puras: não acessam o banco nem a rede. Só montam o texto
 * e o link. Quem envia é o próprio usuário, no WhatsApp do celular
 * (link wa.me, sem API paga: Plano de Fases, Fase 8).
 *
 * Pode ser usado no servidor e no navegador.
 */

export type Pessoa = { nome: string; telefone: string };

/** O que as mensagens precisam saber da OS. */
export type DadosContato = {
  statusServico: StatusServico;
  statusPagamento: StatusPagamento;
  placa: string;
  modelo: string;
  valorOrcamento: string | null;
  saldo: string | null;
  proprietario: Pessoa;
  responsavel: Pessoa | null;
};

export type Destinatario = Pessoa & { papel: "responsável" | "proprietário" };

export type MensagemPronta = { rotulo: string; texto: string };

/** O responsável trouxe o carro: ele recebe a mensagem. Sem responsável, o proprietário. */
export function destinatario(d: DadosContato): Destinatario {
  return d.responsavel
    ? { ...d.responsavel, papel: "responsável" }
    : { ...d.proprietario, papel: "proprietário" };
}

/** "luis silva" → "Luis". Nome vazio → "" (a saudação vira só "Olá!"). */
export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1);
}

/** Mensagem conforme a etapa. null = etapa sem mensagem pronta. */
export function mensagemPronta(d: DadosContato): MensagemPronta | null {
  const nome = primeiroNome(destinatario(d).nome);
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const veiculo = `${d.modelo} placa ${d.placa}`;

  // Saldo só entra no texto se ainda falta receber algo.
  const saldo =
    d.statusPagamento !== "PAGO" && d.saldo && d.saldo !== "0.00" ? emReais(d.saldo) : null;

  if (d.statusServico === "ORCAMENTO") {
    // Sem valor, não há orçamento para enviar.
    if (!d.valorOrcamento) return null;
    return {
      rotulo: "Enviar orçamento",
      texto: `${ola} O orçamento do ${veiculo} ficou em ${emReais(d.valorOrcamento)}. Posso seguir com o serviço?`,
    };
  }

  if (d.statusServico === "PRONTO") {
    return {
      rotulo: "Avisar que está pronto",
      texto:
        `${ola} O ${veiculo} está pronto para retirada.` +
        (saldo ? ` O saldo a pagar é ${saldo}.` : ""),
    };
  }

  if (d.statusServico === "ENTREGUE" && d.statusPagamento !== "PAGO") {
    return {
      rotulo: "Lembrar do saldo",
      texto: `${ola} Passando para lembrar do saldo${saldo ? ` de ${saldo}` : ""} referente ao serviço no ${veiculo}. Obrigado!`,
    };
  }

  return null;
}

/** Telefone só com dígitos e DDD. 55 = código do Brasil, exigido pelo WhatsApp. */
export function linkWhatsApp(telefone: string, texto?: string): string {
  const base = `https://wa.me/55${telefone}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/** Toque no celular abre a ligação. */
export function linkLigacao(telefone: string): string {
  return `tel:+55${telefone}`;
}