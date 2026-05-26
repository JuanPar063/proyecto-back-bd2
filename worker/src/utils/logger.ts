/**
 * ============================================================
 * logger.ts — Logging con contexto
 * ============================================================
 */

export class Logger {
  constructor(private context: string = 'Worker') {}

  info(message: string, data?: any) {
    console.log(`[${this.context}] ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  error(message: string, error?: Error | string | any) {
    console.error(`[${this.context}] ❌ ${message}`, error instanceof Error ? error.message : error);
  }

  warn(message: string, data?: any) {
    console.warn(`[${this.context}] ⚠️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  debug(message: string, data?: any) {
    if (process.env.DEBUG) {
      console.debug(`[${this.context}] 🔧 ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  success(message: string, data?: any) {
    console.log(`[${this.context}] ✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}

export const createLogger = (context: string) => new Logger(context);
