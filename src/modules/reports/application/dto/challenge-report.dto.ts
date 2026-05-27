export class ChallengeReportDto {
  challengeId: string;
  totalSubmissions: number;
  acceptedSubmissions: number;
  successRate: number;
  bestExecutionTimeMs: number | null;
  realDifficulty: number;
}