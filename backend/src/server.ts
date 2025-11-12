import env from './config/env';
import { app } from './app';
import { baseLogger } from './observability/logger';

const port = env.PORT || 4000;
const logger = baseLogger.with({ component: 'server', defaultFields: { port } });

const server = app.listen(port, () => {
  logger.info('Server listening', {
    url: `http://localhost:${port}`
  });
});

const shutdown = (signal: string) => {
  logger.warn('Received shutdown signal', { signal });
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server };
