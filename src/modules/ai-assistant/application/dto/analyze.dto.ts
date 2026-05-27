import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubmissionStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Estados que el endpoint interno acepta. Excluimos los transitorios
 * (QUEUED, RUNNING) porque el asistente solo tiene sentido sobre estados
 * terminales o tras una corrida real.
 */
const ANALYZABLE_STATUSES = [
  SubmissionStatus.ACCEPTED,
  SubmissionStatus.WRONG_ANSWER,
  SubmissionStatus.SYNTAX_ERROR,
  SubmissionStatus.TIME_LIMIT_EXCEEDED,
  SubmissionStatus.RUNTIME_ERROR,
  SubmissionStatus.OPTIMIZATION_REQUIRED,
] as const;

/**
 * DTO para el endpoint interno POST /ai-assistant/analyze.
 *
 * Refleja el AiAnalysisInput del contrato 5.3, pero como DTO con validación
 * y anotaciones Swagger. El controller lo recibe y se lo pasa directo al
 * AiAssistantService.
 *
 * Este endpoint NO es el flujo de producción: en producción el worker llama
 * al servicio en proceso. Existe solo para debugging y para que el equipo
 * pueda probar el motor de reglas sin depender del runner.
 */
export class AnalyzeQueryDto {
  @ApiProperty({ description: 'Query SQL a analizar' })
  @IsString()
  @MinLength(5)
  query: string;

  @ApiProperty({ description: 'DDL del reto (CREATE TABLE ...)' })
  @IsString()
  schemaDdl: string;

  @ApiProperty({ description: 'Tiempo de ejecución medido (ms)' })
  @IsInt()
  @Min(0)
  executionTimeMs: number;

  @ApiPropertyOptional({ description: 'EXPLAIN del motor SQL', nullable: true })
  @IsOptional()
  @IsString()
  explainPlan?: string | null;

  @ApiProperty({
    enum: ANALYZABLE_STATUSES,
    description:
      'Estado derivado del worker (post-runner + post-comparator). Excluye QUEUED/RUNNING.',
  })
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;
}
