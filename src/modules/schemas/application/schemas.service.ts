import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { UpsertSchemaDto } from './dto/schema.dto';
// node-sql-parser viene tipado parcial; usamos require dinámico para evitar fricción.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Parser } = require('node-sql-parser');

interface ParsedTable {
  name: string;
  columns: { name: string; type: string; nullable: boolean }[];
}

@Injectable()
export class SchemasService {
  private readonly parser = new Parser();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida sintáctica y semánticamente que el DDL sean sentencias CREATE TABLE.
   * Devuelve metadata de tablas/columnas detectadas (útil para el generador
   * y el runner).
   */
  parseDdl(ddl: string): ParsedTable[] {
    let ast: unknown;
    try {
      ast = this.parser.astify(ddl, { database: 'postgresql' });
    } catch (err) {
      throw new BadRequestException(`SQL inválido: ${(err as Error).message}`);
    }
    const stmts = Array.isArray(ast) ? ast : [ast];
    const tables: ParsedTable[] = [];
    for (const raw of stmts) {
      const s = raw as any;
      if (s?.type !== 'create' || s?.keyword !== 'table') {
        throw new BadRequestException(
          'Solo se permiten sentencias CREATE TABLE en el script de esquema',
        );
      }
      const tableName = s.table?.[0]?.table ?? 'unknown';
      const columns =
        s.create_definitions
          ?.filter((d: any) => d.resource === 'column')
          .map((d: any) => ({
            name: d.column?.column,
            type: String(d.definition?.dataType ?? '').toLowerCase(),
            nullable: !d.nullable || d.nullable.value !== 'not null',
          })) ?? [];
      tables.push({ name: tableName, columns });
    }
    return tables;
  }

  async upsert(challengeId: string, professorId: string, dto: UpsertSchemaDto) {
    await this.assertOwnership(challengeId, professorId);
    const parsedTables = this.parseDdl(dto.ddl);

    return this.prisma.schemaScript.upsert({
      where: { challengeId },
      create: {
        challengeId,
        ddl: dto.ddl,
        parsedTables: parsedTables as any,
      },
      update: {
        ddl: dto.ddl,
        parsedTables: parsedTables as any,
        version: { increment: 1 },
      },
    });
  }

  async findByChallenge(challengeId: string) {
    const schema = await this.prisma.schemaScript.findUnique({
      where: { challengeId },
    });
    if (!schema) throw new NotFoundException('Este reto aún no tiene esquema cargado');
    return schema;
  }

  private async assertOwnership(challengeId: string, professorId: string) {
    const c = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!c) throw new NotFoundException('Reto no encontrado');
    if (c.createdById !== professorId) {
      throw new ForbiddenException('Solo el autor del reto puede modificar su esquema');
    }
    return c;
  }
}
