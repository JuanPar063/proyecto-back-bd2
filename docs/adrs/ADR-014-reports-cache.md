adr 014
# ADR-014 — Cache para reportes pesados

## Estado

Adoptado

## Contexto

Los reportes y leaderboards pueden requerir agregaciones sobre muchas submissions.

## Decisión

Cachear consultas pesadas en Redis con TTL corto de 60 segundos.

## Consecuencias

- Reduce carga sobre PostgreSQL.
- Los datos pueden tener retraso máximo de 60 segundos.
- Se mantiene suficiente frescura para uso académico.