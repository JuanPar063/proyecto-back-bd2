# Ejemplo de ejecucion end-to-end

Este ejemplo resume una ejecucion real esperada para la entrega final.

## 1. Preparacion

```bash
cp .env.example .env
docker compose up -d --build
npm run prisma:seed
```

Abrir Swagger:

```text
http://localhost:3000/docs
```

## 2. Crear datos academicos

1. Login como profesor.
2. Crear curso.
3. Crear estudiante.
4. Inscribir estudiante en el curso.
5. Crear reto SQL.
6. Cargar schema.
7. Cargar test data manual o generado.
8. Cargar expected result.
9. Publicar reto.

## 3. Enviar submission

```http
POST /api/challenges/:challengeId/submissions
Authorization: Bearer <student-token>
Content-Type: application/json

{
  "query": "SELECT c.name, COUNT(o.id) AS total_orders FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.name HAVING COUNT(o.id) > 3"
}
```

Respuesta inicial:

```json
{
  "id": "submission-id",
  "status": "QUEUED",
  "challengeId": "challenge-id",
  "studentId": "student-id"
}
```

## 4. Worker y runner

Logs esperados:

```text
Procesando submission: <id>
FASE 1: Obteniendo datos del submission...
FASE 2: Creando contenedor PostgreSQL...
FASE 3: Esperando a que PostgreSQL este listo...
FASE 4: Conectando a PostgreSQL y ejecutando SQL...
FASE 6: Comparando resultados...
FASE 7: Calculando puntuacion...
FASE 9: Guardando resultados en DB...
CLEANUP: Destruyendo contenedor...
```

El runner:

- Aplica `SchemaScript`.
- Carga `TestDataset`.
- Ejecuta la query del estudiante.
- Devuelve filas, columnas, tiempo y plan si aplica.
- Destruye el contenedor temporal.

## 5. Resultado final

```http
GET /api/submissions/:id
Authorization: Bearer <student-token>
```

Ejemplo:

```json
{
  "id": "submission-id",
  "status": "ACCEPTED",
  "score": 95,
  "executionTimeMs": 120,
  "scoreBreakdown": {
    "correctness": 60,
    "executionTime": 15,
    "sqlPractices": 10,
    "clarity": 5,
    "improvement": 5,
    "final": 95
  }
}
```

## 6. Reportes

```http
GET /api/reports/students/:studentId
GET /api/reports/challenges/:challengeId
GET /api/reports/courses/:courseId
GET /api/reports/leaderboard?courseId=<courseId>
```

Los reportes se calculan desde submissions persistidos y se cachean en Redis durante 60 segundos.

## 7. Datos disponibles tras el seed

El seed (`npm run prisma:seed`) deja precargado un escenario completo y reproducible. Cualquier query de los siguientes bloques opera contra estos datos sin pasos previos.

Credenciales:

```text
ADMIN     admin@sqljudge.local      Admin123!
PROFESOR  carlos.profe@univ.edu     Profe123!
PROFESOR  laura.profe@univ.edu      Profe123!
STUDENT   ana.estudiante@univ.edu   Stud123!
STUDENT   beto.estudiante@univ.edu  Stud123!
STUDENT   carla.estudiante@univ.edu Stud123!
STUDENT   david.estudiante@univ.edu Stud123!
STUDENT   elena.estudiante@univ.edu Stud123!
```

Retos publicados en el curso `BD2-DEMO-2026` (profesor Carlos):

| Reto | Dificultad | Tags | Time limit |
|------|------------|------|------------|
| Clientes en Bogotá | EASY | SELECT, WHERE | 3000 ms |
| Top 3 órdenes por total | MEDIUM | ORDER BY, LIMIT | 3000 ms |
| Clientes con más de 3 compras | HARD | JOIN, GROUP BY, HAVING | 5000 ms |

Submissions precargadas (7): una por cada estado terminal del enum.

```http
GET /api/submissions?challengeId=<ch1.id>
Authorization: Bearer <profToken>
```

Devuelve las submissions de Ana (ACCEPTED), Beto (ACCEPTED), Carla (OPTIMIZATION_REQUIRED) sobre el reto fácil.

## 8. Estados terminales del Evaluador SQL

El seed cubre los seis estados terminales. Para mostrar cada uno basta con consultar la submission correspondiente:

```http
GET /api/submissions?studentId=<id>
Authorization: Bearer <profToken>
```

Resumen de qué buscar:

| Estado | Submission de | Causa esperada |
|--------|---------------|----------------|
| ACCEPTED | Ana en reto 1 | Resultado correcto, tiempo óptimo, score 100 |
| WRONG_ANSWER | Beto en reto 2 | Olvidó LIMIT, devolvió 10 filas en vez de 3 |
| SYNTAX_ERROR | Beto en reto 3 | Usó `==` en lugar de `=` |
| OPTIMIZATION_REQUIRED | Carla en reto 1 | SELECT * + tiempo lento (950 ms) |
| TIME_LIMIT_EXCEEDED | Carla en reto 3 | Subconsultas correlacionadas, excedió 5000 ms |
| RUNTIME_ERROR | David en reto 2 | Tabla `ordenes` no existe |

Cada submission persiste `status`, `score`, `scoreBreakdown`, `executionTimeMs`, `errorMessage` y `feedback` con el detalle.

Para validar el flujo en vivo, disparar una submission nueva en el reto fácil:

```http
POST /api/challenges/<ch1.id>/submissions
Authorization: Bearer <studToken (Elena)>

{ "query": "SELECT name FROM customers WHERE city = 'Bogotá'" }
```

En `docker compose logs -f worker` aparecen las 9 fases en menos de 25 segundos.

## 9. Asistente IA en vivo

El endpoint público sirve para mostrar los cuatro outputs del asistente (warnings, indexes, rewriteSql, qualityScore) sin pasar por el worker.

```http
POST /api/ai-assistant/analyze
Authorization: Bearer <profToken>

{
  "query": "SELECT * FROM customers WHERE UPPER(name) = 'ANA LÓPEZ' ORDER BY name",
  "schemaDdl": "CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100), city VARCHAR(80));",
  "executionTimeMs": 100,
  "status": "ACCEPTED"
}
```

Respuesta esperada:

```jsonc
{
  "explanation": "La consulta se ejecutó correctamente en 100 ms. Observaciones: ...",
  "warnings": [
    { "ruleId": "SELECT_STAR", "severity": "warning", "message": "Evita SELECT *..." },
    { "ruleId": "FUNCTION_IN_WHERE", "severity": "warning", "message": "Función sobre columna..." },
    { "ruleId": "ORDER_BY_WITHOUT_LIMIT", "severity": "info", "message": "ORDER BY sin LIMIT..." }
  ],
  "suggestedIndexes": [
    "CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);",
    "CREATE INDEX IF NOT EXISTS idx_customers_name_upper ON customers(UPPER(name));"
  ],
  "rewriteSql": "SELECT id, name, city FROM customers WHERE UPPER(name) = 'ANA LÓPEZ' ORDER BY name",
  "impact": "Aplicar las 3 sugerencia(s) puede mejorar la legibilidad y el plan de ejecución.",
  "qualityScore": { "goodPractices": 6, "clarity": 2, "improvement": 5 }
}
```

Recomendaciones precargadas por el seed:

```http
GET /api/submissions/<id>
```

La respuesta incluye `runnerMetadata` con el análisis. Los 3 registros en la tabla `recommendations` se pueden inspeccionar con Prisma Studio o consultando submissions de Carla (OPTIMIZATION_REQUIRED), Beto (WRONG_ANSWER en reto 2) y Ana (ACCEPTED en reto 2).

## 10. Caso OPTIMIZATION_REQUIRED end-to-end

Para mostrar la decisión de estado dirigida por el IA, disparar una submission correcta pero con anti-patrón crítico:

```http
POST /api/challenges/<ch3.id>/submissions
Authorization: Bearer <studToken (Elena)>

{
  "query": "SELECT c.name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS total FROM customers c WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) > 3"
}
```

El comparator declara `ACCEPTED` (el resultado coincide) pero el rule engine levanta `SLOW_QUERY` con severidad `critical`. El worker (`worker/src/main.ts:226-233`) deriva el estado final a `OPTIMIZATION_REQUIRED`.

En los logs del worker se observa:

```text
[ResultComparator] Comparación: OK (1 fila coincide)
[Worker] Asistente IA respondió ✓ (1 warning(s) crítica(s))
[Worker] Submission completado: OPTIMIZATION_REQUIRED (Score: ...)
```

## 11. Evaluaciones (parciales)

El seed precarga una evaluación con un attempt activo de Ana. Para inspeccionar el estado:

```http
GET /api/evaluations
Authorization: Bearer <studToken (Ana)>
```

Devuelve la lista filtrada por cursos donde está inscrita.

```http
GET /api/evaluations/<eval1.id>/state
Authorization: Bearer <studToken (Ana)>
```

Devuelve el detalle: ventana, intentos usados, intento activo, retos asociados y submissions del intento (visibles según `resultsVisibility`).

Flujo nuevo en vivo:

```http
POST /api/evaluations
Authorization: Bearer <profToken (Carlos)>

{
  "name": "Parcial demo",
  "courseId": "<courseBD2.id>",
  "startDate": "<now>",
  "endDate": "<now + 2h>",
  "durationMinutes": 60,
  "maxAttempts": 1,
  "resultsVisibility": "AFTER_END"
}
```

```http
PATCH /api/evaluations/<id>/challenges
Authorization: Bearer <profToken>

{ "challengeIds": ["<ch1.id>", "<ch2.id>"] }
```

```http
POST /api/evaluations/<id>/start
Authorization: Bearer <studToken (Beto)>
```

Las submissions enviadas con `evaluationId` en el body quedan amarradas al `EvaluationAttempt` correspondiente.

## 12. Reportes y leaderboard

Sobre los datos del seed (7 submissions reales) los reportes ya tienen contenido:

```http
GET /api/reports/students/<studAna.id>
Authorization: Bearer <profToken>
```

Devuelve retos resueltos, submissions totales, mejor tiempo y score promedio de Ana.

```http
GET /api/reports/challenges/<ch1.id>
Authorization: Bearer <profToken>
```

Devuelve tasa de éxito y dificultad real del reto fácil.

```http
GET /api/reports/courses/<courseBD2.id>
Authorization: Bearer <profToken>
```

Devuelve promedio del curso, top 5 estudiantes (con `fullName` real) y retos más difíciles.

```http
GET /api/reports/leaderboard?courseId=<courseBD2.id>
Authorization: Bearer <studToken>
```

Devuelve ranking agregado por estudiante. Visible para los tres roles.

## 13. Diseño Clean Architecture

Cada módulo bajo `src/modules/<contexto>/` respeta cuatro capas:

```text
src/modules/ai-assistant/
├── domain/         entidades, puertos (interfaces), excepciones
├── application/    servicios, casos de uso, reglas
├── infrastructure/ adaptadores (Prisma, stub LLM)
└── presentation/   controllers HTTP, DTOs
```

Punto a destacar — `src/modules/ai-assistant/ai-assistant.module.ts`:

```ts
{ provide: LLM_CLIENT_PORT, useExisting: StubLlmClient }
```

Esa línea permite reemplazar el cliente LLM (stub, OpenAI, Anthropic, Ollama) sin tocar el resto del módulo. Es inversión de dependencias en práctica.

El worker (`worker/src/`) es un proceso separado que reusa contratos y funciones puras desde `src/shared/`:

- `src/shared/contracts/` — payloads de cola, IO del IA, resultados del runner.
- `src/shared/evaluator/result-comparator.ts` — comparador canónico.
- `src/shared/evaluator/score-calculator.ts` — scorer canónico.

Los archivos no dependen de NestJS ni Prisma, por eso pueden correr igual en API y worker.

## 14. Mapeo a la rúbrica

| Criterio | Peso | Dónde demostrarlo |
|----------|------|-------------------|
| Diseño de dominio y Clean Architecture | 10% | Sección 13 + estructura del repo + `ai-assistant.module.ts` |
| API REST, autenticación y roles | 10% | Sección 2 (login de los 3 roles) + Swagger UI |
| Gestión de cursos, retos SQL y evaluaciones | 15% | Sección 7 (cursos y retos del seed) + Sección 11 (evaluations) |
| Gestión de esquemas y generación de datos aleatorios | 10% | Sección 7 (schema cargado) + `POST /test-data/preview` + `data-generator.service.ts` |
| Evaluador automático SQL | 20% | Sección 4 (worker 9 fases) + Sección 8 (6 estados terminales) |
| Runner SQL con Docker y procesamiento con Redis | 15% | Sección 4 + `docker compose logs -f worker` + `docker ps` durante submission |
| Asistente inteligente de optimización SQL | 10% | Sección 9 (analyze en vivo) + Sección 10 (OPTIMIZATION_REQUIRED) |
| Reportes, leaderboard, documentación y video | 10% | Sección 12 + `README.md` + `docs/` |

## 15. Cheat sheet de la sustentación

Tiempo estimado por bloque:

```text
Setup (docker + seed)              2 min
Tour de Swagger + roles            3 min
Reto + schema + dataset            2 min
Submission en vivo + worker logs   4 min
Estados terminales (consulta)      3 min
Asistente IA manual                3 min
OPTIMIZATION_REQUIRED en vivo      3 min
Evaluaciones + attempt             3 min
Reportes + leaderboard             2 min
Clean Architecture (tour código)   3 min
                                  ---
Total                             28 min
```

Comandos de apoyo:

```bash
docker compose ps                  # 4 servicios healthy
docker compose logs -f worker      # 9 fases en vivo
docker ps --filter "name=sql-judge-eval-"   # runner temporal vivo
npm run prisma:studio              # GUI sobre la BD del seed
```
