# Contratos compartidos — Entrega 2

> **Responsable de cerrar contratos:** Pardo (cableado API ↔ BullMQ ↔ Worker).
> **Documenta:** Ruiz (módulo Submissions / comparador / scoring).
>
> Este archivo es la fuente de verdad de los contratos descritos en la
> sección 5 del `Plan_Entregable2_SQLJudge.docx`. Si alguien modifica
> alguno de estos shapes, debe abrir PR a este archivo Y avisar al
> equipo en la daily — porque por el otro lado del contrato hay
> tres módulos esperando esa forma.

---

## 1. Payload del job en la cola `submissions`

La API (módulo Submissions) publica un único campo y el worker carga el
resto desde Postgres usando `submissionId`. Esto mantiene los jobs
pequeños y idempotentes — si la base se actualiza después de encolar,
el worker siempre ve la versión más fresca.

```ts
// src/modules/submissions/application/submissions.service.ts
await queue.add('evaluate', { submissionId: submission.id }, { ... });
```

```jsonc
// payload literal en Redis
{ "submissionId": "uuid" }
```

Configuración de BullMQ usada hoy (puede cambiar si Pardo lo decide):
- `attempts`: 3
- `backoff`: exponential, delay 2000 ms
- `removeOnComplete`: 100 jobs
- `removeOnFail`: 50 jobs

---

## 2. Resultado del Runner SQL

El Worker invoca al DockerRunnerService (Jose) por cada submission y
recibe este shape. **El stub actual del worker** (en `worker/src/main.ts`)
emula este contrato para que el flujo end-to-end funcione antes del
runner real.

```ts
interface RunnerResult {
  status: 'OK' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | 'TIMEOUT';
  executionTimeMs: number;
  rows: Array<Array<string | number | boolean | null>>;
  columns: string[];
  errorMessage: string | null;
  explainPlan: string | null;
}
```

Mapeo a `SubmissionStatus` (la lógica vive en `worker/src/main.ts:deriveStatus`):

| `RunnerResult.status` | Comparator verdict | `SubmissionStatus` final |
|-----------------------|--------------------|--------------------------|
| `OK`                  | `ok: true`         | `ACCEPTED`               |
| `OK`                  | `ok: false`        | `WRONG_ANSWER`           |
| `TIMEOUT`             | n/a                | `TIME_LIMIT_EXCEEDED`    |
| `SYNTAX_ERROR`        | n/a                | `SYNTAX_ERROR`           |
| `RUNTIME_ERROR`       | n/a                | `RUNTIME_ERROR`          |

`OPTIMIZATION_REQUIRED` lo activa el asistente IA cuando la query es
correcta (`ACCEPTED`) pero el motor de reglas detecta una mejora
significativa. Por ahora no se emite.

---

## 3. Input / Output del Asistente IA

Pardo entrega este contrato. El Worker lo invoca después de comparar y
antes de calcular el score, para nutrir las dimensiones de calidad.

```ts
// Input
interface AiAnalysisInput {
  query: string;
  schemaDdl: string;
  executionTimeMs: number;
  explainPlan: string | null;
  status: SubmissionStatus;
}

// Output
interface AiAnalysisOutput {
  explanation: string;            // texto en lenguaje natural
  suggestedIndexes: string[];     // CREATE INDEX recomendados
  rewriteSql: string | null;      // reescritura sugerida (o null)
  warnings: string[];             // malas prácticas detectadas
  impact: string;                 // texto resumen del impacto
  // sub-scores que consume el calculador de score (0-10, 0-5, 0-10)
  qualityScore?: {
    goodPractices?: number;
    clarity?: number;
    improvement?: number;
  };
}
```

`AiAnalysisOutput.qualityScore` se pasa directo a `calculateScore` de
`src/shared/evaluator/score-calculator.ts`. Si Pardo aún no lo
implementa, el worker pasa `aiQualityScore: null` y el score máximo
queda en 75 (60 correctness + 15 performance).

---

## 4. Resultado esperado (ExpectedResult)

Modelo Prisma propio del módulo Submissions. Lo carga el profesor con
`PUT /challenges/:challengeId/expected-result`. El comparador
(`src/shared/evaluator/result-comparator.ts`) lo consume para decidir
ACCEPTED vs WRONG_ANSWER.

```prisma
model ExpectedResult {
  id              String   @id @default(uuid())
  challengeId     String   @unique
  columns         String[]
  rows            Json
  orderSensitive  Boolean  @default(false)
  floatTolerance  Float    @default(0)
  ...
}
```

Reglas de comparación (resumen — la lógica completa está en el JSDoc
del comparator):
- Nombres de columna se normalizan con `trim().toLowerCase()` salvo que
  se pase `caseSensitiveColumns: true`.
- Si el set de columnas coincide pero el orden no, el comparator
  reordena las filas del actual antes de comparar. No es error.
- `null` es un valor independiente: `null == null`, `null != 0`,
  `null != ''`.
- Si `floatTolerance > 0`, los números se redondean al múltiplo de la
  tolerancia más cercano antes de generar la clave de comparación.
- Si `orderSensitive = false`, las filas se comparan como multiset
  (respeta multiplicidades, ignora orden).

---

## 5. Reglas de transición de Submission

Centralizadas en `src/modules/submissions/application/submissions.service.ts`
y reexpuestas como `assertValidTransition(from, to)` para que el worker
las use al persistir cambios de estado.

```
   QUEUED ──► RUNNING ──► ACCEPTED
                       ├─► WRONG_ANSWER
                       ├─► SYNTAX_ERROR
                       ├─► TIME_LIMIT_EXCEEDED
                       ├─► RUNTIME_ERROR
                       └─► OPTIMIZATION_REQUIRED
```

Todos los estados terminales son finales — no se puede salir de
ACCEPTED ni de WRONG_ANSWER. Un reintento se modela como una **nueva**
Submission, no como una reevaluación.

---

## 6. Rúbrica de scoring

Implementada en `src/shared/evaluator/score-calculator.ts`. El total es
entero 0-100, compuesto de:

| Dimensión       | Peso | Fuente                                           |
|-----------------|------|--------------------------------------------------|
| Correctness     | 60   | Comparator: ACCEPTED → 60, cualquier otro → 0   |
| Performance     | 15   | Tiempo del Runner vs `Challenge.timeLimit`       |
| Buenas prácticas| 10   | `AiAnalysisOutput.qualityScore.goodPractices`   |
| Claridad        |  5   | `AiAnalysisOutput.qualityScore.clarity`         |
| Mejora propuesta| 10   | `AiAnalysisOutput.qualityScore.improvement`     |

Performance:
- `executionTimeMs ≤ 25% del timeLimit` → 15 puntos
- `executionTimeMs ≥ timeLimit` → 0 puntos
- Rango intermedio → interpolación lineal

Mientras Pardo no entregue IA, las tres últimas dimensiones aportan 0
y el score máximo es 75. Cuando entregue, sin tocar el worker basta
con poblar `aiQualityScore`.

---

## 7. Quién toca qué (cheat sheet para PR review)

| Si cambia...                                      | Avisa a...    | Por qué                                       |
|---------------------------------------------------|---------------|-----------------------------------------------|
| El payload del job en `submissions`               | Pardo + Jose  | Worker / API se quedan sin contrato común     |
| El shape de `RunnerResult`                        | Jose + Ruiz   | Comparator y deriveStatus dejan de cuadrar    |
| El comparator (criterios, tolerancia, etc.)       | Ruiz + Pardo  | El feedback del IA puede traducir mal el verdict |
| `SubmissionStatus` o las transiciones             | Todos         | Reportes, leaderboard y evaluations dependen  |
| La rúbrica de scoring                             | Ruiz + Dayana | Reportes y leaderboard usan `score` directo   |
| El modelo `ExpectedResult`                        | Ruiz + Sofia  | Las evaluations dependen del flujo de envío   |
