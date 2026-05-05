import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  FieldConfigDto,
  TableGeneratorConfigDto,
} from './dto/test-data.dto';

/**
 * Generador de datos de prueba — versión inicial Entrega 1.
 *
 * Soporta tipos básicos: integer, decimal, date, varchar, enum, foreign_key.
 * Respeta llaves foráneas referenciando IDs ya generados en otras tablas.
 *
 * Pendiente para Entrega 2 (TODO Ruiz):
 *  - Casos borde configurables (valores extremos, listas, etc.)
 *  - Mayor variedad léxica para varchar (faker)
 *  - Validaciones cruzadas más finas
 */
@Injectable()
export class DataGeneratorService {
  /**
   * Genera el script INSERT respetando relaciones FK.
   * Las tablas deben llegar ordenadas por dependencia (padre antes que hijo).
   * Si no, hacemos un sort topológico simple basado en references.
   */
  generate(tables: TableGeneratorConfigDto[]): { sql: string } {
    const ordered = this.topologicalSort(tables);
    const generatedIds: Record<string, (string | number)[]> = {};
    const lines: string[] = [];

    for (const table of ordered) {
      const fieldNames = Object.keys(table.fields);
      if (fieldNames.length === 0) {
        throw new BadRequestException(`Tabla ${table.table} no tiene campos configurados`);
      }

      const ids: (string | number)[] = [];

      for (let i = 1; i <= table.rows; i++) {
        const values = fieldNames.map((name) =>
          this.generateValue(name, table.fields[name], generatedIds, i),
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

  // -------- helpers --------

  private generateValue(
    fieldName: string,
    cfg: FieldConfigDto,
    generatedIds: Record<string, (string | number)[]>,
    rowIndex: number,
  ): string {
    if (cfg.nullPercent && randomInt(0, 100) < cfg.nullPercent) {
      return 'NULL';
    }

    switch (cfg.type) {
      case 'integer': {
        const min = cfg.min ?? 0;
        const max = cfg.max ?? 1000;
        if (max < min) throw new BadRequestException(`min>max en ${fieldName}`);
        return String(randomInt(min, max + 1));
      }
      case 'decimal': {
        const min = cfg.min ?? 0;
        const max = cfg.max ?? 1000;
        const v = min + Math.random() * (max - min);
        return v.toFixed(2);
      }
      case 'date': {
        if (!cfg.from || !cfg.to) {
          throw new BadRequestException(`from/to requeridos para date en ${fieldName}`);
        }
        const start = Date.parse(cfg.from);
        const end = Date.parse(cfg.to);
        if (isNaN(start) || isNaN(end) || end < start) {
          throw new BadRequestException(`Rango de fechas inválido en ${fieldName}`);
        }
        const ts = start + Math.floor(Math.random() * (end - start));
        return `'${new Date(ts).toISOString().slice(0, 10)}'`;
      }
      case 'varchar': {
        const max = cfg.maxLength ?? 16;
        const sample = `${fieldName}_${rowIndex}`.slice(0, max);
        return `'${sample.replace(/'/g, "''")}'`;
      }
      case 'enum': {
        if (!cfg.values || cfg.values.length === 0) {
          throw new BadRequestException(`values requerido para enum en ${fieldName}`);
        }
        const v = cfg.values[randomInt(0, cfg.values.length)];
        return `'${v.replace(/'/g, "''")}'`;
      }
      case 'foreign_key': {
        if (!cfg.references) {
          throw new BadRequestException(`references requerido para foreign_key en ${fieldName}`);
        }
        const pool = generatedIds[cfg.references];
        if (!pool || pool.length === 0) {
          throw new BadRequestException(
            `FK ${fieldName} apunta a ${cfg.references}, pero esa tabla no se ha generado o está vacía`,
          );
        }
        return String(pool[randomInt(0, pool.length)]);
      }
    }
  }

  /**
   * Orden topológico simple: una tabla X depende de Y si algún field de X tiene
   * references "Y.col".
   */
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
