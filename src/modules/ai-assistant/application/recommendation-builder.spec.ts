import { SubmissionStatus } from '@prisma/client';
import type { RuleWarning } from '../../../shared/contracts';
import { RecommendationBuilderService } from './recommendation-builder.service';

const SAMPLE_DDL = `
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  city VARCHAR(60),
  tier VARCHAR(16),
  created_at DATE NOT NULL
);
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at DATE NOT NULL
);
`;

const warning = (ruleId: string, severity: 'info' | 'warning' | 'critical' = 'warning'): RuleWarning => ({
  ruleId,
  severity,
  message: `${ruleId} message`,
});

describe('RecommendationBuilderService', () => {
  const service = new RecommendationBuilderService();
  const baseLlm = { explanation: 'OK', rewriteSql: null };

  describe('suggestIndexes (DDL real)', () => {
    it('emite CREATE INDEX para columnas referenciadas en WHERE', () => {
      const out = service.build(
        {
          query: 'SELECT name FROM customers WHERE city = $1',
          schemaDdl: SAMPLE_DDL,
          executionTimeMs: 50,
          explainPlan: null,
          status: SubmissionStatus.ACCEPTED,
        },
        [],
        baseLlm,
      );
      expect(out.suggestedIndexes).toContain(
        'CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);',
      );
    });

    it('resuelve aliases en JOIN ON', () => {
      const out = service.build(
        {
          query:
            'SELECT c.name FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status = $1',
          schemaDdl: SAMPLE_DDL,
          executionTimeMs: 100,
          explainPlan: null,
          status: SubmissionStatus.ACCEPTED,
        },
        [],
        baseLlm,
      );
      const indexes = out.suggestedIndexes;
      expect(indexes).toContain(
        'CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);',
      );
      expect(indexes).toContain(
        'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);',
      );
    });

    it('agrega índice funcional cuando hay FUNCTION_IN_WHERE', () => {
      const out = service.build(
        {
          query: "SELECT * FROM customers WHERE UPPER(name) = 'JUAN'",
          schemaDdl: SAMPLE_DDL,
          executionTimeMs: 200,
          explainPlan: null,
          status: SubmissionStatus.ACCEPTED,
        },
        [warning('FUNCTION_IN_WHERE')],
        baseLlm,
      );
      expect(out.suggestedIndexes).toContain(
        'CREATE INDEX IF NOT EXISTS idx_customers_name_upper ON customers(UPPER(name));',
      );
    });

    it('cae al hint genérico si no hay schemaDdl', () => {
      const out = service.build(
        {
          query: 'SELECT * FROM x WHERE foo = 1',
          schemaDdl: '',
          executionTimeMs: 50,
          explainPlan: null,
          status: SubmissionStatus.ACCEPTED,
        },
        [warning('MISSING_WHERE')],
        baseLlm,
      );
      expect(out.suggestedIndexes[0]).toMatch(/^-- /);
    });

    it('no captura literales string como columnas', () => {
      const out = service.build(
        {
          query: "SELECT name FROM customers WHERE city = 'Bogotá' AND tier = 'GOLD'",
          schemaDdl: SAMPLE_DDL,
          executionTimeMs: 50,
          explainPlan: null,
          status: SubmissionStatus.ACCEPTED,
        },
        [],
        baseLlm,
      );
      // 'Bogotá' / 'GOLD' no son columnas — no deberían producir índices
      const joined = out.suggestedIndexes.join('\n');
      expect(joined).not.toMatch(/idx_\w+_Bogotá/);
      expect(joined).not.toMatch(/idx_\w+_GOLD/);
      // 'city' y 'tier' sí
      expect(joined).toContain('idx_customers_city');
      expect(joined).toContain('idx_customers_tier');
    });
  });
});
