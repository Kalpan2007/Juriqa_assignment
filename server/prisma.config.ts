import path from 'node:path';
import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';

/**
 * Prisma 7 CLI configuration.
 *
 * Two Prisma 7 behaviours make this file necessary:
 *  1. `.env` is no longer loaded automatically, and this monorepo keeps ONE `.env` at the
 *     repository root (decision D24) rather than one per workspace — so the CLI is pointed
 *     at it explicitly below.
 *  2. The `url` property was removed from the `datasource` block in schema.prisma. The
 *     connection string used by Migrate and Introspect now lives here.
 *
 * The runtime client does NOT read this file; it is given a @prisma/adapter-pg adapter
 * (see infrastructure/database/prisma.service.ts).
 */
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: databaseUrl,
    // Only needed if `prisma migrate dev` cannot create its shadow database (decision D15).
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
