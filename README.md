# SQL Judge — Plataforma inteligente para evaluación y optimización de SQL

> Backend académico para que profesores creen retos SQL, los estudiantes envíen
> consultas y el sistema las evalúe automáticamente en un sandbox Docker,
> midiendo correctness, rendimiento y entregando recomendaciones de
> optimización generadas por un asistente IA.

**Stack:** Node.js 20 · NestJS 10 · PostgreSQL 16 · Redis 7 · BullMQ · Prisma · JWT · dockerode · Docker Compose

---

## 1. Requisitos

- Docker Desktop (o Docker Engine 24+) y Docker Compose v2
- Node.js 20+ y npm 10+ (solo si quieres correr fuera de Docker)

## 2. Puesta en marcha rápida

```bash
# 1. Clonar y entrar
git clone <repo> proyecto-back-bd2 && cd proyecto-back-bd2

# 2. Variables de entorno
cp .env.example .env

# 3. Levantar todo el stack (API + worker + Postgres + Redis)
npm run docker:up

# 4. (Si el volumen es nuevo) crear admin por defecto desde el host
DATABASE_URL="postgresql://sqljudge:sqljudge_dev_password@localhost:5432/sqljudge?schema=public" \
  npm run prisma:seed
```

Cuando todo está arriba:

| Recurso  | URL                                |
|----------|------------------------------------|
| API      | http://localhost:3000/api          |
| Swagger  | http://localhost:3000/docs         |
| Health   | http://localhost:3000/api/health   |
| Postgres | localhost:5432 (`sqljudge`)        |
| Redis    | localhost:6379                     |

Credenciales del admin de seed: `admin@sqljudge.local` / `Admin123!`.

## 3. Visión global del flujo end-to-end

```
            ┌──────────────┐  POST /challenges/:id/submissions  ┌──────────────────┐
   STUDENT  │  Cliente HTTP├───────────────────────────────────►│  API (NestJS)    │
            └──────────────┘                                    │                  │
                                                                │  • Auth JWT      │
            ┌──────────────┐  PUT  expected-result              │  • Submissions   │
PROFESSOR   │  Postman /   │  POST demo/customers-orders        │  • Evaluations   │
            │  REST Client ├───────────────────────────────────►│  • Reports       │
            └──────────────┘                                    │  • AI Assistant  │
                                                                └──────┬───────────┘
                                                                       │ enqueue
                                                                       ▼
                                                                ┌──────────────┐
                                                                │   Redis      │
                                                                │  (BullMQ)    │
                                                                └──────┬───────┘
                                                                       │ consume
                                                                       ▼
                                                                ┌──────────────────┐
                                                                │  Worker SQL      │
                                                                │  1 obtener datos │
                                                                │  2 crear runner  │
                                                                │  3 esperar PG    │
                                                                │  4 DDL+seed+qry  │
                                                                │  5 comparar      │
                                                                │  6 IA assistant  │
                                                                │  7 score         │
                                                                │  8 status final  │
                                                                │  9 persistir     │
                                                                └──────┬───────────┘
                                                                       │ docker run --rm
                                                                       ▼
                                                                ┌──────────────────┐
                                                                │ postgres:16      │
                                                                │ contenedor       │
                                                                │ temporal por     │
                                                                │ cada submission  │
                                                                └──────────────────┘
```

## 4. Módulos

| Módulo            | Carpeta                       | Responsable | Descripción |
|-------------------|-------------------------------|-------------|-------------|
| Auth              | `src/modules/auth`            | Sofia       | Login / register / refresh / JWT. |
| Users             | `src/modules/users`           | Sofia       | CRUD de usuarios y roles (ADMIN). |
| Courses           | `src/modules/courses`         | Sofia       | Cursos académicos y enrollments. |
| Challenges        | `src/modules/challenges`      | Ruiz        | Retos SQL con transiciones de estado. |
| Schemas           | `src/modules/schemas`         | Ruiz        | DDL de cada reto + parsing con metadata rica. |
| Test Data         | `src/modules/test-data`       | Ruiz        | Generador determinístico (faker + presets + FKs). |
| Submissions       | `src/modules/submissions`     | Ruiz        | Envío de soluciones, expected-result, comparator, scoring. |
| Evaluations       | `src/modules/evaluations`     | Sofia       | Parciales con ventana de tiempo + intentos. |
| Reports           | `src/modules/reports`         | Dayana      | Estudiante/reto/curso + leaderboard. |
| AI Assistant      | `src/modules/ai-assistant`    | Pardo       | Reglas SQL + LLM stub + recomendaciones. |
| Demo              | `src/modules/demo`            | Ruiz        | Atajo end-to-end para sustentación. |

Cada módulo sigue **Clean Architecture** con cuatro capas:

```
modules/<context>/
├── domain/         # Entidades, value objects, puertos (interfaces)
├── application/    # Use cases, DTOs, servicios de aplicación
├── infrastructure/ # Adaptadores: Prisma, HTTP clients, BullMQ
└── presentation/   # Controllers, decoradores HTTP, Swagger
```

## 5. Endpoints principales

| Módulo           | Endpoints clave                                                                                |
|------------------|-----------------------------------------------------------------------------------------------|
| Auth             | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh`                              |
| Users (ADMIN)    | `POST /users` · `GET /users` · `GET /users/:id` · `PATCH /users/:id/deactivate`                |
| Courses          | `POST /courses` · `GET /courses/:id` · `POST /courses/:id/enrollments`                         |
| Challenges       | `POST /challenges` · `GET /challenges` · `PATCH /challenges/:id` · `PATCH .../status`          |
| Schemas          | `PUT /challenges/:id/schema` · `GET /challenges/:id/schema`                                    |
| Test data        | `POST .../test-data/manual` · `POST .../test-data/generate` · `POST .../preview`               |
| **Submissions**  | `POST /challenges/:id/submissions` · `GET /submissions/:id` · `GET /submissions?filters`       |
|                  | `GET /submissions/my` · `GET /submissions/challenge/:id` (PROFESSOR)                           |
| **Expected**     | `PUT /challenges/:id/expected-result` · `GET /challenges/:id/expected-result` (PROFESSOR)      |
| **Evaluations**  | `POST /evaluations` · `PATCH /evaluations/:id/challenges` · `POST /evaluations/:id/start`      |
| **Reports**      | `GET /reports/students/:id` · `GET /reports/challenges/:id` · `GET /reports/courses/:id`       |
|                  | `GET /reports/leaderboard?courseId&evaluationId`                                              |
| **AI Assistant** | `POST /ai-assistant/analyze` (debug, PROFESSOR/ADMIN)                                          |
| **DLQ Admin**    | `GET /admin/submissions/failed` · `POST /admin/submissions/failed/:jobId/retry` (ADMIN)        |
| Demo             | `POST /demo/customers-orders` (PROFESSOR, atajo end-to-end)                                    |
| Health           | `GET /health`                                                                                  |

Detalle completo con esquemas y ejemplos en **Swagger UI** (`/docs`).

## 6. Evaluador SQL — comparador + scoring

`src/shared/evaluator/result-comparator.ts` (compartido API + worker):
- **Column-set** insensible a case (configurable).
- **Multiset de filas** por defecto; `orderSensitive: true` exige orden.
- **Tolerancia decimal** absoluta para comparar números (`DECIMAL(10,2)`).
- **NULL es valor**: `NULL == NULL`, `NULL ≠ 0`, `NULL ≠ ''`.

`src/shared/evaluator/score-calculator.ts` — rúbrica del enunciado:

| Dimensión        | Peso | Fuente                                                |
|------------------|------|-------------------------------------------------------|
| Correctness      | 60   | Comparador (ACCEPTED → 60, cualquier otro → 0)         |
| Performance      | 15   | Tiempo del runner vs `Challenge.timeLimit` (lineal)    |
| Buenas prácticas | 10   | `AiAnalysisOutput.qualityScore.goodPractices`         |
| Claridad         |  5   | `AiAnalysisOutput.qualityScore.clarity`               |
| Mejora propuesta | 10   | `AiAnalysisOutput.qualityScore.improvement`           |

Total entero 0-100. Si el IA aún no entrega quality score, las tres últimas son 0 y el techo es 75.

## 7. Worker SQL — runner Docker real

`worker/src/main.ts` corre las **9 fases** por cada submission:

1. Obtener datos (challenge, schema, dataset, expectedResult).
2. Crear contenedor `postgres:16-alpine` con 512MB / 0.5 CPU.
3. Esperar a que PostgreSQL esté `healthy` (hasta 30 intentos / 60s).
4. Conectarse y ejecutar: `EXPLAIN` + DDL + seed + query del estudiante.
5. Comparar resultados (comparator de Ruiz).
6. Pedir recomendaciones al **AI Assistant** vía `POST /ai-assistant/internal/analyze`.
7. Calcular score (correctness + performance + sub-scores IA).
8. Derivar `SubmissionStatus`:
   - `ACCEPTED` si correct y sin warnings críticas.
   - `OPTIMIZATION_REQUIRED` si correct pero hay warnings críticas (`SLOW_QUERY`, `CROSS_JOIN`).
   - `WRONG_ANSWER` / `TIME_LIMIT_EXCEEDED` / `SYNTAX_ERROR` / `RUNTIME_ERROR`.
9. Persistir todo (`status`, `score`, `scoreBreakdown`, `feedback`, `runnerMetadata`).

**Cleanup garantizado** (en `finally`): el contenedor temporal se destruye siempre, incluso si el job falla.

### Dead Letter Queue (DLQ)
`FailedSubmissionsProducer` empuja jobs muertos a `failed-submissions`. El ADMIN puede reintentarlos vía `POST /admin/submissions/failed/:jobId/retry`.

## 8. Asistente IA — reglas + LLM stub

`src/modules/ai-assistant`:

- **Rule engine** con 7 reglas SQL (SELECT_STAR, FUNCTION_IN_WHERE, JOIN_WITHOUT_ON, MISSING_WHERE, ORDER_BY_WITHOUT_LIMIT, GROUP_BY_WITHOUT_FILTER, SLOW_QUERY).
- **StubLlmClient** determinístico (sin red): produce reescritura SQL para 3 patrones (`IN (SELECT...)` → `EXISTS`, función en WHERE, `SELECT *` → columnas reales del schema).
- **RecommendationBuilder** ensambla la salida con `suggestedIndexes` reales (parsea el DDL del reto y emite `CREATE INDEX idx_<tabla>_<col> ON <tabla>(<col>);`).
- `shouldRequireOptimization` decide cuándo marcar `OPTIMIZATION_REQUIRED`.

Cualquier proveedor (OpenAI / Anthropic / Ollama) puede reemplazar el stub cambiando un solo provider (`LLM_CLIENT_PORT`).

## 9. Evaluaciones (parciales)

`src/modules/evaluations`:
- `Evaluation` agrupa retos con `startDate` / `endDate` / `durationMinutes` / `maxAttempts`.
- `EvaluationAttempt` (por estudiante) registra cada intento.
- `Submission.evaluationAttemptId` conecta los envíos con su intento.
- Reglas: no se puede iniciar fuera de la ventana, los intentos están topados, la visibilidad de resultados es configurable (`DURING_EVALUATION` / `AFTER_END` / `ALWAYS`).

## 10. Estructura del repo

```
proyecto-back-bd2/
├── docker-compose.yml             # api · worker · postgres · redis
├── Dockerfile                     # Multi-stage para API y Worker
├── .env.example
├── .dockerignore
├── prisma/
│   ├── schema.prisma              # Modelo completo (12 modelos)
│   ├── seed.ts                    # Admin por defecto
│   └── migrations/                # 4 migraciones acumuladas
├── scripts/
│   ├── init-db.sql                # Crea sqljudge_eval
│   └── smoke-submissions.ps1      # Smoke test end-to-end
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   ├── CONTRACTS.md               # 3 contratos del Entregable 2
│   ├── AI_ASSISTANT.md
│   └── RUNNER.md
├── requests/
│   ├── ruiz-flows.http
│   ├── ruiz-submissions.http
│   └── sofia-evaluations.simple.postman_collection.json
├── worker/
│   └── src/
│       ├── main.ts                # 9 fases del runner
│       ├── docker/                # dockerode + pg + health
│       ├── evaluation/            # comparator + scoring del worker
│       ├── contracts/             # tipos compartidos con la API
│       └── utils/logger.ts
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── health/
    ├── shared/
    │   ├── domain/                # BaseEntity, DomainException
    │   ├── application/dto/
    │   ├── evaluator/             # comparator + score-calculator
    │   ├── contracts/             # ai-assistant, runner-result, submission-job
    │   └── infrastructure/
    │       ├── prisma/
    │       ├── config/
    │       └── filters/
    └── modules/
        ├── auth/
        ├── users/
        ├── courses/
        ├── challenges/
        ├── schemas/
        ├── test-data/
        ├── submissions/
        ├── evaluations/
        ├── reports/
        ├── ai-assistant/
        └── demo/
```

## 11. Comandos útiles

```bash
npm run start:dev          # API en watch (fuera de Docker)
npm run worker:dev         # Worker en watch (fuera de Docker)
npm run docker:up          # Levantar stack completo
npm run docker:down        # Apagar stack
npm run docker:logs        # Ver logs en vivo
npm run prisma:studio      # GUI Prisma sobre la DB
npm run prisma:migrate     # Crear nueva migración
npm run prisma:seed        # Crear admin
npm run lint               # Lint + autofix
npm test                   # Unit tests (jest)
npm run build              # Build API + worker
```

## 12. Tests

Suite jest cubre las piezas críticas:

- `src/shared/evaluator/result-comparator.spec.ts` — 18 tests del comparator.
- `src/shared/evaluator/score-calculator.spec.ts` — 7 tests de la rúbrica.
- `src/modules/submissions/application/submissions.transitions.spec.ts` — 15 tests de transiciones de estado.
- `src/modules/evaluations/application/evaluations.service.spec.ts` — flujo de evaluaciones.

Para correr todos:
```bash
npm test
```

## 13. Smoke test end-to-end

`scripts/smoke-submissions.ps1` (PowerShell) ejecuta:
1. Login admin.
2. Crear profesor + estudiante.
3. `POST /demo/customers-orders` → curso + reto publicado + esquema + dataset.
4. Inscribir estudiante.
5. Cargar resultado esperado.
6. Enviar submission feliz → ACCEPTED.
7. Enviar submission con `/* expect:WRONG */` → WRONG_ANSWER.
8. Listar `/submissions/my`, filtros como profesor.

```powershell
.\scripts\smoke-submissions.ps1
```

## 14. Documentación

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — diagramas, modelo de dominio, ADRs.
- [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) — convenciones de código.
- [`docs/CONTRACTS.md`](./docs/CONTRACTS.md) — payload del job, RunnerResult, IO del AI.
- [`docs/AI_ASSISTANT.md`](./docs/AI_ASSISTANT.md) — reglas, builder, score IA.
- [`docs/RUNNER.md`](./docs/RUNNER.md) — despliegue del runner Docker, troubleshooting.

## 15. Decisiones arquitectónicas (ADR-condensado)

| ID  | Decisión | Estado |
|-----|----------|--------|
| 001 | NestJS sobre Express por familiaridad del equipo | Adoptado |
| 002 | Prisma como ORM | Adoptado |
| 003 | BullMQ para colas | Adoptado |
| 004 | Clean Architecture por bounded context | Adoptado |
| 005 | JWT con par access (1h) + refresh (7d) | Adoptado |
| 006 | DB separada `sqljudge_eval` para runner | Adoptado |
| 007 | Migraciones automáticas al arrancar API | Adoptado |
| 008 | Solo SELECT en evaluación automática | Adoptado |
| 009 | Toda evaluación SQL es asíncrona vía Redis | Adoptado |
| 010 | Asistente IA híbrido: reglas + LLM | Adoptado |
| 011 | Cada evaluación corre en contenedor efímero | Adoptado |
| 012 | Runner con límites de CPU/RAM/tiempo | Adoptado |
| 013 | Comparator normaliza antes de comparar | Adoptado |
| 014 | Endpoint interno del IA sin JWT (solo red docker) | Adoptado |

## 16. Equipo

| Integrante                    | Cancha                                       |
|-------------------------------|----------------------------------------------|
| MOLINA VEGA, DAYANA           | Arquitectura, Reports, ADRs, video, entrega  |
| PALACIO MERCADO, SOFIA        | Auth, Users, Courses, Evaluations            |
| RUIZ AKLE, JUAN               | Schemas, Test data, Challenges, Submissions  |
| SEQUEDA MEDINA, JOSE          | DevOps, Worker, Runner SQL en Docker         |
| PARDO ANZOLA, JUAN            | Asistente IA, contracts, queue producers     |

Ver [`Reparticion_Tareas_Entrega1.docx`](./Reparticion_Tareas_Entrega1.docx) y [`Plan_Entregable2_SQLJudge.docx`](./Plan_Entregable2_SQLJudge.docx) para el desglose detallado.
