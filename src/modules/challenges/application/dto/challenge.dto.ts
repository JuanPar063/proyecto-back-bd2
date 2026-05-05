import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChallengeStatus, DatabaseEngine, Difficulty } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateChallengeDto {
  @ApiProperty({ example: 'Clientes con más de tres compras' })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiProperty({ enum: Difficulty })
  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @ApiProperty({ type: [String], example: ['SELECT', 'JOIN', 'GROUP BY'] })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @ApiPropertyOptional({ enum: DatabaseEngine, default: DatabaseEngine.postgresql })
  @IsOptional()
  @IsEnum(DatabaseEngine)
  databaseEngine?: DatabaseEngine;

  @ApiPropertyOptional({ default: 2000, description: 'Time limit en milisegundos' })
  @IsOptional()
  @IsInt()
  @Min(100)
  timeLimit?: number;

  @ApiProperty()
  @IsUUID()
  courseId!: string;
}

export class UpdateChallengeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: Difficulty }) @IsOptional() @IsEnum(Difficulty) difficulty?: Difficulty;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) timeLimit?: number;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: ChallengeStatus })
  @IsEnum(ChallengeStatus)
  status!: ChallengeStatus;
}
