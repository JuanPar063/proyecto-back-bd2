import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateManualDatasetDto {
  @ApiProperty({ example: 'dataset_basico' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    description: 'Script INSERT con los datos iniciales',
    example: "INSERT INTO customers (name) VALUES ('Ana');",
  })
  @IsString()
  @MinLength(10)
  sql!: string;
}

// ----------- Generador -----------

export class FieldConfigDto {
  @ApiProperty({
    enum: ['integer', 'decimal', 'date', 'varchar', 'enum', 'foreign_key'],
  })
  @IsEnum(['integer', 'decimal', 'date', 'varchar', 'enum', 'foreign_key'])
  type!: 'integer' | 'decimal' | 'date' | 'varchar' | 'enum' | 'foreign_key';

  // numeric
  @ApiPropertyOptional() @IsOptional() @IsInt() min?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() max?: number;

  // date
  @ApiPropertyOptional({ example: '2026-01-01' }) @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @IsString() to?: string;

  // varchar
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxLength?: number;

  // enum
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];

  // foreign_key — formato "tabla.columna"
  @ApiPropertyOptional({ example: 'customers.id' })
  @IsOptional()
  @IsString()
  references?: string;

  @ApiPropertyOptional({ description: 'Porcentaje de NULL permitidos (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  nullPercent?: number;
}

export class TableGeneratorConfigDto {
  @ApiProperty({ example: 'orders' })
  @IsString()
  table!: string;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(1)
  rows!: number;

  @ApiProperty({
    description: 'Configuración por campo',
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/FieldConfigDto' },
  })
  @IsObject()
  fields!: Record<string, FieldConfigDto>;
}

export class GenerateDatasetDto {
  @ApiProperty({ example: 'dataset_generado' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ type: [TableGeneratorConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableGeneratorConfigDto)
  tables!: TableGeneratorConfigDto[];
}
