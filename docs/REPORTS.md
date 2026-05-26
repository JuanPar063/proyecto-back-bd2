# Reports Module — SQL Judge

## Objetivo

El módulo de reportes permite consultar métricas académicas del sistema:
rendimiento por estudiante, desempeño por reto, resumen por curso y leaderboard.

## Endpoints

### GET /reports/students/:id

Retorna:
- retos resueltos,
- submissions totales,
- mejor tiempo,
- score promedio.

### GET /reports/challenges/:id

Retorna:
- tasa de éxito,
- mejor tiempo,
- dificultad real,
- submissions aceptados.

### GET /reports/courses/:id

Retorna:
- promedio del curso,
- top 5 estudiantes,
- retos más difíciles.

### GET /reports/leaderboard

Query params:
- courseId
- evaluationId

Retorna ranking agregado de estudiantes.

## Cache

Las consultas pesadas deben cachearse en Redis con TTL corto de 60 segundos.