/*
 * Teste das mensagens e links de contato (Fase 10.3).
 * Uso: npx tsx scripts/testar-contato.ts
 *
 * Não acessa o banco. Os mesmos casos vão virar testes com Vitest.
 */
import {
  destinatario,
  linkLigacao,
  linkWhatsApp,
  mensagemPronta,
  primeiroNome,
  type DadosContato,
} from "../src/lib/contato";
import { emReais } from "../src/lib/formatacao";

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  if (!condicao) falhas++;
  console.log(`${condicao ? "✔" : "✘ FALHOU"}  ${descricao}`);
}

// OS fictícia de base; cada caso muda só o que interessa.
const base: DadosContato = {
  statusServico: "ORCAMENTO",
  statusPagamento: "NAO_PAGO",
  placa: "ABC1D23",
  modelo: "Gol",
  valorOrcamento: "1850.00",
  saldo: "1850.00",
  proprietario: { nome: "maria da silva", telefone: "11987654321" },
  responsavel: null,
};
const os = (mudancas: Partial<DadosContato>): DadosContato => ({ ...base, ...mudancas });

console.log("1) Destinatário");
conferir("sem responsável: o proprietário", destinatario(base).nome === "maria da silva");
const comResponsavel = os({ responsavel: { nome: "joão souza", telefone: "11999998888" } });
conferir(
  "com responsável: o responsável",
  destinatario(comResponsavel).nome === "joão souza" &&
    destinatario(comResponsavel).papel === "responsável",
);
conferir(
  "a mensagem cumprimenta o responsável",
  mensagemPronta(comResponsavel)?.texto.startsWith("Olá, João!") === true,
);

console.log("\n2) Primeiro nome");
conferir('"maria da silva" → "Maria"', primeiroNome("maria da silva") === "Maria");
conferir('"  ÉRICO  " → "ÉRICO"', primeiroNome("  ÉRICO  ") === "ÉRICO");
conferir("nome vazio → saudação só com Olá!", mensagemPronta(os({ proprietario: { nome: " ", telefone: "11987654321" } }))?.texto.startsWith("Olá! ") === true);

console.log("\n3) Mensagem por etapa");
const orcamento = mensagemPronta(base);
conferir(
  "Orçamento: valor e pergunta",
  orcamento?.texto ===
    `Olá, Maria! O orçamento do Gol placa ABC1D23 ficou em ${emReais("1850.00")}. Posso seguir com o serviço?`,
);
conferir("Orçamento sem valor: sem mensagem", mensagemPronta(os({ valorOrcamento: null, saldo: null })) === null);
conferir(
  "Pronto com saldo: avisa e informa o saldo",
  mensagemPronta(os({ statusServico: "PRONTO", statusPagamento: "SINAL_PAGO", saldo: "1250.00" }))?.texto ===
    `Olá, Maria! O Gol placa ABC1D23 está pronto para retirada. O saldo a pagar é ${emReais("1250.00")}.`,
);
conferir(
  "Pronto e pago: só o aviso",
  mensagemPronta(os({ statusServico: "PRONTO", statusPagamento: "PAGO", saldo: "0.00" }))?.texto ===
    "Olá, Maria! O Gol placa ABC1D23 está pronto para retirada.",
);
conferir(
  "Entregue e não pago: lembrete com o saldo",
  mensagemPronta(os({ statusServico: "ENTREGUE", saldo: "1850.00" }))?.texto ===
    `Olá, Maria! Passando para lembrar do saldo de ${emReais("1850.00")} referente ao serviço no Gol placa ABC1D23. Obrigado!`,
);
conferir(
  "Entregue sem orçamento: lembrete sem valor",
  mensagemPronta(os({ statusServico: "ENTREGUE", valorOrcamento: null, saldo: null }))?.texto ===
    "Olá, Maria! Passando para lembrar do saldo referente ao serviço no Gol placa ABC1D23. Obrigado!",
);
conferir("Entregue e pago: sem mensagem", mensagemPronta(os({ statusServico: "ENTREGUE", statusPagamento: "PAGO", saldo: "0.00" })) === null);
conferir(
  "Aprovado, Em execução, Recusado, Cancelado: sem mensagem",
  (["APROVADO", "EM_EXECUCAO", "RECUSADO", "CANCELADO"] as const).every(
    (s) => mensagemPronta(os({ statusServico: s })) === null,
  ),
);

console.log("\n4) Links");
const texto = "Olá, Maria! Ficou em R$ 1.850,00. Posso seguir?";
const link = linkWhatsApp("11987654321", texto);
conferir("WhatsApp com código 55", link.startsWith("https://wa.me/5511987654321?text="));
conferir(
  "o texto volta igual (acentos, R$ e ? não quebram o link)",
  decodeURIComponent(link.split("?text=")[1]) === texto,
);
conferir("WhatsApp sem texto: só a conversa", linkWhatsApp("11987654321") === "https://wa.me/5511987654321");
conferir("Ligação", linkLigacao("1133334444") === "tel:+551133334444");

console.log(falhas === 0 ? "\nTodas as verificações conferem." : `\n${falhas} verificação(ões) falharam.`);