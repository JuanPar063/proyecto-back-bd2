import type { RuleWarning } from '../../../../shared/contracts';
import type { SqlRule, SqlRuleContext } from './sql-rule.interface';

/**
 * Detecta SELECT sin WHERE sobre tablas reales (no subqueries). Es la causa
 * más típica de full table scan en retos académicos.
 */
export class MissingWhereRule implements SqlRule {
  readonly id = 'MISSING_WHERE';

  check(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.ast) return null;

    const trees = Array.isArray(ctx.ast) ? ctx.ast : [ctx.ast];
    for (const tree of trees) {
      const node = tree as {
        type?: string;
        where?: unknown;
        from?: unknown;
        limit?: unknown;
      };
      if (node.type !== 'select') continue;

      const hasFromTable =
        Array.isArray(node.from) && (node.from as unknown[]).length > 0;
      if (!hasFromTable) continue;

      if (!node.where && !node.limit) {
        return {
          ruleId: this.id,
          severity: 'warning',
          message:
            'La consulta no tiene WHERE ni LIMIT: provoca un full table scan. Si el reto exige todas las filas, considera al menos un LIMIT durante la depuración.',
        };
      }
    }
    return null;
  }
}
