export class LeaderboardEntryDto {
  studentId: string;
  fullName: string;
  totalScore: number;
  solvedChallenges: number;
  totalSubmissions: number;
  bestExecutionTimeMs: number | null;
}

export class LeaderboardDto {
  courseId?: string;
  evaluationId?: string;
  entries: LeaderboardEntryDto[];
}