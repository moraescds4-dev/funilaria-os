-- AlterTable
ALTER TABLE "HistoricoStatus" ADD COLUMN     "correcao" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HistoricoPagamento" (
    "id" TEXT NOT NULL,
    "statusAnterior" "StatusPagamento" NOT NULL,
    "statusNovo" "StatusPagamento" NOT NULL,
    "valorSinal" DECIMAL(10,2),
    "correcao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordemServicoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "HistoricoPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricoPagamento_ordemServicoId_criadoEm_idx" ON "HistoricoPagamento"("ordemServicoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "HistoricoPagamento" ADD CONSTRAINT "HistoricoPagamento_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPagamento" ADD CONSTRAINT "HistoricoPagamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
