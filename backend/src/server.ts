import type { Server } from 'http';

import env from './config/env';
import { app } from './app';
import { baseLogger } from './observability/logger';
import { verifyCriticalSchema } from './startup/schema-check';

const port = env.PORT || 4000;
const logger = baseLogger.with({ component: 'server', defaultFields: { port } });

let server: Server | null = null;

const start = async (): Promise<void> => {
  try {
    await verifyCriticalSchema();
  } catch (error) {
    logger.error('Startup checks failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  server = app.listen(port, () => {
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

const shutdown = (signal: string) => {
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

export { server };
