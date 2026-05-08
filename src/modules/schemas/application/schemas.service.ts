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

/**
 * Metadata estructurada de una tabla del esquema, usada por el generador
 * de datos y el runner SQL (Entrega 2).
 */
export interface ParsedColumn {
  name: string;
  rawType: string;
  type: NormalizedType;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  references?: { table: string; column: string };
}

export interface ForeignKeyConstraint {
  columns: string[];
  referencesTable: string;
  referencesColumns: string[];
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  primaryKey: string[];
  foreignKeys: ForeignKeyConstraint[];
  uniqueConstraints: string[][];
}

/** Conjunto canónico que entiende el resto del backend (generador + runner). */
export type NormalizedType =
  | 'integer'
  | 'bigint'
  | 'serial'
  | 'bigserial'
  | 'decimal'
  | 'real'
  | 'double'
  | 'varchar'
  | 'char'
  | 'text'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'timestamptz'
  | 'time'
  | 'uuid'
  | 'json'
  | 'jsonb'
  | 'unknown';

/**
 * Statements DDL/DML que NUNCA deben aparecer en un script de esquema de reto.
 * Pre-validamos por texto antes de pasar al parser para dar mensajes claros
 * y proteger contra construcciones que el parser pudiera aceptar.
 */
const FORBIDDEN_STATEMENT_KEYWORDS = [
  'DROP',
  'ALTER',
  'TRUNCATE',
  'DELETE',
  'UPDATE',
  'INSERT',
  'GRANT',
  'REVOKE',
  'CREATE INDEX',
  'CREATE VIEW',
  'CREATE FUNCTION',
  'CREATE PROCEDURE',
  'CREATE TRIGGER',
  'CREATE SCHEMA',
  'CREATE DATABASE',
  'CREATE ROLE',
  'CREATE USER',
  'CREATE EXTENSION',
];

@Injectable()
export class SchemasService {
  private readonly parser = new Parser();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida sintáctica y semánticamente que el DDL contenga solo CREATE TABLE
   * y devuelve metadata estructurada de tablas, columnas, PKs y FKs.
   */
  parseDdl(ddl: string): ParsedTable[] {
    this.assertNoForbiddenStatements(ddl);

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
          `Solo se permiten sentencias CREATE TABLE. Se recibió: ${s?.type ?? 'desconocido'} ${s?.keyword ?? ''}`.trim(),
        );
      }
      tables.push(this.toParsedTable(s));
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

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  private async assertOwnership(challengeId: string, professorId: string) {
    const c = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!c) throw new NotFoundException('Reto no encontrado');
    if (c.createdById !== professorId) {
      throw new ForbiddenException('Solo el autor del reto puede modificar su esquema');
    }
    return c;
  }

  /**
   * Pre-chequeo textual contra DDL/DML peligrosos antes de pasar al parser.
   * Ignora contenido entre comillas y comentarios para reducir falsos positivos.
   */
  private assertNoForbiddenStatements(ddl: string): void {
    const sanitized = ddl
      // comentarios -- ... fin de línea
      .replace(/--[^\n]*/g, ' ')
      // comentarios /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // strings con comilla simple
      .replace(/'([^'\\]|\\.)*'/g, "''")
      // identificadores entre comillas dobles
      .replace(/"([^"\\]|\\.)*"/g, '""');

    for (const kw of FORBIDDEN_STATEMENT_KEYWORDS) {
      // boundary-aware: el keyword debe ir como "palabra(s)" — no parte de un identificador
      const pattern = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (pattern.test(sanitized)) {
        throw new BadRequestException(
          `Sentencia no permitida en el script de esquema: ${kw}. Solo se acepta CREATE TABLE.`,
        );
      }
    }
  }

  private toParsedTable(stmt: any): ParsedTable {
    const tableName = stmt.table?.[0]?.table ?? 'unknown';
    const definitions: any[] = stmt.create_definitions ?? [];

    const columns: ParsedColumn[] = [];
    const constraintFks: ForeignKeyConstraint[] = [];
    const constraintPk: string[] = [];
    const uniqueConstraints: string[][] = [];

    for (const def of definitions) {
      if (def.resource === 'column') {
        columns.push(this.toParsedColumn(def));
        continue;
      }
      if (def.resource === 'constraint') {
        const cType = String(def.constraint_type ?? '').toLowerCase();
        if (cType === 'primary key') {
          constraintPk.push(...this.extractColumnNames(def.definition));
        } else if (cType === 'foreign key' || cType === 'foreign_key') {
          const localCols = this.extractColumnNames(def.definition);
          const ref = def.reference_definition;
          const refTable = ref?.table?.[0]?.table ?? ref?.table ?? 'unknown';
          const refCols = this.extractColumnNames(ref?.definition);
          constraintFks.push({
            columns: localCols,
            referencesTable: String(refTable),
            referencesColumns: refCols,
          });
        } else if (cType === 'unique') {
          uniqueConstraints.push(this.extractColumnNames(def.definition));
        }
      }
    }

    // PK derivada: bien de constraint explícito, bien de columnas marcadas como inline PK.
    const inlinePk = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    const primaryKey = constraintPk.length > 0 ? constraintPk : inlinePk;

    // FKs inline (REFERENCES en la columna) se suman a las constraint-level
    const inlineFks: ForeignKeyConstraint[] = columns
      .filter((c) => !!c.references)
      .map((c) => ({
        columns: [c.name],
        referencesTable: c.references!.table,
        referencesColumns: [c.references!.column],
      }));

    return {
      name: tableName,
      columns,
      primaryKey,
      foreignKeys: [...constraintFks, ...inlineFks],
      uniqueConstraints,
    };
  }

  private toParsedColumn(def: any): ParsedColumn {
    const rawType = String(def.definition?.dataType ?? '').trim();
    const length = this.toFiniteNumber(def.definition?.length);
    const scale = this.toFiniteNumber(def.definition?.scale);
    // En PostgreSQL DECIMAL(p,s): length = precision, scale = scale.
    const precision = length;

    const nullable = !def.nullable || def.nullable.value !== 'not null';
    const isPrimaryKey = !!def.primary_key || /\bprimary\s+key\b/i.test(String(def.unique_or_primary ?? ''));
    const isUnique = !!def.unique || /\bunique\b/i.test(String(def.unique_or_primary ?? ''));
    const hasDefault = def.default_val != null;

    let references: ParsedColumn['references'];
    const refDef = def.reference_definition;
    if (refDef) {
      const table = refDef.table?.[0]?.table ?? refDef.table ?? 'unknown';
      const columnsArr = this.extractColumnNames(refDef.definition);
      references = {
        table: String(table),
        column: columnsArr[0] ?? 'id',
      };
    }

    return {
      name: def.column?.column ?? 'unknown',
      rawType,
      type: this.normalizeType(rawType),
      length,
      precision,
      scale,
      nullable,
      isPrimaryKey,
      isUnique,
      hasDefault,
      references,
    };
  }

  private extractColumnNames(input: any): string[] {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : [input];
    return arr
      .map((d: any) => d?.column ?? d?.name ?? d)
      .filter((v: any) => typeof v === 'string');
  }

  private toFiniteNumber(value: any): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * Normaliza un nombre de tipo SQL Postgres a un identificador canónico.
   * Mantiene `unknown` como fallback explícito para que el generador / runner
   * decida cómo manejarlo en lugar de adivinar.
   */
  private normalizeType(rawType: string): NormalizedType {
    const t = rawType.toLowerCase().replace(/\s+/g, ' ').trim();
    switch (t) {
      case 'int':
      case 'integer':
      case 'int4':
        return 'integer';
      case 'bigint':
      case 'int8':
        return 'bigint';
      case 'serial':
      case 'serial4':
        return 'serial';
      case 'bigserial':
      case 'serial8':
        return 'bigserial';
      case 'decimal':
      case 'numeric':
        return 'decimal';
      case 'real':
      case 'float4':
        return 'real';
      case 'double':
      case 'double precision':
      case 'float8':
        return 'double';
      case 'varchar':
      case 'character varying':
        return 'varchar';
      case 'char':
      case 'character':
      case 'bpchar':
        return 'char';
      case 'text':
        return 'text';
      case 'bool':
      case 'boolean':
        return 'boolean';
      case 'date':
        return 'date';
      case 'timestamp':
      case 'timestamp without time zone':
        return 'timestamp';
      case 'timestamptz':
      case 'timestamp with time zone':
        return 'timestamptz';
      case 'time':
      case 'time without time zone':
        return 'time';
      case 'uuid':
        return 'uuid';
      case 'json':
        return 'json';
      case 'jsonb':
        return 'jsonb';
      default:
        return 'unknown';
    }
  }
}
