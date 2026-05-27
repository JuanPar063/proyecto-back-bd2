/**
 * ============================================================
 * docker.service.ts — Servicio de gestión de contenedores Docker
 * ============================================================
 * Responsable de:
 * - Conectar al daemon de Docker
 * - Crear/destruir contenedores PostgreSQL temporales
 * - Gestionar cleanup en caso de errores
 * ============================================================
 */
import Docker from 'dockerode';
import { createLogger } from '../utils/logger';
import { ContainerConfig } from './types';

const logger = createLogger('DockerService');

export class DockerService {
  private docker: Docker;
  private activeContainers: Map<string, string> = new Map(); // submissionId -> containerId

  constructor() {
    // Conecta al daemon de Docker via socket Unix (default: /var/run/docker.sock)
    // En Docker, la variable DOCKER_HOST controla esto
    this.docker = new Docker({
      socketPath:
        process.env.DOCKER_SOCKET_PATH ||
        (process.env.DOCKER_HOST?.replace('unix://', '') ?? '/var/run/docker.sock'),
    });
  }

  /**
   * Crea un contenedor PostgreSQL temporal con la configuración especificada
   *
   * @param submissionId - ID único del submission (usado como identificador)
   * @param resourceLimits - Límites de recursos (memoria, CPUs, timeout)
   * @returns ID del contenedor creado
   */
  async createPostgresContainer(
    submissionId: string,
    resourceLimits: ContainerConfig,
  ): Promise<string> {
    const containerName = `sql-judge-eval-${submissionId}`;
    logger.info(`Creando contenedor PostgreSQL: ${containerName}`);

    try {
      // Verifica que la imagen postgres:16 esté disponible
      // Si no, intenta descargarla
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
          // Límites de recursos: 512MB de RAM, 0.5 CPUs
          Memory: resourceLimits.memory,
          MemorySwap: resourceLimits.memory, // Evita swap
          CpuQuota: Math.round(resourceLimits.cpus * 100000),
          CpuPeriod: 100000,
          // Reinicia automáticamente si falla (máximo 3 intentos)
          RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 0 },
          // El contenedor temporal debe vivir en la misma red del worker
          // para que el TCP healthcheck pueda alcanzarlo; si no se setea,
          // cae en la red `bridge` por defecto (aislada del worker).
          NetworkMode: process.env.RUNNER_NETWORK || undefined,
        },
        Healthcheck: {
          Test: [
            'CMD-SHELL',
            "pg_isready -U eval_user -d eval_db || exit 1",
          ],
          Interval: 1000000000, // 1 segundo en nanosegundos
          Timeout: 500000000, // 0.5 segundos
          Retries: 5,
          StartPeriod: 2000000000, // 2 segundos grace period
        },
      });

      const containerId = (container as any).id;
      this.activeContainers.set(submissionId, containerId);

      // Inicia el contenedor
      const containerInstance = this.docker.getContainer(containerId);
      await containerInstance.start();
      logger.info(`Contenedor iniciado: ${containerId.substring(0, 12)}`);

      return containerId;
    } catch (error) {
      logger.error(`Error al crear contenedor: ${error}`);
      throw new Error(`No se pudo crear contenedor PostgreSQL: ${error}`);
    }
  }

  /**
   * Espera hasta que PostgreSQL esté listo para aceptar conexiones
   * Implementa retry con backoff exponencial
   *
   * @param containerId - ID del contenedor
   * @param maxRetries - Máximo número de intentos
   * @param timeout - Tiempo máximo de espera total (ms)
   */
  async waitForPostgresReady(
    containerId: string,
    maxRetries: number = 30,
    timeout: number = 60000,
  ): Promise<void> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    logger.info(`Esperando a que PostgreSQL esté listo (${maxRetries} intentos, ${timeout}ms timeout)`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Verifica si se acabó el timeout global
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `PostgreSQL no estuvo listo en ${timeout}ms. Último error: ${lastError?.message}`,
        );
      }

      try {
        const container = this.docker.getContainer(containerId);
        const inspectData = await container.inspect();

        // Verifica el estado health check del contenedor
        const health = inspectData.State?.Health;
        if (health?.Status === 'healthy') {
          logger.success('PostgreSQL está listo ✓');
          return;
        }

        logger.debug(`Health check (intento ${attempt + 1}): ${health?.Status}`);
      } catch (error) {
        lastError = error as Error;
        logger.debug(`Error inspeccionando contenedor: ${lastError.message}`);
      }

      // Backoff exponencial: 200ms, 400ms, 800ms, ...
      const delayMs = Math.min(200 * Math.pow(2, Math.min(attempt / 3, 3)), 5000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(
      `PostgreSQL nunca se volvió healthy después de ${maxRetries} intentos. Último error: ${lastError?.message}`,
    );
  }

  /**
   * Obtiene la dirección IP del contenedor para conectarse desde el host
   *
   * @param containerId - ID del contenedor
   * @returns Dirección IP
   */
  async getContainerIp(containerId: string): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const inspectData = await container.inspect();
    
    // Intenta obtener IP de NetworkSettings
    let ip: string | undefined;
    
    // Intenta IPv4Address primero
    const networkSettings = (inspectData as any).NetworkSettings;
    if (networkSettings?.IPv4Address) {
      ip = networkSettings.IPv4Address;
    } else if (networkSettings?.IPAddress) {
      ip = networkSettings.IPAddress;
    } else if (networkSettings?.Networks) {
      // Si está en Networks (docker networks)
      const firstNetwork = Object.values(networkSettings.Networks)[0] as any;
      ip = firstNetwork?.IPAddress;
    }

    if (!ip) {
      throw new Error('No se pudo obtener IP del contenedor');
    }

    logger.debug(`IP del contenedor: ${ip}`);
    return ip;
  }

  /**
   * Destruye un contenedor de forma segura
   * Se ejecuta al finalizar (siempre, incluso en errores)
   *
   * @param submissionId - ID del submission
   * @param force - Forzar detención (kill) si es necesario
   */
  async destroyContainer(submissionId: string, force: boolean = true): Promise<void> {
    const containerId = this.activeContainers.get(submissionId);

    if (!containerId) {
      logger.warn(`No hay contenedor activo para submission ${submissionId}`);
      return;
    }

    logger.info(`Destruyendo contenedor: ${containerId.substring(0, 12)}`);

    try {
      const container = this.docker.getContainer(containerId);

      // Intenta detener el contenedor gracefully
      try {
        await container.stop({ t: 5 }); // 5 segundos timeout
        logger.debug('Contenedor detenido');
      } catch (stopError) {
        if (force) {
          logger.warn('Forzando kill del contenedor...');
          await container.kill();
        } else {
          throw stopError;
        }
      }

      // Elimina el contenedor
      await container.remove({ v: true }); // v: true elimina volúmenes asociados
      this.activeContainers.delete(submissionId);
      logger.success('Contenedor eliminado');
    } catch (error) {
      logger.error(`Error al destruir contenedor: ${error}`);
      // No relanzar error aquí — cleanup siempre debe intentarse, incluso si falla
    }
  }

  /**
   * Ejecuta un comando en el contenedor
   * Útil para debugging
   *
   * @param containerId - ID del contenedor
   * @param command - Comando a ejecutar (ej: ['psql', '-U', 'user', '-c', 'SELECT 1'])
   */
  async executeCommand(
    containerId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string }> {
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

      stream.on('data', (chunk: any) => {
        stdout += chunk.toString();
      });

      stream.on('error', (error: any) => {
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

  /**
   * Verifica que una imagen Docker esté disponible
   * Si no está, intenta descargarla
   *
   * @param imageName - Nombre de la imagen (ej: 'postgres:16-alpine')
   */
  private async ensureImageExists(imageName: string): Promise<void> {
    try {
      // Intenta obtener la imagen
      const image = this.docker.getImage(imageName);
      await image.inspect();
      logger.debug(`Imagen ${imageName} ya está disponible`);
    } catch (error) {
      logger.info(`Descargando imagen ${imageName}...`);
      try {
        await new Promise<void>((resolve, reject) => {
          this.docker.pull(imageName, (error: any, stream: any) => {
            if (error) return reject(error);

            stream.on('data', () => {
              // Procesa líneas de progreso del pull
            });
            stream.on('end', () => resolve());
            stream.on('error', reject);
          });
        });
        logger.success(`Imagen ${imageName} descargada`);
      } catch (pullError) {
        throw new Error(`No se pudo descargar imagen ${imageName}: ${pullError}`);
      }
    }
  }

  /**
   * Obtiene estadísticas del contenedor (CPU, memoria)
   * Útil para monitoreo
   */
  async getContainerStats(containerId: string): Promise<any> {
    try {
      const container = this.docker.getContainer(containerId);
      return await container.stats({ stream: false });
    } catch (error) {
      logger.error(`Error obteniendo stats: ${error}`);
      return null;
    }
  }

  /**
   * Cleanup: destruye todos los contenedores activos
   * Llamar en shutdown graceful
   */
  async cleanupAllContainers(): Promise<void> {
    logger.info(`Limpiando ${this.activeContainers.size} contenedores activos...`);

    for (const [submissionId, _] of this.activeContainers) {
      await this.destroyContainer(submissionId, true);
    }

    this.activeContainers.clear();
    logger.success('Cleanup completado');
  }
}

// Singleton
export const dockerService = new DockerService();
