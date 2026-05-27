# Contratos compartidos - SQL Judge

Este documento resume los contratos de la implementacion final entre API, Redis/BullMQ, worker, runner SQL, AI Assistant, comparador, scoring y reportes.

---

## 1. Job BullMQ de submissions

La API crea la submission y encola un job minimo. El worker carga el contexto completo desde PostgreSQL usando `submissionId`.

```json
{
  "submissionId": "uuid"
}
```

Configuracion usada por la API:

| Opcion | Valor |
|--------|-------|
| `attempts` | `3` |
| `backoff` | exponencial, `delay=2000` |
| `removeOnComplete` | `100` |
| `removeOnFail` | `50` |

Cola principal:

```ts
export const SUBMISSIONS_QUEUE = 'submissions';
```

Cola de fallos administrativos:

```ts
export const FAILED_SUBMISSIONS_QUEUE_NAME = 'failed-submissions';
```

---

## 2. Contexto de evaluacion del worker

Antes de ejecutar el runner, el worker carga:

- Submission.
- Student.
- Challenge.
- `SchemaScript`.
- Primer `TestDataset` del reto.
- `ExpectedResult`.
- `timeLimit`.
- `databaseEngine`.

El worker falla con `RUNTIME_ERROR` si el reto no tiene schema, dataset o datos suficientes para preparar el runner.

---

## 3. Resultado del Runner SQL

Contrato usado por `worker/src/docker/sql-executor.service.ts`:

```ts
interface SqlExecutionResult {
  success: boolean;
  rows: any[];
  rowCount: number;
  columns: string[];
  executionTimeMs: number;
  error?: string;
  explainPlan?: string | null;
}
```

Mapeo a `SubmissionStatus`:

| Runner | Comparador | Status final |
|--------|------------|--------------|
| `success=true` | correcto y sin alerta critica | `ACCEPTED` |
| `success=true` | correcto con alerta critica IA | `OPTIMIZATION_REQUIRED` |
| `success=true` | incorrecto | `WRONG_ANSWER` |
| `TIME_LIMIT_EXCEEDED` | n/a | `TIME_LIMIT_EXCEEDED` |
| `SYNTAX_ERROR` | n/a | `SYNTAX_ERROR` |
| otro error | n/a | `RUNTIME_ERROR` |

---

## 4. ExpectedResult

`ExpectedResult` es entidad propia para comparacion deterministica.

```prisma
model ExpectedResult {
  id             String
  challengeId    String
  columns        String[]
  rows           Json
  orderSensitive Boolean
  floatTolerance Float
}
```

Reglas:

- `columns` define nombres y orden esperado.
- `rows` contiene filas alineadas con `columns`.
- Si `orderSensitive=false`, las filas se comparan como multiset.
- `floatTolerance` permite tolerancia absoluta para decimales.
- `null` se compara como valor independiente.
- Los nombres de columnas se normalizan antes de comparar.

---

## 5. AI Assistant

Entrada:

```ts
interface AiAnalysisInput {
  query: string;
  schemaDdl: string;
  executionTimeMs: number;
  explainPlan: string | null;
  status: SubmissionStatus;
}
```

Salida:

```ts
interface AiAnalysisOutput {
  explanation: string;
  suggestedIndexes: string[];
  rewriteSql: string | null;
  warnings: RuleWarning[];
  impact: string;
  qualityScore?: AiQualityScore;
}
```

La invocacion de produccion la realiza el worker:

```http
POST /api/ai-assistant/internal/analyze
```

Payload interno:

```json
{
  "submissionId": "uuid",
  "query": "SELECT ...",
  "schemaDdl": "CREATE TABLE ...",
  "executionTimeMs": 120,
  "explainPlan": null,
  "status": "ACCEPTED"
}
```

Respuesta interna:

```json
{
  "explanation": "...",
  "suggestedIndexes": [],
  "rewriteSql": null,
  "warnings": [],
  "impact": "...",
  "qualityScore": {
    "goodPractices": 10,
    "clarity": 5,
    "improvement": 10
  },
  "recommendationId": "uuid",
  "shouldRequireOptimization": false
}
```

---

## 6. Transiciones de Submission

```text
QUEUED -> RUNNING -> ACCEPTED
                  -> WRONG_ANSWER
                  -> SYNTAX_ERROR
                  -> TIME_LIMIT_EXCEEDED
                  -> RUNTIME_ERROR
                  -> OPTIMIZATION_REQUIRED
```

Los estados terminales no vuelven a transicionar. Un nuevo intento se modela como una nueva submission.

---

## 7. Rubrica de scoring

| Dimension | Peso | Fuente |
|-----------|------|--------|
| Resultado correcto | 60 | Comparador contra `ExpectedResult`. |
| Tiempo de ejecucion | 15 | `executionTimeMs` contra `Challenge.timeLimit`. |
| Buenas practicas SQL | 10 | `AiAnalysisOutput.qualityScore.goodPractices`. |
| Claridad | 5 | `AiAnalysisOutput.qualityScore.clarity`. |
| Mejora propuesta | 10 | `AiAnalysisOutput.qualityScore.improvement`. |

Total: 100 puntos.

---

## 8. Reportes y cache

Los reportes leen submissions persistidas y cachean resultados en Redis durante 60 segundos.

Contratos de lectura:

```http
GET /api/reports/students/:id
GET /api/reports/challenges/:id
GET /api/reports/courses/:id
GET /api/reports/leaderboard?courseId=&evaluationId=
```

El leaderboard ordena estudiantes por `totalScore` descendente y puede filtrarse por curso o evaluacion.

---

## 9. Seguridad minima del contrato SQL

- API nunca ejecuta SQL de estudiantes.
- Worker nunca usa la base principal como ambiente de evaluacion.
- Runner ejecuta en contenedor temporal.
- Solo se permiten consultas `SELECT` o `WITH ... SELECT`.
- DDL/DML y operaciones administrativas se bloquean.
- El resultado esperado se compara en memoria, no ejecutando SQL en la base principal.
