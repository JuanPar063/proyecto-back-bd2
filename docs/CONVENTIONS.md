# Convenciones del equipo — SQL Judge

> **Owner:** Dayana Molina. Si algo aquí choca con tu PR, antes de saltártelo,
> consúltalo en la daily.

---

## 1. Nombres

- **Carpetas y archivos**: `kebab-case`. Ejemplo: `prisma-user.repository.ts`.
- **Clases**: `PascalCase`. `UsersService`, `JwtAuthGuard`.
- **Variables y funciones**: `camelCase`.
- **Constantes globales / tokens DI**: `UPPER_SNAKE_CASE`. Ej: `USER_REPOSITORY`.
- **Módulos Nest**: `<Context>Module` (`AuthModule`, `CoursesModule`).
- **DTOs**: `<Acción><Entidad>Dto` (`CreateCourseDto`, `UpdateChallengeDto`).
- **Puertos del dominio**: `<Entidad>Repository` (interfaz) + token `Symbol` exportado.

---

## 2. Estructura de un módulo

```
modules/<context>/
├── domain/
│   ├── <entidad>.entity.ts       # entidad pura, sin decoradores de infra
│   └── <entidad>.repository.ts   # puerto + Symbol token
├── application/
│   ├── dto/                      # DTOs con class-validator + ApiProperty
│   └── <context>.service.ts      # orquestación, NO toca Prisma directamente
├── infrastructure/
│   └── prisma-<entidad>.repository.ts
├── presentation/
│   └── <context>.controller.ts   # @Controller + @ApiTags
└── <context>.module.ts
```

**Reglas duras:**
- Un controller solo llama a un service.
- Un service solo llama a repositorios (vía puerto) y a otros services.
- Si un service necesita un dato de Prisma "rápido", crear método en repo.
  No usar `PrismaService` desde la capa de aplicación (excepto en stubs
  marcados con TODO).

---

## 2.1. Casos de uso (Use Cases)

Para mantener una separación más estricta de responsabilidades dentro de
Clean Architecture, los flujos principales del negocio deben implementarse
como casos de uso explícitos.

Estructura sugerida:

modules/<context>/
├── application/
│   ├── dto/
│   ├── use-cases/
│   │   ├── create-course.use-case.ts
│   │   ├── publish-challenge.use-case.ts
│   │   └── submit-sql.use-case.ts
│   └── services/

Reglas:
- Un Use Case representa una acción concreta del negocio.
- Los controllers llaman Use Cases o Services de aplicación.
- Un Use Case no debe depender de Prisma directamente.
- Los Use Cases pueden orquestar múltiples repositorios o puertos.
- Mantener lógica de negocio fuera de controllers.


---

## 3. DTOs

- Usar `class-validator` para validar.
- Usar `class-transformer` (`@Type`) para `Number` y nested objects.
- Anotar todos los campos con `@ApiProperty` o `@ApiPropertyOptional` para que
  Swagger los recoja.
- Nunca exponer hashes/passwords en respuestas. Si la entidad tiene `passwordHash`,
  filtrarlo manualmente o vía `class-transformer @Exclude`.

---

## 4. Formato de respuesta

**Éxito**: el body es directamente la entidad o `{ data, meta }` para listados
paginados (ver `PaginationQueryDto`).

**Error** (lo emite `HttpExceptionFilter`):

```json
{
  "statusCode": 400,
  "message": "El email ya está registrado",
  "error": "Conflict",
  "path": "/api/users",
  "timestamp": "2026-05-04T12:34:56.000Z"
}
```

`message` puede ser `string` o `string[]` (caso típico de errores de validación
de class-validator). Los clientes deben tolerar ambos.

---

## 5. Autenticación / autorización

- **Endpoints públicos**: `/auth/register`, `/auth/login`, `/auth/refresh`, `/health`.
- **Resto**: protegidos con `@UseGuards(JwtAuthGuard, RolesGuard)`.
- Restringir por rol con `@Roles(Role.PROFESSOR, ...)`.
- Para acceder al usuario autenticado dentro de un controller, usar el
  decorador `@CurrentUser()` (`auth/infrastructure/decorators/current-user.decorator`).
- Nunca confiar en `userId` que venga en el body para autorización: tomarlo del JWT.

---

## 5.1. Jobs y procesamiento asíncrono

La plataforma usa BullMQ + Redis para procesamiento asíncrono.

Convenciones:
- Nombre de jobs:
  `<context>.<action>`

Ejemplos:
- `submissions.evaluate`
- `recommendations.generate`
- `runner.cleanup`

Payloads:
- Los payloads deben ser tipados.
- Evitar enviar objetos gigantes en cola.
- Preferir IDs y cargar información desde DB dentro del worker.

Reglas:
- Los jobs nunca deben ejecutar lógica HTTP.
- Los workers son responsables de:
  - actualizar estados,
  - manejar retries,
  - persistir resultados,
  - registrar errores.

---

## 6. Errores

- **Domain**: lanzar subclases de `DomainException` (ver
  `shared/domain/domain.exception.ts`).
- **Application**: cuando se cruza la frontera HTTP, traducir a
  `BadRequestException`, `NotFoundException`, `ForbiddenException`,
  `ConflictException`, etc. (built-in de Nest).
- **No** lanzar `Error` genérico desde la capa de aplicación.

---


## 6.1. Seguridad SQL

Toda consulta SQL enviada por estudiantes debe considerarse no confiable.

Reglas obligatorias:
- Nunca ejecutar SQL directamente desde requests HTTP.
- Toda ejecución SQL debe pasar por Redis + Worker + Runner aislado.
- Validar el AST SQL antes de ejecutar.
- Bloquear:
  - DROP
  - DELETE
  - UPDATE
  - ALTER
  - TRUNCATE
  - CREATE USER
  - GRANT
  - REVOKE

- Solo se permiten consultas SELECT en la evaluación automática.
- Toda evaluación debe tener:
  - timeout,
  - límites de memoria,
  - límites de CPU.

- El Runner SQL nunca debe usar la base principal de la plataforma.
- Cada evaluación debe ejecutarse en contenedores efímeros.

---

## 7. Git / PRs

- Ramas: `feature/<modulo>-<descripcion>`. Ej: `feature/courses-enrollments`.
- Base: `dev`. Solo se mergea a `main` al cierre de entrega.
- **Conventional Commits** OBLIGATORIO (la rúbrica evalúa contribución por commits):
  - `feat:` nueva funcionalidad
  - `fix:` bug
  - `docs:` documentación
  - `refactor:` cambio sin alterar comportamiento
  - `test:` solo tests
  - `chore:` infra, deps, build
  - `wip:` evitar; si lo usas, no lo mergees a `dev`.
- Cada PR debe ser revisado por **al menos otro integrante** antes de mergear.
- En el PR: descripción corta + lista de cambios + cómo probarlo + capturas si aplica.

---

## 8. Swagger

- Cada controller lleva `@ApiTags(...)`.
- Cada handler lleva `@ApiOperation({ summary: '...' })`.
- Si el endpoint requiere auth: `@ApiBearerAuth()` a nivel controller.
- DTOs con `@ApiProperty` para que aparezcan los ejemplos.

---

## 9. Tests

- Para Entrega 1, mínimo **1 colección Postman / archivo `.http`** por módulo.
  Vivirá en `test/postman/` o equivalente.
- Para Entrega 2: tests unitarios de `application/*.service.ts` con mocks de
  los puertos.
- Nunca testear endpoints golpeando la DB real fuera de un docker compose dedicado.

---

## 9.1. Logging y trazabilidad

Reglas:
- No usar `console.log`.
- Usar `Logger` de NestJS.
- Los logs deben incluir:
  - timestamp,
  - contexto,
  - nivel,
  - correlationId.

- Cada submission debe tener un `correlationId`
  para rastrear:
  API → Queue → Worker → Runner.

Niveles sugeridos:
- `log`: eventos normales.
- `warn`: comportamiento inesperado recuperable.
- `error`: fallos críticos.
- `debug`: solo desarrollo local.

Nunca loggear:
- passwords,
- refresh tokens,
- JWTs completos.

---

## 10. Variables de entorno

- Todo lo que cambia entre entornos va a `.env`.
- Cada nueva variable se añade a `.env.example` Y a la clase `EnvVars` en
  `shared/infrastructure/config/env.validation.ts` para que falle rápido si
  está mal configurada.

---

## 11. Transacciones

Cuando una operación afecte múltiples entidades relacionadas,
usar `prisma.$transaction`.

Ejemplos:
- Crear curso + enrollments.
- Crear reto + esquema + dataset.
- Guardar submission + resultado + recomendaciones.

Evitar estados parcialmente persistidos.

---

## 12. Versionado API

La API debe exponerse bajo:

/api/v1

Ejemplos:
- `/api/v1/auth/login`
- `/api/v1/courses`
- `/api/v1/challenges`

Cambios incompatibles deben crear nueva versión.

---

## 13. Paginación

Endpoints listados deben soportar:

?page=1&limit=10

Formato estándar:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
