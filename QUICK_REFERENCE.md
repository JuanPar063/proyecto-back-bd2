# Quick Reference - SQL Judge

## Comandos

```bash
npm run build
npm run test
npm run docker:up
npm run docker:down
npm run docker:logs
npm run prisma:seed
npm run prisma:studio
```

Worker local:

```bash
npm run worker:dev
```

Docker:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose logs -f worker
```

## URLs

| Recurso | URL |
|---------|-----|
| API | http://localhost:3000/api |
| Swagger | http://localhost:3000/docs |
| Health | http://localhost:3000/api/health |

## Flujo minimo

1. Crear usuario profesor y estudiante.
2. Crear curso.
3. Inscribir estudiante.
4. Crear reto SQL.
5. Cargar schema.
6. Cargar o generar test data.
7. Cargar expected result.
8. Publicar reto.
9. Enviar submission.
10. Revisar logs del worker.
11. Consultar submission final.
12. Consultar recomendaciones, reportes y leaderboard.

## Colas

| Cola | Uso |
|------|-----|
| `submissions` | Jobs de evaluacion SQL. |
| `failed-submissions` | Jobs agotados para revision administrativa. |

## Estados

Challenge:

```text
draft -> published -> archived
draft -> archived
```

Submission:

```text
QUEUED -> RUNNING -> ACCEPTED
                  -> WRONG_ANSWER
                  -> SYNTAX_ERROR
                  -> TIME_LIMIT_EXCEEDED
                  -> RUNTIME_ERROR
                  -> OPTIMIZATION_REQUIRED
```

## Runner Docker

El worker crea un contenedor PostgreSQL temporal por submission:

- 512 MB de memoria.
- 0.5 CPU.
- Timeout por query.
- Schema y test data aislados.
- Cleanup al finalizar.

La base principal no ejecuta SQL de estudiantes.

## Documentacion

- `README.md`: guia principal.
- `docs/ARCHITECTURE.md`: arquitectura y Mermaid.
- `docs/CONTRACTS.md`: contratos finales.
- `docs/RUNNER.md`: worker y runner.
- `docs/AI_ASSISTANT.md`: recomendaciones.
- `docs/REPORTS.md`: reportes y leaderboard.
