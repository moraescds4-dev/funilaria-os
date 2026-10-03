import { z } from "zod";

/*
 * Validação do cadastro de nova ordem de serviço (Fase 8).
 *
 * Todo dado do formulário passa por aqui, no servidor, antes de
 * chegar ao banco. Campos controlados pelo sistema (número, status,
 * datas automáticas, sinal) não fazem parte deste schema: o Zod
 * descarta qualquer campo extra enviado na requisição.
 */

// ── Auxiliares ──────────────────────────────────────────────

/** Campo opcional: texto vazio (ou só espaços) vira undefined. */
function vazioParaUndefined(valor: unknown): unknown {
  if (valor === null) return undefined;
  if (typeof valor === "string" && valor.trim() === "") return undefined;
  return valor;
}

/** Data de hoje no fuso de São Paulo, no formato AAAA-MM-DD. */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** Confere se AAAA-MM-DD existe no calendário (rejeita 31/02). */
function dataExiste(texto: string): boolean {
  const [ano, mes, dia] = texto.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

// ── Placa ───────────────────────────────────────────────────

/** Antiga (ABC1234) ou Mercosul (ABC1D23), já normalizada. */
const PADRAO_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** "abc-1234" → "ABC1234". Também será usada na busca por placa. */
export function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/[\s-]/g, "");
}

// ── Valor em reais ──────────────────────────────────────────

/**
 * Formato brasileiro: "1500", "1500,5", "1.500,00".
 * Ponto só como separador de milhar; centavos sempre com vírgula.
 */
const PADRAO_VALOR_BR = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

/**
 * "1.500,5" → "1500.50". O valor segue como texto até o Decimal
 * do Prisma: nunca passa por number, para não perder centavos.
 */
export function valorBrParaDecimal(texto: string): string {
  const [inteiro, centavos = ""] = texto.replace(/\./g, "").split(",");
  return `${inteiro}.${centavos.padEnd(2, "0")}`;
}

// ── Telefone ────────────────────────────────────────────────

/**
 * DDD + número, guardado só com dígitos.
 * Usado no proprietário e no responsável pela OS.
 */
const telefoneSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\D/g, "") : v),
  z
    .string({ error: "Informe o telefone." })
    .regex(/^[1-9]{2}9?\d{8}$/, "Telefone inválido. Informe DDD e número."),
);

// ── Responsável pela OS ─────────────────────────────────────

/**
 * Se o proprietário é o responsável, os campos do responsável são
 * descartados antes da validação, mesmo que tenham chegado preenchidos.
 */
function descartarResponsavelSeProprietario(dados: unknown): unknown {
  if (
    typeof dados === "object" &&
    dados !== null &&
    (dados as Record<string, unknown>).responsavelEhProprietario === "sim"
  ) {
    return { ...dados, responsavelNome: undefined, responsavelTelefone: undefined };
  }
  return dados;
}

// ── Schema da nova ordem de serviço ─────────────────────────

const camposNovaOrdemServico = z.object({
  // Proprietário do veículo
  nomeCliente: z
    .string({ error: "Informe o nome do proprietário." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 letras.")
    .max(100, "O nome deve ter no máximo 100 caracteres."),

  telefone: telefoneSchema,

  // Placa já cadastrada: manter o proprietário ou trocar.
  // Em placa nova é ignorado. Se não vier, vale "manter".
  acaoProprietario: z.preprocess(
    vazioParaUndefined,
    z
      .enum(["manter", "trocar"], { error: "Opção de proprietário inválida." })
      .default("manter"),
  ),

  // Responsável pela OS
  responsavelEhProprietario: z
    .enum(["sim", "nao"], {
      error: "Informe se o proprietário é o responsável pela OS.",
    })
    .transform((v) => v === "sim"),

  responsavelNome: z.preprocess(
    vazioParaUndefined,
    z
      .string()
      .trim()
      .min(2, "O nome deve ter pelo menos 2 letras.")
      .max(100, "O nome deve ter no máximo 100 caracteres.")
      .optional(),
  ),

  responsavelTelefone: z.preprocess(vazioParaUndefined, telefoneSchema.optional()),

  // Veículo
  placa: z.preprocess(
    (v) => (typeof v === "string" ? normalizarPlaca(v) : v),
    z
      .string({ error: "Informe a placa." })
      .regex(PADRAO_PLACA, "Placa inválida. Use o formato ABC1234 ou ABC1D23."),
  ),

  modelo: z
    .string({ error: "Informe o modelo do veículo." })
    .trim()
    .min(2, "O modelo deve ter pelo menos 2 caracteres.")
    .max(60, "O modelo deve ter no máximo 60 caracteres."),

  cor: z.preprocess(
    vazioParaUndefined,
    z
      .string()
      .trim()
      .max(30, "A cor deve ter no máximo 30 caracteres.")
      .optional(),
  ),

  // Ordem de serviço
  descricaoServico: z
    .string({ error: "Descreva o serviço." })
    .trim()
    .min(3, "Descreva o serviço com pelo menos 3 caracteres.")
    .max(2000, "A descrição deve ter no máximo 2.000 caracteres."),

  valorOrcamento: z.preprocess(
    (v) => {
      const valor = vazioParaUndefined(v);
      return typeof valor === "string" ? valor.replace(/R\$|\s/g, "") : valor;
    },
    z
      .string()
      .regex(
        PADRAO_VALOR_BR,
        "Valor inválido. Use vírgula nos centavos, como em 1.500,00.",
      )
      .transform(valorBrParaDecimal)
      .refine((v) => /[1-9]/.test(v), "O valor deve ser maior que zero.")
      .refine(
        (v) => v.split(".")[0].replace(/^0+/, "").length <= 8,
        "O valor máximo é 99.999.999,99.",
      )
      .optional(),
  ),

  previsaoEntrega: z.preprocess(
    vazioParaUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
      .refine(dataExiste, "Data inválida.")
      .refine(
        (v) => v >= hojeEmSaoPaulo(),
        "A previsão não pode ser uma data passada.",
      )
      .transform((v) => new Date(`${v}T12:00:00-03:00`))
      .optional(),
  ),

  observacoes: z.preprocess(
    vazioParaUndefined,
    z
      .string()
      .trim()
      .max(2000, "As observações devem ter no máximo 2.000 caracteres.")
      .optional(),
  ),
});

/**
 * Schema completo: descarta o responsável quando é o próprio
 * proprietário e exige nome e telefone quando é outra pessoa.
 */
export const novaOrdemServicoSchema = z.preprocess(
  descartarResponsavelSeProprietario,
  camposNovaOrdemServico.superRefine((dados, ctx) => {
    if (dados.responsavelEhProprietario) return;

    if (!dados.responsavelNome) {
      ctx.addIssue({
        code: "custom",
        path: ["responsavelNome"],
        message: "Informe o nome do responsável.",
      });
    }
    if (!dados.responsavelTelefone) {
      ctx.addIssue({
        code: "custom",
        path: ["responsavelTelefone"],
        message: "Informe o telefone do responsável.",
      });
    }
  }),
);

/** Dados já validados e normalizados, prontos para gravar. */
export type NovaOrdemServico = z.output<typeof novaOrdemServicoSchema>;