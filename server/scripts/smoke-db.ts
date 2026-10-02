/**
 * F0 smoke test: prove the Supabase session pooler, the generated tsvector column and the
 * full-text index all work before slice F1 writes anything real.
 *
 * It also re-asserts the connection rules that cost time to discover (decisions D15, D30):
 * the session pooler on 5432 (not the IPv6-only direct host, not the 6543 transaction pooler),
 * and `sslmode=no-verify` because pg 8.16+ reads `require` as `verify-full` and Supabase's
 * chain fails that check.
 *
 * Usage: npm run smoke:db -w @ca/server
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

function assertUrlShape(url: string): void {
  if (url.includes(':6543')) {
    throw new Error('DATABASE_URL points at the transaction pooler (:6543), which breaks migrations.');
  }
  if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
    throw new Error(
      'DATABASE_URL points at the DIRECT connection, which is IPv6-only and unreachable from Render. Use the session pooler host.',
    );
  }
  if (!url.includes('sslmode=no-verify')) {
    console.warn(
      'WARNING: DATABASE_URL has no sslmode=no-verify; node-postgres may reject Supabase\'s certificate chain.',
    );
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repo root.');
  assertUrlShape(url);

  const host = new URL(url).host;
  console.log(`host          : ${host}`);

  const adapter = new PrismaPg({ connectionString: url, max: 2 });
  const prisma = new PrismaClient({ adapter });

  try {
    const version = await prisma.$queryRaw<Array<{ v: string }>>`SELECT version() AS v`;
    console.log(`postgres      : ${version[0]?.v.split(' ').slice(0, 2).join(' ')}`);

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`;
    console.log(`tables (${tables.length})   : ${tables.map((t) => t.table_name).join(', ')}`);

    const tsv = await prisma.$queryRaw<Array<{ is_generated: string }>>`
      SELECT is_generated FROM information_schema.columns
      WHERE table_name = 'Chunk' AND column_name = 'tsv'`;
    const generated = tsv[0]?.is_generated === 'ALWAYS';
    console.log(`Chunk.tsv     : ${generated ? 'GENERATED ALWAYS (ok)' : 'MISSING'}`);

    const index = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Chunk' AND indexname = 'Chunk_tsv_idx'`;
    console.log(`GIN index     : ${index.length > 0 ? 'present (ok)' : 'MISSING'}`);

    // Counting documents exercises the generated Prisma client, not just raw SQL.
    const documents = await prisma.document.count();
    console.log(`documents     : ${documents}`);

    if (!generated) throw new Error('The Chunk.tsv generated column is missing — run prisma migrate deploy.');
    if (index.length === 0) throw new Error('The Chunk_tsv_idx GIN index is missing — run prisma migrate deploy.');

    console.log('\nPASS: pooler reachable, schema applied, full-text index in place.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('\nFAIL:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
