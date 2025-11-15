const useExternalDatabase =
  process.env.PLAYWRIGHT_USE_EXTERNAL_PG === '1' || process.env.TEST_PG_EXTERNAL === '1';

if (!useExternalDatabase) {
  const rawWorkerId = Number(process.env.JEST_WORKER_ID);
  const workerId = Number.isInteger(rawWorkerId) ? rawWorkerId : 1;
  const workerIndex = workerId > 0 ? workerId - 1 : 0;

  const host = process.env.TEST_PG_HOST ?? '127.0.0.1';
  const basePort = Number(process.env.TEST_PG_PORT ?? 6543);
  const port = basePort + workerIndex;
  const user = process.env.TEST_PG_USER ?? 'biohax';
  const password = process.env.TEST_PG_PASSWORD ?? 'biohax';
  const database = process.env.TEST_PG_DATABASE ?? 'biohax';

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const databaseUrl = `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}?schema=public`;

  process.env.DATABASE_URL = databaseUrl;
  process.env.TEST_DATABASE_URL = databaseUrl;
}

