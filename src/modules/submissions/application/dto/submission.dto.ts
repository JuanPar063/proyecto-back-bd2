import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Body de POST /submissions (variante legacy con challengeId en el body).
 * Para POST /challenges/:challengeId/submissions usar SubmitFromChallengeDto.
 */
export class CreateSubmissionDto {
  @ApiProperty({ description: 'ID del reto a resolver', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  challengeId!: string;

  @ApiProperty({
    description: 'Query SQL enviada por el estudiante (solo SELECT en evaluación automática)',
    minLength: 5,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  query!: string;

  @ApiPropertyOptional({ description: 'ID de evaluación (módulo de Sofia)' })
  @IsUUID()
  @IsOptional()
  evaluationId?: string;
}

/** Body de POST /challenges/:challengeId/submissions — el challengeId va por la URL. */
export class SubmitFromChallengeDto {
  @ApiProperty({ description: 'Query SQL enviada por el estudiante', minLength: 5 })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  query!: string;

  @ApiPropertyOptional({ description: 'ID de evaluación (módulo de Sofia)' })
  @IsUUID()
  @IsOptional()
  evaluationId?: string;
}

/** Filtros para GET /submissions. STUDENT ignora studentId si apunta a otro usuario. */
export class ListSubmissionsQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por reto', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  challengeId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estudiante', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Tamaño máximo de página', default: 50, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset de la página', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

/**
 * Body para PUT /challenges/:challengeId/expected-result.
 * El profesor sube columnas + filas que el Runner debe producir.
 * Para cargas masivas se acepta JSON: rows es un arreglo de arreglos
 * donde cada celda es string | number | boolean | null.
 */
export class UpsertExpectedResultDto {
  @ApiProperty({
    description: 'Nombres de las columnas esperadas (en cualquier orden).',
    example: ['name', 'total'],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  columns!: string[];

  @ApiProperty({
    description: 'Filas esperadas. Cada fila es un arreglo paralelo a columns.',
    example: [['Ana', 5], ['Beto', 3]],
    type: 'array',
    items: { type: 'array', items: { type: 'string', nullable: true } },
  })
  @IsArray()
  @ArrayNotEmpty()
  rows!: Array<Array<string | number | boolean | null>>;

  @ApiPropertyOptional({
    description: 'Si true, las filas se comparan respetando el orden devuelto por la query.',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  orderSensitive?: boolean;

  @ApiPropertyOptional({
    description:
      'Tolerancia absoluta para comparar valores numéricos (DECIMALes con redondeo). 0 = comparación exacta.',
    default: 0,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  floatTolerance?: number;
}
