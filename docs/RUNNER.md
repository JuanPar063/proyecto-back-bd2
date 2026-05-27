# Runner SQL en Docker - SQL Judge

## 1. Vision general

El worker SQL consume jobs desde Redis/BullMQ y evalua cada submission en un ambiente Docker temporal. La API no ejecuta SQL de estudiantes y la base principal no se usa como ambiente de evaluacion.

Flujo por submission:

1. El worker recibe `{ submissionId }`.
2. Carga submission, challenge, schema, dataset y expected result desde PostgreSQL.
3. Marca la submission como `RUNNING`.
4. Crea un contenedor PostgreSQL temporal.
5. Espera que el contenedor este listo.
6. Aplica `SchemaScript`.
7. Carga `TestDataset`.
8. Ejecuta la query del estudiante con timeout.
9. Captura filas, columnas, tiempo y `EXPLAIN` cuando aplica.
10. Compara contra `ExpectedResult`.
11. Calcula score.
12. Invoca AI Assistant.
13. Persiste resultado final.
14. Destruye el contenedor temporal.

---

## 2. Servicios Docker Compose

| Servicio | Responsabilidad |
|----------|-----------------|
| `api` | API NestJS, Swagger, JWT, Prisma y producers BullMQ. |
| `worker` | Consumer BullMQ y orquestador del runner. |
| `postgres` | Base principal `sqljudge`. |
| `redis` | Cola BullMQ y cache de reportes. |
| Runner temporal | Contenedor PostgreSQL creado por el worker para una submission. |

El worker monta `/var/run/docker.sock` para crear y destruir contenedores temporales.

---

## 3. Levantar el stack

```bash
cp .env.example .env
docker compose up -d --build
```

Ver estado:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs -f worker
docker compose logs -f api
```

---

## 4. Variables relevantes

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Conexion Prisma a la base principal. |
| `REDIS_HOST` / `REDIS_PORT` | Conexion BullMQ. |
| `DOCKER_HOST` | Socket del daemon Docker. |
| `RUNNER_NETWORK` | Red para contenedores temporales. |
| `API_URL` | URL interna de la API para AI Assistant. |

---

## 5. Limites de recursos

| Proceso | Memoria | CPU |
|---------|---------|-----|
| PostgreSQL principal | 512 MB | 0.5 |
| Redis | 256 MB | 0.25 |
| API | 512 MB | 0.5 |
| Worker | 384 MB | 0.5 |
| Runner temporal | 512 MB | 0.5 |

El worker procesa hasta 2 submissions en paralelo.

---

## 6. Contrato `SqlExecutionResult`

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

Mapeo principal:

| Resultado runner | Status |
|------------------|--------|
| Correcto y esperado | `ACCEPTED` |
| Correcto pero con alerta critica IA | `OPTIMIZATION_REQUIRED` |
| Resultado diferente al esperado | `WRONG_ANSWER` |
| Error de sintaxis | `SYNTAX_ERROR` |
| Timeout | `TIME_LIMIT_EXCEEDED` |
| Error operativo | `RUNTIME_ERROR` |

---

## 7. Seguridad

- El runner nunca se conecta a la base principal como ambiente de ejecucion.
- Solo se aceptan consultas `SELECT` o `WITH ... SELECT`.
- Operaciones destructivas o administrativas se bloquean antes de encolar.
- El contenedor temporal se elimina en `finally`.
- Los resultados se comparan en memoria contra `ExpectedResult`.
- Si el runner falla, el worker persiste un estado terminal y mensaje de error.

---

## 8. Limpieza de contenedores huerfanos

Si Docker o el worker se detienen abruptamente:

```bash
docker ps -a --filter "name=sql-judge-eval-"
docker rm -f $(docker ps -a --filter "name=sql-judge-eval-" -q)
```

---

## 9. Troubleshooting

### El worker no puede conectarse a Docker

Verificar montaje:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:rw
```

### Submissions quedan en RUNNING

Reiniciar worker:

```bash
docker compose restart worker
```

Opcionalmente marcar submissions antiguas:

```bash
docker compose exec postgres psql -U sqljudge -d sqljudge \
  -c "UPDATE submissions SET status='RUNTIME_ERROR' WHERE status='RUNNING' AND \"updatedAt\" < NOW() - INTERVAL '5 minutes';"
```

### El asistente IA no responde

La evaluacion continua sin bloquearse. El score puede perder las dimensiones de calidad IA y la recomendacion no se persistira para esa corrida.
