adr 015
# ADR-015 — Leaderboard basado en submissions persistidos

## Estado

Adoptado

## Contexto

El leaderboard debe reflejar resultados académicos auditables.

## Decisión

Calcular el leaderboard desde submissions persistidos y no desde resultados temporales del runner.

## Consecuencias

- El ranking es reproducible.
- Se evita depender de contenedores temporales.
- Los datos pueden auditarse desde PostgreSQL.