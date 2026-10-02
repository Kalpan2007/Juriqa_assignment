import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { AppConfigService } from '../../config/config.service';
import { JOB_NAMES, type JobName } from './job-names';

/**
 * Durable background jobs, backed by the same Postgres (ARCHITECTURE section 1).
 *
 * Why pg-boss and not Redis/BullMQ: a 150-page document takes minutes to process, Render
 * restarts freely, and the assignment asks for processing that recovers if the server
 * restarts. pg-boss stores jobs in Postgres, so a restart resumes them — and it needs no
 * extra service to pay for or keep alive.
 *
 * Pinned to 11.1.2 because pg-boss 12 is ESM-only and this server is CommonJS (decision D3).
 * Note the v10+ API shape this is written against: queues must be created before use, and
 * retry/expiry/retention are QUEUE options rather than constructor options.
 *
 * Connection budget: 2 connections per instance (decision D16).
 */
const PG_BOSS_POOL_MAX = 2;

/**
 * Per-queue defaults.
 * `expireInSeconds` is 15 minutes because a 150-page extraction legitimately takes minutes —
 * too short and a big document would be killed and retried forever.
 */
const QUEUE_DEFAULTS = {
  retryLimit: 2,
  retryBackoff: true,
  expireInSeconds: 15 * 60,
  // Keep finished jobs long enough to diagnose a failed document, then let them go.
  retentionSeconds: 12 * 60 * 60,
  deleteAfterSeconds: 3 * 24 * 60 * 60,
} as const;

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly boss: PgBoss;
  private started = false;

  constructor(private readonly config: AppConfigService) {
    this.boss = new PgBoss({
      connectionString: this.config.databaseUrl,
      max: PG_BOSS_POOL_MAX,
      // pg-boss keeps its tables in their own schema so they never collide with Prisma's.
      schema: 'pgboss',
      supervise: true,
      migrate: true,
    });

    this.boss.on('error', (error) => {
      // pg-boss emits transient connection errors; crashing the process would be worse.
      this.logger.error({ err: error }, 'pg-boss error');
    });
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    // Queues must exist before a job can be sent to them (pg-boss 10+).
    for (const name of Object.values(JOB_NAMES)) {
      await this.boss.createQueue(name, { ...QUEUE_DEFAULTS });
    }
    this.started = true;
    this.logger.log(`Queue started (pool max ${PG_BOSS_POOL_MAX})`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.started) return;
    // Graceful: let an in-flight job finish rather than orphaning a half-processed document.
    await this.boss.stop({ graceful: true });
    this.logger.log('Queue stopped');
  }

  /**
   * Enqueues a job. `singletonKey` is how we guarantee one processing job per document even
   * if the upload request is retried.
   */
  async send<T extends object>(
    name: JobName,
    data: T,
    options?: { singletonKey?: string; retryLimit?: number; expireInSeconds?: number },
  ): Promise<string | null> {
    return this.boss.send(name, data, {
      retryLimit: options?.retryLimit ?? QUEUE_DEFAULTS.retryLimit,
      retryBackoff: QUEUE_DEFAULTS.retryBackoff,
      expireInSeconds: options?.expireInSeconds ?? QUEUE_DEFAULTS.expireInSeconds,
      ...(options?.singletonKey ? { singletonKey: options.singletonKey } : {}),
    });
  }

  /** Registers a handler. One job at a time per instance keeps memory predictable. */
  async work<T extends object>(name: JobName, handler: (data: T) => Promise<void>): Promise<string> {
    return this.boss.work<T>(name, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        await handler(job.data);
      }
    });
  }

  /** True when the queue is reachable — used by `/health/ready`. */
  async isHealthy(): Promise<boolean> {
    try {
      // getQueue returns null (rather than throwing) when the queue is absent.
      const queue = await this.boss.getQueue(JOB_NAMES.documentProcess);
      return queue !== null;
    } catch (error) {
      this.logger.warn({ err: error }, 'Queue health check failed');
      return false;
    }
  }
}
