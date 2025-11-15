"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const env_1 = __importDefault(require("./config/env"));
const app_1 = require("./app");
const logger_1 = require("./observability/logger");
const port = env_1.default.PORT || 4000;
const logger = logger_1.baseLogger.with({ component: 'server', defaultFields: { port } });
const server = app_1.app.listen(port, () => {
    logger.info('Server listening', {
        url: `http://localhost:${port}`
    });
});
exports.server = server;
const shutdown = (signal) => {
    logger.warn('Received shutdown signal', { signal });
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
