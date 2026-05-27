import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationResultsVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEvaluationDto {
  @ApiProperty({ example: 'Parcial 1 - Consultas SQL' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiPropertyOptional({ example: 'Evaluacion sobre joins, filtros y agregaciones.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Curso al que pertenece la evaluacion', format: 'uuid' })
  @IsUUID()
  courseId!: string;

  @ApiProperty({ example: '2026-05-26T18:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ example: '2026-05-26T20:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @ApiProperty({ example: 90, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(480)
  durationMinutes!: number;

  @ApiPropertyOptional({ example: 2, default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @ApiPropertyOptional({
    enum: EvaluationResultsVisibility,
    default: EvaluationResultsVisibility.AFTER_END,
  })
  @IsOptional()
  @IsEnum(EvaluationResultsVisibility)
  resultsVisibility?: EvaluationResultsVisibility;
}

export class UpdateEvaluationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ minimum: 1, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @ApiPropertyOptional({ enum: EvaluationResultsVisibility })
  @IsOptional()
  @IsEnum(EvaluationResultsVisibility)
  resultsVisibility?: EvaluationResultsVisibility;
}

export class SetEvaluationChallengesDto {
  @ApiProperty({
    description: 'Lista ordenada de retos que componen la evaluacion',
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  challengeIds!: string[];
}
