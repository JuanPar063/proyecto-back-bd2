"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlExecutorService = exports.SqlExecutorService = void 0;
const pg_1 = require("pg");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('SqlExecutor');
class SqlExecutorService {
    client = null;
    async connect(host, port = 5432, database = 'eval_db', user = 'eval_user', password = 'eval_password', timeout = 10000) {
        logger.info(`Conectando a PostgreSQL en ${host}:${port}/${database}...`);
        this.client = new pg_1.Client({
            host,
            port,
            database,
            user,
            password,
            statement_timeout: timeout,
            connectionTimeoutMillis: 10000,
        });
        try {
            await this.client.connect();
            logger.success('Conectado a PostgreSQL ✓');
        }
        catch (error) {
            this.client = null;
            throw new Error(`No se pudo conectar a PostgreSQL: ${error}`);
        }
    }
    async disconnect() {
        if (this.client) {
            try {
                await this.client.end();
                logger.info('Desconectado de PostgreSQL');
            }
            catch (error) {
                logger.warn(`Error al desconectar: ${error}`);
            }
            finally {
                this.client = null;
            }
        }
    }
    async executeDdl(ddlSql) {
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
        }
        catch (error) {
            throw new Error(`Error ejecutando DDL: ${error}`);
        }
    }
    async executeSeed(seedSql) {
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
        }
        catch (error) {
            throw new Error(`Error ejecutando seed: ${error}`);
        }
    }
    async executeQuery(query, timeout = 5000) {
        if (!this.client) {
            throw new Error('No hay conexión activa a PostgreSQL');
        }
        logger.info(`Ejecutando query del estudiante (timeout: ${timeout}ms)...`);
        logger.debug(`Query: ${query.substring(0, 200)}...`);
        const startTime = Date.now();
        try {
            await this.client.query(`SET statement_timeout TO ${timeout}`);
            let explainPlan = null;
            try {
                const explainRes = await this.client.query(`EXPLAIN (FORMAT JSON) ${query}`);
                explainPlan = JSON.stringify(explainRes.rows[0]?.['QUERY PLAN'] ?? null);
            }
            catch (explainErr) {
                logger.debug(`EXPLAIN falló (no fatal): ${explainErr}`);
            }
            const queryStartTime = Date.now();
            const result = await this.client.query(query);
            const executionTimeMs = Date.now() - queryStartTime;
            logger.success(`Query ejecutada en ${executionTimeMs}ms (${result.rows.length} filas, ${result.fields.length} columnas)`);
            return {
                success: true,
                rows: result.rows,
                rowCount: result.rows.length,
                columns: result.fields.map((f) => f.name),
                executionTimeMs,
                explainPlan,
            };
        }
        catch (error) {
            const executionTimeMs = Date.now() - startTime;
            if (error.code === 'QUERY_CANCELLED' ||
                error.message.includes('timeout') ||
                error.message.includes('Execution time out')) {
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
    async executeFullPipeline(ddl, seed, query, timeout = 5000) {
        logger.info('Iniciando pipeline completo de SQL...');
        try {
            await this.executeDdl(ddl);
            if (seed) {
                await this.executeSeed(seed);
            }
            const result = await this.executeQuery(query, timeout);
            if (!result.success) {
                logger.warn(`Query no fue exitosa: ${result.error}`);
            }
            return result;
        }
        catch (error) {
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
    async diagnose() {
        if (!this.client) {
            throw new Error('No hay conexión activa');
        }
        try {
            const versionResult = await this.client.query('SELECT version()');
            const dbsResult = await this.client.query("SELECT datname FROM pg_database WHERE datname NOT LIKE 'template%' ORDER BY datname");
            return `PostgreSQL Version: ${versionResult.rows[0].version}\nDatabases: ${dbsResult.rows.map((r) => r.datname).join(', ')}`;
        }
        catch (error) {
            return `Error en diagnóstico: ${error}`;
        }
    }
}
exports.SqlExecutorService = SqlExecutorService;
exports.sqlExecutorService = new SqlExecutorService();
//# sourceMappingURL=sql-executor.service.js.map