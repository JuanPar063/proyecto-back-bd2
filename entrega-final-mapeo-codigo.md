# SQL Judge — Entregable 2 (Semana 5)

## Mapeo de cada requisito del enunciado al código real

> Este documento es la guía paso a paso para que el equipo pueda **mostrar en la
> sustentación** y en el **video demostrativo** dónde vive cada pieza pedida en
> el enunciado del Entregable 2. Cada sección lista archivo y líneas reales
> del repo, cómo funciona y cómo verificarlo end-to-end.
>
> **Estado del main** (commit `06c1a9b`): 52 tests verdes, build limpio, flujo
> end-to-end probado con docker compose. Solo quedan abiertos los ítems 16 y 17
> (video y capturas), que son trabajo manual de la presentación.

---

## Resumen ejecutivo

| # | Ítem | Estado | Owner |
|---|------|--------|-------|
| 1 | Evaluador SQL funcional | ✅ | Ruiz + Jose |
| 2 | Envío de submissions | ✅ | Ruiz |
| 3 | Procesamiento con Redis | ✅ | Ruiz + Pardo |
| 4 | Worker SQL funcional | ✅ | Jose |
| 5 | Runner SQL con Docker | ✅ | Jose |
| 6 | Generador de datos aleatorios | ✅ | Ruiz |
| 7 | Medición de tiempo de ejecución | ✅ | Jose |
| 8 | Comparación contra resultado esperado | ✅ | Ruiz |
| 9 | Asistente inteligente obligatorio | ✅ | Pardo |
| 10 | Recomendaciones de optimización SQL | ✅ | Pardo |
| 11 | Sugerencia de índices | ✅ | Pardo |
| 12 | Reescritura sugerida de consultas | ✅ | Pardo |
| 13 | Evaluaciones o parciales | ✅ | Sofia |
| 14 | Reportes por estudiante, reto y curso | ✅ | Dayana |
| 15 | README completo | ✅ | Dayana |
| 16 | Video demostrativo | ❌ | Dayana |
| 17 | Evidencia de ejecución con Docker Compose | ❌ | Dayana |

**Cobertura**: 15/17 (88%). Los 2 abiertos son entregables NO-código (video y capturas) responsabilidad de Dayana.

---

## 1. Evaluador SQL funcional ✅

### Qué pide el enunciado
"Sistema que reciba una consulta SQL del estudiante, la ejecute en sandbox, mida tiempo, compare contra esperado y asigne puntaje."

### Dónde vive

| Componente | Archivo | Líneas |
|------------|---------|--------|
| Comparador canónico | `src/shared/evaluator/result-comparator.ts` | 1-241 |
| Tests del comparador | `src/shared/evaluator/result-comparator.spec.ts` | 18 tests |
| Scorer canónico | `src/shared/evaluator/score-calculator.ts` | 1-103 |
| Tests del scorer | `src/shared/evaluator/score-calculator.spec.ts` | 7 tests |
| Comparator del worker | `worker/src/evaluation/result-comparator.ts` | 1-234 |
| Scorer del worker | `worker/src/evaluation/score-calculator.ts` | 1-249 |
| Orquestación end-to-end | `worker/src/main.ts` | 9 fases |

### Cómo funciona

1. El estudiante envía su query → la API la persiste con `status: QUEUED` y la encola.
2. El worker la consume y la pasa por 9 fases: obtener datos, crear contenedor, esperar Postgres, ejecutar DDL+seed+query, **comparar resultados**, llamar al IA, **calcular score**, derivar status final, persistir.
3. El comparador compara contra el `ExpectedResult` del reto:
   - Set de columnas (case-insensitive por defecto).
   - Multiset de filas (orden opcional con `orderSensitive`).
   - Tolerancia decimal configurable (`floatTolerance`).
   - `NULL` como valor (NULL == NULL, NULL ≠ 0).
4. El scorer suma: **60% correctness + 15% performance + 10% buenas prácticas + 5% claridad + 10% mejora**.

### Cómo verificarlo en la demo

```bash
docker compose up -d
npm run prisma:seed         # crea admin
.\scripts\smoke-submissions.ps1
```

Ver `docker compose logs -f worker` durante la submission: aparecen las 9 fases y el `Score breakdown: correctness=X, time=Y, practices=Z, clarity=W, improvement=V => TOTAL=N`.

---

## 2. Envío de submissions ✅

### Qué pide el enunciado
"Endpoint para que el estudiante envíe una consulta SQL contra un reto publicado."

### Dónde vive

| Componente | Archivo | Líneas / Endpoint |
|------------|---------|--------------------|
| DTO Create | `src/modules/submissions/application/dto/submission.dto.ts` | `CreateSubmissionDto`, `SubmitFromChallengeDto` |
| Servicio | `src/modules/submissions/application/submissions.service.ts` | `submitForChallenge()` 88-166 |
| Controller principal | `src/modules/submissions/presentation/submissions.controller.ts` | `POST /submissions` (legacy) |
| Controller REST-ish | `src/modules/submissions/presentation/challenge-submissions.controller.ts` | `POST /challenges/:challengeId/submissions` |
| Módulo | `src/modules/submissions/submissions.module.ts` | Registra 4 controllers |

### Validaciones (en `submissions.service.ts:submitForChallenge`)

- L93: `assertSelectOnly(query)` → rechaza queries que no empiecen con `SELECT` o `WITH`, y que contengan keywords prohibidos (`DROP`, `DELETE`, `UPDATE`, etc.).
- L113-135: el reto debe existir, estar `published`, el alumno debe estar inscrito, debe haber schema + dataset + expectedResult cargados.
- L137-141: si la submission entra dentro de una `evaluation`, se resuelve el `evaluationAttemptId`.
- L143-152: persiste con `status: QUEUED`.
- L154-163: encola con `attempts: 3`, `backoff: exponential delay 2000`.

### Cómo verificarlo

Usar Postman o `requests/ruiz-submissions.http` sección 3.1:

```http
POST /api/challenges/{challengeId}/submissions
Authorization: Bearer <studToken>
Content-Type: application/json

{ "query": "SELECT c.name FROM customers c ..." }
```

Respuesta: `202 Accepted` con el id de la submission.

---

## 3. Procesamiento con Redis ✅

### Qué pide el enunciado
"Las evaluaciones deben procesarse asíncronamente usando una cola Redis."

### Dónde vive

| Componente | Archivo | Función |
|------------|---------|---------|
| Producer principal | `src/modules/submissions/application/submissions.service.ts:154-163` | `queue.add('evaluate', { submissionId }, { attempts: 3, backoff })` |
| Producer auxiliar | `src/modules/submissions/infrastructure/queue/submission-queue.producer.ts` | Abstracción del producer |
| Cola DLQ | `src/modules/submissions/infrastructure/queue/failed-submissions.producer.ts` | Dead Letter Queue manual |
| Admin DLQ | `src/modules/submissions/presentation/admin-submissions.controller.ts` | `GET /admin/submissions/failed`, `POST /admin/submissions/failed/:jobId/retry` |
| Configuración global | `src/app.module.ts` | `BullModule.forRootAsync` con host/port de Redis |
| Worker consumer | `worker/src/main.ts:73-95` | `new Worker(SUBMISSIONS_QUEUE, ..., { concurrency: 2 })` |
| Healthcheck Redis | `src/health/health.controller.ts` | `GET /api/health` incluye Redis |

### Política de reintentos

- 3 intentos automáticos con backoff exponencial 2s.
- Si los 3 fallan, BullMQ emite `failed` event → el `FailedSubmissionsProducer` lo empuja a la cola `failed-submissions`.
- ADMIN puede reintentar manualmente con `POST /admin/submissions/failed/:jobId/retry`.

### Cómo verificarlo

```bash
docker compose ps redis   # debe decir (healthy)
curl http://localhost:3000/api/health
# {"status":"ok","info":{"postgres":{"status":"up"},"redis":{"status":"up"}}, ...}
```

En logs del worker se ve `[Worker] Worker listo. Escuchando cola "submissions"`.

---

## 4. Worker SQL funcional ✅

### Qué pide el enunciado
"Worker que consume la cola, orquesta la ejecución y persiste los resultados."

### Dónde vive

| Componente | Archivo | Líneas |
|------------|---------|--------|
| Entry-point | `worker/src/main.ts` | 1-310 |
| Logger | `worker/src/utils/logger.ts` | 1-33 |
| Tipos compartidos | `worker/src/contracts/` | 4 archivos |
| Tipos runner | `worker/src/docker/types.ts` | 1-64 |

### Las 9 fases del worker (`worker/src/main.ts`)

| Fase | Líneas aprox. | Qué hace |
|------|---------------|----------|
| 1 | L85-93 | Obtener `EvaluationContext` (challenge, schema, dataset, expectedResult) |
| 2 | L94-99 | Crear contenedor Postgres temporal con `dockerService.createPostgresContainer` |
| 3 | L100-114 | Esperar a que Postgres esté `healthy` |
| 4 | L115-132 | Conectar con `pg`, ejecutar DDL + seed + query (con timeout) |
| 5 | L134-159 | Si error: derivar `SYNTAX_ERROR | TIME_LIMIT_EXCEEDED | RUNTIME_ERROR` |
| 6 | L161-170 | Comparar resultados vs expected |
| 6.5 | L172-202 | Invocar al **Asistente IA** vía `POST /ai-assistant/internal/analyze` |
| 7 | L204-218 | Calcular score con sub-scores IA |
| 8 | L220-230 | Derivar status final: ACCEPTED / OPTIMIZATION_REQUIRED / WRONG_ANSWER |
| 9 | L227-244 | Persistir en DB (status, score, scoreBreakdown, feedback, runnerMetadata) |
| Cleanup | L230-241 (`finally`) | Destruir contenedor temporal SIEMPRE |

### Concurrencia

- Línea 246: `concurrency: 2` → procesa hasta 2 submissions en paralelo.

### Shutdown graceful

- L270-292: SIGTERM/SIGINT → `dockerService.cleanupAllContainers()` + cerrar worker + desconectar Prisma.

### Cómo verificarlo

```bash
docker compose logs -f worker
```

Enviar una submission y ver pasar las 9 fases en vivo.

---

## 5. Runner SQL con Docker ✅

### Qué pide el enunciado
"Las consultas se ejecutan dentro de un contenedor Docker aislado, con límites de recursos y limpieza."

### Dónde vive

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| DockerService | `worker/src/docker/docker.service.ts` | Crear/destruir contenedores Postgres |
| PostgresHealthCheck | `worker/src/docker/postgres-health.service.ts` | Esperar a que Postgres esté listo |
| SqlExecutor | `worker/src/docker/sql-executor.service.ts` | Conectar con `pg`, ejecutar DDL+seed+query |
| Tipos | `worker/src/docker/types.ts` | `SqlExecutionResult`, `ContainerConfig`, `EvaluationContext` |

### Configuración del contenedor temporal (`docker.service.ts:50-79`)

```typescript
Image: 'postgres:16-alpine',
HostConfig: {
  Memory: 512 * 1024 * 1024,           // 512 MB
  MemorySwap: 512 * 1024 * 1024,       // sin swap
  CpuQuota: 50000, CpuPeriod: 100000,  // 0.5 CPU
  NetworkMode: 'proyecto-back-bd2_sqljudge',  // misma red del worker
},
Healthcheck: {
  Test: ['CMD-SHELL', 'pg_isready -U eval_user -d eval_db'],
  Interval: 1s, Timeout: 0.5s, Retries: 5, StartPeriod: 2s,
},
```

### Cleanup garantizado

- `worker/src/main.ts:230-241`: en el `finally`, llama a `dockerService.destroyContainer(submissionId, force=true)`.
- Si el worker muere abruptamente: `cleanupAllContainers()` en SIGTERM/SIGINT (`worker/src/main.ts:270-289`).

### Socket Docker

- `docker-compose.yml`:
  - `volumes: - /var/run/docker.sock:/var/run/docker.sock:rw`
  - `user: root` (para acceder al socket)
  - `DOCKER_HOST: unix:///var/run/docker.sock`

### Cómo verificarlo

Durante una evaluación:

```bash
# En otra terminal mientras corre el smoke
docker ps --filter "name=sql-judge-eval-"
# Verás contenedores efímeros aparecer y desaparecer
```

Logs del worker muestran:
```
[DockerService] Creando contenedor PostgreSQL: sql-judge-eval-<uuid>
[DockerService] Imagen postgres:16 descargada
[DockerService] Contenedor iniciado: <id12>
...
[DockerService] Destruyendo contenedor: <id12>
[DockerService] Contenedor eliminado
```

---

## 6. Generador de datos aleatorios ✅

### Qué pide el enunciado
"Sistema para generar datos sintéticos a partir del schema, con relaciones FK y casos borde."

### Dónde vive

| Componente | Archivo | Líneas |
|------------|---------|--------|
| Servicio generador | `src/modules/test-data/application/data-generator.service.ts` | 1-300+ |
| DTO | `src/modules/test-data/application/dto/test-data.dto.ts` | |
| Controller | `src/modules/test-data/presentation/test-data.controller.ts` | `POST .../preview`, `POST .../generate`, `POST .../manual` |
| Módulo | `src/modules/test-data/test-data.module.ts` | |

### Features (`data-generator.service.ts`)

- L2: `import { faker } from '@faker-js/faker';`
- L33: `faker.seed(table.seed)` → semilla determinística por tabla.
- L204+: presets semánticos (`name`, `firstName`, `email`, `city`, etc.).
- Tipos soportados: `integer`, `decimal`, `varchar`, `enum`, `date`, `foreign_key`, `boolean`.
- L186: `fractionDigits: 2` para DECIMAL(10,2).
- Resolución de FKs: cada `foreign_key` referencia un valor existente en la tabla padre (respeta integridad referencial).
- Casos borde: `includeExtremes: true` agrega mín y máx a la primera fila.

### Endpoints

| Endpoint | Función |
|----------|---------|
| `POST /api/challenges/:id/test-data/preview` | Genera SQL sin persistir (debug) |
| `POST /api/challenges/:id/test-data/generate` | Genera y persiste como `TestDataset` con `kind: GENERATOR_CONFIG` |
| `POST /api/challenges/:id/test-data/manual` | El profesor sube INSERTs a mano |

### Cómo verificarlo

`requests/ruiz-flows.http` sección 3.6 / 3.7 — ejemplo completo con customers + orders + FKs.

---

## 7. Medición de tiempo de ejecución ✅

### Qué pide el enunciado
"Medir cuánto tarda la query del estudiante (en ms) y mostrarlo al final."

### Dónde vive

| Componente | Archivo | Líneas |
|------------|---------|--------|
| Medición real | `worker/src/docker/sql-executor.service.ts:165-181` | `Date.now()` antes y después del `client.query(query)` |
| Captura del plan | `worker/src/docker/sql-executor.service.ts:155-164` | `EXPLAIN (FORMAT JSON) <query>` sin ANALYZE |
| Timeout server-side | `worker/src/docker/sql-executor.service.ts:152` | `SET statement_timeout TO <timeout>` |
| Persistencia | `worker/src/main.ts:236` | `executionTimeMs: sqlResult.executionTimeMs` |
| Lectura | API: `Submission.executionTimeMs` (campo Int? en Prisma) |

### Importante

- El tiempo NO incluye DDL ni seed (eso son setup).
- El tiempo NO incluye el EXPLAIN (se ejecuta antes, sin ANALYZE, no cuenta).
- El `statement_timeout` del lado servidor garantiza que una query infinita se aborte.

### Cómo verificarlo

`GET /api/submissions/:id`:
```json
{
  "executionTimeMs": 234,
  "runnerMetadata": { "explainPlan": "[{...}]", ... },
  ...
}
```

---

## 8. Comparación contra resultado esperado ✅

### Qué pide el enunciado
"Comparar la salida de la query del estudiante contra un resultado de referencia cargado por el profesor."

### Dónde vive

| Componente | Archivo | Líneas |
|------------|---------|--------|
| Modelo Prisma | `prisma/schema.prisma` | `model ExpectedResult` (challengeId @unique, columns String[], rows Json, orderSensitive Bool, floatTolerance Float) |
| Migración | `prisma/migrations/20260526120000_submissions_full/migration.sql` | Crea tabla `expected_results` |
| Endpoint upsert | `src/modules/submissions/presentation/challenge-expected-result.controller.ts` | `PUT /challenges/:id/expected-result` (PROFESSOR) |
| Endpoint get | mismo archivo | `GET /challenges/:id/expected-result` (PROFESSOR) |
| Servicio | `src/modules/submissions/application/submissions.service.ts:upsertExpectedResult` | Valida shape, hace upsert |
| Comparador canónico | `src/shared/evaluator/result-comparator.ts` | `compareResults(expected, actual, options)` |
| Comparador worker | `worker/src/evaluation/result-comparator.ts` | Adaptado a formato `Array<Object>` |

### Reglas del comparador (`result-comparator.ts`)

1. **Mismo número de columnas** → si no, `COLUMN_COUNT_MISMATCH`.
2. **Mismo set de nombres** (case-insensitive por default) → si no, `COLUMN_NAME_MISMATCH`.
3. **Reordenamiento automático**: si el alumno devuelve columnas en otro orden pero las mismas, se reordenan antes de comparar.
4. **Mismo número de filas** → si no, `ROW_COUNT_MISMATCH`.
5. **Comparación de celdas**:
   - `NULL == NULL`, `NULL ≠ 0`, `NULL ≠ ''`.
   - Si ambos números y `floatTolerance > 0` → comparar con redondeo al múltiplo de tolerance más cercano.
6. **Orden**: si `orderSensitive: true`, exige mismo orden; si no, comparación como multiset.

### Cómo verificarlo

```http
PUT /api/challenges/{challengeId}/expected-result
Authorization: Bearer <profToken>

{
  "columns": ["name", "total"],
  "rows": [["Ana", 8], ["Beto", 6]],
  "orderSensitive": false,
  "floatTolerance": 0
}
```

Después, una submission contra ese reto que devuelva las mismas filas → `ACCEPTED`. Filas distintas → `WRONG_ANSWER` con `feedback` que indica la diferencia.

---

## 9. Asistente inteligente obligatorio ✅

### Qué pide el enunciado
"Módulo IA que genere recomendaciones de optimización SQL en lenguaje natural, basadas en la query enviada."

### Dónde vive

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| Módulo | `src/modules/ai-assistant/ai-assistant.module.ts` | Registra todo |
| Service principal | `src/modules/ai-assistant/application/ai-assistant.service.ts` | Orquesta rule engine + LLM + builder |
| Rule engine | `src/modules/ai-assistant/application/rule-engine.service.ts` | Aplica 7 reglas |
| Builder | `src/modules/ai-assistant/application/recommendation-builder.service.ts` | Ensambla salida final |
| Stub LLM | `src/modules/ai-assistant/infrastructure/stub-llm.client.ts` | Cliente LLM determinístico |
| Puerto LLM | `src/modules/ai-assistant/domain/llm-client.port.ts` | Interface para cambiar a OpenAI/Claude |
| Repositorio | `src/modules/ai-assistant/infrastructure/prisma-recommendation.repository.ts` | Persistencia |
| Controller público | `src/modules/ai-assistant/presentation/ai-assistant.controller.ts` | `POST /ai-assistant/analyze` (PROFESSOR/ADMIN) |
| Controller interno | `src/modules/ai-assistant/presentation/ai-assistant-internal.controller.ts` | `POST /ai-assistant/internal/analyze` (sin auth, para worker) |
| Modelo Prisma | `prisma/schema.prisma` | `model Recommendation` |
| Migración | `prisma/migrations/.../recommendations` | Tabla recommendations |
| Contratos | `src/shared/contracts/ai-assistant.contract.ts` | `AiAnalysisInput`, `AiAnalysisOutput`, `RuleWarning`, `AiQualityScore` |
| Doc | `docs/AI_ASSISTANT.md` | ADRs de diseño |

### Reglas SQL (7)

`src/modules/ai-assistant/application/rules/`:

| Archivo | Detecta |
|---------|---------|
| `select-star.rule.ts` | `SELECT *` (warning) |
| `function-in-where.rule.ts` | `WHERE UPPER(col) = ...` (warning) |
| `join-without-on.rule.ts` | JOIN sin condición ON (critical) |
| `missing-where.rule.ts` | SELECT sin WHERE en tablas grandes (warning) |
| `order-by-without-limit.rule.ts` | ORDER BY sin LIMIT (info) |
| `group-by-without-filter.rule.ts` | GROUP BY sin filtro previo (warning) |
| `slow-query.rule.ts` | Query > 50% del timeLimit (critical) |

### Integración con el worker

`worker/src/main.ts:180-202`:

```typescript
const resp = await fetch(`${apiUrl}/ai-assistant/internal/analyze`, {
  method: 'POST',
  body: JSON.stringify({
    query, schemaDdl, executionTimeMs, explainPlan,
    status: comparisonResult.isCorrect ? 'ACCEPTED' : 'WRONG_ANSWER',
  }),
});
const ai = await resp.json();
aiQualityScore = ai.qualityScore ?? null;
aiWarnings = ai.warnings ?? [];
```

Si el IA falla / no responde → graceful degradation (el worker sigue sin él, solo pierde sub-scores).

### Decisión `OPTIMIZATION_REQUIRED`

`worker/src/main.ts:223-230`:

```typescript
const hasCriticalWarning = aiWarnings.some((w) => w.severity === 'critical');
const finalStatus = comparisonResult.isCorrect
  ? hasCriticalWarning
    ? SubmissionStatus.OPTIMIZATION_REQUIRED  // ← correcto pero con problemas serios
    : SubmissionStatus.ACCEPTED
  : ...;
```

### Cómo verificarlo

```http
POST /api/ai-assistant/analyze
Authorization: Bearer <profToken>

{
  "query": "SELECT * FROM customers WHERE UPPER(name) = 'JUAN'",
  "schemaDdl": "CREATE TABLE customers (id SERIAL, name VARCHAR);",
  "executionTimeMs": 100,
  "status": "ACCEPTED"
}
```

Respuesta:
```json
{
  "explanation": "La consulta se ejecutó...",
  "warnings": [
    { "ruleId": "SELECT_STAR", "severity": "warning", "message": "..." },
    { "ruleId": "FUNCTION_IN_WHERE", "severity": "warning", "message": "..." }
  ],
  "suggestedIndexes": ["CREATE INDEX IF NOT EXISTS idx_customers_name_upper ON customers(UPPER(name));"],
  "rewriteSql": "SELECT id, name FROM customers WHERE name = 'JUAN'",
  "impact": "Aplicar las 2 sugerencia(s) puede mejorar...",
  "qualityScore": { "goodPractices": 6, "clarity": 2, "improvement": 5 }
}
```

---

## 10. Recomendaciones de optimización SQL ✅

### Qué pide el enunciado
"Las recomendaciones deben incluir: explicación en lenguaje natural, advertencias, índices sugeridos, reescritura cuando aplique."

### Estructura de la respuesta

`src/shared/contracts/ai-assistant.contract.ts` define `AiAnalysisOutput`:

```typescript
{
  explanation: string;               // 1-3 párrafos (StubLlmClient.explain)
  suggestedIndexes: string[];        // CREATE INDEX reales (ítem 11)
  rewriteSql: string | null;         // Query reescrita (ítem 12)
  warnings: RuleWarning[];           // {ruleId, severity, message}
  impact: string;                    // Resumen del impacto esperado
  qualityScore?: {                   // Sub-scores para el scorer
    goodPractices?: number;          // 0-10
    clarity?: number;                // 0-5
    improvement?: number;            // 0-10
  };
}
```

### Builder (`recommendation-builder.service.ts`)

| Método | Líneas | Función |
|--------|--------|---------|
| `build` | 28-41 | Ensambla el output completo |
| `suggestIndexes` | 59-87 | Índices DDL reales (ítem 11) |
| `legacyIndexHints` | 90-108 | Fallback si schema no parseable |
| `summarizeImpact` | 110-128 | Texto del impacto |
| `computeQualityScore` | 130-163 | Sub-scores que consume el scorer |

### Cómo se persiste

- `Submission.runnerMetadata` (JSON) guarda el output completo.
- `Submission.feedback` (texto) guarda un resumen humano.
- Modelo `Recommendation` (Prisma) guarda recomendaciones individuales (futuro: UI de detalle).

---

## 11. Sugerencia de índices ✅

### Qué pide el enunciado
"Sugerir `CREATE INDEX` reales basados en el schema y la query, no comentarios genéricos."

### Dónde vive

`src/modules/ai-assistant/application/recommendation-builder.service.ts:59-87` (`suggestIndexes`)

### Algoritmo (líneas 165+ del mismo archivo)

| Función | Líneas | Qué hace |
|---------|--------|----------|
| `parseSchemaTables` | 165-194 | Parsea `CREATE TABLE` y construye `tabla → Set<columnas>` |
| `extractIndexCandidates` | 200-235 | Busca columnas en WHERE / JOIN ON / ORDER BY |
| `collectAliases` | 237-253 | Resuelve aliases (`FROM customers c` → `c.* === customers.*`) |
| `forEachColumnRef` | 256-289 | Itera referencias `col` o `alias.col`, sanitiza literales string |
| `resolveTable` | 291-307 | Resuelve a qué tabla pertenece cada columna |
| `detectFunctionalIndex` | 310-322 | Para `UPPER(col)`, emite índice funcional |

### Output

Para `SELECT c.name FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status = $1`:

```sql
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_id ON customers(id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
```

Para `WHERE UPPER(name) = 'JUAN'` con `FUNCTION_IN_WHERE`:

```sql
CREATE INDEX IF NOT EXISTS idx_customers_name_upper ON customers(UPPER(name));
```

### Tests

`src/modules/ai-assistant/application/recommendation-builder.spec.ts`:
- "emite CREATE INDEX para columnas referenciadas en WHERE"
- "resuelve aliases en JOIN ON"
- "agrega índice funcional cuando hay FUNCTION_IN_WHERE"
- "cae al hint genérico si no hay schemaDdl"
- "no captura literales string como columnas"

---

## 12. Reescritura sugerida de consultas ✅

### Qué pide el enunciado
"Cuando aplique, sugerir una versión reescrita de la query."

### Dónde vive

`src/modules/ai-assistant/infrastructure/stub-llm.client.ts:proposeRewrite` (líneas 65-110)

### Tres reglas heurísticas

| # | Patrón detectado | Transformación |
|---|------------------|----------------|
| 1 | `<col> IN (SELECT <colSub> FROM <body>)` | `EXISTS (SELECT 1 FROM <body> WHERE <colSub> = <col>)` |
| 2 | `UPPER(col) = 'lit'` (con warning `FUNCTION_IN_WHERE`) | `col = 'lit'` (quita la función) |
| 3 | `SELECT *` (con warning `SELECT_STAR`) | `SELECT col1, col2, ... FROM ...` (enumera columnas del primer `CREATE TABLE`) |

Si ningún patrón coincide → `rewriteSql: null`.

### Tests

`src/modules/ai-assistant/infrastructure/stub-llm.client.spec.ts`:
- "reescribe IN (SELECT ...) como EXISTS (...)"
- "reescribe UPPER(col)= literal quitando la función"
- "reescribe SELECT * enumerando columnas del primer CREATE TABLE"
- "devuelve null si no hay patrón conocido"

### Para sustituir por LLM real

Reemplazar `StubLlmClient` por `OpenAiLlmClient` o `AnthropicLlmClient` en `ai-assistant.module.ts`:

```typescript
{ provide: LLM_CLIENT_PORT, useExisting: StubLlmClient }
// → useExisting: OpenAiLlmClient
```

El resto del sistema no cambia.

---

## 13. Evaluaciones o parciales ✅

### Qué pide el enunciado
"Profesor puede crear una evaluación (parcial) que agrupa varios retos, con ventana de tiempo y límite de intentos."

### Dónde vive

| Componente | Archivo |
|------------|---------|
| Módulo | `src/modules/evaluations/evaluations.module.ts` |
| Service | `src/modules/evaluations/application/evaluations.service.ts` (423 líneas) |
| Tests | `src/modules/evaluations/application/evaluations.service.spec.ts` (3 tests) |
| Controller | `src/modules/evaluations/presentation/evaluations.controller.ts` |
| DTO | `src/modules/evaluations/application/dto/evaluation.dto.ts` |
| Postman | `requests/sofia-evaluations.simple.postman_collection.json` |
| Migración | `prisma/migrations/20260526224500_evaluations_module/migration.sql` |

### Modelos Prisma

- `Evaluation`: `name`, `description`, `courseId`, `startDate`, `endDate`, `durationMinutes`, `maxAttempts`, `resultsVisibility`
- `EvaluationChallenge`: tabla intermedia con `position` (orden de los retos)
- `EvaluationAttempt`: `evaluationId`, `studentId`, `attemptNumber`, `startedAt`, `endsAt`, `submittedAt`
- `Submission.evaluationAttemptId` → relación con `EvaluationAttempt`

### Reglas implementadas

- L137-141 de `submissions.service.ts`: cuando se crea una submission dentro de una evaluation, se resuelve el `evaluationAttemptId` automáticamente.
- `evaluations.service.ts`: validaciones de ventana de tiempo, intentos máximos, visibilidad de resultados (`DURING_EVALUATION` / `AFTER_END` / `ALWAYS`).

### Endpoints

| Endpoint | Rol |
|----------|-----|
| `POST /api/evaluations` | PROFESSOR (crea evaluation en su curso) |
| `GET /api/evaluations` | STUDENT/PROFESSOR (lista) |
| `GET /api/evaluations/:id` | STUDENT/PROFESSOR (detalle) |
| `PATCH /api/evaluations/:id` | PROFESSOR (editar) |
| `DELETE /api/evaluations/:id` | PROFESSOR (eliminar) |
| `PATCH /api/evaluations/:id/challenges` | PROFESSOR (asocia retos) |
| `POST /api/evaluations/:id/start` | STUDENT (inicia un attempt) |
| `GET /api/evaluations/:id/state` | STUDENT (estado de su attempt) |

### Cómo verificarlo

Usar `requests/sofia-evaluations.simple.postman_collection.json` (importable a Postman).

---

## 14. Reportes por estudiante, reto y curso ✅

### Qué pide el enunciado
"Endpoints para que el profesor vea métricas agregadas por estudiante / reto / curso, y leaderboard."

### Dónde vive

| Componente | Archivo |
|------------|---------|
| Módulo | `src/modules/reports/reports.module.ts` |
| Service | `src/modules/reports/application/reports.service.ts` (262 líneas) |
| Controller | `src/modules/reports/presentation/reports.controller.ts` |
| DTOs | `src/modules/reports/application/dto/*.dto.ts` (4 archivos) |
| ADRs | `docs/adrs/ADR-014-reports-cache.md`, `ADR-015-leaderboard-aggregation.md` |
| Doc | `docs/REPORTS.md` |

### Endpoints

| Endpoint | Métricas |
|----------|----------|
| `GET /api/reports/students/:id` | Retos resueltos, total submissions, score promedio, mejor tiempo |
| `GET /api/reports/challenges/:id` | Tasa de éxito, mejor tiempo, dificultad real (1 - successRate) |
| `GET /api/reports/courses/:id` | Promedio del curso, top 5 estudiantes (con `fullName` real), retos más difíciles |
| `GET /api/reports/leaderboard?courseId=&evaluationId=` | Ranking agregado por estudiante con `fullName`, total score, retos resueltos, mejor tiempo |

### Detalles

- `reports.service.ts:getCourseReport` líneas 89-183: incluye `student: { select: { fullName: true } }` en el include de submissions → ahora muestra el nombre real del estudiante, no string vacío.
- `reports.service.ts:getLeaderboard` líneas 185-261: misma lógica para el leaderboard.

### Cómo verificarlo

```http
GET /api/reports/courses/{courseId}
Authorization: Bearer <profToken>
```

Respuesta:
```json
{
  "courseId": "...",
  "averageScore": 72.4,
  "topStudents": [
    { "studentId": "...", "fullName": "Ana Pérez", "averageScore": 95, "solvedChallenges": 3 },
    ...
  ],
  "hardestChallenges": [...]
}
```

---

## 15. README completo ✅

### Qué pide el enunciado
"README con instrucciones completas para que cualquier persona clone, levante y entienda el proyecto."

### Dónde vive

`README.md` (380 líneas, 16 secciones):

1. Visión general + stack
2. Requisitos
3. Puesta en marcha rápida
4. Visión global del flujo end-to-end (diagrama ASCII)
5. Módulos (tabla con responsable y descripción)
6. Endpoints principales
7. Evaluador SQL (comparador + scoring)
8. Worker SQL (9 fases) + DLQ
9. Asistente IA (rule engine + LLM stub)
10. Evaluaciones (parciales)
11. Estructura del repo (árbol)
12. Comandos útiles
13. Tests
14. Smoke test end-to-end
15. Documentación adicional (links)
16. Decisiones arquitectónicas (ADR-condensado)

Más sección 16: equipo y responsabilidades.

---

## 16. Video demostrativo ❌ (Dayana)

### Qué pide el enunciado
"Video de 8-12 minutos mostrando el flujo end-to-end."

### Guion sugerido (basado en el smoke test)

1. **0:00-1:00** — Levantamiento del stack: `docker compose up -d`, mostrar `docker compose ps` con 4 servicios `healthy`.
2. **1:00-2:00** — Login admin en Swagger, crear profesor y estudiante.
3. **2:00-3:00** — Login profesor, ejecutar `POST /demo/customers-orders` para crear escenario.
4. **3:00-4:00** — Inscribir estudiante, cargar `expected-result`.
5. **4:00-5:30** — Login estudiante, enviar submission, mostrar 9 fases del worker en logs en vivo.
6. **5:30-7:00** — Polling, ver el resultado con `score`, `feedback`, `runnerMetadata.breakdown`.
7. **7:00-8:30** — Mostrar caso de error: `expect:WRONG`, `expect:TIMEOUT`, `expect:SYNTAX`.
8. **8:30-10:00** — Reportes: `GET /api/reports/courses/:id`, leaderboard.
9. **10:00-12:00** — Asistente IA: `POST /api/ai-assistant/analyze` con `SELECT * FROM customers WHERE UPPER(name) = 'X'`, mostrar `suggestedIndexes`, `rewriteSql`.

### Herramientas para grabar

- **Windows**: ScreenToGif, OBS Studio.
- **Editor**: DaVinci Resolve (free) o cualquier capturador.

### Material disponible para apoyar el guion

- `scripts/smoke-submissions.ps1` — ejecuta el flujo automáticamente, útil para grabar logs.
- `requests/ruiz-submissions.http` — colección REST Client con todos los casos.
- `requests/sofia-evaluations.simple.postman_collection.json` — para sección de evaluations.

---

## 17. Evidencia de ejecución con Docker Compose ❌ (Dayana)

### Qué pide el enunciado
"Capturas, logs o evidencia de que el sistema corre end-to-end con docker compose."

### Material existente que sirve como evidencia (sin grabar nada)

- `docker-compose.yml` configurado completo:
  - 4 servicios con `restart: unless-stopped`
  - `healthcheck` en `postgres` y `redis`
  - `mem_limit` y `cpus` en api/worker/postgres/redis
  - Worker monta socket Docker para crear runner temporal
  - `RUNNER_NETWORK` configurada
- `Dockerfile` multi-stage (deps → build → runtime)
- `docs/RUNNER.md` con troubleshooting

### Capturas/GIFs a producir (sugerencia)

1. `docker compose ps` con los 4 servicios `healthy`.
2. `docker compose logs -f worker` durante una submission — mostrar las 9 fases.
3. Durante el procesamiento: `docker ps` mostrando el contenedor temporal `sql-judge-eval-<uuid>` recién creado.
4. Después del procesamiento: `docker ps -a` mostrando que el contenedor temporal fue destruido (cleanup OK).
5. `curl http://localhost:3000/api/health` con respuesta verde.

Guardar en una carpeta `evidencia/` LOCAL (no commitearla — los GIFs son pesados) y pasársela a Dayana para el PDF final.

---

## Apéndice A: Tests del proyecto (52 totales)

| Suite | Archivo | Tests |
|-------|---------|-------|
| Comparator | `src/shared/evaluator/result-comparator.spec.ts` | 18 |
| Scorer | `src/shared/evaluator/score-calculator.spec.ts` | 7 |
| Transitions | `src/modules/submissions/application/submissions.transitions.spec.ts` | 15 |
| Evaluations | `src/modules/evaluations/application/evaluations.service.spec.ts` | 3 |
| Recommendation Builder | `src/modules/ai-assistant/application/recommendation-builder.spec.ts` | 5 |
| Stub LLM Client | `src/modules/ai-assistant/infrastructure/stub-llm.client.spec.ts` | 4 |

Correr todos:
```bash
npm test
```

---

## Apéndice B: Migraciones Prisma

| Migración | Contenido |
|-----------|-----------|
| `20260508121912_init` | Modelos iniciales (Entrega 1): Users, Courses, Challenges, Schemas, TestDatasets, Submissions, Enrollments |
| `20260526000000_add_expected_result_and_score_breakdown` | Columnas `scoreBreakdown` y `resultData` en `submissions` |
| `20260526120000_submissions_full` | Columnas `engineVersion`, `runnerMetadata`, `feedback` en `submissions` + tabla `expected_results` |
| `20260526224500_evaluations_module` | Tablas `evaluations`, `evaluation_challenges`, `evaluation_attempts` + columna `evaluationAttemptId` en `submissions` |
| `<recommendations>` | Tabla `recommendations` (Pardo) |

Aplicación automática: el comando del API en compose hace `npx prisma migrate deploy && node dist/main.js`.

---

## Apéndice C: Documentación complementaria del repo

| Archivo | Contenido |
|---------|-----------|
| `docs/ARCHITECTURE.md` | Diagramas (deploy, dominio, secuencia) + ADRs |
| `docs/CONVENTIONS.md` | Convenciones de código |
| `docs/CONTRACTS.md` | Contratos entre módulos (payload del job, RunnerResult, AI IO) |
| `docs/AI_ASSISTANT.md` | Diseño del asistente IA |
| `docs/RUNNER.md` | Despliegue del runner Docker, troubleshooting, limpieza |
| `docs/REPORTS.md` | Métricas de reports |
| `docs/adrs/ADR-014-reports-cache.md` | Cache de reports |
| `docs/adrs/ADR-015-leaderboard-aggregation.md` | Estrategia de leaderboard |
| `docs/adrs/ADR-016-delivery-demo.md` | Plan de demo |

---

## Apéndice D: Cheat sheet para el día de la sustentación

```bash
# 1. Levantar el stack
docker compose up -d

# 2. Esperar a que los 4 servicios estén healthy (postgres + redis primero)
docker compose ps

# 3. Si volumen nuevo: crear admin
$env:DATABASE_URL="postgresql://sqljudge:sqljudge_dev_password@localhost:5432/sqljudge?schema=public"
npm run prisma:seed

# 4. Abrir Swagger
start http://localhost:3000/docs

# 5. (Opcional) Smoke test automatizado en background mientras se habla
.\scripts\smoke-submissions.ps1

# 6. Logs del worker en una terminal aparte (mostrar las 9 fases en vivo)
docker compose logs -f worker

# 7. Limpieza al final
docker compose down
```

Credenciales del admin de seed: `admin@sqljudge.local` / `Admin123!`.

---

## Apéndice E: Comparativa antes / después del Entregable 2

| Aspecto | Entregable 1 | Entregable 2 (final) |
|---------|--------------|----------------------|
| Submission worker | Stub que siempre da ACCEPTED | Runner Docker real con 9 fases |
| Evaluador | No existía | Comparator + scorer + 52 tests |
| Resultado esperado | No existía | Modelo `ExpectedResult` + endpoints |
| IA assistant | No existía | Módulo completo con 7 reglas + LLM stub + 4 outputs |
| Recomendaciones de índices | No existía | DDL ejecutable parseando schema |
| Reescritura SQL | No existía | 3 reglas heurísticas |
| Evaluaciones (parciales) | No existía | Módulo con ventana + intentos + visibilidad |
| Reports | No existía | 4 endpoints + leaderboard |
| Estados de Submission | QUEUED, RUNNING, ACCEPTED | + WRONG_ANSWER, SYNTAX_ERROR, TIME_LIMIT_EXCEEDED, RUNTIME_ERROR, OPTIMIZATION_REQUIRED |
| Score | 0 o 100 fijos | Breakdown 60/15/10/5/10 real |
| Tests | 0 | 52 |
| Endpoints HTTP | ~20 | 50+ |
| Tablas Prisma | 7 | 12 (+ ExpectedResult, Evaluation, EvaluationChallenge, EvaluationAttempt, Recommendation) |
| Documentación | 2 docs | 9 docs + 3 ADRs + README 380 líneas |

---

**Fecha de generación**: 27 mayo 2026
**Estado del main**: commit `06c1a9b` — 15/17 ítems cumplidos (88%). Pendientes solo el video y las capturas (Dayana).
