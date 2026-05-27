import type { RuleWarning } from '../../../../shared/contracts';
import type { SqlRule, SqlRuleContext } from './sql-rule.interface';

/**
 * Detecta dos patrones costosos relacionados con joins:
 *   1. CROSS JOIN explícito.
 *   2. Join implícito vía coma en FROM (ej. FROM a, b WHERE a.id = b.id).
 *
 * Ambos llevan a productos cartesianos o joins sin índice obvio. Si el
 * estudiante quería un INNER JOIN, debe expresarlo con `JOIN ... ON ...`
 * para que el motor lo optimice correctamente.
 *
 * NOTA: detectar "JOIN sin índice" real requiere parsear el DDL del reto
 * (que viene en ctx.schemaDdl). Eso se hará cuando Ruiz tenga estable
 * parsedTables en SchemaScript. Por ahora, esta regla cubre la causa más
 * común del problema en retos académicos.
 */
export class JoinWithoutOnRule implements SqlRule {
  readonly id = 'JOIN_WITHOUT_ON';

  check(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.ast) return null;

    const trees = Array.isArray(ctx.ast) ? ctx.ast : [ctx.ast];
    for (const tree of trees) {
      const node = tree as {
        type?: string;
        from?: Array<{ join?: string; on?: unknown }>;
      };
      if (node.type !== 'select' || !Array.isArray(node.from)) continue;

      // 1. CROSS JOIN explícito (parser lo marca con join: 'CROSS JOIN')
      const hasCrossJoin = node.from.some((f) =>
        typeof f?.join === 'string' && /cross/i.test(f.join),
      );
      if (hasCrossJoin) return this.warningCross();

      // 2. Join implícito por coma: dos o más tablas en FROM, ninguna con `join`
      const tablesWithoutJoin = node.from.filter(
        (f, i) => i > 0 && !f.join,
      );
      if (tablesWithoutJoin.length > 0) return this.warningImplicit();
    }
    return null;
  }

  private warningCross(): RuleWarning {
    return {
      ruleId: this.id,
      severity: 'critical',
      message:
        'La consulta usa CROSS JOIN: produce un producto cartesiano. Si querías combinar filas relacionadas, usa INNER JOIN con una condición ON.',
    };
  }

  private warningImplicit(): RuleWarning {
    return {
      ruleId: this.id,
      severity: 'warning',
      message:
        'Hay un join implícito por coma en FROM (ej. FROM a, b). Reescribe con JOIN ... ON explícito para que el motor pueda usar índices.',
    };
  }
}
