/**
 * Seed completo para demo / sustentación del Entregable 2.
 *
 * Crea:
 *   - 1 ADMIN (admin@sqljudge.local / Admin123!)
 *   - 2 PROFESORES (Carlos Mendoza, Laura Ríos / Profe123!)
 *   - 5 ESTUDIANTES (Ana, Beto, Carla, David, Elena / Stud123!)
 *   - 2 CURSOS (BD2 y SQL Avanzado)
 *   - 6 INSCRIPCIONES
 *   - 3 RETOS publicados, cada uno con esquema + dataset + expectedResult
 *   - 7 SUBMISSIONS cubriendo TODOS los estados del enum:
 *       ACCEPTED, WRONG_ANSWER, SYNTAX_ERROR, OPTIMIZATION_REQUIRED,
 *       TIME_LIMIT_EXCEEDED, RUNTIME_ERROR  (+ algunas en distintos retos)
 *   - 3 RECOMENDACIONES del IA (para submissions OPTIMIZATION_REQUIRED y WRONG_ANSWER)
 *   - 1 EVALUACIÓN (parcial) con 2 retos asociados
 *   - 1 EVALUATION_ATTEMPT (Ana hizo el parcial)
 *
 * Es **idempotente**: se puede correr varias veces. Usa `upsert` donde hay
 * claves únicas y un "guard" sobre el reto demo para no duplicar submissions.
 *
 * Ejecutar:
 *   npm run prisma:seed
 *
 * Importante: el `passwordHash` se reescribe en cada corrida, así que si
 * cambias los passwords aquí, la próxima corrida los actualiza en la DB.
 */
import {
  ChallengeStatus,
  DatabaseEngine,
  Difficulty,
  EvaluationResultsVisibility,
  PrismaClient,
  Role,
  RuleSeverity,
  SubmissionStatus,
  TestDatasetKind,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ============================================================
// Helpers
// ============================================================

async function upsertUser(opts: {
  email: string;
  fullName: string;
  role: Role;
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { email: opts.email },
    update: {
      passwordHash: opts.passwordHash,
      fullName: opts.fullName,
      role: opts.role,
      isActive: true,
    },
    create: {
      email: opts.email,
      passwordHash: opts.passwordHash,
      fullName: opts.fullName,
      role: opts.role,
    },
  });
}

async function upsertCourse(opts: {
  code: string;
  name: string;
  period: string;
  groupName: string;
  professorId: string;
}) {
  return prisma.course.upsert({
    where: { code: opts.code },
    update: {},
    create: {
      code: opts.code,
      name: opts.name,
      period: opts.period,
      groupName: opts.groupName,
      professorId: opts.professorId,
    },
  });
}

async function enrollIfMissing(courseId: string, studentIds: string[]) {
  for (const studentId of studentIds) {
    await prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      update: {},
      create: { courseId, studentId },
    });
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('[seed] === Iniciando seed completo de demo ===');

  // ------------------------------------------------------------
  // 1. Pre-hash de contraseñas (3 hashes, no uno por usuario)
  // ------------------------------------------------------------
  console.log('[seed] Hasheando contraseñas...');
  const ADMIN_HASH = await bcrypt.hash('Admin123!', 10);
  const PROFE_HASH = await bcrypt.hash('Profe123!', 10);
  const STUD_HASH = await bcrypt.hash('Stud123!', 10);

  // ------------------------------------------------------------
  // 2. USUARIOS
  // ------------------------------------------------------------
  console.log('[seed] Creando usuarios...');

  const admin = await upsertUser({
    email: 'admin@sqljudge.local',
    fullName: 'Administrador',
    role: Role.ADMIN,
    passwordHash: ADMIN_HASH,
  });

  const profCarlos = await upsertUser({
    email: 'carlos.profe@univ.edu',
    fullName: 'Carlos Mendoza',
    role: Role.PROFESSOR,
    passwordHash: PROFE_HASH,
  });
  const profLaura = await upsertUser({
    email: 'laura.profe@univ.edu',
    fullName: 'Laura Ríos',
    role: Role.PROFESSOR,
    passwordHash: PROFE_HASH,
  });

  const studAna = await upsertUser({
    email: 'ana.estudiante@univ.edu',
    fullName: 'Ana López',
    role: Role.STUDENT,
    passwordHash: STUD_HASH,
  });
  const studBeto = await upsertUser({
    email: 'beto.estudiante@univ.edu',
    fullName: 'Beto García',
    role: Role.STUDENT,
    passwordHash: STUD_HASH,
  });
  const studCarla = await upsertUser({
    email: 'carla.estudiante@univ.edu',
    fullName: 'Carla Romero',
    role: Role.STUDENT,
    passwordHash: STUD_HASH,
  });
  const studDavid = await upsertUser({
    email: 'david.estudiante@univ.edu',
    fullName: 'David Vargas',
    role: Role.STUDENT,
    passwordHash: STUD_HASH,
  });
  const studElena = await upsertUser({
    email: 'elena.estudiante@univ.edu',
    fullName: 'Elena Mora',
    role: Role.STUDENT,
    passwordHash: STUD_HASH,
  });

  console.log(`  ✓ ${admin.email}  (ADMIN)`);
  console.log(`  ✓ ${profCarlos.email}, ${profLaura.email}  (PROFESSOR)`);
  console.log(
    `  ✓ ${studAna.email}, ${studBeto.email}, ${studCarla.email}, ${studDavid.email}, ${studElena.email}  (STUDENT)`,
  );

  // ------------------------------------------------------------
  // 3. CURSOS
  // ------------------------------------------------------------
  console.log('[seed] Creando cursos...');

  const courseBD2 = await upsertCourse({
    code: 'BD2-DEMO-2026',
    name: 'Bases de Datos II',
    period: '2026-1',
    groupName: '1',
    professorId: profCarlos.id,
  });
  const courseSQL = await upsertCourse({
    code: 'SQL-ADV-DEMO-2026',
    name: 'SQL Avanzado',
    period: '2026-1',
    groupName: '1',
    professorId: profLaura.id,
  });

  console.log(`  ✓ ${courseBD2.code} — ${courseBD2.name}`);
  console.log(`  ✓ ${courseSQL.code} — ${courseSQL.name}`);

  // ------------------------------------------------------------
  // 4. INSCRIPCIONES
  // ------------------------------------------------------------
  console.log('[seed] Inscribiendo estudiantes...');

  await enrollIfMissing(courseBD2.id, [
    studAna.id,
    studBeto.id,
    studCarla.id,
    studElena.id,
  ]);
  await enrollIfMissing(courseSQL.id, [studDavid.id, studElena.id]);

  console.log(`  ✓ 4 estudiantes en ${courseBD2.code}`);
  console.log(`  ✓ 2 estudiantes en ${courseSQL.code}`);

  // ------------------------------------------------------------
  // 5. GUARD — si el reto demo ya existe, no recreamos retos/submissions
  // ------------------------------------------------------------
  const existingDemo = await prisma.challenge.findFirst({
    where: {
      title: 'Clientes con más de 3 compras',
      courseId: courseBD2.id,
    },
  });
  if (existingDemo) {
    console.log(
      '[seed] Retos demo ya existen — omitiendo creación de challenges/submissions/evaluations',
    );
    console.log('[seed] === Listo (modo idempotente) ===');
    return;
  }

  // ------------------------------------------------------------
  // 6. RETOS + SCHEMA + DATASET + EXPECTED RESULT
  // ------------------------------------------------------------
  console.log('[seed] Creando retos con su contenido completo...');

  // DDL común para los 3 retos: schema customers + orders
  const SCHEMA_DDL = `
CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  city VARCHAR(80) NOT NULL
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  total DECIMAL(10,2) NOT NULL,
  created_at DATE NOT NULL
);
`.trim();

  const SEED_SQL = `
INSERT INTO customers (id, name, city) VALUES
  (1, 'Ana López', 'Bogotá'),
  (2, 'Beto García', 'Medellín'),
  (3, 'Carla Romero', 'Cali'),
  (4, 'Diego Vargas', 'Bogotá'),
  (5, 'Elena Mora', 'Cali');

INSERT INTO orders (id, customer_id, total, created_at) VALUES
  (1, 1, 100000.00, '2026-01-05'),
  (2, 1, 250000.00, '2026-01-12'),
  (3, 1, 75000.00,  '2026-01-18'),
  (4, 1, 150000.00, '2026-02-03'),
  (5, 2, 90000.00,  '2026-01-08'),
  (6, 2, 180000.00, '2026-01-15'),
  (7, 3, 200000.00, '2026-01-20'),
  (8, 4, 80000.00,  '2026-01-25'),
  (9, 5, 120000.00, '2026-02-01'),
  (10, 5, 300000.00,'2026-02-10');
`.trim();

  // Reto 1 — EASY
  const ch1 = await prisma.challenge.create({
    data: {
      title: 'Clientes en Bogotá',
      description:
        'Devuelve los nombres de los clientes cuya ciudad sea Bogotá.',
      difficulty: Difficulty.EASY,
      tags: ['SELECT', 'WHERE'],
      databaseEngine: DatabaseEngine.postgresql,
      timeLimit: 3000,
      status: ChallengeStatus.published,
      courseId: courseBD2.id,
      createdById: profCarlos.id,
      schema: { create: { ddl: SCHEMA_DDL, version: 1 } },
      testDatasets: {
        create: {
          name: 'dataset-base',
          kind: TestDatasetKind.MANUAL_INSERT,
          sql: SEED_SQL,
        },
      },
      expectedResult: {
        create: {
          columns: ['name'],
          rows: [['Ana López'], ['Diego Vargas']],
          orderSensitive: false,
          floatTolerance: 0,
        },
      },
    },
  });

  // Reto 2 — MEDIUM
  const ch2 = await prisma.challenge.create({
    data: {
      title: 'Top 3 órdenes por total',
      description:
        'Devuelve las 3 órdenes con mayor total, en orden descendente.',
      difficulty: Difficulty.MEDIUM,
      tags: ['ORDER BY', 'LIMIT'],
      databaseEngine: DatabaseEngine.postgresql,
      timeLimit: 3000,
      status: ChallengeStatus.published,
      courseId: courseBD2.id,
      createdById: profCarlos.id,
      schema: { create: { ddl: SCHEMA_DDL, version: 1 } },
      testDatasets: {
        create: {
          name: 'dataset-base',
          kind: TestDatasetKind.MANUAL_INSERT,
          sql: SEED_SQL,
        },
      },
      expectedResult: {
        create: {
          columns: ['id', 'total'],
          rows: [
            [10, 300000],
            [2, 250000],
            [7, 200000],
          ],
          orderSensitive: true,
          floatTolerance: 0.01,
        },
      },
    },
  });

  // Reto 3 — HARD
  const ch3 = await prisma.challenge.create({
    data: {
      title: 'Clientes con más de 3 compras',
      description:
        'Devuelve el nombre del cliente y la cantidad de órdenes, sólo para clientes con más de 3 órdenes.',
      difficulty: Difficulty.HARD,
      tags: ['JOIN', 'GROUP BY', 'HAVING'],
      databaseEngine: DatabaseEngine.postgresql,
      timeLimit: 5000,
      status: ChallengeStatus.published,
      courseId: courseBD2.id,
      createdById: profCarlos.id,
      schema: { create: { ddl: SCHEMA_DDL, version: 1 } },
      testDatasets: {
        create: {
          name: 'dataset-base',
          kind: TestDatasetKind.MANUAL_INSERT,
          sql: SEED_SQL,
        },
      },
      expectedResult: {
        create: {
          columns: ['name', 'total'],
          rows: [['Ana López', 4]],
          orderSensitive: false,
          floatTolerance: 0,
        },
      },
    },
  });

  console.log(`  ✓ ${ch1.title}  (EASY)`);
  console.log(`  ✓ ${ch2.title}  (MEDIUM)`);
  console.log(`  ✓ ${ch3.title}  (HARD)`);

  // ------------------------------------------------------------
  // 7. SUBMISSIONS — cubrimos todos los estados terminales
  // ------------------------------------------------------------
  console.log('[seed] Creando submissions en distintos estados...');

  // Reusable: scoreBreakdown realista
  const breakdownAccepted = {
    correctness: 60,
    performance: 15,
    goodPractices: 10,
    clarity: 5,
    improvement: 10,
    final: 100,
  };
  const breakdownGood = {
    correctness: 60,
    performance: 12,
    goodPractices: 8,
    clarity: 4,
    improvement: 7,
    final: 91,
  };
  const breakdownOptimization = {
    correctness: 60,
    performance: 6,
    goodPractices: 5,
    clarity: 3,
    improvement: 0,
    final: 74,
  };
  const breakdownWrong = {
    correctness: 0,
    performance: 12,
    goodPractices: 6,
    clarity: 3,
    improvement: 0,
    final: 21,
  };

  // Ana acertó el reto 1 con tiempo óptimo
  await prisma.submission.create({
    data: {
      studentId: studAna.id,
      challengeId: ch1.id,
      query: "SELECT name FROM customers WHERE city = 'Bogotá'",
      status: SubmissionStatus.ACCEPTED,
      score: 100,
      executionTimeMs: 45,
      scoreBreakdown: breakdownAccepted,
      feedback: 'Resultado correcto. Tiempo óptimo (45ms) y código limpio.',
      resultData: [['Ana López'], ['Diego Vargas']],
    },
  });

  // Ana acertó el reto 2 también
  const anaCh2 = await prisma.submission.create({
    data: {
      studentId: studAna.id,
      challengeId: ch2.id,
      query: 'SELECT id, total FROM orders ORDER BY total DESC LIMIT 3',
      status: SubmissionStatus.ACCEPTED,
      score: 91,
      executionTimeMs: 78,
      scoreBreakdown: breakdownGood,
      feedback: 'Resultado correcto. Buena utilización de ORDER BY + LIMIT.',
      resultData: [
        [10, 300000],
        [2, 250000],
        [7, 200000],
      ],
    },
  });

  // Beto: reto 1 OK
  await prisma.submission.create({
    data: {
      studentId: studBeto.id,
      challengeId: ch1.id,
      query: "SELECT name FROM customers WHERE city = 'Bogotá'",
      status: SubmissionStatus.ACCEPTED,
      score: 85,
      executionTimeMs: 120,
      scoreBreakdown: breakdownGood,
      feedback: 'Resultado correcto. Tiempo aceptable.',
      resultData: [['Ana López'], ['Diego Vargas']],
    },
  });

  // Beto: reto 2 incorrecto (olvidó el LIMIT)
  const betoCh2 = await prisma.submission.create({
    data: {
      studentId: studBeto.id,
      challengeId: ch2.id,
      query: 'SELECT id, total FROM orders ORDER BY total DESC',
      status: SubmissionStatus.WRONG_ANSWER,
      score: 21,
      executionTimeMs: 65,
      scoreBreakdown: breakdownWrong,
      feedback:
        'La cantidad de filas no coincide. Esperado: 3 filas. Obtenido: 10 filas. Revisa el LIMIT.',
      resultData: [
        [10, 300000],
        [2, 250000],
        [7, 200000],
        [6, 180000],
        [4, 150000],
        [9, 120000],
        [1, 100000],
        [5, 90000],
        [8, 80000],
        [3, 75000],
      ],
    },
  });

  // Beto: reto 3 error de sintaxis
  await prisma.submission.create({
    data: {
      studentId: studBeto.id,
      challengeId: ch3.id,
      query:
        'SELECT c.name, COUNT(o.id) FROM customers c JOIN orders o ON c.id == o.customer_id GROUP BY c.name', // `==` inválido
      status: SubmissionStatus.SYNTAX_ERROR,
      score: 0,
      executionTimeMs: 0,
      errorMessage: 'syntax error at or near "=="',
      feedback:
        'Error de sintaxis SQL. En PostgreSQL la igualdad es "=" no "==". Revisa la cláusula ON del JOIN.',
    },
  });

  // Carla: reto 1 OK pero lento
  await prisma.submission.create({
    data: {
      studentId: studCarla.id,
      challengeId: ch1.id,
      query: "SELECT * FROM customers WHERE city = 'Bogotá'",
      status: SubmissionStatus.OPTIMIZATION_REQUIRED,
      score: 74,
      executionTimeMs: 950,
      scoreBreakdown: breakdownOptimization,
      feedback:
        'Resultado correcto, pero la query tiene oportunidades de mejora. Evita SELECT * cuando solo necesitas algunas columnas.',
      resultData: [
        [1, 'Ana López', 'Bogotá'],
        [4, 'Diego Vargas', 'Bogotá'],
      ],
    },
  });

  // Carla: reto 3 timeout
  await prisma.submission.create({
    data: {
      studentId: studCarla.id,
      challengeId: ch3.id,
      query:
        "SELECT c.name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS total FROM customers c WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) > 3",
      status: SubmissionStatus.TIME_LIMIT_EXCEEDED,
      score: 0,
      executionTimeMs: 5000,
      errorMessage:
        'La consulta excedió el tiempo límite de 5000ms. Considera reescribir las subconsultas correlacionadas como JOIN + GROUP BY.',
      feedback:
        'Tiempo límite excedido. Las subconsultas correlacionadas se ejecutan una vez por fila; reescribe con JOIN + GROUP BY + HAVING.',
    },
  });

  // David: reto 2 con error de ejecución
  await prisma.submission.create({
    data: {
      studentId: studDavid.id,
      challengeId: ch2.id,
      query: 'SELECT id, total FROM ordenes ORDER BY total DESC LIMIT 3', // tabla inexistente
      status: SubmissionStatus.RUNTIME_ERROR,
      score: 0,
      executionTimeMs: 0,
      errorMessage: 'relation "ordenes" does not exist',
      feedback:
        'Error de ejecución: la tabla "ordenes" no existe. Revisa los nombres exactos del schema (orders).',
    },
  });

  console.log(`  ✓ 7 submissions creadas (todos los estados representados)`);

  // ------------------------------------------------------------
  // 8. RECOMENDACIONES del IA
  // ------------------------------------------------------------
  console.log('[seed] Creando recomendaciones del asistente IA...');

  // Recomendación para la submission OPTIMIZATION_REQUIRED de Carla en reto 1
  const carlaOptSub = await prisma.submission.findFirst({
    where: {
      studentId: studCarla.id,
      challengeId: ch1.id,
      status: SubmissionStatus.OPTIMIZATION_REQUIRED,
    },
  });
  if (carlaOptSub) {
    await prisma.recommendation.create({
      data: {
        submissionId: carlaOptSub.id,
        explanation:
          'La consulta se ejecutó correctamente pero tiene oportunidades de mejora. El uso de SELECT * trae columnas innecesarias y aumenta el I/O. Para esta consulta solo necesitas la columna "name".',
        suggestedIndexes: [
          'CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);',
        ],
        rewriteSql: "SELECT name FROM customers WHERE city = 'Bogotá'",
        warnings: [
          {
            ruleId: 'SELECT_STAR',
            severity: 'warning',
            message:
              'Evita SELECT *: lista solo las columnas que necesitas. Mejora la legibilidad y reduce I/O.',
          },
          {
            ruleId: 'SLOW_QUERY',
            severity: 'critical',
            message:
              'La consulta tardó 950 ms (umbral 800 ms). Revisa índices y filtros antes de entregar.',
          },
        ] as any,
        impact:
          'Aplicar las sugerencias debería bajar el tiempo de ejecución bajo los 100ms.',
        highestSeverity: RuleSeverity.critical,
        qualityScore: { goodPractices: 5, clarity: 3, improvement: 0 },
      },
    });
  }

  // Recomendación para la submission WRONG_ANSWER de Beto en reto 2
  await prisma.recommendation.create({
    data: {
      submissionId: betoCh2.id,
      explanation:
        'La consulta corrió pero devolvió todas las filas en vez de las 3 esperadas. El problema es la ausencia de LIMIT al final.',
      suggestedIndexes: [],
      rewriteSql: 'SELECT id, total FROM orders ORDER BY total DESC LIMIT 3',
      warnings: [
        {
          ruleId: 'MISSING_LIMIT',
          severity: 'warning',
          message:
            'El reto pide top-N: agrega LIMIT 3 después de ORDER BY para obtener solo las filas necesarias.',
        },
      ] as any,
      impact:
        'Agregar LIMIT 3 hará que la consulta sea correcta y reduzca filas transferidas.',
      highestSeverity: RuleSeverity.warning,
      qualityScore: { goodPractices: 6, clarity: 3, improvement: 0 },
    },
  });

  // Recomendación para la submission ACCEPTED de Ana en reto 2 (buena práctica)
  await prisma.recommendation.create({
    data: {
      submissionId: anaCh2.id,
      explanation:
        'Consulta correcta y eficiente. Usaste ORDER BY + LIMIT, el camino estándar para top-N.',
      suggestedIndexes: [
        'CREATE INDEX IF NOT EXISTS idx_orders_total ON orders(total);',
      ],
      rewriteSql: null,
      warnings: [] as any,
      impact:
        'La consulta es eficiente. Un índice sobre orders.total podría acelerar aún más el ORDER BY.',
      highestSeverity: RuleSeverity.info,
      qualityScore: { goodPractices: 9, clarity: 5, improvement: 8 },
    },
  });

  console.log('  ✓ 3 recomendaciones creadas');

  // ------------------------------------------------------------
  // 9. EVALUACIÓN (parcial) + INTENTO de Ana
  // ------------------------------------------------------------
  console.log('[seed] Creando evaluación con attempt activo...');

  const now = new Date();
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const eval1 = await prisma.evaluation.create({
    data: {
      name: 'Parcial 1 — SQL avanzado',
      description:
        'Evaluación parcial que cubre ORDER BY/LIMIT y GROUP BY/HAVING. Duración 90 minutos, 3 intentos.',
      courseId: courseBD2.id,
      startDate: now,
      endDate: sevenDaysAhead,
      durationMinutes: 90,
      maxAttempts: 3,
      resultsVisibility: EvaluationResultsVisibility.AFTER_END,
      challenges: {
        create: [
          { challengeId: ch2.id, position: 1 },
          { challengeId: ch3.id, position: 2 },
        ],
      },
    },
  });

  // Ana ya inició un intento (todavía activo)
  const attemptStarted = new Date(now.getTime() - 30 * 60 * 1000); // hace 30 min
  const attemptEnds = new Date(attemptStarted.getTime() + 90 * 60 * 1000); // 90 min después
  await prisma.evaluationAttempt.create({
    data: {
      evaluationId: eval1.id,
      studentId: studAna.id,
      attemptNumber: 1,
      startedAt: attemptStarted,
      endsAt: attemptEnds,
    },
  });

  console.log(`  ✓ Evaluación "${eval1.name}" con 2 retos`);
  console.log(`  ✓ Attempt activo de Ana (vence en ~60 min)`);

  // ------------------------------------------------------------
  // 10. RESUMEN FINAL
  // ------------------------------------------------------------
  console.log('\n[seed] === Seed completo ===\n');
  console.log('Credenciales:');
  console.log('  ADMIN     → admin@sqljudge.local      / Admin123!');
  console.log('  PROFESSOR → carlos.profe@univ.edu     / Profe123!');
  console.log('  PROFESSOR → laura.profe@univ.edu      / Profe123!');
  console.log('  STUDENT   → ana.estudiante@univ.edu   / Stud123!');
  console.log('  STUDENT   → beto.estudiante@univ.edu  / Stud123!');
  console.log('  STUDENT   → carla.estudiante@univ.edu / Stud123!');
  console.log('  STUDENT   → david.estudiante@univ.edu / Stud123!');
  console.log('  STUDENT   → elena.estudiante@univ.edu / Stud123!');
  console.log('');
  console.log('IDs útiles para demo:');
  console.log(`  courseBD2.id = ${courseBD2.id}`);
  console.log(`  ch1 (EASY)   = ${ch1.id}`);
  console.log(`  ch2 (MEDIUM) = ${ch2.id}`);
  console.log(`  ch3 (HARD)   = ${ch3.id}`);
  console.log(`  eval1.id     = ${eval1.id}`);
  console.log('');
  console.log('Para resetear: docker compose down -v && docker compose up -d --build');
}

main()
  .catch((err) => {
    console.error('[seed] ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
