/*
 * Formatação de valores para exibir na tela (Fase 10.2).
 *
 * Só para mostrar: nunca usar o resultado em contas ou gravações.
 * Datas sempre no fuso de São Paulo, porque o servidor da Vercel
 * roda em UTC (sem isso, 22h viraria 01h do dia seguinte).
 *
 * Não acessa o banco: pode ser usado no servidor e no navegador.
 */

const FUSO = "America/Sao_Paulo";

/** "1850.00" → "R$ 1.850,00" */
export function emReais(texto: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(texto),
  );
}

/** "11987654321" → "(11) 98765-4321"; "1133334444" → "(11) 3333-4444" */
export function formatarTelefone(digitos: string): string {
  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);
  const corte = numero.length === 9 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/** → "06/10/2026" */
export function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

/** → "06/10/2026, 14:35" */
export function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}