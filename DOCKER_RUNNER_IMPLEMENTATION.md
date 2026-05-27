# Docker Runner Implementation - SQL Judge

## Estado

Implementacion final del runner SQL usando contenedores PostgreSQL temporales. El runner es operado por el worker independiente en `worker/src` y se integra con Redis/BullMQ, Prisma, comparador, scoring y AI Assistant.

## Componentes

```text
worker/src/
├── main.ts
├── docker/
│   ├── docker.service.ts
│   ├── postgres-health.service.ts
│   ├── sql-executor.service.ts
│   └── types.ts
├── evaluation/
│   ├── result-comparator.ts
│   └── score-calculator.ts
├── contracts/
└── utils/
```

## Flujo de evaluacion

```text
QUEUED
  -> RUNNING
  -> crear contenedor PostgreSQL temporal
  -> aplicar schema
  -> cargar test dataset
  -> ejecutar query del estudiante
  -> comparar contra ExpectedResult
  -> calcular score
  -> invocar AI Assistant
  -> persistir resultado
  -> destruir contenedor
  -> estado terminal
```

Estados terminales:

- `ACCEPTED`
- `WRONG_ANSWER`
- `SYNTAX_ERROR`
- `TIME_LIMIT_EXCEEDED`
- `RUNTIME_ERROR`
- `OPTIMIZATION_REQUIRED`

## Seguridad

- El SQL de estudiantes no se ejecuta en la base principal.
- El runner usa un contenedor temporal por submission.
- Se aplican limites de memoria, CPU y tiempo.
- El contenedor se destruye al finalizar.
- La API solo encola trabajos; no ejecuta SQL de estudiantes.

## Contrato del runner

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

## Operacion

Levantar:

```bash
docker compose up -d --build
```

Logs:

```bash
docker compose logs -f worker
```

Limpiar contenedores huerfanos:

```bash
docker ps -a --filter "name=sql-judge-eval-"
docker rm -f $(docker ps -a --filter "name=sql-judge-eval-" -q)
```

## Relacion con AI Assistant

Despues de comparar resultados y antes de persistir el estado final, el worker invoca:

```http
POST /api/ai-assistant/internal/analyze
```

El asistente genera recomendaciones, sugerencias de indices, reescritura opcional y sub-scores de calidad. Si detecta una alerta critica sobre una query correcta, el estado final puede ser `OPTIMIZATION_REQUIRED`.
