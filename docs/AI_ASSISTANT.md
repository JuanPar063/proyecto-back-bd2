# Asistente IA — SQL Judge

> **Owner:** Pardo Anzola, Juan (Entrega 2).
> Documento vivo. Si cambias el contrato 5.3 o la composición del módulo,
> actualízalo en este archivo antes de mergear a `dev`.

---

## 1. Decisión arquitectónica

Enfoque elegido: **híbrido reglas + LLM** (alineado con ADR-010 en
`docs/ARCHITECTURE.md`).

| Pieza                          | Qué resuelve                                       | Por qué así                                                  |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| `RuleEngineService`            | Detección barata y determinística de anti-patrones | Sin red, sin dependencias externas, fácil de testear         |
| `StubLlmClient`                | Texto coherente en lenguaje natural sin proveedor  | Permite cerrar el pipeline antes de elegir OpenAI/Anthropic  |
| `RecommendationBuilderService` | Ensambla la salida final tipada                    | Única pieza que conoce la forma del `AiAssistantOutput`      |
| `AiAssistantService`           | Orquesta los tres anteriores                       | Cumple `AiAssistantPort`, lo que consume el worker (Jose)    |

Cuando se cablee un proveedor real basta con sustituir el provider de
`LLM_CLIENT_PORT` en `ai-assistant.module.ts`. El resto del sistema no cambia.

## 2. Estructura del módulo

```
src/modules/ai-assistant/
├── domain/
│   ├── ai-assistant.port.ts                  # Puerto consumido por el worker
│   ├── llm-client.port.ts                    # Puerto para el cliente LLM
│   ├── recommendation.entity.ts              # Entidad del dominio
│   └── recommendation.repository.ts          # Puerto de persistencia
├── application/
│   ├── ai-assistant.service.ts               # Orquestador (implementa el puerto)
│   ├── rule-engine.service.ts                # Corre todas las reglas
│   ├── recommendation-builder.service.ts
│   ├── dto/analyze.dto.ts                    # DTO del endpoint interno
│   ├── use-cases/
│   │   └── analyze-and-persist.use-case.ts   # Lo que el worker invoca
│   └── rules/
│       ├── sql-rule.interface.ts
│       ├── select-star.rule.ts
│       ├── missing-where.rule.ts
│       ├── function-in-where.rule.ts
│       ├── order-by-without-limit.rule.ts
│       ├── join-without-on.rule.ts
│       ├── group-by-without-filter.rule.ts
│       ├── slow-query.rule.ts
│       └── index.ts                          # DEFAULT_RULES (array)
├── infrastructure/
│   ├── stub-llm.client.ts                    # Implementación temporal del LLM
│   └── prisma-recommendation.repository.ts   # Adapter Prisma
├── presentation/
│   └── ai-assistant.controller.ts            # POST /ai-assistant/analyze (debug)
└── ai-assistant.module.ts
```

## 3. Contrato 5.3 — Input/Output

El contrato vive en `src/shared/contracts/ai-assistant.contract.ts` y se
espeja en `worker/src/contracts/ai-assistant.contract.ts`. Si lo cambias,
cambia los dos archivos.

```ts
interface AiAssistantInput {
  query: string;
  schemaDdl: string;
  executionTimeMs: number;
  explainPlan: string | null;
  status: 'OK' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | 'TIMEOUT';
}

interface AiAssistantOutput {
  explanation: string;
  suggestedIndexes: string[];
  rewriteSql: string | null;
  warnings: RuleWarning[];
  impact: string;
}

interface RuleWarning {
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}
```

## 4. Reglas implementadas (Sprint 1)

| `ruleId`                   | Severidad   | Disparador                                                           |
| -------------------------- | ----------- | -------------------------------------------------------------------- |
| `SELECT_STAR`              | `warning`   | La query incluye `SELECT *`                                          |
| `MISSING_WHERE`            | `warning`   | `SELECT` sobre tabla real sin WHERE ni LIMIT                         |
| `FUNCTION_IN_WHERE`        | `warning`   | Función envolviendo columna dentro del WHERE                         |
| `ORDER_BY_WITHOUT_LIMIT`   | `info`      | `ORDER BY` sin `LIMIT`                                               |
| `JOIN_WITHOUT_ON`          | `warning` / `critical` | Join implícito (`FROM a, b`) o `CROSS JOIN` explícito     |
| `GROUP_BY_WITHOUT_FILTER`  | `warning`   | `GROUP BY` sin `WHERE`, `HAVING` ni `LIMIT`                          |
| `SLOW_QUERY`               | `critical`  | `executionTimeMs > AI_SLOW_QUERY_THRESHOLD_MS`                       |

Para agregar una regla:

1. Crear `application/rules/<nombre>.rule.ts` que implemente `SqlRule`.
2. Incluirla en `DEFAULT_RULES` en `application/rules/index.ts`.
3. Documentarla en esta tabla.

Las reglas no hacen IO. Si necesitas información del esquema (tablas,
columnas, FKs), aprovecha `schemaDdl` en el `SqlRuleContext` y parsea con
`node-sql-parser` o el `parsedTables` que Ruiz mantiene en `SchemaScript`.

## 5. Variables de entorno

| Variable                     | Default | Notas                                              |
| ---------------------------- | ------- | -------------------------------------------------- |
| `LLM_PROVIDER`               | `stub`  | `stub`, `openai`, `anthropic`, `ollama`            |
| `LLM_API_KEY`                | —       | Requerido cuando `LLM_PROVIDER !== stub`           |
| `LLM_MODEL`                  | —       | Nombre del modelo del proveedor                    |
| `LLM_BASE_URL`               | —       | Endpoint custom (Ollama, proxies)                  |
| `AI_SLOW_QUERY_THRESHOLD_MS` | `800`   | Umbral para `SLOW_QUERY`                           |

Todas validadas en `src/shared/infrastructure/config/env.validation.ts`.

## 6. Cómo probarlo (sin runner real)

El controller `POST /api/v1/ai-assistant/analyze` permite enviar un input
sintético y obtener la recomendación. Solo PROFESSOR o ADMIN.

```http
POST /api/v1/ai-assistant/analyze
Authorization: Bearer <token de profesor>
Content-Type: application/json

{
  "query": "SELECT * FROM orders WHERE UPPER(status) = 'PAID'",
  "schemaDdl": "CREATE TABLE orders (id INT, status VARCHAR(20));",
  "executionTimeMs": 1200,
  "status": "OK"
}
```

Respuesta esperada (resumen):

```json
{
  "explanation": "La consulta se ejecutó correctamente en 1200 ms. ...",
  "suggestedIndexes": ["-- Considera un índice funcional ..."],
  "rewriteSql": null,
  "warnings": [
    { "ruleId": "SELECT_STAR", "severity": "warning", "message": "..." },
    { "ruleId": "FUNCTION_IN_WHERE", "severity": "warning", "message": "..." },
    { "ruleId": "SLOW_QUERY", "severity": "critical", "message": "..." }
  ],
  "impact": "Hay 1 alerta(s) crítica(s): atender estos puntos suele reducir el tiempo de ejecución de forma notable."
}
```

## 7. Persistencia

Se eligió **tabla separada `Recommendation`** (no campo JSON en `Submission`)
para:

1. Evitar conflictos de merge con la migración de Ruiz que extiende `Submission`.
2. Permitir historial: múltiples corridas del asistente sobre la misma
   submission quedan registradas.

Modelo (`prisma/schema.prisma`):

```prisma
model Recommendation {
  id               String       @id @default(uuid())
  submissionId     String
  explanation      String       @db.Text
  suggestedIndexes String[]
  rewriteSql       String?      @db.Text
  warnings         Json
  impact           String       @db.Text
  highestSeverity  RuleSeverity @default(info)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  submission       Submission   @relation(fields: [submissionId], references: [id], onDelete: Cascade)
}
```

Para aplicar:

```bash
npx prisma generate
npx prisma migrate dev --name add_recommendations
```

El puerto `RecommendationRepository` vive en `domain/` y se implementa en
`infrastructure/prisma-recommendation.repository.ts`.

## 8. Integración con el worker (pendiente con Jose)

El worker (`worker/src/main.ts`) hoy está en stub. Cuando Jose lo lleve a
producción, su flujo final es:

```ts
// dentro del worker, tras evaluar la submission:
const result = await this.useCase.execute(submissionId, aiInput);

if (result.shouldRequireOptimization) {
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: 'OPTIMIZATION_REQUIRED' },
  });
}
```

Donde `useCase` es `AnalyzeAndPersistUseCase`. Genera la recomendación,
la guarda en `recommendations` y devuelve si el estado debe ser
`OPTIMIZATION_REQUIRED` (regla actual: query OK + al menos un warning
`critical` del rule engine, típicamente `SLOW_QUERY` o `CROSS_JOIN`).

La decisión final (HTTP interno vs proceso compartido) se toma con Jose
en la daily. Ambas son aceptables y el contrato 5.3 no cambia.

## 9. Dead-letter queue

Cuando un job de "submissions" agota sus 3 reintentos con backoff
exponencial, el worker lo empuja a la cola `failed-submissions`. Esa cola
NO la consume nadie automáticamente: queda para inspección humana vía los
endpoints admin:

- `GET /api/v1/admin/submissions/failed` — listar
- `POST /api/v1/admin/submissions/failed/:jobId/retry` — reencolar a "submissions"
- `DELETE /api/v1/admin/submissions/failed/:jobId` — descartar

Solo ADMIN. La clase `FailedSubmissionsProducer` encapsula la lógica.

## 10. Pendientes conocidos

- Cliente LLM real (OpenAI / Anthropic / Ollama). Sprint 2.
- Integración worker → `AnalyzeAndPersistUseCase` (compartida con Jose).
- Más reglas: `JOIN_WITHOUT_INDEX` real (requiere parsear DDL del reto),
  `LIKE_LEADING_WILDCARD`, `DISTINCT_INSTEAD_OF_GROUP_BY`.
