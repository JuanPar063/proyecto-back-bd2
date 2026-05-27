-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "suggestedIndexes" TEXT[],
    "rewriteSql" TEXT,
    "warnings" JSONB NOT NULL,
    "impact" TEXT NOT NULL,
    "highestSeverity" "RuleSeverity" NOT NULL DEFAULT 'info',
    "qualityScore" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendations_submissionId_idx" ON "recommendations"("submissionId");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
