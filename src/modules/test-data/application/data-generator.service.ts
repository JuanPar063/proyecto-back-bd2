import { BadRequestException, Injectable } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import {
  FieldConfigDto,
  TableGeneratorConfigDto,
} from './dto/test-data.dto';

/**
 * Generador de datos de prueba.
 *
 * @responsable Ruiz Akle, Juan.
 *
 * Características:
 *  - Tipos: integer, decimal, date, varchar, enum, foreign_key.
 *  - varchar con presets semánticos (faker): name, email, city, etc.
 *  - Casos borde: `fixedValue` (override), `includeExtremes` (garantiza min y
 *    max en las primeras dos filas), `weights` (distribuciones no uniformes
 *    para enum), `nullPercent` (porcentaje de nulos).
 *  - Semilla determinística por tabla (`seed`) para corridas reproducibles.
 *  - Orden topológico automático según FKs.
 */
@Injectable()
export class DataGeneratorService {
  generate(tables: TableGeneratorConfigDto[]): { sql: string } {
    const ordered = this.topologicalSort(tables);
    const generatedIds: Record<string, (string | number)[]> = {};
    const lines: string[] = [];

    for (const table of ordered) {
      this.validateTableConfig(table);

      // Semilla determinística por tabla. Sin seed, faker es no-determinístico.
      if (table.seed != null) faker.seed(table.seed);

      const fieldNames = Object.keys(table.fields);
      const ids: (string | number)[] = [];

      for (let i = 1; i <= table.rows; i++) {
        const values = fieldNames.map((name) =>
          this.generateValue(name, table.fields[name], generatedIds, i, table.rows),
        );
        lines.push(
          `INSERT INTO ${table.table} (${fieldNames.join(', ')}) VALUES (${values.join(', ')});`,
        );
        ids.push(i);
      }
      generatedIds[`${table.table}.id`] = ids;
    }

    return { sql: lines.join('\n') };
  }

  // -------------------------------------------------------------------------
  // Validación
  // -------------------------------------------------------------------------

  private validateTableConfig(table: TableGeneratorConfigDto): void {
    if (Object.keys(table.fields).length === 0) {
      throw new BadRequestException(`Tabla ${table.table} no tiene campos configurados`);
    }
    for (const [name, cfg] of Object.entries(table.fields)) {
      this.validateField(table.table, name, cfg);
    }
  }

  private validateField(tableName: string, name: string, cfg: FieldConfigDto): void {
    const where = `${tableName}.${name}`;

    if (cfg.nullPercent != null && (cfg.nullPercent < 0 || cfg.nullPercent > 100)) {
      throw new BadRequestException(`nullPercent fuera de [0,100] en ${where}`);
    }

    if (cfg.min != null && cfg.max != null && cfg.min > cfg.max) {
      throw new BadRequestException(`min>max en ${where}`);
    }

    if (cfg.type === 'date') {
      if (!cfg.from || !cfg.to) {
        throw new BadRequestException(`from/to requeridos para date en ${where}`);
      }
      const f = Date.parse(cfg.from);
      const t = Date.parse(cfg.to);
      if (isNaN(f) || isNaN(t)) {
        throw new BadRequestException(`from/to inválidos en ${where}`);
      }
      if (f > t) {
        throw new BadRequestException(`from > to en ${where}`);
      }
    }

    if (cfg.type === 'enum') {
      if (!cfg.values || cfg.values.length === 0) {
        throw new BadRequestException(`values requerido para enum en ${where}`);
      }
      if (cfg.weights) {
        if (cfg.weights.length !== cfg.values.length) {
          throw new BadRequestException(
            `weights.length (${cfg.weights.length}) != values.length (${cfg.values.length}) en ${where}`,
          );
        }
        if (cfg.weights.some((w) => w < 0)) {
          throw new BadRequestException(`weights debe ser no negativo en ${where}`);
        }
        if (cfg.weights.every((w) => w === 0)) {
          throw new BadRequestException(`weights todos cero en ${where}`);
        }
      }
    }

    if (cfg.type === 'foreign_key' && !cfg.references) {
      throw new BadRequestException(`references requerido para foreign_key en ${where}`);
    }
    if (cfg.references && !/^\w+\.\w+$/.test(cfg.references)) {
      throw new BadRequestException(
        `references debe tener formato "tabla.columna" en ${where}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Generación de valores
  // -------------------------------------------------------------------------

  private generateValue(
    fieldName: string,
    cfg: FieldConfigDto,
    generatedIds: Record<string, (string | number)[]>,
    rowIndex: number,
    totalRows: number,
  ): string {
    // 1) fixedValue gana sobre todo lo demás (incluido nullPercent y extremos).
    if (cfg.fixedValue !== undefined) {
      return this.formatLiteral(cfg.fixedValue);
    }

    // 2) Slot de extremos: filas 1 y 2 producen min y max respectivamente.
    const inExtremesSlot =
      !!cfg.includeExtremes && totalRows >= 2 && (rowIndex === 1 || rowIndex === 2);

    // 3) NULL aleatorio: nunca en slot de extremos (sería inútil para tests).
    if (
      !inExtremesSlot &&
      cfg.nullPercent != null &&
      Math.random() * 100 < cfg.nullPercent
    ) {
      return 'NULL';
    }

    switch (cfg.type) {
      case 'integer':
        return this.genInteger(cfg, rowIndex, inExtremesSlot);
      case 'decimal':
        return this.genDecimal(cfg, rowIndex, inExtremesSlot);
      case 'date':
        return this.genDate(cfg, rowIndex, inExtremesSlot);
      case 'varchar':
        return this.genVarchar(cfg, fieldName, rowIndex);
      case 'enum':
        return this.genEnum(cfg);
      case 'foreign_key':
        return this.genFk(cfg, fieldName, generatedIds);
      default: {
        const _exhaustive: never = cfg.type;
        throw new BadRequestException(`Tipo no soportado: ${_exhaustive}`);
      }
    }
  }

  private formatLiteral(v: string | number | boolean): string {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  private genInteger(cfg: FieldConfigDto, rowIndex: number, inExtremesSlot: boolean): string {
    const min = Math.trunc(cfg.min ?? 0);
    const max = Math.trunc(cfg.max ?? 1000);
    if (inExtremesSlot) return String(rowIndex === 1 ? min : max);
    return String(faker.number.int({ min, max }));
  }

  private genDecimal(cfg: FieldConfigDto, rowIndex: number, inExtremesSlot: boolean): string {
    const min = cfg.min ?? 0;
    const max = cfg.max ?? 1000;
    if (inExtremesSlot) return (rowIndex === 1 ? min : max).toFixed(2);
    return faker.number.float({ min, max, fractionDigits: 2 }).toFixed(2);
  }

  private genDate(cfg: FieldConfigDto, rowIndex: number, inExtremesSlot: boolean): string {
    const start = Date.parse(cfg.from!);
    const end = Date.parse(cfg.to!);
    if (inExtremesSlot) {
      const ts = rowIndex === 1 ? start : end;
      return `'${new Date(ts).toISOString().slice(0, 10)}'`;
    }
    const date = faker.date.between({ from: new Date(start), to: new Date(end) });
    return `'${date.toISOString().slice(0, 10)}'`;
  }

  private genVarchar(cfg: FieldConfigDto, fieldName: string, rowIndex: number): string {
    const max = cfg.maxLength ?? 64;
    let value: string;
    switch (cfg.preset) {
      case 'name':       value = faker.person.fullName(); break;
      case 'firstName':  value = faker.person.firstName(); break;
      case 'lastName':   value = faker.person.lastName(); break;
      case 'email':      value = faker.internet.email(); break;
      case 'phone':      value = faker.phone.number(); break;
      case 'username':   value = faker.internet.username(); break;
      case 'city':       value = faker.location.city(); break;
      case 'country':    value = faker.location.country(); break;
      case 'address':    value = faker.location.streetAddress(); break;
      case 'company':    value = faker.company.name(); break;
      case 'word':       value = faker.lorem.word(); break;
      case 'sentence':   value = faker.lorem.sentence(); break;
      case 'paragraph':  value = faker.lorem.paragraph(); break;
      default:           value = `${fieldName}_${rowIndex}`;
    }
    return `'${value.slice(0, max).replace(/'/g, "''")}'`;
  }

  private genEnum(cfg: FieldConfigDto): string {
    const values = cfg.values!;
    let idx: number;
    if (cfg.weights) {
      const total = cfg.weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      idx = cfg.weights.length - 1;
      for (let i = 0; i < cfg.weights.length; i++) {
        r -= cfg.weights[i];
        if (r <= 0) {
          idx = i;
          break;
        }
      }
    } else {
      idx = faker.number.int({ min: 0, max: values.length - 1 });
    }
    return `'${values[idx].replace(/'/g, "''")}'`;
  }

  private genFk(
    cfg: FieldConfigDto,
    fieldName: string,
    generatedIds: Record<string, (string | number)[]>,
  ): string {
    const pool = generatedIds[cfg.references!];
    if (!pool || pool.length === 0) {
      throw new BadRequestException(
        `FK ${fieldName} apunta a ${cfg.references}, pero esa tabla no se ha generado o está vacía`,
      );
    }
    return String(pool[faker.number.int({ min: 0, max: pool.length - 1 })]);
  }

  // -------------------------------------------------------------------------
  // Orden topológico
  // -------------------------------------------------------------------------

  private topologicalSort(tables: TableGeneratorConfigDto[]): TableGeneratorConfigDto[] {
    const map = new Map(tables.map((t) => [t.table, t]));
    const visited = new Set<string>();
    const tempMark = new Set<string>();
    const result: TableGeneratorConfigDto[] = [];

    const visit = (t: TableGeneratorConfigDto) => {
      if (visited.has(t.table)) return;
      if (tempMark.has(t.table)) {
        throw new BadRequestException(`Ciclo detectado en FKs en tabla ${t.table}`);
      }
      tempMark.add(t.table);

      for (const f of Object.values(t.fields)) {
        if (f.type === 'foreign_key' && f.references) {
          const dep = f.references.split('.')[0];
          const depTable = map.get(dep);
          if (depTable) visit(depTable);
        }
      }
      tempMark.delete(t.table);
      visited.add(t.table);
      result.push(t);
    };

    for (const t of tables) visit(t);
    return result;
  }
}
