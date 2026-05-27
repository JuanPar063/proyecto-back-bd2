# Convenciones tecnicas - SQL Judge

Estas convenciones aplican a la implementacion final del backend.

---

## 1. Nombres

- Carpetas y archivos: `kebab-case`.
- Clases: `PascalCase`.
- Variables y funciones: `camelCase`.
- Constantes y tokens DI: `UPPER_SNAKE_CASE`.
- Modulos Nest: `<Context>Module`.
- DTOs: `<Accion><Entidad>Dto`.
- Repositorios de dominio: `<Entidad>Repository`.

---

## 2. Estructura por modulo

```text
modules/<context>/
├── domain/
│   ├── <entity>.entity.ts
│   └── <entity>.repository.ts
├── application/
│   ├── dto/
│   ├── use-cases/
│   └── <context>.service.ts
├── infrastructure/
│   └── prisma-<entity>.repository.ts
├── presentation/
│   └── <context>.controller.ts
└── <context>.module.ts
```

Reglas:

- Controllers solo coordinan HTTP, DTOs, guards y servicios/casos de uso.
- La logica de negocio vive en application/domain.
- Infrastructure implementa persistencia, cache, colas, runner o clientes externos.
- Los modulos pueden usar Prisma directamente cuando no existe puerto formal, pero no desde controllers.
- Las reglas compartidas de transicion, scoring y contratos deben vivir en `shared/` o documentarse en `docs/CONTRACTS.md`.

---

## 3. DTOs y Swagger

- Validar entrada con `class-validator`.
- Transformar tipos con `class-transformer`.
- Documentar campos con `@ApiProperty` o `@ApiPropertyOptional`.
- No exponer `passwordHash`, refresh tokens ni JWT completos.
- Cada controller debe tener `@ApiTags`.
- Endpoints protegidos deben usar `@ApiBearerAuth`.

---

## 4. Respuestas y errores

Respuesta de exito:

- Entidad directa para operaciones simples.
- `{ data, meta }` para listados paginados cuando aplique.

Formato de error:

```json
{
  "statusCode": 400,
  "message": "Detalle del error",
  "error": "Bad Request",
  "path": "/api/...",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

---

## 5. Autenticacion y autorizacion

- Publicos: `/auth/register`, `/auth/login`, `/auth/refresh`, `/health`.
- Protegidos: usar `JwtAuthGuard` y `RolesGuard`.
- Roles validos: `ADMIN`, `PROFESSOR`, `STUDENT`.
- Obtener usuario autenticado con `@CurrentUser()`.
- No confiar en `userId` enviado por body para autorizacion.

---

## 6. API

El prefijo global se controla con `API_PREFIX`. El valor por defecto del proyecto es:

```text
/api
```

Si se requiere versionamiento externo, puede configurarse:

```env
API_PREFIX=api/v1
```

Los documentos y Swagger deben reflejar el prefijo configurado.

---

## 7. Procesamiento asincrono

La plataforma usa BullMQ y Redis.

Reglas:

- Jobs pequenos; enviar IDs y cargar contexto desde PostgreSQL.
- El job de submissions usa `{ submissionId }`.
- El worker actualiza estados y persiste resultados.
- Los errores terminales deben quedar reflejados en `Submission.status`.
- Jobs agotados pueden enviarse a `failed-submissions` para inspeccion admin.

---

## 8. Seguridad SQL

- Nunca ejecutar SQL de estudiantes desde la API.
- Nunca ejecutar SQL de estudiantes en la base principal.
- Toda evaluacion pasa por Redis, worker y runner Docker.
- Solo permitir `SELECT` o `WITH ... SELECT`.
- Bloquear `DROP`, `DELETE`, `UPDATE`, `ALTER`, `TRUNCATE`, `INSERT`, `CREATE`, `COPY`, `GRANT` y `REVOKE`.
- Aplicar timeout, CPU y memoria.
- Destruir el contenedor temporal al finalizar.

---

## 9. Reportes

- Los reportes se calculan desde submissions persistidos.
- Redis se usa como cache de TTL corto.
- El leaderboard no depende del runner ni de datos temporales.
- Nuevas metricas deben documentarse en `docs/REPORTS.md`.

---

## 10. Tests

Prioridades de prueba:

- Servicios de application.
- Transiciones de submissions.
- Comparador de resultados.
- Calculador de score.
- Evaluaciones e intentos.
- Reglas del AI Assistant.
- Reportes y leaderboard.

No usar una base compartida real para tests destructivos.

---

## 11. Git y PRs

- Ramas: `feature/<modulo>-<descripcion>` o `fix/<modulo>-<descripcion>`.
- Commits recomendados: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Cada PR debe indicar cambios, pruebas y riesgos.
- Cambios de contratos deben actualizar `docs/CONTRACTS.md`.

---

## 12. Variables de entorno

Cada variable nueva debe agregarse a:

- `.env.example`
- `src/shared/infrastructure/config/env.validation.ts`
- README si es necesaria para operar la entrega.
