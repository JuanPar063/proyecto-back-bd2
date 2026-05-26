-- ============================================================
-- Migración: submissions_full
-- Entrega 2 — módulo Ruiz (Submissions, comparación y scoring).
-- Extiende `submissions` con engineVersion, runnerMetadata y feedback
-- y crea la tabla `expected_results` (resultado de referencia por reto).
-- ============================================================

-- AlterTable: submissions
ALTER TABLE "submissions"
    ADD COLUMN "engineVersion"  TEXT,
    ADD COLUMN "feedback"       TEXT,
    ADD COLUMN "runnerMetadata" JSONB;

-- CreateTable: expected_results
CREATE TABLE "expected_results" (
    "id"             TEXT NOT NULL,
    "challengeId"    TEXT NOT NULL,
    "columns"        TEXT[],
    "rows"           JSONB NOT NULL,
    "orderSensitive" BOOLEAN NOT NULL DEFAULT false,
    "floatTolerance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expected_results_pkey" PRIMARY KEY ("id")
);

-- Unique 1-a-1 con Challenge
CREATE UNIQUE INDEX "expected_results_challengeId_key" ON "expected_results"("challengeId");

-- FK con cascada para limpieza coherente al archivar/borrar retos
ALTER TABLE "expected_results"
    ADD CONSTRAINT "expected_results_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "challenges"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
