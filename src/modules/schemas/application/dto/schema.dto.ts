import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpsertSchemaDto {
  @ApiProperty({
    description: 'Script DDL del esquema (CREATE TABLE...)',
    example: 'CREATE TABLE customers (id SERIAL PRIMARY KEY, name VARCHAR(100));',
  })
  @IsString()
  @MinLength(10)
  ddl!: string;
}
