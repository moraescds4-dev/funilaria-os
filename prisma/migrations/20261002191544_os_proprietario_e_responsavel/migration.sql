-- Fase 8.2: proprietário na data da OS e responsável pela OS.
--
-- O clienteId é criado em três tempos para funcionar mesmo se já
-- existirem ordens no banco: opcional → preenchido → obrigatório.

-- 1) Novas colunas. clienteId ainda sem NOT NULL.
ALTER TABLE "OrdemServico" ADD COLUMN "clienteId" TEXT,
ADD COLUMN "responsavelNome" TEXT,
ADD COLUMN "responsavelTelefone" TEXT;

-- 2) OS já existentes recebem o dono atual do veículo.
--    Se não houver nenhuma OS, este comando não altera nada.
UPDATE "OrdemServico" AS os
SET "clienteId" = v."clienteId"
FROM "Veiculo" AS v
WHERE os."veiculoId" = v."id";

-- 3) Agora que nenhuma linha está vazia, torna obrigatório.
ALTER TABLE "OrdemServico" ALTER COLUMN "clienteId" SET NOT NULL;

-- Índice para buscar OS por cliente.
CREATE INDEX "OrdemServico_clienteId_idx" ON "OrdemServico"("clienteId");

-- Chave estrangeira: não deixa apagar cliente que tem OS.
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;