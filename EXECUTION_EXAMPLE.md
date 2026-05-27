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
