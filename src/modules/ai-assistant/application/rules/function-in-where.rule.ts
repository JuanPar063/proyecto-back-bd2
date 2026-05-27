import type { RuleWarning } from '../../../../shared/contracts';
import type { SqlRule, SqlRuleContext } from './sql-rule.interface';

/**
 * Detecta funciones envolviendo columnas dentro del WHERE, ej.
 * `WHERE UPPER(name) = 'X'` o `WHERE DATE(created_at) = '2026-01-01'`.
 * Estos patrones inhabilitan el uso de índices b-tree.
 */
export class FunctionInWhereRule implements SqlRule {
  readonly id = 'FUNCTION_IN_WHERE';

  check(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.ast) return null;

    const trees = Array.isArray(ctx.ast) ? ctx.ast : [ctx.ast];
    for (const tree of trees) {
      const where = (tree as { where?: unknown }).where;
      if (!where) continue;
      if (this.containsFunctionOnColumn(where)) {
        return {
          ruleId: this.id,
          severity: 'warning',
          message:
            'Hay una función aplicada a una columna dentro de WHERE. Eso inhabilita los índices: reescribe el predicado o crea un índice funcional.',
        };
      }
    }
    return null;
  }

  private containsFunctionOnColumn(node: unknown): boolean {
    if (!node || typeof node !== 'object') return false;
    const n = node as {
      type?: string;
      left?: unknown;
      right?: unknown;
      args?: { value?: unknown[] };
      operator?: string;
    };

    if (n.type === 'function' || n.type === 'aggr_func') {
      const args = n.args?.value ?? [];
      const wrapsColumn = args.some(
        (a) => (a as { type?: string })?.type === 'column_ref',
      );
      if (wrapsColumn) return true;
    }

    if (n.left && this.containsFunctionOnColumn(n.left)) return true;
    if (n.right && this.containsFunctionOnColumn(n.right)) return true;
    return false;
  }
}
