"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.postgresHealthCheckService = exports.PostgresHealthCheckService = void 0;
const net = __importStar(require("net"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('PostgresHealthCheck');
class PostgresHealthCheckService {
    async waitForPostgresReady(host, port = 5432, maxAttempts = 30, totalTimeout = 60000) {
        const startTime = Date.now();
        let lastError = null;
        logger.info(`Esperando PostgreSQL en ${host}:${port} (${maxAttempts} intentos, ${totalTimeout}ms)`);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime > totalTimeout) {
                logger.error(`PostgreSQL no estuvo listo en ${totalTimeout}ms. Último error: ${lastError?.message}`);
                return false;
            }
            try {
                const result = await this.checkTcpConnection(host, port);
                if (result.ready) {
                    logger.success(`PostgreSQL está listo ✓ (intento ${attempt + 1}, ${result.responseTime}ms)`);
                    return true;
                }
            }
            catch (error) {
                lastError = error;
                logger.debug(`Intento ${attempt + 1}: ${lastError.message} (${Date.now() - startTime}ms elapsed)`);
            }
            const delayMs = Math.min(100 * Math.pow(2, attempt / 4), 5000);
            logger.debug(`Esperando ${delayMs.toFixed(0)}ms antes del próximo intento...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        logger.error(`PostgreSQL nunca respondió después de ${maxAttempts} intentos en ${Date.now() - startTime}ms`);
        return false;
    }
    async checkTcpConnection(host, port) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const socket = new net.Socket();
            let connectionEstablished = false;
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error(`TCP connection timeout (${3000}ms)`));
            }, 3000);
            socket.on('connect', () => {
                connectionEstablished = true;
                clearTimeout(timeout);
                socket.destroy();
                const responseTime = Date.now() - startTime;
                resolve({
                    ready: true,
                    responseTime,
                    details: `PostgreSQL escuchando en ${host}:${port}`,
                });
            });
            socket.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            socket.connect(port, host);
        });
    }
    async checkPostgresReady(host, port = 5432, user = 'eval_user', database = 'eval_db', password = 'eval_password') {
        try {
            logger.debug('Usando TCP check en lugar de query SQL');
            return await this.waitForPostgresReady(host, port);
        }
        catch (error) {
            logger.error(`Error en PostgreSQL ready check: ${error}`);
            return false;
        }
    }
}
exports.PostgresHealthCheckService = PostgresHealthCheckService;
exports.postgresHealthCheckService = new PostgresHealthCheckService();
//# sourceMappingURL=postgres-health.service.js.map