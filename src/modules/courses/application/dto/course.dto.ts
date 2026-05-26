import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'Bases de Datos II' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'BD2-2026' })
  @IsString()
  code!: string;

  @ApiProperty({ example: '2026-1' })
  @IsString()
  period!: string;

  @ApiProperty({ example: '1' })
  @IsString()
  group!: string;
}

export class UpdateCourseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  group?: string;
}

export class EnrollStudentDto {
  @ApiProperty({
    example: 'estudiante@test.com',
    description: 'Correo del estudiante que se desea inscribir en el curso',
  })
  @IsEmail()
  studentEmail!: string;
}

