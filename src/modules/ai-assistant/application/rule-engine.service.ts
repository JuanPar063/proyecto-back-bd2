import { Injectable, Logger } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { Parser, type AST } from 'node-sql-parser';
import type {
  AiAnalysisInput,
  RuleWarning,
} from '../../../shared/contracts';
import { DEFAULT_RULES } from './rules';
import type { SqlRule, SqlRuleContext } from './rules';

/**
 * Motor de reglas. Parsea la query una sola vez con node-sql-parser y pasa
 * el AST por cada regla. Si el parser falla, las reglas que dependan del
 * AST se saltan; las que trabajan sobre texto/tiempos siguen activas.
 *
 * El motor NO hace IO: si necesitas más reglas, agrégalas en
 * application/rules/index.ts.
 *
 * NOTA sobre DI: las reglas viven en un field con default — NO como
 * parámetro de constructor con default value. La razón es que Nest no
 * respeta los default values de TS en constructores: vía reflection ve
 * el tipo `Array` y trata de inyectar un provider que no existe, lo que
 * tronaría con "Nest can't resolve dependencies of RuleEngineService".
 * Para sobrescribir las reglas en tests, instanciar el servicio con
 * `new RuleEngineService()` y reasignar `(service as any).rules`.
 */
@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);
  private readonly parser = new Parser();
  private readonly rules: SqlRule[] = DEFAULT_RULES;

  evaluate(input: AiAnalysisInput): RuleWarning[] {
    const ast = this.safeParse(input.query);
    const ctx: SqlRuleContext = {
      query: input.query,
      ast,
      schemaDdl: input.schemaDdl,
      executionTimeMs: input.executionTimeMs,
      syntaxValid: input.status !== SubmissionStatus.SYNTAX_ERROR,
    };

    const warnings: RuleWarning[] = [];
    for (const rule of this.rules) {
      try {
        const w = rule.check(ctx);
        if (w) warnings.push(w);
      } catch (err) {
        this.logger.warn(
          `Regla ${rule.id} falló al evaluar: ${(err as Error).message}`,
        );
      }
    }
    return warnings;
  }

  private safeParse(query: string): AST | AST[] | null {
    try {
      // Usamos dialecto PostgreSQL porque es el motor por defecto del proyecto.
      return this.parser.astify(query, { database: 'postgresql' });
    } catch {
      return null;
    }
  }
}
