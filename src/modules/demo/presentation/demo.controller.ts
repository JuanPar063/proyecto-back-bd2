import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/infrastructure/decorators/current-user.decorator';
import { DemoService } from '../application/demo.service';
import { CustomersOrdersDemoDto } from '../application/dto/demo.dto';

@ApiTags('demo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('customers-orders')
  @Roles(Role.PROFESSOR)
  @ApiOperation({
    summary:
      'Crea un escenario completo (curso + reto publicado + esquema + dataset generado) — útil para sustentación',
    description:
      'Atajo end-to-end para profesores: arma de un solo golpe un curso con un reto publicado de "clientes con más de 3 compras", carga su esquema (customers + orders) y genera un dataset con datos sintéticos realistas (faker) usando semillas determinísticas. El reto queda listo para que un STUDENT inscrito le envíe submissions.',
  })
  customersOrders(
    @CurrentUser() u: CurrentUserPayload,
    @Body() dto: CustomersOrdersDemoDto,
  ) {
    return this.demo.createCustomersOrdersDemo(u.id, dto);
  }
}
