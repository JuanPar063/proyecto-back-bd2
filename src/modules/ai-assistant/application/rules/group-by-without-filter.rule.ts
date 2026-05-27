import type { RuleWarning } from '../../../../shared/contracts';
import type { SqlRule, SqlRuleContext } from './sql-rule.interface';

/**
 * Detecta GROUP BY sin filtro previo (WHERE ni HAVING). Significa que el
 * motor agrega sobre toda la tabla. En retos académicos casi siempre se
 * espera filtrar primero y agregar después.
 *
 * No dispara si hay LIMIT (puede ser intencional para top-N).
 */
export class GroupByWithoutFilterRule implements SqlRule {
  readonly id = 'GROUP_BY_WITHOUT_FILTER';

  check(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.ast) return null;

    const trees = Array.isArray(ctx.ast) ? ctx.ast : [ctx.ast];
    for (const tree of trees) {
      const node = tree as {
        type?: string;
        groupby?: unknown;
        where?: unknown;
        having?: unknown;
        limit?: unknown;
      };
      if (node.type !== 'select') continue;

      const hasGroupBy = this.isGroupByPresent(node.groupby);
      if (!hasGroupBy) continue;

      const hasFilter = !!node.where || !!node.having || !!node.limit;
      if (!hasFilter) {
        return {
          ruleId: this.id,
          severity: 'warning',
          message:
            'GROUP BY sin WHERE ni HAVING ni LIMIT: el motor agrega sobre toda la tabla. Considera filtrar antes de agrupar para reducir el costo.',
        };
      }
    }
    return null;
  }

  private isGroupByPresent(groupby: unknown): boolean {
    if (!groupby) return false;
    if (Array.isArray(groupby)) return groupby.length > 0;
    // En versiones recientes node-sql-parser usa { columns: [...] }
    const obj = groupby as { columns?: unknown[] };
    return Array.isArray(obj.columns) && obj.columns.length > 0;
  }
}
