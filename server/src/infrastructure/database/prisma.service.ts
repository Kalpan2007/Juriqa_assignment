import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma';
import { AppConfigService } from '../../config/config.service';

/**
 * The Prisma client, and the only place a connection to Postgres is opened for queries.
 *
 * Prisma 7 notes (ARCHITECTURE section 1):
 *  - `url` was removed from the schema's datasource block, so the connection string is passed
 *    here through a driver adapter (`@prisma/adapter-pg`, which runs on node-postgres).
 *  - Because node-postgres is doing the connecting, ITS TLS semantics apply: pg 8.16+ treats
 *    `sslmode=require` as `verify-full`, which fails against Supabase's certificate chain.
 *    `DATABASE_URL` therefore carries `sslmode=no-verify` (decision D30).
 *
 * Connection budget (decision D16): Prisma takes at most 4 connections per instance and
 * pg-boss 2, which stays under half of the Supabase session pooler's limit even while an old
 * and a new Render instance overlap during a deploy.
 */
const PRISMA_POOL_MAX = 4;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.databaseUrl,
      max: PRISMA_POOL_MAX,
    });
    super({ adapter, log: config.isProduction ? ['warn', 'error'] : ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log(`Database connected (pool max ${PRISMA_POOL_MAX})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /** Cheap liveness probe for `/health/ready`. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
