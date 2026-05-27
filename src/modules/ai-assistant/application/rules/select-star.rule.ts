import type { RuleWarning } from '../../../../shared/contracts';
import type { SqlRule, SqlRuleContext } from './sql-rule.interface';

/**
 * Detecta `SELECT *`. Es un anti-patrón académico clásico: oculta intención,
 * trae columnas que no se usan y rompe contratos cuando el esquema cambia.
 */
export class SelectStarRule implements SqlRule {
  readonly id = 'SELECT_STAR';

  check(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.ast) return this.fallbackToRegex(ctx);

    const trees = Array.isArray(ctx.ast) ? ctx.ast : [ctx.ast];
    for (const tree of trees) {
      if ((tree as { type?: string }).type !== 'select') continue;
      const columns = (tree as { columns?: unknown }).columns;
      if (columns === '*' || columns === null) {
        return this.warning();
      }
      if (Array.isArray(columns)) {
        const hasStar = columns.some((col: unknown) => {
          const expr = (col as { expr?: { type?: string; column?: string } })?.expr;
          return expr?.type === 'star' || expr?.column === '*';
        });
        if (hasStar) return this.warning();
      }
    }
    return null;
  }

  /** Fallback simple cuando el parser falló pero el motor sí ejecutó. */
  private fallbackToRegex(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.syntaxValid) return null;
    return /select\s+\*/i.test(ctx.query) ? this.warning() : null;
  }

  private warning(): RuleWarning {
    return {
      ruleId: this.id,
      severity: 'warning',
      message:
        'Evita SELECT *: lista solo las columnas que necesitas. Mejora la legibilidad, reduce I/O y protege la consulta cuando el esquema cambie.',
    };
  }
}
