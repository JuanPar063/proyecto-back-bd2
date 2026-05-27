import type { AST } from 'node-sql-parser';
import type { RuleWarning } from '../../../../shared/contracts';

export interface SqlRuleContext {
  query: string;
  /** AST parseado por node-sql-parser. null si la query no parseó. */
  ast: AST | AST[] | null;
  schemaDdl: string;
  executionTimeMs: number;
  /** Si el motor SQL parseó la query (status !== SubmissionStatus.SYNTAX_ERROR). */
  syntaxValid: boolean;
}

/**
 * Cada regla recibe el contexto y devuelve un warning si dispara, o null si
 * no aplica. Mantener una regla = una preocupación. Si una regla necesita
 * inspeccionar varias partes de la query, está bien — pero no apilar
 * heurísticas no relacionadas.
 */
export interface SqlRule {
  readonly id: string;
  check(ctx: SqlRuleContext): RuleWarning | null;
}
