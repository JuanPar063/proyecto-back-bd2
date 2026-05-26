/**
 * ============================================================
 * types.ts — Tipos e interfaces para Docker runner
 * ============================================================
 */

export interface SqlExecutionResult {
  rows: any[];
  rowCount: number;
  executionTimeMs: number;
  columns: string[];
  success: boolean;
  error?: string;
}

export interface ContainerConfig {
  memory: number; // bytes
  cpus: number;
  timeout: number; // ms
}

export interface ContainerOptions {
  environmentVariables?: Record<string, string>;
  resourceLimits?: ContainerConfig;
}

export interface SubmissionEvaluation {
  status: SubmissionStatus;
  score?: number;
  scoreBreakdown?: ScoreBreakdown;
  executionTimeMs?: number;
  errorMessage?: string;
  resultData?: any[];
}

export interface ScoreBreakdown {
  correctness: number; // 0-60
  executionTime: number; // 0-15
  sqlPractices: number; // 0-10
  final: number; // 0-100
}

export enum SubmissionStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  ACCEPTED = 'ACCEPTED',
  WRONG_ANSWER = 'WRONG_ANSWER',
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  TIME_LIMIT_EXCEEDED = 'TIME_LIMIT_EXCEEDED',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  OPTIMIZATION_REQUIRED = 'OPTIMIZATION_REQUIRED',
}

export interface EvaluationContext {
  submissionId: string;
  studentId: string;
  challengeId: string;
  challengeTimeLimit: number;
  schemaSql: string;
  seedSql?: string;
  studentQuery: string;
  expectedResult: any[] | null | undefined;
  databaseEngine: 'postgresql' | 'mysql' | 'sqlite';
}
