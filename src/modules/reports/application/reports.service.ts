import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentReport(studentId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { studentId },
      select: {
        challengeId: true,
        status: true,
        score: true,
        executionTimeMs: true,
      },
    });

    const totalSubmissions = submissions.length;

    const solvedChallenges = new Set(
      submissions
        .filter((submission) => submission.status === 'ACCEPTED')
        .map((submission) => submission.challengeId),
    ).size;

    const scores = submissions
      .map((submission) => submission.score)
      .filter((score): score is number => score !== null);

    const averageScore =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0;

    const times = submissions
      .map((submission) => submission.executionTimeMs)
      .filter((time): time is number => time !== null);

    const bestExecutionTimeMs =
      times.length > 0 ? Math.min(...times) : null;

    return {
      studentId,
      solvedChallenges,
      totalSubmissions,
      averageScore,
      bestExecutionTimeMs,
    };
  }

  async getChallengeReport(challengeId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { challengeId },
      select: {
        status: true,
        executionTimeMs: true,
      },
    });

    const totalSubmissions = submissions.length;

    const acceptedSubmissions = submissions.filter(
      (submission) => submission.status === 'ACCEPTED',
    ).length;

    const successRate =
      totalSubmissions > 0
        ? acceptedSubmissions / totalSubmissions
        : 0;

    const times = submissions
      .map((submission) => submission.executionTimeMs)
      .filter((time): time is number => time !== null);

    const bestExecutionTimeMs =
      times.length > 0 ? Math.min(...times) : null;

    return {
      challengeId,
      totalSubmissions,
      acceptedSubmissions,
      successRate,
      bestExecutionTimeMs,
      realDifficulty: 1 - successRate,
    };
  }

  async getCourseReport(courseId: string) {
    const challenges = await this.prisma.challenge.findMany({
      where: { courseId },
      select: {
        id: true,
        title: true,
        submissions: {
          select: {
            studentId: true,
            status: true,
            score: true,
            student: { select: { fullName: true } },
          },
        },
      },
    });

    const allSubmissions = challenges.flatMap((challenge) =>
      challenge.submissions.map((submission) => ({
        ...submission,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
      })),
    );

    const scores = allSubmissions
      .map((submission) => submission.score)
      .filter((score): score is number => score !== null);

    const averageScore =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0;

    const hardestChallenges = challenges
      .map((challenge) => {
        const total = challenge.submissions.length;
        const accepted = challenge.submissions.filter(
          (submission) => submission.status === 'ACCEPTED',
        ).length;

        const successRate = total > 0 ? accepted / total : 0;

        return {
          challengeId: challenge.id,
          title: challenge.title,
          successRate,
        };
      })
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 5);

    const studentMap = new Map<
      string,
      {
        fullName: string;
        totalScore: number;
        count: number;
        solvedChallenges: Set<string>;
      }
    >();

    for (const submission of allSubmissions) {
      if (!studentMap.has(submission.studentId)) {
        studentMap.set(submission.studentId, {
          fullName: submission.student?.fullName ?? '',
          totalScore: 0,
          count: 0,
          solvedChallenges: new Set<string>(),
        });
      }

      const current = studentMap.get(submission.studentId)!;

      if (submission.score !== null) {
        current.totalScore += submission.score;
        current.count += 1;
      }

      if (submission.status === 'ACCEPTED') {
        current.solvedChallenges.add(submission.challengeId);
      }
    }

    const topStudents = Array.from(studentMap.entries())
      .map(([studentId, value]) => ({
        studentId,
        fullName: value.fullName,
        averageScore:
          value.count > 0 ? value.totalScore / value.count : 0,
        solvedChallenges: value.solvedChallenges.size,
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 5);

    return {
      courseId,
      averageScore,
      topStudents,
      hardestChallenges,
    };
  }

  async getLeaderboard(params: { courseId?: string; evaluationId?: string }) {
    const { courseId, evaluationId } = params;

    const submissions = await this.prisma.submission.findMany({
      where: {
        challenge: courseId
          ? {
              courseId,
            }
          : undefined,
      },
      select: {
        studentId: true,
        status: true,
        score: true,
        executionTimeMs: true,
        challengeId: true,
        student: { select: { fullName: true } },
      },
    });

    const studentMap = new Map<
      string,
      {
        fullName: string;
        totalScore: number;
        totalSubmissions: number;
        solvedChallenges: Set<string>;
        bestExecutionTimeMs: number | null;
      }
    >();

    for (const submission of submissions) {
      if (!studentMap.has(submission.studentId)) {
        studentMap.set(submission.studentId, {
          fullName: submission.student?.fullName ?? '',
          totalScore: 0,
          totalSubmissions: 0,
          solvedChallenges: new Set<string>(),
          bestExecutionTimeMs: null,
        });
      }

      const current = studentMap.get(submission.studentId)!;

      current.totalSubmissions += 1;

      if (submission.score !== null) {
        current.totalScore += submission.score;
      }

      if (submission.status === 'ACCEPTED') {
        current.solvedChallenges.add(submission.challengeId);
      }

      if (submission.executionTimeMs !== null) {
        current.bestExecutionTimeMs =
          current.bestExecutionTimeMs === null
            ? submission.executionTimeMs
            : Math.min(current.bestExecutionTimeMs, submission.executionTimeMs);
      }
    }

    const entries = Array.from(studentMap.entries())
      .map(([studentId, value]) => ({
        studentId,
        fullName: value.fullName,
        totalScore: value.totalScore,
        solvedChallenges: value.solvedChallenges.size,
        totalSubmissions: value.totalSubmissions,
        bestExecutionTimeMs: value.bestExecutionTimeMs,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    return {
      courseId,
      evaluationId,
      entries,
    };
  }
}