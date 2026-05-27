import { SubmissionStatus } from '@prisma/client';
import type { RuleWarning } from '../../../shared/contracts';
import { StubLlmClient } from './stub-llm.client';

const SAMPLE_DDL = `
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80),
  city VARCHAR(60)
);
`;

const w = (ruleId: string): RuleWarning => ({
  ruleId,
  severity: 'warning',
  message: ruleId,
});

describe('StubLlmClient.rewriteSql', () => {
  const stub = new StubLlmClient();

  it('reescribe IN (SELECT ...) como EXISTS (...)', async () => {
    const res = await stub.explain({
      input: {
        query:
          'SELECT name FROM customers WHERE id IN (SELECT customer_id FROM orders WHERE total > 100)',
        schemaDdl: SAMPLE_DDL,
        executionTimeMs: 100,
        explainPlan: null,
        status: SubmissionStatus.ACCEPTED,
      },
      warnings: [],
    });
    expect(res.rewriteSql).not.toBeNull();
    expect(res.rewriteSql).toMatch(/EXISTS\s*\(\s*SELECT 1/);
  });

  it('reescribe UPPER(col)= literal quitando la función', async () => {
    const res = await stub.explain({
      input: {
        query: "SELECT * FROM customers WHERE UPPER(name) = 'JUAN'",
        schemaDdl: SAMPLE_DDL,
        executionTimeMs: 200,
        explainPlan: null,
        status: SubmissionStatus.ACCEPTED,
      },
      warnings: [w('FUNCTION_IN_WHERE')],
    });
    expect(res.rewriteSql).toContain("name = 'JUAN'");
    expect(res.rewriteSql).not.toContain('UPPER(name)');
  });

  it('reescribe SELECT * enumerando columnas del primer CREATE TABLE', async () => {
    const res = await stub.explain({
      input: {
        query: 'SELECT * FROM customers WHERE id = 1',
        schemaDdl: SAMPLE_DDL,
        executionTimeMs: 50,
        explainPlan: null,
        status: SubmissionStatus.ACCEPTED,
      },
      warnings: [w('SELECT_STAR')],
    });
    expect(res.rewriteSql).toContain('SELECT id, name, city');
  });

  it('devuelve null si no hay patrón conocido', async () => {
    const res = await stub.explain({
      input: {
        query: 'SELECT name FROM customers',
        schemaDdl: SAMPLE_DDL,
        executionTimeMs: 10,
        explainPlan: null,
        status: SubmissionStatus.ACCEPTED,
      },
      warnings: [],
    });
    expect(res.rewriteSql).toBeNull();
  });
});
