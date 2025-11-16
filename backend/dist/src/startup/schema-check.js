"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCriticalSchema = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const logger_1 = require("../observability/logger");
const CRITICAL_TABLES = [
    { name: 'AdminBackupJob', feature: 'admin backups' },
    { name: 'ServiceApiKey', feature: 'service API keys' }
];
const logger = logger_1.baseLogger.with({
    component: 'startup',
    defaultFields: { check: 'schema' }
});
const tableExists = async (table) => {
    const [row] = await prisma_1.default.$queryRaw(client_1.Prisma.sql `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${table.name}
    ) AS exists
  `);
    return Boolean(row?.exists);
};
const verifyCriticalSchema = async () => {
    const missing = [];
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
        throw new Error(`Missing critical tables: ${missing.map((entry) => entry.name).join(', ')}. Apply the latest Prisma migrations.`);
    }
    logger.info('Critical database tables verified', {
        tables: CRITICAL_TABLES.map((entry) => entry.name)
    });
};
exports.verifyCriticalSchema = verifyCriticalSchema;
