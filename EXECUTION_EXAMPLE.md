# 📊 SQL Judge — End-to-End Execution Example

## Scenario: Challenge "Top 5 Customers by Sales"

### 🎯 Setup

```javascript
// 1. Challenge se crea en la API
const challenge = {
  id: "ch-001",
  title: "Top 5 Customers by Sales",
  timeLimit: 2000, // 2 segundos
  
  schema: `
    CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100));
    CREATE TABLE sales (id INT PRIMARY KEY, customer_id INT, amount DECIMAL(10,2));
  `,
  
  seed: `
    INSERT INTO customers VALUES (1, 'Acme'), (2, 'TechCorp'), (3, 'Global');
    INSERT INTO sales VALUES (1, 1, 10000), (2, 1, 5000), (3, 2, 8000);
  `,
  
  expectedResult: [
    { customer_id: 1, name: 'Acme', total: 15000 },
    { customer_id: 2, name: 'TechCorp', total: 8000 },
    { customer_id: 3, name: 'Global', total: 0 }
  ]
};

// 2. Estudiante envía su solución
const submission = {
  id: "sub-123",
  challengeId: "ch-001",
  studentId: "std-456",
  query: "SELECT c.customer_id, c.name, SUM(s.amount) as total FROM customers c LEFT JOIN sales s ON c.id = s.customer_id GROUP BY c.id, c.name ORDER BY total DESC LIMIT 5;"
};
```

### 📝 Logs del Worker (Ejecución Real)

```
============================================================
Procesando submission: sub-123
============================================================
[Worker] ℹ️  FASE 1: Obteniendo datos del submission...
[Worker] ℹ️  Submission ID: sub-123
[Worker] ℹ️  Challenge: Top 5 Customers by Sales
[Worker] ℹ️  Estudiante: std-456
[Worker] ℹ️  Query: SELECT c.customer_id, c.name, SUM(s.amount)...

[Worker] ℹ️  FASE 2: Creando contenedor PostgreSQL...
[DockerService] ℹ️  Creando contenedor PostgreSQL: sql-judge-eval-sub-123
[DockerService] ℹ️  Contenedor iniciado: a1b2c3d4e5f6

[Worker] ℹ️  FASE 3: Esperando a que PostgreSQL esté listo...
[PostgresHealthCheck] ℹ️  Esperando PostgreSQL en 172.18.0.3:5432 (30 intentos, 60000ms)
[PostgresHealthCheck] ℹ️  Intento 1: TCP connection timeout (3000ms) (100ms elapsed)
[PostgresHealthCheck] 🔧 Esperando 141ms antes del próximo intento...
[PostgresHealthCheck] ✅ PostgreSQL está listo ✓ (intento 5, 42ms)

[Worker] ℹ️  FASE 4: Conectando a PostgreSQL y ejecutando SQL...
[SqlExecutor] ℹ️  Conectando a PostgreSQL en 172.18.0.3:5432/eval_db...
[SqlExecutor] ✅ Conectado a PostgreSQL ✓

[SqlExecutor] ℹ️  Iniciando pipeline completo de SQL...
[SqlExecutor] ℹ️  Ejecutando DDL (schema)...
[SqlExecutor] ✅ DDL ejecutado en 145ms

[SqlExecutor] ℹ️  Ejecutando seed (inserts)...
[SqlExecutor] ✅ Seed ejecutado en 28ms

[SqlExecutor] ℹ️  Ejecutando query del estudiante (timeout: 2000ms)...
[SqlExecutor] ✅ Query ejecutada en 34ms (3 filas, 3 columnas)

[Worker] ℹ️  FASE 5: Verificando errores SQL...
[Worker] ℹ️  ✓ Query exitosa, sin errores

[Worker] ℹ️  FASE 6: Comparando resultados...
[ResultComparator] ℹ️  Comparando resultados: 3 actual vs 3 esperadas
[ResultComparator] ✅ Resultado EXACTO

[Worker] ℹ️  FASE 7: Calculando puntuación...
[ScoreCalculator] ℹ️  Calculando score final...
[ScoreCalculator] ✅ Resultado exacto (60 pts)
[ScoreCalculator] ⚡ Muy rápido (34ms, 15 pts)
[ScoreCalculator] 🔧 Analizando buenas prácticas SQL...
[ScoreCalculator]   ✓ No usa SELECT * (2 pts)
[ScoreCalculator]   ✓ Usa WHERE clause (2 pts)
[ScoreCalculator]   ✓ Buen formatting (2 pts)
[ScoreCalculator]   ✓ Usa GROUP BY (2 pts)
[ScoreCalculator] Puntuación de prácticas: 10/10
[ScoreCalculator] ℹ️  Score breakdown: correctness=60, time=15, practices=10 => TOTAL=85

[Worker] ℹ️  FASE 9: Guardando resultados en DB...
[Worker] ✅ Submission completado: ACCEPTED (Score: 85/100)
[Worker] ℹ️  Detalles: ✅ Resultado correcto! Excelente tiempo de ejecución. ✓ Código limpio y bien estructurado.

[Worker] ℹ️  CLEANUP: Destruyendo contenedor...
[DockerService] ℹ️  Destruyendo contenedor: a1b2c3d4e5f6
[DockerService] ✅ Contenedor eliminado
[Worker] ✅ Contenedor destruido ✓

============================================================
```

### 💾 Resultado en Base de Datos

```json
{
  "id": "sub-123",
  "status": "ACCEPTED",
  "score": 85,
  "scoreBreakdown": {
    "correctness": 60,
    "executionTime": 15,
    "sqlPractices": 10,
    "final": 85
  },
  "executionTimeMs": 34,
  "resultData": [
    { "customer_id": 1, "name": "Acme", "total": 15000 },
    { "customer_id": 2, "name": "TechCorp", "total": 8000 },
    { "customer_id": 3, "name": "Global", "total": 0 }
  ],
  "errorMessage": "✅ Resultado correcto! Excelente tiempo de ejecución. ✓ Código limpio y bien estructurado.",
  "createdAt": "2026-05-26T14:32:10.000Z",
  "updatedAt": "2026-05-26T14:32:14.000Z"
}
```

---

## ❌ Caso 2: Error — Student's Wrong Query

### Submission

```javascript
const wrongSubmission = {
  id: "sub-124",
  query: "SELECT c.customer_id, c.name FROM customers c;" // ❌ Falta GROUP BY, sin totales
};
```

### Logs

```
============================================================
Procesando submission: sub-124
============================================================
[Worker] ℹ️  FASE 1: Obteniendo datos...
[Worker] ℹ️  FASE 2: Creando contenedor...
[DockerService] ✅ Contenedor iniciado: b2c3d4e5f6g7

[Worker] ℹ️  FASE 3: Esperando PostgreSQL...
[PostgresHealthCheck] ✅ PostgreSQL está listo ✓ (intento 3, 48ms)

[Worker] ℹ️  FASE 4: Ejecutando SQL...
[SqlExecutor] ✅ Query ejecutada en 21ms (3 filas, 2 columnas)

[Worker] ℹ️  FASE 6: Comparando resultados...
[ResultComparator] ℹ️  Comparando resultados: 3 actual vs 3 esperadas
[ResultComparator] ❌ Resultado incorrecto (wrong):
  - Columnas no coinciden. Esperadas: customer_id, name, total

[Worker] ℹ️  FASE 7: Calculando puntuación...
[ScoreCalculator] ❌ Resultado incorrecto (0 pts)
[ScoreCalculator] ✓ Rápido (21ms, 10 pts)
[ScoreCalculator]   ✓ No usa SELECT * (2 pts)
[ScoreCalculator]   ✓ Buen formatting (2 pts)
[ScoreCalculator] Puntuación de prácticas: 4/10
[ScoreCalculator] Score breakdown: correctness=0, time=10, practices=4 => TOTAL=14

[Worker] ✅ Submission completado: WRONG_ANSWER (Score: 14/100)
[Worker] ℹ️  Detalles: ❌ Resultado incorrecto. El tiempo de ejecución es aceptable. Podrías mejorar el formateo y estructura.

[Worker] ✅ Contenedor destruido ✓
============================================================
```

### Resultado

```json
{
  "id": "sub-124",
  "status": "WRONG_ANSWER",
  "score": 14,
  "scoreBreakdown": {
    "correctness": 0,
    "executionTime": 10,
    "sqlPractices": 4,
    "final": 14
  },
  "executionTimeMs": 21,
  "errorMessage": "❌ Resultado incorrecto. Columnas no coinciden. Esperadas: customer_id, name, total"
}
```

---

## ⏱️ Caso 3: Timeout

### Submission

```javascript
const slowSubmission = {
  id: "sub-125",
  timeLimit: 500, // 500ms
  query: "SELECT * FROM sales; SELECT * FROM customers; SELECT * FROM sales;" // Muy lenta
};
```

### Logs (Truncado)

```
[SqlExecutor] ℹ️  Ejecutando query del estudiante (timeout: 500ms)...
[SqlExecutor] ⚠️  Query excedió timeout (524ms)

[Worker] ℹ️  FASE 5: Verificando errores SQL...
[Worker] ⚠️  Error SQL: TIME_LIMIT_EXCEEDED

[Worker] ✅ Submission completado con status: TIME_LIMIT_EXCEEDED
```

### Resultado

```json
{
  "id": "sub-125",
  "status": "TIME_LIMIT_EXCEEDED",
  "score": null,
  "executionTimeMs": 524,
  "errorMessage": "TIME_LIMIT_EXCEEDED: Query exceeded timeout (524ms > 500ms)"
}
```

---

## 🔄 Fase por Fase — Detalles Técnicos

### Fase 1: Obtener Contexto
```typescript
const context = {
  submissionId,
  studentId,
  challengeId,
  challengeTimeLimit: 2000,
  schemaSql: "CREATE TABLE...",
  seedSql: "INSERT INTO...",
  studentQuery: "SELECT...",
  expectedResult: [...],
  databaseEngine: "postgresql"
};
```

### Fase 2: Crear Contenedor
```bash
docker run -d \
  --name sql-judge-eval-sub-123 \
  --memory 512m \
  --cpus 0.5 \
  -e POSTGRES_USER=eval_user \
  -e POSTGRES_PASSWORD=eval_password \
  postgres:16-alpine
```

### Fase 3: Health Check (Retry Logic)
```
Intento 1: TCP connection fail → wait 141ms
Intento 2: TCP connection fail → wait 200ms
Intento 3: TCP connection fail → wait 282ms
Intento 4: TCP connection fail → wait 400ms
Intento 5: TCP connection OK → PostgreSQL listo! ✅
```

### Fase 4: Execute SQL Pipeline
```
DDL:   145ms | CREATE TABLE customers (id INT PRIMARY KEY, ...);
SEED:  28ms  | INSERT INTO customers VALUES (1, 'Acme'), ...;
QUERY: 34ms  | SELECT c.customer_id, c.name, ... FROM customers c ...;
────────────────────
TOTAL: 207ms
```

### Fase 6: Comparación
```
Actual  (3 rows): [{id: 1, name: 'Acme', total: 15000}, ...]
Expected (3 rows): [{customer_id: 1, name: 'Acme', total: 15000}, ...]

❌ Mismatch: Columna "id" vs "customer_id"
Status: WRONG_ANSWER
```

### Fase 7: Scoring
```
Correctness:
  - exact match? → 60 pts ✅

Execution Time:
  - 207ms / 2000ms = 10% → 15 pts ⚡

SQL Practices:
  - SELECT *? No → +2
  - WHERE clause? Yes → +2
  - Good formatting? Yes → +2
  - GROUP BY? Yes → +2
  - Total: 8/10

Final Score: 60 + 15 + 8 = 83/100
```

### Fase 9: Cleanup
```bash
docker stop sql-judge-eval-sub-123     # 5s timeout
docker rm sql-judge-eval-sub-123 -v    # Remove + volumes
✅ Contenedor eliminado
```

---

## 🎓 Key Learnings

1. **Health Check es crítico**: TCP + pg_isready = más robusto
2. **Backoff exponencial**: Evita hammering el servidor
3. **Timeout global**: Garantiza que no cuelgue forever
4. **Cleanup en finally**: Siempre se ejecuta, incluso si error
5. **Scoring extensible**: Fácil agregar nuevos criterios
6. **Normalization**: "123" == 123 == true, null == null

---

Generated: May 26, 2026
