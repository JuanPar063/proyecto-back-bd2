"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dockerService = exports.DockerService = void 0;
const dockerode_1 = __importDefault(require("dockerode"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('DockerService');
class DockerService {
    docker;
    activeContainers = new Map();
    constructor() {
        this.docker = new dockerode_1.default({
            socketPath: process.env.DOCKER_SOCKET_PATH ||
                (process.env.DOCKER_HOST?.replace('unix://', '') ?? '/var/run/docker.sock'),
        });
    }
    async createPostgresContainer(submissionId, resourceLimits) {
        const containerName = `sql-judge-eval-${submissionId}`;
        logger.info(`Creando contenedor PostgreSQL: ${containerName}`);
        try {
            await this.ensureImageExists('postgres:16');
            const container = await this.docker.createContainer({
                Image: 'postgres:16-alpine',
                name: containerName,
                Hostname: 'postgres-eval',
                Env: [
                    'POSTGRES_USER=eval_user',
                    'POSTGRES_PASSWORD=eval_password',
                    'POSTGRES_DB=eval_db',
                    'POSTGRES_INITDB_ARGS=-c log_statement=none',
                ],
                HostConfig: {
                    Memory: resourceLimits.memory,
                    MemorySwap: resourceLimits.memory,
                    CpuQuota: Math.round(resourceLimits.cpus * 100000),
                    CpuPeriod: 100000,
                    RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 0 },
                    NetworkMode: process.env.RUNNER_NETWORK || undefined,
                },
                Healthcheck: {
                    Test: [
                        'CMD-SHELL',
                        "pg_isready -U eval_user -d eval_db || exit 1",
                    ],
                    Interval: 1000000000,
                    Timeout: 500000000,
                    Retries: 5,
                    StartPeriod: 2000000000,
                },
            });
            const containerId = container.id;
            this.activeContainers.set(submissionId, containerId);
            const containerInstance = this.docker.getContainer(containerId);
            await containerInstance.start();
            logger.info(`Contenedor iniciado: ${containerId.substring(0, 12)}`);
            return containerId;
        }
        catch (error) {
            logger.error(`Error al crear contenedor: ${error}`);
            throw new Error(`No se pudo crear contenedor PostgreSQL: ${error}`);
        }
    }
    async waitForPostgresReady(containerId, maxRetries = 30, timeout = 60000) {
        const startTime = Date.now();
        let lastError = null;
        logger.info(`Esperando a que PostgreSQL esté listo (${maxRetries} intentos, ${timeout}ms timeout)`);
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (Date.now() - startTime > timeout) {
                throw new Error(`PostgreSQL no estuvo listo en ${timeout}ms. Último error: ${lastError?.message}`);
            }
            try {
                const container = this.docker.getContainer(containerId);
                const inspectData = await container.inspect();
                const health = inspectData.State?.Health;
                if (health?.Status === 'healthy') {
                    logger.success('PostgreSQL está listo ✓');
                    return;
                }
                logger.debug(`Health check (intento ${attempt + 1}): ${health?.Status}`);
            }
            catch (error) {
                lastError = error;
                logger.debug(`Error inspeccionando contenedor: ${lastError.message}`);
            }
            const delayMs = Math.min(200 * Math.pow(2, Math.min(attempt / 3, 3)), 5000);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        throw new Error(`PostgreSQL nunca se volvió healthy después de ${maxRetries} intentos. Último error: ${lastError?.message}`);
    }
    async getContainerIp(containerId) {
        const container = this.docker.getContainer(containerId);
        const inspectData = await container.inspect();
        let ip;
        const networkSettings = inspectData.NetworkSettings;
        if (networkSettings?.IPv4Address) {
            ip = networkSettings.IPv4Address;
        }
        else if (networkSettings?.IPAddress) {
            ip = networkSettings.IPAddress;
        }
        else if (networkSettings?.Networks) {
            const firstNetwork = Object.values(networkSettings.Networks)[0];
            ip = firstNetwork?.IPAddress;
        }
        if (!ip) {
            throw new Error('No se pudo obtener IP del contenedor');
        }
        logger.debug(`IP del contenedor: ${ip}`);
        return ip;
    }
    async destroyContainer(submissionId, force = true) {
        const containerId = this.activeContainers.get(submissionId);
        if (!containerId) {
            logger.warn(`No hay contenedor activo para submission ${submissionId}`);
            return;
        }
        logger.info(`Destruyendo contenedor: ${containerId.substring(0, 12)}`);
        try {
            const container = this.docker.getContainer(containerId);
            try {
                await container.stop({ t: 5 });
                logger.debug('Contenedor detenido');
            }
            catch (stopError) {
                if (force) {
                    logger.warn('Forzando kill del contenedor...');
                    await container.kill();
                }
                else {
                    throw stopError;
                }
            }
            await container.remove({ v: true });
            this.activeContainers.delete(submissionId);
            logger.success('Contenedor eliminado');
        }
        catch (error) {
            logger.error(`Error al destruir contenedor: ${error}`);
        }
    }
    async executeCommand(containerId, command) {
        const container = this.docker.getContainer(containerId);
        const exec = await container.exec({
            Cmd: command,
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({ Detach: false });
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            stream.on('data', (chunk) => {
                stdout += chunk.toString();
            });
            stream.on('error', (error) => {
                stderr += error.toString();
            });
            stream.on('end', () => {
                resolve({ stdout, stderr });
            });
            setTimeout(() => {
                reject(new Error('Command execution timeout'));
            }, 5000);
        });
    }
    async ensureImageExists(imageName) {
        try {
            const image = this.docker.getImage(imageName);
            await image.inspect();
            logger.debug(`Imagen ${imageName} ya está disponible`);
        }
        catch (error) {
            logger.info(`Descargando imagen ${imageName}...`);
            try {
                await new Promise((resolve, reject) => {
                    this.docker.pull(imageName, (error, stream) => {
                        if (error)
                            return reject(error);
                        stream.on('data', () => {
                        });
                        stream.on('end', () => resolve());
                        stream.on('error', reject);
                    });
                });
                logger.success(`Imagen ${imageName} descargada`);
            }
            catch (pullError) {
                throw new Error(`No se pudo descargar imagen ${imageName}: ${pullError}`);
            }
        }
    }
    async getContainerStats(containerId) {
        try {
            const container = this.docker.getContainer(containerId);
            return await container.stats({ stream: false });
        }
        catch (error) {
            logger.error(`Error obteniendo stats: ${error}`);
            return null;
        }
    }
    async cleanupAllContainers() {
        logger.info(`Limpiando ${this.activeContainers.size} contenedores activos...`);
        for (const [submissionId, _] of this.activeContainers) {
            await this.destroyContainer(submissionId, true);
        }
        this.activeContainers.clear();
        logger.success('Cleanup completado');
    }
}
exports.DockerService = DockerService;
exports.dockerService = new DockerService();
//# sourceMappingURL=docker.service.js.map