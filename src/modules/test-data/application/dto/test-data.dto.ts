import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
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

/**
 * Presets semánticos para columnas varchar. Usan @faker-js/faker.
 * Si no se especifica preset, el generador usa el fallback `fieldName_rowIndex`.
 */
export type VarcharPreset =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'username'
  | 'city'
  | 'country'
  | 'address'
  | 'company'
  | 'word'
  | 'sentence'
  | 'paragraph';

const VARCHAR_PRESETS: VarcharPreset[] = [
  'name',
  'firstName',
  'lastName',
  'email',
  'phone',
  'username',
  'city',
  'country',
  'address',
  'company',
  'word',
  'sentence',
  'paragraph',
];

export class FieldConfigDto {
  @ApiProperty({
    enum: ['integer', 'decimal', 'date', 'varchar', 'enum', 'foreign_key'],
  })
  @IsEnum(['integer', 'decimal', 'date', 'varchar', 'enum', 'foreign_key'])
  type!: 'integer' | 'decimal' | 'date' | 'varchar' | 'enum' | 'foreign_key';

  // numeric
  @ApiPropertyOptional() @IsOptional() @IsNumber() min?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() max?: number;

  // date
  @ApiPropertyOptional({ example: '2026-01-01' }) @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @IsString() to?: string;

  // varchar
  @ApiPropertyOptional({ description: 'Longitud máxima del valor generado (truncado al final)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @ApiPropertyOptional({
    enum: VARCHAR_PRESETS,
    description:
      'Preset semántico para varchar usando faker. Sin preset, se usa fallback simple.',
  })
  @IsOptional()
  @IsEnum(VARCHAR_PRESETS)
  preset?: VarcharPreset;

  // enum
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Pesos relativos por valor (paralelo a `values`). Permite distribuciones no uniformes.',
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  weights?: number[];

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

  // ---- casos borde ----

  @ApiPropertyOptional({
    description:
      'Valor fijo que sobreescribe la generación aleatoria. Útil para columnas constantes.',
  })
  @IsOptional()
  fixedValue?: string | number | boolean;

  @ApiPropertyOptional({
    description:
      'Si es true, garantiza que la primera fila tenga el valor mínimo y la segunda el máximo (integer/decimal/date).',
  })
  @IsOptional()
  @IsBoolean()
  includeExtremes?: boolean;
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

  @ApiPropertyOptional({
    description: 'Semilla determinística (entero). Si se fija, las corridas son reproducibles.',
  })
  @IsOptional()
  @IsInt()
  seed?: number;
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
