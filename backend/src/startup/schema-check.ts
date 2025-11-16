import { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { baseLogger } from '../observability/logger';

type CriticalTable = {
  name: string;
  feature: string;
};

const CRITICAL_TABLES: CriticalTable[] = [
  { name: 'AdminBackupJob', feature: 'admin backups' },
  { name: 'ServiceApiKey', feature: 'service API keys' }
];

const logger = baseLogger.with({
  component: 'startup',
  defaultFields: { check: 'schema' }
});

const tableExists = async (table: CriticalTable): Promise<boolean> => {
  const [row] = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${table.name}
    ) AS exists
  `);

  return Boolean(row?.exists);
};

export const verifyCriticalSchema = async (): Promise<void> => {
  const missing: CriticalTable[] = [];

  for (const table of CRITICAL_TABLES) {
    // eslint-disable-next-line no-await-in-loop -- small fixed list
    const exists = await tableExists(table);
    if (!exists) {
      missing.push(table);
    }
  }

  if (missing.length > 0) {
    logger.error('Missing critical database tables', {
      missing: missing.map((entry) => entry.name)
    });
    throw new Error(
      `Missing critical tables: ${missing.map((entry) => entry.name).join(', ')}. Apply the latest Prisma migrations.`
    );
  }

  logger.info('Critical database tables verified', {
    tables: CRITICAL_TABLES.map((entry) => entry.name)
  });
};


