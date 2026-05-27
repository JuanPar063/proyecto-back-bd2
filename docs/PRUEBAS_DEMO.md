# Guía de pruebas manuales — Demo Entregable 2

> JSONs listos para copiar/pegar en Swagger. Todos los datos referenciados
> aquí los crea `npm run prisma:seed` (ver `prisma/seed.ts`).
>
> Cómo usar este documento:
>
> 1. Arranca el stack y corre el seed.
> 2. Cada sección numerada cubre un módulo del PDF del Entregable 2.
> 3. Reemplaza los placeholders `<...>` (tokens, IDs) con los valores que
>    obtengas en cada paso.
> 4. Si pierdes los IDs, ve a la sección **§0.3** para recuperarlos con
>    endpoints `GET`.

---

## 0. Preparación

### 0.1 Levantar el stack

```powershell
docker compose up -d --build
$env:DATABASE_URL = "postgresql://sqljudge:sqljudge_dev_password@localhost:5432/sqljudge?schema=public"
npm run prisma:seed
```

Swagger: <http://localhost:3000/docs>
Health:  <http://localhost:3000/api/health>

### 0.2 Credenciales del seed

| Rol       | Email                          | Password    | Notas                                       |
| --------- | ------------------------------ | ----------- | ------------------------------------------- |
| ADMIN     | `admin@sqljudge.local`         | `Admin123!` |                                             |
| PROFESSOR | `carlos.profe@univ.edu`        | `Profe123!` | Dueño del curso BD2-DEMO-2026               |
| PROFESSOR | `laura.profe@univ.edu`         | `Profe123!` | Dueño del curso SQL-ADV-DEMO-2026           |
| STUDENT   | `ana.estudiante@univ.edu`      | `Stud123!`  | Inscrita en BD2, tiene attempt activo del Parcial 1 |
| STUDENT   | `beto.estudiante@univ.edu`     | `Stud123!`  | Inscrito en BD2                             |
| STUDENT   | `carla.estudiante@univ.edu`    | `Stud123!`  | Inscrita en BD2                             |
| STUDENT   | `david.estudiante@univ.edu`    | `Stud123!`  | Inscrito en SQL Avanzado                    |
| STUDENT   | `elena.estudiante@univ.edu`    | `Stud123!`  | Inscrita en ambos                           |

### 0.3 Recuperar IDs después del seed

Si no anotaste los IDs cuando corriste el seed:

```http
GET /api/courses
Authorization: Bearer <ADMIN_TOKEN>
```

```http
GET /api/challenges?courseId=<COURSE_BD2_ID>&status=published
Authorization: Bearer <PROF_CARLOS_TOKEN>
```

```http
GET /api/evaluations
Authorization: Bearer <PROF_CARLOS_TOKEN>
```

---

## 1. Autenticación (`/api/auth`)

### 1.1 Login admin

`POST /api/auth/login`

```json
{
  "email": "admin@sqljudge.local",
  "password": "Admin123!"
}
```

→ Guarda `accessToken` como `<ADMIN_TOKEN>`.

### 1.2 Login profesor Carlos

`POST /api/auth/login`

```json
{
  "email": "carlos.profe@univ.edu",
  "password": "Profe123!"
}
```

→ Guarda como `<PROF_CARLOS_TOKEN>`.

### 1.3 Login estudiante Ana

`POST /api/auth/login`

```json
{
  "email": "ana.estudiante@univ.edu",
  "password": "Stud123!"
}
```

→ Guarda como `<STUD_ANA_TOKEN>`.

### 1.4 Login estudiantes adicionales

| Token alias              | Email                          |
| ------------------------ | ------------------------------ |
| `<PROF_LAURA_TOKEN>`     | `laura.profe@univ.edu`         |
| `<STUD_BETO_TOKEN>`      | `beto.estudiante@univ.edu`     |
| `<STUD_CARLA_TOKEN>`     | `carla.estudiante@univ.edu`    |
| `<STUD_DAVID_TOKEN>`     | `david.estudiante@univ.edu`    |
| `<STUD_ELENA_TOKEN>`     | `elena.estudiante@univ.edu`    |

(Mismos `Profe123!` y `Stud123!`)

### 1.5 Registro público (siempre crea STUDENT)

`POST /api/auth/register`

```json
{
  "email": "nuevo.estudiante@univ.edu",
  "password": "Demo1234!",
  "fullName": "Estudiante Nuevo"
}
```

### 1.6 Refrescar token

`POST /api/auth/refresh`

```json
{
  "refreshToken": "<REFRESH_TOKEN_DEL_LOGIN>"
}
```

### 1.7 Confirmar sesión

`GET /api/auth/me` — sin body, con `<ANY_TOKEN>`.

---

## 2. Usuarios (`/api/users`) — solo ADMIN

### 2.1 Crear profesor adicional

`POST /api/users` con `<ADMIN_TOKEN>`

```json
{
  "email": "nuevo.prof@univ.edu",
  "password": "Profe123!",
  "fullName": "Profe Nuevo",
  "role": "PROFESSOR"
}
```

### 2.2 Listar usuarios

`GET /api/users?page=1&limit=20` con `<ADMIN_TOKEN>`

### 2.3 Detalle de usuario

`GET /api/users/<USER_ID>` con `<ADMIN_TOKEN>`

### 2.4 Desactivar usuario

`PATCH /api/users/<USER_ID>/deactivate` con `<ADMIN_TOKEN>`

---

## 3. Cursos (`/api/courses`)

### 3.1 Listar cursos (cada rol ve distinto)

`GET /api/courses` — con `<ADMIN_TOKEN>` (ve todos), `<PROF_CARLOS_TOKEN>` (solo los suyos), o `<STUD_ANA_TOKEN>` (en los que está inscrita).

### 3.2 Detalle del curso BD2

`GET /api/courses/<COURSE_BD2_ID>` con `<PROF_CARLOS_TOKEN>`

### 3.3 Crear nuevo curso

`POST /api/courses` con `<PROF_CARLOS_TOKEN>`

```json
{
  "name": "Bases de Datos III",
  "code": "BD3-DEMO-2026",
  "period": "2026-1",
  "group": "1"
}
```

### 3.4 Editar curso

`PATCH /api/courses/<COURSE_BD2_ID>` con `<PROF_CARLOS_TOKEN>`

```json
{
  "name": "Bases de Datos II - 2026-1"
}
```

### 3.5 Inscribir estudiante nuevo

`POST /api/courses/<COURSE_BD2_ID>/enrollments` con `<PROF_CARLOS_TOKEN>`

```json
{
  "studentEmail": "elena.estudiante@univ.edu"
}
```

### 3.6 Archivar curso

`PATCH /api/courses/<COURSE_ID>/archive` con `<PROF_CARLOS_TOKEN>`

---

## 4. Retos (`/api/challenges`)

> **IDs del seed**: ya tienes 3 retos publicados en BD2. Para usarlos sin
> crear nuevos, ve a §4.6.

### 4.1 Crear reto en draft

`POST /api/challenges` con `<PROF_CARLOS_TOKEN>`

```json
{
  "title": "Órdenes de febrero",
  "description": "Devuelve el id y total de las órdenes creadas en febrero 2026.",
  "difficulty": "MEDIUM",
  "tags": ["WHERE", "DATE"],
  "databaseEngine": "postgresql",
  "timeLimit": 3000,
  "courseId": "<COURSE_BD2_ID>"
}
```

### 4.2 Listar retos publicados

`GET /api/challenges?courseId=<COURSE_BD2_ID>&status=published` con cualquier token.

### 4.3 Detalle de reto

`GET /api/challenges/<CH3_ID>` con cualquier token.

### 4.4 Editar reto (mientras esté en draft)

`PATCH /api/challenges/<CH_NEW_ID>` con `<PROF_CARLOS_TOKEN>`

```json
{
  "description": "Devuelve el id y total de las órdenes de febrero 2026 (UTC).",
  "tags": ["WHERE", "DATE", "FILTERING"]
}
```

### 4.5 Cambiar estado del reto

`PATCH /api/challenges/<CH_NEW_ID>/status` con `<PROF_CARLOS_TOKEN>`

```json
{ "status": "published" }
```

Después puede ir a `"archived"` desde `published` o `draft`.

### 4.6 Retos del seed (referencia)

| Alias    | Título                              | Difficulty | timeLimit |
| -------- | ----------------------------------- | ---------- | --------- |
| `<CH1_ID>` | Clientes en Bogotá                | EASY       | 3000ms    |
| `<CH2_ID>` | Top 3 órdenes por total           | MEDIUM     | 3000ms    |
| `<CH3_ID>` | Clientes con más de 3 compras     | HARD       | 5000ms    |

---

## 5. Esquemas (`/api/challenges/:id/schema`)

### 5.1 Cargar/reemplazar esquema

`PUT /api/challenges/<CH_NEW_ID>/schema` con `<PROF_CARLOS_TOKEN>`

```json
{
  "ddl": "CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, city VARCHAR(80) NOT NULL); CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT REFERENCES customers(id), total DECIMAL(10,2) NOT NULL, created_at DATE NOT NULL);"
}
```

### 5.2 Ver esquema

`GET /api/challenges/<CH1_ID>/schema` con `<PROF_CARLOS_TOKEN>`

→ Verifica que `parsedTables` viene poblado.

---

## 6. Datos de prueba (`/api/challenges/:id/test-data`)

### 6.1 Dataset manual con INSERTs

`POST /api/challenges/<CH_NEW_ID>/test-data/manual` con `<PROF_CARLOS_TOKEN>`

```json
{
  "name": "dataset-manual-demo",
  "sql": "INSERT INTO customers (id, name, city) VALUES (1, 'Demo', 'Bogotá'); INSERT INTO orders (id, customer_id, total, created_at) VALUES (1, 1, 100000, '2026-02-15');"
}
```

### 6.2 Preview del generador (sin persistir)

`POST /api/challenges/<CH_NEW_ID>/test-data/preview` con `<PROF_CARLOS_TOKEN>`

```json
{
  "name": "preview-clientes",
  "tables": [
    {
      "table": "customers",
      "rows": 5,
      "seed": 42,
      "fields": {
        "id": { "type": "integer", "min": 1, "max": 100 },
        "name": { "type": "varchar", "preset": "name", "maxLength": 80 },
        "city": { "type": "enum", "values": ["Bogotá", "Medellín", "Cali"] }
      }
    }
  ]
}
```

### 6.3 Generador completo con FK y casos borde

`POST /api/challenges/<CH_NEW_ID>/test-data/generate` con `<PROF_CARLOS_TOKEN>`

```json
{
  "name": "dataset-generado-completo",
  "tables": [
    {
      "table": "customers",
      "rows": 10,
      "seed": 7,
      "fields": {
        "id": { "type": "integer", "min": 1, "max": 1000 },
        "name": { "type": "varchar", "preset": "name", "maxLength": 80 },
        "city": {
          "type": "enum",
          "values": ["Bogotá", "Medellín", "Cali", "Barranquilla"],
          "weights": [0.5, 0.25, 0.15, 0.1]
        }
      }
    },
    {
      "table": "orders",
      "rows": 50,
      "seed": 99,
      "includeExtremes": true,
      "fields": {
        "id": { "type": "integer", "min": 1, "max": 100000 },
        "customer_id": { "type": "foreign_key", "references": "customers.id" },
        "total": { "type": "decimal", "min": 10000, "max": 5000000, "nullPercent": 5 },
        "created_at": { "type": "date", "from": "2026-01-01", "to": "2026-12-31" }
      }
    }
  ]
}
```

### 6.4 Listar datasets

`GET /api/challenges/<CH1_ID>/test-data` con `<PROF_CARLOS_TOKEN>`

---

## 7. Resultado esperado (`/api/challenges/:id/expected-result`)

### 7.1 Cargar expected result (orden no importa)

`PUT /api/challenges/<CH_NEW_ID>/expected-result` con `<PROF_CARLOS_TOKEN>`

```json
{
  "columns": ["name"],
  "rows": [["Ana López"], ["Diego Vargas"]],
  "orderSensitive": false,
  "floatTolerance": 0
}
```

### 7.2 Cargar expected con orden estricto y tolerancia decimal

```json
{
  "columns": ["id", "total"],
  "rows": [[10, 300000.00], [2, 250000.00], [7, 200000.00]],
  "orderSensitive": true,
  "floatTolerance": 0.01
}
```

### 7.3 Ver expected result

`GET /api/challenges/<CH2_ID>/expected-result` con `<PROF_CARLOS_TOKEN>`

---

## 8. Submissions (`/api/submissions` + variante REST-ish)

### 8.1 Enviar query correcta (variante REST-ish)

`POST /api/challenges/<CH1_ID>/submissions` con `<STUD_ANA_TOKEN>`

```json
{
  "query": "SELECT name FROM customers WHERE city = 'Bogotá'"
}
```

→ Debe responder `202` con `status: QUEUED`. Anota el `id` como `<SUBM_ID>`.

### 8.2 Enviar query del reto 2 (top-N)

`POST /api/challenges/<CH2_ID>/submissions` con `<STUD_BETO_TOKEN>`

```json
{
  "query": "SELECT id, total FROM orders ORDER BY total DESC LIMIT 3"
}
```

### 8.3 Enviar query del reto 3 (JOIN + GROUP BY + HAVING)

`POST /api/challenges/<CH3_ID>/submissions` con `<STUD_ANA_TOKEN>`

```json
{
  "query": "SELECT c.name, COUNT(o.id) AS total FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name HAVING COUNT(o.id) > 3"
}
```

### 8.4 Variante body (legacy)

`POST /api/submissions` con `<STUD_ANA_TOKEN>`

```json
{
  "challengeId": "<CH1_ID>",
  "query": "SELECT name FROM customers WHERE city = 'Cali'"
}
```

### 8.5 Submission dentro de una evaluación

`POST /api/challenges/<CH2_ID>/submissions` con `<STUD_ANA_TOKEN>`

```json
{
  "query": "SELECT id, total FROM orders ORDER BY total DESC LIMIT 3",
  "evaluationId": "<EVAL1_ID>"
}
```

### 8.6 Casos de error a probar

**SYNTAX_ERROR** (el `==` no existe en SQL):

```json
{ "query": "SELECT name FROM customers WHERE city == 'Bogotá'" }
```

**RUNTIME_ERROR** (tabla inexistente):

```json
{ "query": "SELECT * FROM tabla_inexistente" }
```

**TIME_LIMIT_EXCEEDED** (sleep mayor que `timeLimit`):

```json
{ "query": "SELECT pg_sleep(10), id FROM customers" }
```

**WRONG_ANSWER** (devuelve filas distintas):

```json
{ "query": "SELECT name FROM customers WHERE city = 'Medellín'" }
```

> **Nota**: estas no son las queries `expect:WRONG` de Ruiz (que solo
> funcionan con un stub antiguo). Con el runner Docker REAL, basta con que
> la query corra y devuelva algo distinto a lo esperado.

### 8.7 Polling al resultado

`GET /api/submissions/<SUBM_ID>` con `<STUD_ANA_TOKEN>`

Repetir cada 500ms hasta que `status` ya no sea `QUEUED` ni `RUNNING`.
Verifica:
- `status` (uno de los 6 terminales)
- `score` (0-100)
- `executionTimeMs`
- `feedback` (texto humano)
- `scoreBreakdown` (JSON con las 5 dimensiones)
- `resultData` (filas devueltas por la query)
- `errorMessage` (si falló)

### 8.8 Listar mis submissions (STUDENT)

`GET /api/submissions/my` con `<STUD_ANA_TOKEN>`

### 8.9 Filtrar submissions (con visibilidad por rol)

`GET /api/submissions?challengeId=<CH1_ID>` con `<PROF_CARLOS_TOKEN>`
(ve todas), o con `<STUD_BETO_TOKEN>` (solo las suyas).

### 8.10 Submissions de un reto (vista del profesor)

`GET /api/submissions/challenge/<CH1_ID>` con `<PROF_CARLOS_TOKEN>`

---

## 9. Evaluaciones (`/api/evaluations`)

> El seed crea una evaluación `Parcial 1 — SQL avanzado` asociada a los
> retos CH2 y CH3, con un attempt activo de Ana.

### 9.1 Crear evaluación

`POST /api/evaluations` con `<PROF_CARLOS_TOKEN>`

```json
{
  "name": "Quiz semanal — JOIN",
  "description": "Quiz corto sobre JOIN entre customers y orders",
  "courseId": "<COURSE_BD2_ID>",
  "startDate": "2026-05-27T00:00:00Z",
  "endDate": "2026-06-03T23:59:59Z",
  "durationMinutes": 30,
  "maxAttempts": 2,
  "resultsVisibility": "AFTER_END"
}
```

`resultsVisibility` acepta: `DURING_EVALUATION`, `AFTER_END`, `ALWAYS`.

### 9.2 Asociar retos a la evaluación

`PATCH /api/evaluations/<EVAL_NEW_ID>/challenges` con `<PROF_CARLOS_TOKEN>`

```json
{
  "challengeIds": ["<CH1_ID>", "<CH3_ID>"]
}
```

El orden del array define `position`.

### 9.3 Listar evaluaciones visibles

`GET /api/evaluations` con `<STUD_ANA_TOKEN>` (ve las de sus cursos),
`<PROF_CARLOS_TOKEN>` (ve las de sus cursos).

### 9.4 Detalle de evaluación

`GET /api/evaluations/<EVAL1_ID>` con `<STUD_ANA_TOKEN>`

### 9.5 Iniciar attempt (STUDENT)

`POST /api/evaluations/<EVAL_NEW_ID>/start` con `<STUD_BETO_TOKEN>`

→ Devuelve el `EvaluationAttempt` con `endsAt = startedAt + durationMinutes`.

### 9.6 Estado del attempt

`GET /api/evaluations/<EVAL1_ID>/state` con `<STUD_ANA_TOKEN>`

→ Ana ya tiene un attempt activo del seed; verás los retos asociados +
tiempo restante.

### 9.7 Editar evaluación

`PATCH /api/evaluations/<EVAL1_ID>` con `<PROF_CARLOS_TOKEN>`

```json
{
  "durationMinutes": 120,
  "maxAttempts": 5
}
```

### 9.8 Eliminar evaluación

`DELETE /api/evaluations/<EVAL_NEW_ID>` con `<PROF_CARLOS_TOKEN>`

### 9.9 Probar reglas de negocio

**Fuera de ventana**: primero `PATCH` con `endDate` en el pasado:

```json
{ "endDate": "2026-05-26T00:00:00Z" }
```

Luego intenta `POST /start` → debe responder `400`.

**Máximo de intentos**: con `maxAttempts: 1`, llama `POST /start` dos veces
→ la segunda responde `409`.

---

## 10. Reportes (`/api/reports`)

> Con el seed tienes 7 submissions reales, así que los reportes muestran
> data verdadera (no listas vacías).

### 10.1 Reporte por estudiante

`GET /api/reports/students/<STUD_ANA_ID>` con `<PROF_CARLOS_TOKEN>`

Espera ver: retos resueltos, total submissions, score promedio, mejor
tiempo.

### 10.2 Reporte por reto

`GET /api/reports/challenges/<CH2_ID>` con `<PROF_CARLOS_TOKEN>`

Espera ver: tasa de éxito, mejor tiempo, dificultad real (`1 - successRate`).

### 10.3 Reporte por curso

`GET /api/reports/courses/<COURSE_BD2_ID>` con `<PROF_CARLOS_TOKEN>`

Espera ver: promedio del curso, top 5 estudiantes (con `fullName` real),
retos más difíciles.

### 10.4 Leaderboard del curso

`GET /api/reports/leaderboard?courseId=<COURSE_BD2_ID>` con
`<PROF_CARLOS_TOKEN>` o `<STUD_ANA_TOKEN>`.

### 10.5 Leaderboard filtrado por evaluación

`GET /api/reports/leaderboard?evaluationId=<EVAL1_ID>` con
`<PROF_CARLOS_TOKEN>`.

---

## 11. Asistente IA (`/api/ai-assistant`)

### 11.1 Query con MUCHOS problemas (warnings + critical)

`POST /api/ai-assistant/analyze` con `<PROF_CARLOS_TOKEN>` o `<ADMIN_TOKEN>`

```json
{
  "query": "SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id WHERE UPPER(c.city) = 'BOGOTÁ' ORDER BY o.created_at",
  "schemaDdl": "CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100), city VARCHAR(80)); CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT, total DECIMAL(10,2), created_at DATE);",
  "executionTimeMs": 1500,
  "status": "ACCEPTED"
}
```

Espera:
- `warnings`: incluye `SELECT_STAR`, `FUNCTION_IN_WHERE`, `ORDER_BY_WITHOUT_LIMIT`, `SLOW_QUERY` (severity critical).
- `suggestedIndexes`: arrays de `CREATE INDEX ...` reales.
- `rewriteSql`: la reescritura quita `UPPER(city)` (o enumera columnas).
- `qualityScore`: bajo (improvement = 0 por el critical).

### 11.2 Query con `IN (SELECT)` para forzar reescritura

```json
{
  "query": "SELECT name FROM customers WHERE id IN (SELECT customer_id FROM orders WHERE total > 100000)",
  "schemaDdl": "CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100), city VARCHAR(80)); CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT, total DECIMAL(10,2), created_at DATE);",
  "executionTimeMs": 300,
  "status": "ACCEPTED"
}
```

Espera: `rewriteSql` te devuelve la versión con `EXISTS (SELECT 1 ...)`.

### 11.3 Query con CROSS JOIN (critical)

```json
{
  "query": "SELECT * FROM customers CROSS JOIN orders",
  "schemaDdl": "CREATE TABLE customers (id INT, name VARCHAR(100)); CREATE TABLE orders (id INT, total DECIMAL);",
  "executionTimeMs": 200,
  "status": "ACCEPTED"
}
```

Espera: warning `JOIN_WITHOUT_ON` con severity `critical`.

### 11.4 Query limpia (cero warnings)

```json
{
  "query": "SELECT id, name FROM customers WHERE id = 1",
  "schemaDdl": "CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(50));",
  "executionTimeMs": 50,
  "status": "ACCEPTED"
}
```

Espera: `warnings: []`, `qualityScore: { goodPractices: 10, clarity: 5, improvement: 10 }`.

### 11.5 Query con GROUP BY sin filtro

```json
{
  "query": "SELECT status, COUNT(*) FROM orders GROUP BY status",
  "schemaDdl": "CREATE TABLE orders (id INT, status VARCHAR(20));",
  "executionTimeMs": 600,
  "status": "ACCEPTED"
}
```

Espera: warning `GROUP_BY_WITHOUT_FILTER`.

### 11.6 Status distintos

Cambia `status` a `"WRONG_ANSWER"`, `"SYNTAX_ERROR"`, `"RUNTIME_ERROR"`,
`"TIME_LIMIT_EXCEEDED"`, `"OPTIMIZATION_REQUIRED"` y observa cómo cambia
el `impact` y el `qualityScore`.

---

## 12. Admin DLQ (`/api/admin/submissions/failed`)

### 12.1 Listar jobs fallidos definitivamente

`GET /api/admin/submissions/failed` con `<ADMIN_TOKEN>`

→ Hoy: `{ data: [] }`. La DLQ se llena cuando un job agota los 3
reintentos automáticos.

### 12.2 Reintentar job fallido (cuando exista)

`POST /api/admin/submissions/failed/<JOB_ID>/retry` con `<ADMIN_TOKEN>`

### 12.3 Descartar job fallido

`DELETE /api/admin/submissions/failed/<JOB_ID>` con `<ADMIN_TOKEN>`

---

## 13. Demo (`/api/demo`)

### 13.1 Atajo: crear escenario customers-orders completo

`POST /api/demo/customers-orders` con `<PROF_CARLOS_TOKEN>`

```json
{
  "courseName": "BD2 Demo Atajo",
  "courseCode": "DEMO-ATAJO-001",
  "customerCount": 30,
  "orderCount": 150
}
```

→ Crea: curso + reto publicado + esquema + dataset generado. Útil cuando
quieres un escenario nuevo sin pasar por los 5+ endpoints.

---

## 14. Health (`/api/health`)

### 14.1 Verificar conectividad

`GET /api/health` — sin auth.

Debe responder `200` con `info.postgres.status: "up"` y `info.redis.status: "up"`.

---

## Apéndice A — Flujo "cortito" para grabar el video (12 min)

| Minuto | Acción | Endpoint(s) |
| ------ | ------ | ----------- |
| 0–1    | Levantar stack, mostrar `docker compose ps` healthy | — |
| 1–2    | Login admin, mostrar Swagger, login estudiante Ana | §1.1, §1.3 |
| 2–4    | Mostrar retos publicados que ya creó la seed | §4.2, §4.6 |
| 4–6    | Enviar submission ACCEPTED, ver 9 fases del worker | §8.1, §8.7 |
| 6–8    | Enviar submission TIME_LIMIT_EXCEEDED y SYNTAX_ERROR | §8.6 |
| 8–10   | Mostrar reportes y leaderboard con data real del seed | §10.3, §10.4 |
| 10–12  | Asistente IA con query problemática | §11.1, §11.2 |

---

## Apéndice B — Estados del Submission que ya están en el seed

Sin necesidad de enviar nuevas submissions, ya hay ejemplos de cada estado:

| Estado                  | Estudiante | Reto                          |
| ----------------------- | ---------- | ----------------------------- |
| `ACCEPTED`              | Ana        | Clientes en Bogotá            |
| `ACCEPTED`              | Ana        | Top 3 órdenes                 |
| `ACCEPTED`              | Beto       | Clientes en Bogotá            |
| `WRONG_ANSWER`          | Beto       | Top 3 órdenes (le faltó LIMIT)|
| `SYNTAX_ERROR`          | Beto       | Clientes con más de 3 compras |
| `OPTIMIZATION_REQUIRED` | Carla      | Clientes en Bogotá (SELECT *) |
| `TIME_LIMIT_EXCEEDED`   | Carla      | Clientes con más de 3 compras |
| `RUNTIME_ERROR`         | David      | Top 3 órdenes (tabla inexistente) |

Para verlos:

```http
GET /api/submissions?challengeId=<CH1_ID>
Authorization: Bearer <PROF_CARLOS_TOKEN>
```

O para ver detalle individual con su feedback completo:

```http
GET /api/submissions/<ID_DE_SUBMISSION>
Authorization: Bearer <PROF_CARLOS_TOKEN>
```

---

## Apéndice C — Troubleshooting

**El admin login da 401 con "Credenciales inválidas"**
→ El password hash del seed quedó desfasado. Ejecuta:
```sql
DELETE FROM users WHERE email='admin@sqljudge.local';
```
Y vuelve a correr `npm run prisma:seed`.

**El worker falla con `network proyecto-back-bd2_sqljudge not found`**
→ Crea `.env` (si no existe) y agrega:
```
COMPOSE_PROJECT_NAME=proyecto-back-bd2
```
Después `docker compose down && docker compose up -d --build`.

**Swagger no muestra `/api/evaluations/*`**
→ Verifica que `EvaluationsModule` esté importado en `src/app.module.ts`.

**`prisma migrate dev` da "Can't reach database server at postgres:5432"**
→ Estás corriendo desde el host (no desde el contenedor). Usa:
```powershell
$env:DATABASE_URL="postgresql://sqljudge:sqljudge_dev_password@localhost:5432/sqljudge?schema=public"
npx prisma migrate dev
```
