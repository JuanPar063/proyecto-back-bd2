import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CustomersOrdersDemoDto {
  @ApiPropertyOptional({
    description: 'Nombre del curso a crear (default: "Demo SQL Judge")',
    example: 'Demo BD2 2026',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  courseName?: string;

  @ApiPropertyOptional({
    description: 'Código del curso (default: DEMO-<timestamp>)',
    example: 'DEMO-2026-1',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  courseCode?: string;

  @ApiPropertyOptional({ description: 'Filas en customers', default: 100, example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  customerCount?: number;

  @ApiPropertyOptional({ description: 'Filas en orders', default: 1000, example: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500000)
  orderCount?: number;
}
