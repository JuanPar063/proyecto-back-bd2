"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = exports.Logger = void 0;
class Logger {
    context;
    constructor(context = 'Worker') {
        this.context = context;
    }
    info(message, data) {
        console.log(`[${this.context}] ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
    error(message, error) {
        console.error(`[${this.context}] ❌ ${message}`, error instanceof Error ? error.message : error);
    }
    warn(message, data) {
        console.warn(`[${this.context}] ⚠️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
    debug(message, data) {
        if (process.env.DEBUG) {
            console.debug(`[${this.context}] 🔧 ${message}`, data ? JSON.stringify(data, null, 2) : '');
        }
    }
    success(message, data) {
        console.log(`[${this.context}] ✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
}
exports.Logger = Logger;
const createLogger = (context) => new Logger(context);
exports.createLogger = createLogger;
//# sourceMappingURL=logger.js.map