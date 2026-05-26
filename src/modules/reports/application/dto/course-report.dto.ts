export class CourseReportDto {
  courseId: string;
  averageScore: number;
  topStudents: {
    studentId: string;
    fullName: string;
    averageScore: number;
    solvedChallenges: number;
  }[];
  hardestChallenges: {
    challengeId: string;
    title: string;
    successRate: number;
  }[];
}