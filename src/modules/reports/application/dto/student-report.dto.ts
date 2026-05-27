export class StudentReportDto {
  studentId: string;
  solvedChallenges: number;
  totalSubmissions: number;
  averageScore: number;
  bestExecutionTimeMs: number | null;
}