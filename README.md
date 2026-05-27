# SQL Judge - Plataforma inteligente para evaluacion y optimizacion de SQL

Backend para evaluar automaticamente consultas SQL enviadas por estudiantes, medir rendimiento y generar recomendaciones de optimizacion. El proyecto corresponde a la entrega final: API NestJS, autenticacion JWT, gestion academica, evaluacion asincrona con Redis/BullMQ, worker SQL independiente, runner Docker aislado, asistente inteligente, reportes y leaderboard.

**Stack:** Node.js 20, NestJS 10, Prisma, PostgreSQL 16, Redis 7, BullMQ, Docker Compose, JWT, Docker Runner.

---

## 1. Alcance de la entrega final

El sistema implementa los modulos solicitados en el PDF del proyecto final:

- Gestion de usuarios, roles y autenticacion JWT.
- Gestion de cursos, inscripciones y retos SQL.
- Carga de `SchemaScript`, `TestDataset` y `ExpectedResult`.
- Generador de datos de prueba.
- Envio de submissions por estudiantes.
- Evaluacion asincrona con Redis y BullMQ.
- Worker SQL independiente en `worker/src`.
- Runner SQL con Docker y ambiente temporal aislado.
- Comparacion deterministica contra resultado esperado.
- Medicion de tiempo, scoring y feedback.
- Asistente inteligente de optimizacion SQL.
- Persistencia de recomendaciones.
- Evaluaciones/parciales con intentos.
- Reportes por estudiante, reto y curso.
- Leaderboard calculado desde submissions persistidos.
- Cache de reportes en Redis con TTL corto.
- Swagger y documentacion tecnica.

---

## 2. Requisitos

- Docker Desktop o Docker Engine 24+.
- Docker Compose v2.
- Node.js 20+ y npm 10+ si se ejecuta fuera de Docker.
- Puerto `3000` libre para API.
- Puertos `5433` y `6380` libres si se usan los valores por defecto.

---

## 3. Puesta en marcha con Docker Compose

```bash
cp .env.example .env
npm run docker:up
```

La API aplica migraciones al iniciar mediante `npx prisma migrate deploy`.

Para cargar el usuario administrador de prueba:

```bash
npm run prisma:seed
```

Credenciales del seed:

```text
admin@sqljudge.local / Admin123!
```

Servicios principales:

| Recurso | URL / Conexion |
|---------|----------------|
| API | http://localhost:3000/api |
| Swagger | http://localhost:3000/docs |
| Health | http://localhost:3000/api/health |
| PostgreSQL host | localhost:5433 |
| Redis host | localhost:6380 |

Dentro de Docker Compose, la API y el worker usan `postgres:5432` y `redis:6379`.

---

## 4. Comandos utiles

```bash
npm run build                  # Compila API y worker
npm run start:dev              # API NestJS en watch, fuera de Docker
npm run worker:dev             # Worker SQL real en watch, fuera de Docker
npm run docker:up              # Levanta API, worker, PostgreSQL y Redis
npm run docker:down            # Apaga el stack
npm run docker:logs            # Logs del stack
npm run prisma:generate        # Genera Prisma Client
npm run prisma:migrate         # Crea/aplica migracion local
npm run prisma:migrate:deploy  # Aplica migraciones en entorno Docker/produccion
npm run prisma:studio          # Abre Prisma Studio
npm run prisma:seed            # Crea admin inicial
npm run test                   # Tests unitarios
npm run lint                   # Lint + autofix
```

Logs recomendados para sustentacion:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f worker
```

---

## 5. Variables de entorno principales

| Variable | Uso |
|----------|-----|
| `API_PREFIX` | Prefijo global de la API. Por defecto `api`. |
| `SWAGGER_PATH` | Ruta de Swagger. Por defecto `docs`. |
| `DATABASE_URL` | Conexion Prisma a PostgreSQL principal. |
| `REDIS_HOST` / `REDIS_PORT` | Conexion a Redis para BullMQ y cache. |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Firmas de access y refresh token. |
| `DOCKER_HOST` | Socket del daemon Docker usado por el worker. |
| `RUNNER_NETWORK` | Red Docker donde se crean runners temporales. |
| `API_URL` | URL interna usada por el worker para invocar AI Assistant. |
| `LLM_PROVIDER` | `stub`, `openai`, `anthropic` u `ollama`. |
| `AI_SLOW_QUERY_THRESHOLD_MS` | Umbral de consulta lenta para reglas IA. |

La entrega funciona con `LLM_PROVIDER=stub`, sin llaves externas.

---

## 6. Estructura del proyecto

```text
proyecto-back/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── scripts/
│   └── init-db.sql
├── docs/
│   ├── ARCHITECTURE.md
│   ├── AI_ASSISTANT.md
│   ├── CONTRACTS.md
│   ├── CONVENTIONS.md
│   ├── REPORTS.md
│   └── RUNNER.md
├── worker/
│   └── src/
│       ├── main.ts
│       ├── docker/
│       ├── evaluation/
│       └── contracts/
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── health/
    ├── shared/
    │   ├── contracts/
    │   ├── domain/
    │   ├── evaluator/
    │   └── infrastructure/
    └── modules/
        ├── auth/
        ├── users/
        ├── courses/
        ├── challenges/
        ├── schemas/
        ├── test-data/
        ├── submissions/
        ├── evaluations/
        ├── ai-assistant/
        ├── reports/
        └── demo/
```

Cada modulo de negocio sigue Clean Architecture:

```text
modules/<context>/
├── domain/
├── application/
├── infrastructure/
└── presentation/
```

---

## 7. Endpoints principales

Todos los endpoints quedan bajo el prefijo global `/api`.

| Modulo | Endpoints |
|--------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` |
| Users | `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id/deactivate` |
| Courses | `POST /courses`, `GET /courses`, `GET /courses/:id`, `PATCH /courses/:id`, `PATCH /courses/:id/archive` |
| Enrollments | `POST /courses/:id/enrollments`, `DELETE /courses/:id/enrollments/:studentId`, `GET /courses/:id/students` |
| Challenges | `POST /challenges`, `GET /challenges`, `GET /challenges/:id`, `PATCH /challenges/:id`, `PATCH /challenges/:id/status` |
| Schemas | `PUT /challenges/:challengeId/schema`, `GET /challenges/:challengeId/schema` |
| Test data | `GET /challenges/:challengeId/test-data`, `POST /challenges/:challengeId/test-data/manual`, `POST /challenges/:challengeId/test-data/generate`, `POST /challenges/:challengeId/test-data/preview` |
| Expected result | `PUT /challenges/:challengeId/expected-result`, `GET /challenges/:challengeId/expected-result` |
| Submissions | `POST /submissions`, `GET /submissions`, `GET /submissions/my`, `GET /submissions/:id`, `GET /submissions/challenge/:challengeId` |
| Challenge submissions | `POST /challenges/:challengeId/submissions` |
| Failed submissions | `GET /admin/submissions/failed`, `POST /admin/submissions/failed/:jobId/retry`, `DELETE /admin/submissions/failed/:jobId` |
| Evaluations | `POST /evaluations`, `GET /evaluations`, `GET /evaluations/:id`, `PATCH /evaluations/:id`, `DELETE /evaluations/:id`, `PATCH /evaluations/:id/challenges`, `POST /evaluations/:id/start`, `GET /evaluations/:id/state` |
| AI Assistant | `POST /ai-assistant/analyze`, `POST /ai-assistant/internal/analyze` |
| Reports | `GET /reports/students/:id`, `GET /reports/challenges/:id`, `GET /reports/courses/:id`, `GET /reports/leaderboard` |
| Demo | `POST /demo/customers-orders` |
| Health | `GET /health` |

Swagger contiene detalles de DTOs, roles y ejemplos: http://localhost:3000/docs.

---

## 8. Flujo final de evaluacion

1. El profesor crea un curso e inscribe estudiantes.
2. El profesor crea un reto SQL en estado `draft`.
3. El profesor carga el schema del reto.
4. El profesor carga o genera datos de prueba.
5. El profesor define el resultado esperado.
6. El profesor publica el reto.
7. El estudiante envia una submission.
8. La API guarda la submission en `QUEUED`.
9. La API encola el job en Redis/BullMQ.
10. El worker consume el job y marca `RUNNING`.
11. El runner crea un contenedor PostgreSQL temporal.
12. El runner aplica schema, carga dataset y ejecuta la query.
13. El worker compara contra `ExpectedResult`.
14. El worker calcula score y feedback.
15. El worker invoca AI Assistant y persiste `Recommendation`.
16. El worker persiste el resultado final.
17. Reports y leaderboard leen submissions persistidas y usan Redis Cache.

---

## 9. Estados

Challenge:

```text
draft -> published -> archived
draft -> archived
```

Submission:

```text
QUEUED -> RUNNING -> ACCEPTED
                  -> WRONG_ANSWER
                  -> SYNTAX_ERROR
                  -> TIME_LIMIT_EXCEEDED
                  -> RUNTIME_ERROR
                  -> OPTIMIZATION_REQUIRED
```

---

## 10. Seguridad de ejecucion SQL

- La API no ejecuta SQL enviado por estudiantes.
- La base principal `sqljudge` no ejecuta SQL enviado por estudiantes.
- Toda ejecucion pasa por Redis, worker y runner aislado.
- El runner crea un ambiente Docker temporal por submission.
- El runner aplica limites de CPU, memoria y tiempo.
- Solo se aceptan consultas `SELECT` o `WITH ... SELECT`.
- Se bloquean operaciones DDL/DML y administrativas.
- El contenedor temporal se elimina al finalizar.

---

## 11. Reportes y leaderboard

El modulo `reports` calcula:

- Reporte por estudiante.
- Reporte por reto.
- Reporte por curso.
- Leaderboard por curso o evaluacion.

Los reportes se calculan desde submissions persistidos y se cachean en Redis durante 60 segundos.

---

## 12. Documentacion tecnica

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): arquitectura, dominio, despliegue y diagramas Mermaid.
- [docs/CONTRACTS.md](./docs/CONTRACTS.md): contratos API, BullMQ, runner, IA, scoring y estados.
- [docs/RUNNER.md](./docs/RUNNER.md): operacion del worker y runner Docker.
- [docs/AI_ASSISTANT.md](./docs/AI_ASSISTANT.md): reglas, contrato y persistencia de recomendaciones.
- [docs/REPORTS.md](./docs/REPORTS.md): reportes, cache y leaderboard.
- [docs/CONVENTIONS.md](./docs/CONVENTIONS.md): convenciones tecnicas del equipo.

---

## 13. Evidencia sugerida para sustentacion

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 worker
```

Flujo recomendado para demo:

1. Crear login de profesor y estudiante.
2. Crear curso.
3. Inscribir estudiante.
4. Crear escenario con `POST /api/demo/customers-orders`.
5. Iniciar evaluacion si aplica.
6. Enviar submission correcta e incorrecta.
7. Observar logs del worker.
8. Consultar submission final.
9. Consultar recomendaciones.
10. Consultar reportes y leaderboard.
