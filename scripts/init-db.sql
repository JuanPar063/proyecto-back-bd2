-- ============================================================
-- Inicialización de PostgreSQL para SQL Judge
-- Crea la base "sqljudge_eval" usada para evaluaciones temporales
-- (la usará el Runner SQL en Entrega 2).
-- ============================================================
SELECT 'CREATE DATABASE sqljudge_eval'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sqljudge_eval')\gexec
