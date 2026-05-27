import type { RuleWarning } from '../../../../shared/contracts';
import type { SqlRule, SqlRuleContext } from './sql-rule.interface';

/**
 * Detecta ORDER BY sin LIMIT. Pedirle al motor que ordene todas las filas
 * y luego desechar el top-N es costoso; casi siempre el reto solo necesita
 * unas pocas filas.
 */
export class OrderByWithoutLimitRule implements SqlRule {
  readonly id = 'ORDER_BY_WITHOUT_LIMIT';

  check(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.ast) return null;

    const trees = Array.isArray(ctx.ast) ? ctx.ast : [ctx.ast];
    for (const tree of trees) {
      const node = tree as {
        type?: string;
        orderby?: unknown;
        limit?: unknown;
      };
      if (node.type !== 'select') continue;

      const hasOrderBy = Array.isArray(node.orderby) && node.orderby.length > 0;
      const hasLimit = !!node.limit;
      if (hasOrderBy && !hasLimit) {
        return {
          ruleId: this.id,
          severity: 'info',
          message:
            'Hay un ORDER BY sin LIMIT. Si el reto solo necesita las primeras filas, agregar LIMIT reduce significativamente el costo de ordenamiento.',
        };
      }
    }
    return null;
  }
}
