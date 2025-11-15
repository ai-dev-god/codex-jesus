import { shutdownDatabase } from './integration/support/db';

afterAll(async () => {
  await shutdownDatabase();
});

