"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const env_1 = __importDefault(require("./config/env"));
const app_1 = require("./app");
const logger_1 = require("./observability/logger");
const schema_check_1 = require("./startup/schema-check");
const port = env_1.default.PORT || 4000;
const logger = logger_1.baseLogger.with({ component: 'server', defaultFields: { port } });
let server = null;
exports.server = server;
const start = async () => {
    try {
        await (0, schema_check_1.verifyCriticalSchema)();
    }
    catch (error) {
        logger.error('Startup checks failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
    exports.server = server = app_1.app.listen(port, () => {
        logger.info('Server listening', {
            url: `http://localhost:${port}`
        });
    });
};
void start().catch((error) => {
    logger.error('Failed to launch server', {
        error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
});
const shutdown = (signal) => {
    logger.warn('Received shutdown signal', { signal });
    if (!server) {
        logger.info('Server not started; exiting');
        process.exit(0);
        return;
    }
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
