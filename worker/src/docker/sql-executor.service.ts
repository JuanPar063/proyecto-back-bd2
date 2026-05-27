/**
 * ============================================================
 * sql-executor.service.ts — Ejecutor de queries SQL en contenedor
 * ============================================================
 * Responsable de:
 * - Conectar a PostgreSQL temporal
 * - Ejecutar DDL (CREATE TABLE)
 * - Ejecutar DML (INSERT/seed)
 * - Ejecutar query del estudiante
 * - Capturar resultados y tiempos
 * - Manejar errores SQL
 * ============================================================
 */

import { Client } from 'pg';
import { createLogger } from '../utils/logger';
import { SqlExecutionResult } from './types';

const logger = createLogger('SqlExecutor');

export class SqlExecutorService {
  private client: Client | null = null;

  /**
   * Conecta a PostgreSQL en el contenedor
   *
   * @param host - IP del contenedor
   * @param port - Puerto (5432)
   * @param database - Nombre de la DB (eval_db)
   * @param user - Usuario (eval_user)
   * @param password - Contraseña (eval_password)
   * @param timeout - Timeout de conexión (ms)
   */
  async connect(
    host: string,
    port: number = 5432,
    database: string = 'eval_db',
    user: string = 'eval_user',
    password: string = 'eval_password',
    timeout: number = 10000,
  ): Promise<void> {
    logger.info(`Conectando a PostgreSQL en ${host}:${port}/${database}...`);

    this.client = new Client({
      host,
      port,
      database,
      user,
      password,
      statement_timeout: timeout, // Timeout del lado servidor
      connectionTimeoutMillis: 10000, // Timeout de conexión
    });

    try {
      await this.client.connect();
      logger.success('Conectado a PostgreSQL ✓');
    } catch (error) {
      this.client = null;
      throw new Error(`No se pudo conectar a PostgreSQL: ${error}`);
    }
  }

  /**
   * Desconecta del cliente PostgreSQL
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
        logger.info('Desconectado de PostgreSQL');
      } catch (error) {
        logger.warn(`Error al desconectar: ${error}`);
      } finally {
        this.client = null;
      }
    }
  }

  /**
   * Ejecuta DDL (CREATE TABLE) del reto
   *
   * @param ddlSql - Sentencias SQL para crear tablas
   * @returns Tiempo de ejecución en ms
   */
  async executeDdl(ddlSql: string): Promise<number> {
    if (!this.client) {
      throw new Error('No hay conexión activa a PostgreSQL');
    }

    logger.info('Ejecutando DDL (schema)...');
    const startTime = Date.now();

    try {
      await this.client.query(ddlSql);
      const executionTime = Date.now() - startTime;
      logger.success(`DDL ejecutado en ${executionTime}ms`);
      return executionTime;
    } catch (error) {
      throw new Error(`Error ejecutando DDL: ${error}`);
    }
  }

  /**
   * Ejecuta DML (INSERT/seed) para poblar las tablas
   *
   * @param seedSql - Sentencias SQL para insertar datos
   * @returns Tiempo de ejecución en ms
   */
  async executeSeed(seedSql: string): Promise<number> {
    if (!this.client) {
      throw new Error('No hay conexión activa a PostgreSQL');
    }

    if (!seedSql || seedSql.trim().length === 0) {
      logger.info('No hay seed SQL, saltando...');
      return 0;
    }

    logger.info('Ejecutando seed (inserts)...');
    const startTime = Date.now();

    try {
      await this.client.query(seedSql);
      const executionTime = Date.now() - startTime;
      logger.success(`Seed ejecutado en ${executionTime}ms`);
      return executionTime;
    } catch (error) {
      throw new Error(`Error ejecutando seed: ${error}`);
    }
  }

  /**
   * Ejecuta la query del estudiante
   * CRÍTICO: medir tiempo exacto de ejecución
   *
   * @param query - Query SQL del estudiante
   * @param timeout - Timeout específico para esta query (ms)
   * @returns Resultado con rows, columnas, tiempo de ejecución
   */
  async executeQuery(query: string, timeout: number = 5000): Promise<SqlExecutionResult> {
    if (!this.client) {
      throw new Error('No hay conexión activa a PostgreSQL');
    }

    logger.info(`Ejecutando query del estudiante (timeout: ${timeout}ms)...`);
    logger.debug(`Query: ${query.substring(0, 200)}...`);

    const startTime = Date.now();

    try {
      // Establece timeout para esta query específica
      await this.client.query(`SET statement_timeout TO ${timeout}`);

      // FIX P1: capturar plan estimado ANTES de ejecutar la query real.
      // Usamos EXPLAIN sin ANALYZE para no doblar el tiempo de ejecución.
      // Si el EXPLAIN falla (ej. query con DML), seguimos sin él — no es fatal.
      let explainPlan: string | null = null;
      try {
        const explainRes = await this.client.query(
          `EXPLAIN (FORMAT JSON) ${query}`,
        );
        explainPlan = JSON.stringify(explainRes.rows[0]?.['QUERY PLAN'] ?? null);
      } catch (explainErr) {
        logger.debug(`EXPLAIN falló (no fatal): ${explainErr}`);
      }

      // Ejecuta la query del estudiante y mide su tiempo real (sin contar el EXPLAIN)
      const queryStartTime = Date.now();
      const result = await this.client.query(query);
      const executionTimeMs = Date.now() - queryStartTime;

      logger.success(
        `Query ejecutada en ${executionTimeMs}ms (${result.rows.length} filas, ${result.fields.length} columnas)`,
      );

      return {
        success: true,
        rows: result.rows,
        rowCount: result.rows.length,
        columns: result.fields.map((f: any) => f.name),
        executionTimeMs,
        explainPlan,
      };
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;

      // Detecta tipo de error
      if (
        error.code === 'QUERY_CANCELLED' ||
        error.message.includes('timeout') ||
        error.message.includes('Execution time out')
      ) {
        logger.warn(`Query excedió timeout (${executionTimeMs}ms)`);
        return {
          success: false,
          rows: [],
          rowCount: 0,
          columns: [],
          executionTimeMs,
          error: 'TIME_LIMIT_EXCEEDED',
        };
      }

      // Errores SQL sintácticos
      if (error.code === 'SYNTAX_ERROR' || error.severity === 'ERROR') {
        logger.warn(`Error SQL: ${error.message}`);
        return {
          success: false,
          rows: [],
          rowCount: 0,
          columns: [],
          executionTimeMs,
          error: `SYNTAX_ERROR: ${error.message}`,
        };
      }

      // Otros errores
      logger.error(`Error ejecutando query: ${error.message}`);
      return {
        success: false,
        rows: [],
        rowCount: 0,
        columns: [],
        executionTimeMs,
        error: `RUNTIME_ERROR: ${error.message}`,
      };
    }
  }

  /**
   * Ejecuta todas las fases en orden: DDL + Seed + Query
   * Esto es lo que el worker llamará
   *
   * @param ddl - CREATE TABLE ...
   * @param seed - INSERT statements
   * @param query - SELECT del estudiante
   * @param timeout - Timeout total
   * @returns Resultado de la ejecución
   */
  async executeFullPipeline(
    ddl: string,
    seed: string | undefined,
    query: string,
    timeout: number = 5000,
  ): Promise<SqlExecutionResult> {
    logger.info('Iniciando pipeline completo de SQL...');

    try {
      // 1. DDL
      await this.executeDdl(ddl);

      // 2. Seed
      if (seed) {
        await this.executeSeed(seed);
      }

      // 3. Query estudiante
      const result = await this.executeQuery(query, timeout);

      if (!result.success) {
        logger.warn(`Query no fue exitosa: ${result.error}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error en pipeline: ${error}`);
      return {
        success: false,
        rows: [],
        rowCount: 0,
        columns: [],
        executionTimeMs: 0,
        error: `Pipeline error: ${error}`,
      };
    }
  }

  /**
   * Ejecuta una query de diagnóstico (para debugging)
   * Útil para verificar que PostgreSQL está correctamente configurado
   */
  async diagnose(): Promise<string> {
    if (!this.client) {
      throw new Error('No hay conexión activa');
    }

    try {
      const versionResult = await this.client.query('SELECT version()');
      const dbsResult = await this.client.query(
        "SELECT datname FROM pg_database WHERE datname NOT LIKE 'template%' ORDER BY datname",
      );

      return `PostgreSQL Version: ${versionResult.rows[0].version}\nDatabases: ${dbsResult.rows.map((r: any) => r.datname).join(', ')}`;
    } catch (error) {
      return `Error en diagnóstico: ${error}`;
    }
  }
}

// Singleton
export const sqlExecutorService = new SqlExecutorService();
