import type { RuleWarning } from '../../../../shared/contracts';
import type { SqlRule, SqlRuleContext } from './sql-rule.interface';

/**
 * Regla no estructural: si la query ejecutó pero tardó por encima del
 * umbral, marca la submission como candidata a OPTIMIZATION_REQUIRED.
 * El umbral concreto se decide a nivel de configuración; mantenemos el
 * valor por defecto razonable para retos académicos en Postgres local.
 */
const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 800;

export class SlowQueryRule implements SqlRule {
  readonly id = 'SLOW_QUERY';

  constructor(
    private readonly thresholdMs: number = DEFAULT_SLOW_QUERY_THRESHOLD_MS,
  ) {}

  check(ctx: SqlRuleContext): RuleWarning | null {
    if (!ctx.syntaxValid) return null;
    if (ctx.executionTimeMs <= this.thresholdMs) return null;

    return {
      ruleId: this.id,
      severity: 'critical',
      message: `La consulta tardó ${ctx.executionTimeMs} ms (umbral ${this.thresholdMs} ms). Revisa índices, joins y filtros antes de entregar.`,
    };
  }
}
