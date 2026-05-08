import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
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
import { SchemasService } from '../application/schemas.service';
import { UpsertSchemaDto } from '../application/dto/schema.dto';

@ApiTags('schemas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('challenges/:challengeId/schema')
export class SchemasController {
  constructor(private readonly schemas: SchemasService) {}

  @Put()
  @Roles(Role.PROFESSOR)
  @ApiOperation({
    summary: 'Cargar/actualizar el esquema SQL del reto',
    description:
      'Acepta solo CREATE TABLE. Rechaza DROP/ALTER/TRUNCATE/INSERT/UPDATE/DELETE/GRANT/REVOKE y CREATE INDEX/VIEW/FUNCTION/PROCEDURE/TRIGGER/SCHEMA/DATABASE/ROLE/USER/EXTENSION. Persiste metadata estructurada (parsedTables) con PKs, FKs, columnas, length/precision/scale y tipos normalizados.',
  })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto dueño del esquema' })
  @ApiResponse({ status: 200, description: 'Esquema upserteado, version incrementada' })
  @ApiResponse({
    status: 400,
    description: 'DDL inválido, sentencia no permitida, o SQL no parseable',
  })
  @ApiResponse({ status: 403, description: 'No es el autor del reto' })
  @ApiResponse({ status: 404, description: 'Reto no encontrado' })
  upsert(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: UpsertSchemaDto,
  ) {
    return this.schemas.upsert(challengeId, u.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar el esquema cargado del reto' })
  @ApiParam({ name: 'challengeId', description: 'UUID del reto' })
  @ApiResponse({ status: 200, description: 'Esquema con DDL y parsedTables' })
  @ApiResponse({ status: 404, description: 'El reto no tiene esquema cargado' })
  findOne(@Param('challengeId', new ParseUUIDPipe()) challengeId: string) {
    return this.schemas.findByChallenge(challengeId);
  }
}
