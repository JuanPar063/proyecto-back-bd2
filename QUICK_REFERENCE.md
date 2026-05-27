# 🚀 Quick Reference — SQL Judge Docker Runner

## 📦 Comandos Básicos

```bash
# Build todo el proyecto
npm run build

# Compilar solo worker
npm run build:worker

# Ejecutar worker en desarrollo (local)
npm run worker:dev

# Docker Compose
docker compose up -d              # Levantar en background
docker compose up --build         # Rebuild
docker compose logs -f worker     # Ver logs del worker
docker compose down               # Bajar todo
docker compose restart worker     # Reiniciar worker
docker compose ps                 # Ver servicios corriendo
```

## 🗂️ Estructura de Archivos

```
worker/src/
├── docker/
│   ├── types.ts                  # Interfaces + enums
│   ├── docker.service.ts         # Container management
│   ├── postgres-health.service.ts # Health check (CRÍTICO)
│   └── sql-executor.service.ts   # Ejecutar SQL
├── evaluation/
│   ├── result-comparator.ts      # Comparar resultados
│   └── score-calculator.ts       # Score 60-15-10
├── utils/
│   └── logger.ts                 # Logging
└── main.ts                       # Worker principal (9 fases)

prisma/
├── schema.prisma                 # ACTUALIZADO con expectedResult
└── migrations/
    └── 20260526000000_add_expected_result.../ # Nueva migración
```

## 🔑 Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `schema.prisma` | +expectedResult en Challenge, +scoreBreakdown/resultData en Submission |
| `docker-compose.yml` | +DOCKER_HOST env, +docker.sock volume |
| `worker/src/main.ts` | Reescrito completamente (9 fases) |
| `package.json` | +dockerode +pg +types/* |

## 🐳 Docker Runner: 9 Fases

```
1. Obtener contexto evaluación
2. Crear contenedor PostgreSQL temporal
3. Esperar PostgreSQL listo (TCP + health check)
4. Conectar y ejecutar: DDL → Seed → Query
5. Verificar errores SQL
6. Comparar resultados
7. Calcular score (60% + 15% + 10%)
8. Guardar en DB
9. CLEANUP: Destruir contenedor
```

## 📊 Scoring

```
Correctness (60 pts)
├─ Exact match: 60 pts
├─ Partial: < 60 pts (proporcional a confianza)
└─ Wrong: 0 pts

Execution Time (15 pts)
├─ 0-50% timeLimit: 15 pts
├─ 50-100%: 10 pts
├─ 100-150%: 5 pts
└─ >150%: 0 pts

SQL Practices (10 pts)
├─ No SELECT *: 2 pts
├─ WHERE clause: 2 pts
├─ Buen formatting: 2 pts
├─ Sin UNION: 1 pt
├─ Estructura OK: 1 pt
└─ GROUP BY: 2 pts
```

## 🔍 Debugging

```bash
# Ver logs filtrados
docker compose logs worker | grep ERROR

# Buscar submission específico
docker compose logs worker | grep "sub-xxx"

# Listar contenedores eval
docker ps | grep sql-judge-eval

# Conectar a contenedor para debugging
docker exec -it [container-name] psql -U eval_user -d eval_db

# Ejecutar query en contenedor
docker exec [container-id] psql -U eval_user -d eval_db -c "SELECT 1"

# Destruir contenedor manualmente
docker kill [container-id] && docker rm [container-id]
```

## 💾 Base de Datos

```sql
-- Ver submissions recientes
SELECT id, status, score, executionTimeMs, createdAt 
FROM submissions 
ORDER BY createdAt DESC LIMIT 10;

-- Ver detalles de un submission
SELECT * FROM submissions WHERE id = 'xxx';

-- Ver scoreBreakdown JSON
SELECT id, scoreBreakdown FROM submissions WHERE status = 'ACCEPTED';

-- Ver resultData (resultado de la query)
SELECT id, resultData FROM submissions LIMIT 1;
```

## ⚠️ Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| "Can't reach database server" | PostgreSQL no está corriendo | `docker compose up postgres -d` |
| "PostgreSQL no estuvo listo" | Health check timeout | Aumentar `maxRetries` o verificar recursos |
| "Docker daemon not reachable" | Permisos en docker.sock | `sudo chmod 666 /var/run/docker.sock` |
| "IP del contenedor no encontrada" | Network issue | `docker compose down -v && docker compose up` |
| "Submission cuelga" | Contenedor stuck | `docker kill [container]` |

## 📋 Checklist Pre-Deploy

- [ ] `npm run build` pasa sin errores
- [ ] PostgreSQL está en docker-compose.yml
- [ ] `DOCKER_HOST` env variable en worker
- [ ] `/var/run/docker.sock` volumen configurado
- [ ] `expectedResult` en Challenge para test
- [ ] `seedData` o TestDataset configurado
- [ ] Logs visibles: `docker compose logs -f worker`
- [ ] Prueba end-to-end: enviar submission y verificar

## 🚀 Deployment Checklist

```bash
# 1. Build
npm run build

# 2. Up con rebuild
docker compose up -d --build

# 3. Verify services
docker compose ps
# Debe mostrar: postgres, redis, api, worker todos "Up"

# 4. Check worker logs
docker compose logs worker | head -20

# 5. Send test submission via API
curl -X POST http://localhost:3000/api/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [token]" \
  -d '{"challengeId":"xxx","query":"SELECT 1"}'

# 6. Monitor worker
docker compose logs -f worker
```

## 🔐 Environment Variables

```env
# redis
REDIS_HOST=redis
REDIS_PORT=6379

# postgres
DATABASE_URL=postgresql://sqljudge:password@postgres:5432/sqljudge?schema=public

# docker (para worker)
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_SOCKET_PATH=/var/run/docker.sock
```

## 📞 Support

1. Revisar logs: `docker compose logs -f worker`
2. Buscar archivo: [DOCKER_RUNNER_IMPLEMENTATION.md](./DOCKER_RUNNER_IMPLEMENTATION.md)
3. Debugging: Ejecutar en `worker:dev` localmente
