import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Cargar/actualizar el esquema SQL del reto' })
  upsert(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: UpsertSchemaDto,
  ) {
    return this.schemas.upsert(challengeId, u.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar el esquema cargado del reto' })
  findOne(@Param('challengeId', new ParseUUIDPipe()) challengeId: string) {
    return this.schemas.findByChallenge(challengeId);
  }
}
