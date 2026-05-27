# Runner SQL en Docker — Guía de despliegue

> **Responsable:** Jose Sequeda.
> Documenta cómo levantar, observar y mantener el Runner SQL real
> que evalúa las submissions del Entregable 2.

---

## 1. Visión general

El Worker SQL consume jobs de Redis (BullMQ) y, por cada submission:

1. Crea un contenedor PostgreSQL 16 temporal (`docker run --rm`)
2. Aplica el `SchemaScript` del reto
3. Carga el `TestDataset` (seed)
4. Ejecuta la query del estudiante con timeout
5. Captura `EXPLAIN (FORMAT JSON)` para el asistente IA
6. Compara resultados contra `Challenge.expectedResult`
7. Calcula score (60% correctness + 15% tiempo + 10% prácticas + 5% claridad IA + 10% mejora IA)
8. Persiste status, score y feedback
9. **Destruye el contenedor (siempre, incluso en error)**

---

## 2. Cómo levantar todo

Pre-requisitos: Docker Desktop activo, `.env` válido (copiar `.env.example`).

```bash
docker compose up -d --build
```

Estado de los servicios:
```bash
docker compose ps
```

Esperar a que `postgres` y `redis` estén `(healthy)` antes de mandar submissions.

---

## 3. Cómo ver logs

```bash
# Logs del worker (donde verás cada fase de evaluación)
docker compose logs -f worker

# Logs combinados
docker compose logs -f

# Solo errores del último arranque
docker compose logs --tail=200 worker | grep -i "ERROR\|error"
```

---

## 4. Limpieza de contenedores huérfanos del runner

El worker destruye los contenedores temporales al finalizar (en `finally`).
Si el worker se mata abruptamente (SIGKILL, OOM), pueden quedar contenedores
huérfanos con nombre `sql-judge-eval-*`. Para limpiarlos:

```bash
# Listar huérfanos
docker ps -a --filter "name=sql-judge-eval-"

# Limpiarlos todos
docker rm -f $(docker ps -a --filter "name=sql-judge-eval-" -q)
```

---

## 5. Variables de entorno relevantes

| Variable | Default | Uso |
|----------|---------|-----|
| `DATABASE_URL` | `postgresql://sqljudge:...@postgres:5432/sqljudge` | Conexión Prisma del worker |
| `REDIS_HOST` | `redis` | Host BullMQ |
| `REDIS_PORT` | `6379` | Puerto BullMQ |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Socket del daemon Docker |
| `API_URL` | `http://api:3000/api` | Para llamar al ai-assistant |

---

## 6. Troubleshooting

### `Cannot connect to Docker daemon`
El worker no tiene acceso al socket. Verifica que `docker-compose.yml` monte:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:rw
```

### Submissions atascadas en `RUNNING`
El worker murió a mitad. Reiniciar:
```bash
docker compose restart worker
```
Para marcarlas como `RUNTIME_ERROR` manualmente:
```bash
docker compose exec postgres psql -U sqljudge -d sqljudge \
  -c "UPDATE submissions SET status='RUNTIME_ERROR' WHERE status='RUNNING' AND \"updatedAt\" < NOW() - INTERVAL '5 minutes';"
```

### Postgres temporal nunca llega a `healthy`
Probablemente recursos. Sube el `mem_limit` del worker o reduce `concurrency` en `main.ts`.

---

## 7. Límites de recursos

| Servicio | Memoria | CPU |
|----------|---------|-----|
| `postgres` (base) | 512 MB | 0.5 |
| `redis` | 256 MB | 0.25 |
| `api` | 512 MB | 0.5 |
| `worker` | 384 MB | 0.5 |
| **Runner temporal (por submission)** | **512 MB** | **0.5** |

El worker corre máximo 2 submissions en paralelo (`concurrency: 2`).

---

## 8. Contrato del runner — `SqlExecutionResult`

```ts
interface SqlExecutionResult {
  success: boolean;          // true si OK; false si SYNTAX/RUNTIME/TIMEOUT
  rows: any[];               // filas devueltas por la query
  rowCount: number;          // === rows.length
  columns: string[];         // nombres de columnas en orden
  executionTimeMs: number;   // tiempo de la query del estudiante (sin DDL/seed)
  error?: string;            // 'SYNTAX_ERROR: ...' | 'TIME_LIMIT_EXCEEDED' | 'RUNTIME_ERROR: ...'
  explainPlan?: string|null; // JSON string del EXPLAIN sin ANALYZE — null si falló
}
```

Mapeo a `SubmissionStatus`:

| `success` | `comparator.isCorrect` | Status final |
|-----------|------------------------|--------------|
| `true` | `true` | `ACCEPTED` |
| `true` | `false` | `WRONG_ANSWER` |
| `false` + `TIME_LIMIT_EXCEEDED` | n/a | `TIME_LIMIT_EXCEEDED` |
| `false` + `SYNTAX_ERROR` | n/a | `SYNTAX_ERROR` |
| `false` + cualquier otro | n/a | `RUNTIME_ERROR` |

---

## 9. Señales correctas en los logs tras aplicar los fixes

```
FASE 1: Obteniendo datos del submission...
FASE 2: Creando contenedor PostgreSQL...
FASE 3: Esperando a que PostgreSQL esté listo...
FASE 4: Conectando a PostgreSQL y ejecutando SQL...
[SqlExecutor] Ejecutando DDL (schema)...
[SqlExecutor] DDL ejecutado en XXms
[SqlExecutor] Ejecutando seed (inserts)...        ← FIX P0 aplicado
[SqlExecutor] Seed ejecutado en XXms
[SqlExecutor] Ejecutando query del estudiante...
[SqlExecutor] Query ejecutada en XXms (N filas)   ← N > 0
FASE 6: Comparando resultados...
FASE 6.5: Asistente IA no disponible — continuando sin IA  ← OK, Pardo pendiente
FASE 7: Calculando puntuación...
FASE 9: Guardando resultados en DB...
✅ Submission completado: ACCEPTED (Score: XX/100)
CLEANUP: Destruyendo contenedor...
Contenedor destruido ✓
```
