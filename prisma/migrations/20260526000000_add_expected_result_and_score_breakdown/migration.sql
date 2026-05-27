-- AddColumn: expectedResult to challenges
ALTER TABLE "challenges" ADD COLUMN "expectedResult" JSONB;

-- AddColumn: scoreBreakdown and resultData to submissions
ALTER TABLE "submissions" ADD COLUMN "scoreBreakdown" JSONB;
ALTER TABLE "submissions" ADD COLUMN "resultData" JSONB;
