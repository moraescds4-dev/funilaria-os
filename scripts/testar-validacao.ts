/*
 * Teste manual do schema de nova OS (Fase 8.1).
 * Uso: npx tsx scripts/testar-validacao.ts
 * Os mesmos casos vão virar testes automatizados com Vitest.
 */
import { novaOrdemServicoSchema } from "../src/lib/validacoes/ordem-servico";

// Um formulário válido, com o texto como o usuário digitaria.
const base = {
  nomeCliente: "  Maria da Silva  ",
  telefone: "(11) 98765-4321",
   responsavelEhProprietario: "sim",
  placa: "abc-1234",
  modelo: "Gol",
  cor: "",
  descricaoServico: "Funilaria na porta dianteira",
  valorOrcamento: "",
  previsaoEntrega: "",
  observacoes: "",
};

// [descrição, campos alterados, deve ser aceito?]
const casos: [string, Record<string, unknown>, boolean][] = [
  ["Formulário mínimo", {}, true],
  ["Placa Mercosul com espaço", { placa: "bra 2e19" }, true],
  ["Placa com 8 caracteres", { placa: "ABC12345" }, false],
  ["Telefone fixo (10 dígitos)", { telefone: "11 3333-4444" }, true],
  ["Telefone sem DDD", { telefone: "98765-4321" }, false],
  ["Valor 1.500,00", { valorOrcamento: "1.500,00" }, true],
  ["Valor R$ 350,5", { valorOrcamento: "R$ 350,5" }, true],
  ["Valor com ponto decimal", { valorOrcamento: "1500.50" }, false],
  ["Valor zero", { valorOrcamento: "0,00" }, false],
  ["Valor acima do máximo", { valorOrcamento: "100.000.000,00" }, false],
  ["Data 31/02 (não existe)", { previsaoEntrega: "2030-02-31" }, false],
  ["Data no passado", { previsaoEntrega: "2020-01-10" }, false],
  ["Data futura", { previsaoEntrega: "2030-03-15" }, true],
  ["Tentar forçar status", { statusServico: "ENTREGUE" }, true],
  ["Nome faltando", { nomeCliente: undefined }, false],
    // Fase 8.2: proprietário e responsável pela OS
  ["Sem resposta sobre o responsável", { responsavelEhProprietario: undefined }, false],
  ["Responsável é outra pessoa, sem dados", { responsavelEhProprietario: "nao" }, false],
  ["Responsável é outra pessoa, completo", { responsavelEhProprietario: "nao", responsavelNome: " João Souza ", responsavelTelefone: "(11) 99999-8888" }, true],
  ["Responsável com telefone inválido", { responsavelEhProprietario: "nao", responsavelNome: "João Souza", responsavelTelefone: "123" }, false],
  ["Proprietário responsável, campos extras descartados", { responsavelNome: "Lixo", responsavelTelefone: "123" }, true],
  ["Trocar proprietário", { acaoProprietario: "trocar" }, true],
  ["Ação de proprietário inválida", { acaoProprietario: "apagar" }, false],
];

let falhas = 0;

for (const [descricao, alteracoes, deveAceitar] of casos) {
  const resultado = novaOrdemServicoSchema.safeParse({ ...base, ...alteracoes });
  const confere = resultado.success === deveAceitar;
  if (!confere) falhas++;

  console.log(`\n${confere ? "✔" : "✘ INESPERADO"}  ${descricao}`);

  if (resultado.success) {
    // Mostra só o que interessa: os campos alterados, já normalizados.
    const campos = Object.keys(alteracoes).length
      ? Object.keys(alteracoes)
      : ["nomeCliente", "telefone", "placa", "cor"];
    for (const campo of campos) {
      const valor = (resultado.data as Record<string, unknown>)[campo];
      console.log(`     aceito  → ${campo}: ${JSON.stringify(valor)}`);
    }
  } else {
    for (const erro of resultado.error.issues) {
      console.log(`     recusado → ${erro.path.join(".")}: ${erro.message}`);
    }
  }
}

console.log(`\n${casos.length - falhas} de ${casos.length} casos conferem.`);