# Prisma Schema & Migration Pipeline

## Baseline
- Schema file: `backend/prisma/schema.prisma`
- First migration: `20251107160403_init/migration.sql`
- Lock file: `backend/prisma/migrations/migration_lock.toml`

## Generating Client & Applying Migrations
1. Ensure `DATABASE_URL` points at a PostgreSQL instance (see `backend/.env.example`).
2. Generate the client after editing the schema:
   ```bash
   npm run prisma:generate --prefix backend
   ```
3. Apply migrations in CI or prod:
   ```bash
   DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" npm run db:migrate --prefix backend
   ```
   - The script attempts a live `prisma migrate deploy`. If the database is unreachable (e.g., QA sandbox without Postgres), it falls back to `prisma migrate diff --script` so SQL can still be validated offline.

## Local Reset & Seeding
- Use Prisma reset to rebuild the schema and re-seed demo data:
  ```bash
  DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" npm run db:reset --prefix backend
  ```
- The seed script populates demo users, biomarkers, insight samples, feed content, and Cloud Task metadata via `npm run db:seed --prefix backend`.

## Rollback Guidance
- To roll back the latest deploy without wiping the database:
  ```bash
  DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" npx prisma migrate resolve --rolled-back "20251107160403_init" --schema backend/prisma/schema.prisma
  DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" npm run db:migrate --prefix backend
  ```
- For local development, prefer `npm run db:reset --prefix backend` which clears data and reapplies migrations before running the seed.
- Always check in a reversing migration when rolling back in shared environments.
