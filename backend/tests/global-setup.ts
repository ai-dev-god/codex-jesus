import { ensureDatabaseReady } from './integration/support/db';

export default async () => {
  await ensureDatabaseReady();
};
