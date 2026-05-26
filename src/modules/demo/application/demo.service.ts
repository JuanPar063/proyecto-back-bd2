import { Injectable } from '@nestjs/common';
import {
  ChallengeStatus,
  DatabaseEngine,
  Difficulty,
  TestDatasetKind,
} from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { SchemasService } from '../../schemas/application/schemas.service';
import { DataGeneratorService } from '../../test-data/application/data-generator.service';
import { CustomersOrdersDemoDto } from './dto/demo.dto';

/**
 * Endpoint demo end-to-end. Crea de un solo golpe el escenario completo
 * (curso + reto publicado + esquema + dataset generado) que el equipo
 * puede mostrarle al profesor en la sustentación.
 *
 * @responsable Ruiz Akle, Juan.
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schemas: SchemasService,
    private readonly generator: DataGeneratorService,
  ) {}

  async createCustomersOrdersDemo(professorId: string, dto: CustomersOrdersDemoDto) {
    const courseName = dto.courseName ?? 'Demo SQL Judge';
    const courseCode = dto.courseCode ?? `DEMO-${Date.now()}`;
    const customerCount = dto.customerCount ?? 100;
    const orderCount = dto.orderCount ?? 1000;

    // 1) Curso
    const course = await this.prisma.course.create({
      data: {
        name: courseName,
        code: courseCode,
        period: '2026-1',
        groupName: 'demo',
        professorId,
      },
    });

    // 2) Reto publicado
    const challenge = await this.prisma.challenge.create({
      data: {
        title: 'Clientes con más de 3 compras',
        description:
          'Construya una consulta SQL que retorne los clientes que han realizado más de 3 compras, ordenados por número de compras descendente.',
        difficulty: Difficulty.MEDIUM,
        tags: ['SELECT', 'JOIN', 'GROUP BY', 'HAVING'],
        databaseEngine: DatabaseEngine.postgresql,
        timeLimit: 2000,
        status: ChallengeStatus.published,
        courseId: course.id,
        createdById: professorId,
      },
    });

    // 3) Esquema (validación + parsedTables vienen del módulo schemas)
    const ddl = `CREATE TABLE customers (
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
  currency VARCHAR(3) NOT NULL,
  created_at DATE NOT NULL
);`;
    const parsedTables = this.schemas.parseDdl(ddl);
    const schema = await this.prisma.schemaScript.create({
      data: {
        challengeId: challenge.id,
        ddl,
        parsedTables: parsedTables as any,
      },
    });

    // 4) Dataset generado con seed determinística (reproducible para el demo)
    const generatorConfig = {
      tables: [
        {
          table: 'customers',
          rows: customerCount,
          seed: 1,
          fields: {
            name: { type: 'varchar', preset: 'name', maxLength: 80 },
            city: { type: 'varchar', preset: 'city', maxLength: 60 },
            tier: {
              type: 'enum',
              values: ['BRONZE', 'SILVER', 'GOLD'],
              weights: [50, 30, 20],
            },
            created_at: { type: 'date', from: '2025-01-01', to: '2026-12-31' },
          },
        },
        {
          table: 'orders',
          rows: orderCount,
          seed: 2,
          fields: {
            customer_id: { type: 'foreign_key', references: 'customers.id' },
            total: {
              type: 'decimal',
              min: 10000,
              max: 5000000,
              includeExtremes: true,
            },
            status: {
              type: 'enum',
              values: ['PENDING', 'PAID', 'CANCELLED'],
              weights: [10, 80, 10],
            },
            currency: { type: 'varchar', fixedValue: 'COP' },
            created_at: { type: 'date', from: '2026-01-01', to: '2026-12-31' },
          },
        },
      ],
    };
    const { sql } = this.generator.generate(generatorConfig.tables as any);
    const dataset = await this.prisma.testDataset.create({
      data: {
        challengeId: challenge.id,
        name: 'demo_customers_orders',
        kind: TestDatasetKind.GENERATOR_CONFIG,
        sql,
        generatorConfig: generatorConfig as any,
      },
    });

    return {
      message: 'Escenario demo creado correctamente',
      course: { id: course.id, name: course.name, code: course.code },
      challenge: {
        id: challenge.id,
        title: challenge.title,
        status: challenge.status,
      },
      schema: { id: schema.id, tables: parsedTables.map((t) => t.name) },
      dataset: {
        id: dataset.id,
        name: dataset.name,
        rowsCustomers: customerCount,
        rowsOrders: orderCount,
      },
      hint: {
        suggestedSolution:
          'SELECT c.name, COUNT(o.id) AS total FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.name HAVING COUNT(o.id) > 3 ORDER BY total DESC;',
      },
    };
  }
}
