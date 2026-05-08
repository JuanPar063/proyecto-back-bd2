import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class CreateSubmissionDto {
  @ApiProperty({ description: 'ID del reto a resolver' })
  @IsUUID()
  @IsNotEmpty()
  challengeId: string;

  @ApiProperty({ description: 'Query SQL enviada por el estudiante' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  query: string;

  @ApiPropertyOptional({ description: 'ID de evaluación (si aplica)' })
  @IsUUID()
  @IsOptional()
  evaluationId?: string;
}
