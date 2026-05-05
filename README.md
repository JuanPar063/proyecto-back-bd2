# SQL Judge — Plataforma inteligente para evaluación y optimización de SQL

> Backend para evaluar automáticamente consultas SQL enviadas por estudiantes,
> medir su rendimiento y generar recomendaciones de optimización.

**Stack:** Node.js 20 · NestJS 10 · PostgreSQL 16 · Redis 7 · BullMQ · Prisma · JWT · Docker Compose

---

## 1. Requisitos

- Docker Desktop (o Docker Engine 24+) y Docker Compose v2
- Node.js 20+ y npm 10+ (solo si se quiere correr fuera de Docker)
- Make (opcional)

## 2. Puesta en marcha rápida

```bash
# 1. Clonar y entrar
git clone <repo> proyecto-back && cd proyecto-back

# 2. Variables de entorno
cp .env.example .env

# 3. Levantar todo el stack (API + worker + Postgres + Redis)
npm run docker:up

# 4. Aplicar migraciones de Prisma (se hace automático al arrancar la API,
#    pero si trabajas en local sin Docker:)
npx prisma migrate dev

# 5. Cargar admin por defecto
npm run prisma:seed
```

Cuando todo está arriba:

| Recurso  | URL                                |
|----------|------------------------------------|
| API      | http://localhost:3000/api          |
| Swagger  | http://localhost:3000/docs         |
| Health   | http://localhost:3000/api/health   |
| Postgres | localhost:5432 (user: `sqljudge`)  |
| Redis    | localhost:6379                     |

Credenciales del admin de seed: `admin@sqljudge.local` / `Admin123!`

## 3. Comandos útiles

```bash
npm run start:dev          # API en watch (fuera de Docker)
npm run worker:dev         # Worker SQL stub en watch (fuera de Docker)
npm run docker:up          # Levantar stack completo
npm run docker:down        # Apagar stack
npm run docker:logs        # Ver logs en vivo
npm run prisma:studio      # GUI de Prisma sobre la DB
npm run prisma:migrate     # Crear nueva migración
npm run lint               # Lint + autofix
npm run test               # Unit tests
```

## 4. Estructura del proyecto

```
proyecto-back/
├── docker-compose.yml
├── Dockerfile                      # Multi-stage para API y Worker
├── .env.example
├── prisma/
│   ├── schema.prisma               # Modelo de dominio
│   └── seed.ts                     # Admin por defecto
├── scripts/
│   └── init-db.sql                 # Crea sqljudge_eval para evaluaciones
├── docs/
│   ├── ARCHITECTURE.md             # Arquitectura + diagramas
│   └── CONVENTIONS.md              # Convenciones de código
├── worker/
│   └── src/main.ts                 # Worker SQL stub (BullMQ)
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── health/                     # /health
    ├── shared/
    │   ├── domain/                 # BaseEntity, DomainException
    │   ├── application/dto/        # PaginationDto, etc.
    │   └── infrastructure/
    │       ├── prisma/             # PrismaService
    │       ├── config/             # validación de env
    │       └── filters/            # HttpExceptionFilter global
    └── modules/                    # Bounded contexts (Clean Architecture)
        ├── auth/                   # Sofia
        ├── users/                  # Sofia
        ├── courses/                # Sofia (redelegado por Pardo)
        ├── challenges/             # Ruiz (redelegado por Pardo)
        ├── schemas/                # Ruiz
        ├── test-data/              # Ruiz (incluye generador)
        └── submissions/            # Entrega 2
```

Cada módulo sigue **Clean Architecture** con cuatro capas:

```
modules/<context>/
├── domain/         # Entidades, value objects, puertos (interfaces)
├── application/    # Use cases, DTOs, servicios de aplicación
├── infrastructure/ # Implementación de puertos: Prisma, HTTP clients, BullMQ
└── presentation/   # Controllers, decoradores HTTP, swagger
```

## 5. Endpoints principales (Entrega 1)

| Módulo           | Endpoints                                                                                  |
|------------------|--------------------------------------------------------------------------------------------|
| Auth             | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me`         |
| Users (ADMIN)    | `POST /users` · `GET /users` · `GET /users/:id` · `PATCH /users/:id/deactivate`            |
| Courses          | `POST /courses` · `GET /courses` · `GET /courses/:id` · `PATCH /courses/:id` · `archive`   |
| Challenges       | `POST /challenges` · `GET /challenges` · `PATCH /challenges/:id` · `PATCH .../status`      |
| Schemas          | `PUT /challenges/:challengeId/schema` · `GET /challenges/:challengeId/schema`              |
| Test data        | `POST .../test-data/manual` · `POST .../test-data/generate` · `POST .../preview`           |
| Health           | `GET /health` (Postgres + Redis)                                                           |

Detalle completo en Swagger.

## 6. Generador de datos — ejemplo end-to-end

`POST /api/challenges/:id/test-data/preview`:

```json
{
  "name": "demo_clientes_ordenes",
  "tables": [
    {
      "table": "customers",
      "rows": 5,
      "fields": {
        "id":   { "type": "integer", "min": 1, "max": 1000 },
        "name": { "type": "varchar", "maxLength": 50 },
        "city": { "type": "enum", "values": ["Bogotá", "Medellín", "Cali"] }
      }
    },
    {
      "table": "orders",
      "rows": 20,
      "fields": {
        "id":          { "type": "integer", "min": 1, "max": 100000 },
        "customer_id": { "type": "foreign_key", "references": "customers.id" },
        "total":       { "type": "decimal", "min": 10000, "max": 5000000 },
        "created_at":  { "type": "date", "from": "2026-01-01", "to": "2026-12-31" },
        "status":      { "type": "enum", "values": ["PENDING", "PAID", "CANCELLED"] }
      }
    }
  ]
}
```

Devuelve un script `INSERT` que respeta las relaciones FK.

## 7. Repartición de tareas

Ver [`Reparticion_Tareas_Entrega1.docx`](./Reparticion_Tareas_Entrega1.docx).

## 8. Documentación

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — diagramas y modelo de dominio
- [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) — convenciones de código

## 9. Próximos pasos (Entrega 2)

- Submissions reales y flujo end-to-end de evaluación
- Runner SQL en Docker con límites de memoria/CPU
- Asistente inteligente (reglas + IA generativa)
- Reportes y leaderboard
