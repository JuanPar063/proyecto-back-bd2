-- CreateEnum
CREATE TYPE "EvaluationResultsVisibility" AS ENUM ('DURING_EVALUATION', 'AFTER_END', 'ALWAYS');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "evaluationAttemptId" TEXT;

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "courseId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "resultsVisibility" "EvaluationResultsVisibility" NOT NULL DEFAULT 'AFTER_END',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_challenges" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "evaluation_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_attempts" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "evaluation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluations_courseId_idx" ON "evaluations"("courseId");

-- CreateIndex
CREATE INDEX "evaluations_startDate_endDate_idx" ON "evaluations"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "evaluation_challenges_challengeId_idx" ON "evaluation_challenges"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_challenges_evaluationId_challengeId_key" ON "evaluation_challenges"("evaluationId", "challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_challenges_evaluationId_position_key" ON "evaluation_challenges"("evaluationId", "position");

-- CreateIndex
CREATE INDEX "evaluation_attempts_studentId_idx" ON "evaluation_attempts"("studentId");

-- CreateIndex
CREATE INDEX "evaluation_attempts_evaluationId_studentId_idx" ON "evaluation_attempts"("evaluationId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_attempts_evaluationId_studentId_attemptNumber_key" ON "evaluation_attempts"("evaluationId", "studentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "submissions_evaluationAttemptId_idx" ON "submissions"("evaluationAttemptId");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_evaluationAttemptId_fkey" FOREIGN KEY ("evaluationAttemptId") REFERENCES "evaluation_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_challenges" ADD CONSTRAINT "evaluation_challenges_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_challenges" ADD CONSTRAINT "evaluation_challenges_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_attempts" ADD CONSTRAINT "evaluation_attempts_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_attempts" ADD CONSTRAINT "evaluation_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
