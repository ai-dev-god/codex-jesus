import process from 'node:process';

import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env.EMBEDDED_PG_PORT ?? 6543);
const host = process.env.EMBEDDED_PG_HOST ?? '127.0.0.1';
const user = process.env.EMBEDDED_PG_USER ?? 'biohax';
const password = process.env.EMBEDDED_PG_PASSWORD ?? 'biohax';
const database = process.env.EMBEDDED_PG_DATABASE ?? 'biohax';
const dataDir = process.env.EMBEDDED_PG_DATA_DIR ?? '';

const shutdownSignals = ['SIGTERM', 'SIGINT'];

const ensureDatabase = async (instance, dbName, dbHost) => {
  const client = instance.getPgClient('postgres', dbHost);
  await client.connect();

  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (result.rowCount === 0) {
    await client.query(
      `CREATE DATABASE ${client.escapeIdentifier(dbName)} OWNER ${client.escapeIdentifier(user)}`
    );
  }

  await client.end();
};

const start = async () => {
  try {
    process.stderr.write('DEBUG: Starting worker...\n');
    const embedded = new EmbeddedPostgres({
      databaseDir: dataDir || undefined,
      port,
      user,
      password,
      persistent: true,
      createPostgresUser: typeof process.getuid === 'function' && process.getuid() === 0 && process.platform === 'linux'
    });

    process.stderr.write('DEBUG: Initialising...\n');
    await embedded.initialise();
    process.stderr.write('DEBUG: Starting PG...\n');
    await embedded.start();
    process.stderr.write('DEBUG: Ensuring DB...\n');
    await ensureDatabase(embedded, database, host);

    process.stdout.write('READY\n');

    const shutdown = async () => {
      try {
        await embedded.stop();
      } finally {
        process.exit(0);
      }
    };

    shutdownSignals.forEach((signal) => {
      process.on(signal, shutdown);
    });
    process.on('disconnect', shutdown);
  } catch (error) {
    process.stderr.write(`DEBUG: Caught error: ${typeof error} ${String(error)}\n`);
    const messages = [];
    if (error instanceof Error) {
      messages.push(error.stack ?? error.message);
    } else if (error) {
      messages.push(String(error));
    }

    if (error && typeof error === 'object') {
      try {
        messages.push(JSON.stringify(error, Object.getOwnPropertyNames(error)));
      } catch {
        // ignore serialization errors
      }
      if ('stdout' in error && error.stdout) {
        messages.push(String(error.stdout));
      }
      if ('stderr' in error && error.stderr) {
        messages.push(String(error.stderr));
      }
    }

    process.stderr.write(`ERROR ${messages.filter(Boolean).join('\n')}\n`);
    process.exit(1);
  }
};

await start();

