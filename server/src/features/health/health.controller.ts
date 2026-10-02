import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { QueueService } from '../../infrastructure/queue/queue.service';

interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: Record<string, 'ok' | 'failed'>;
}

/**
 * Health endpoints (ARCHITECTURE section 3.5).
 *
 * `/health/live` answers "is the process up" and must never touch a dependency — Render uses
 * it to decide whether to restart us, and a slow database must not cause a restart loop.
 * `/health/ready` answers "can we actually serve traffic" and checks each dependency.
 *
 * Both skip throttling (decision D9): Render polls them continuously, and a rate-limited
 * health check would take the service down by itself.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const [database, storage, queue] = await Promise.all([
      this.check(() => this.prisma.ping()),
      this.check(async () => {
        if (!(await this.storage.isHealthy())) throw new Error('storage unreachable');
      }),
      this.check(async () => {
        if (!(await this.queue.isHealthy())) throw new Error('queue unreachable');
      }),
    ]);

    const checks = { database, storage, queue };
    const allOk = Object.values(checks).every((value) => value === 'ok');
    // The LLM is deliberately NOT part of readiness: the app is still useful for reading and
    // comparing documents when the model provider is down, so a Groq outage must not take
    // the whole service out of rotation.
    return { status: allOk ? 'ok' : 'degraded', checks };
  }

  private async check(probe: () => Promise<void>): Promise<'ok' | 'failed'> {
    try {
      await probe();
      return 'ok';
    } catch {
      return 'failed';
    }
  }
}
