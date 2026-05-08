import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/infrastructure/decorators/current-user.decorator';
import { TestDataService } from '../application/test-data.service';
import {
  CreateManualDatasetDto,
  GenerateDatasetDto,
} from '../application/dto/test-data.dto';

@ApiTags('test-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges/:challengeId/test-data')
export class TestDataController {
  constructor(private readonly service: TestDataService) {}

  @Get()
  @ApiOperation({ summary: 'Listar datasets del reto' })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto' })
  @ApiResponse({ status: 200, description: 'Datasets ordenados por fecha desc' })
  list(@Param('challengeId', new ParseUUIDPipe()) challengeId: string) {
    return this.service.listForChallenge(challengeId);
  }

  @Post('manual')
  @Roles(Role.PROFESSOR)
  @ApiOperation({ summary: 'Cargar dataset manual (script INSERT)' })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto' })
  @ApiResponse({ status: 201, description: 'Dataset creado' })
  @ApiResponse({ status: 403, description: 'No es el autor del reto' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado' })
  createManual(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: CreateManualDatasetDto,
  ) {
    return this.service.createManual(challengeId, u.id, dto);
  }

  @Post('generate')
  @Roles(Role.PROFESSOR)
  @ApiOperation({
    summary: 'Generar dataset a partir de configuración',
    description:
      'Genera INSERTs respetando FKs. Soporta presets faker (name, city, email, etc.), distribuciones por pesos para enums, valores fijos, garantía de extremos (min/max en filas 1 y 2) y semilla determinística por tabla.',
  })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto' })
  @ApiResponse({ status: 201, description: 'Dataset generado y almacenado' })
  @ApiResponse({
    status: 400,
    description: 'Configuración inválida (min>max, ciclo de FKs, weights mal alineados, etc.)',
  })
  @ApiResponse({ status: 403, description: 'No es el autor del reto' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado' })
  generate(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: GenerateDatasetDto,
  ) {
    return this.service.generate(challengeId, u.id, dto);
  }

  @Post('preview')
  @Roles(Role.PROFESSOR)
  @ApiOperation({
    summary: 'Previsualizar el SQL generado sin guardarlo',
    description:
      'Útil para iterar la configuración del generador antes de persistir el dataset.',
  })
  @ApiResponse({ status: 200, description: 'SQL generado' })
  @ApiResponse({ status: 400, description: 'Configuración inválida' })
  preview(@Body() dto: GenerateDatasetDto) {
    return this.service.preview(dto);
  }
}
