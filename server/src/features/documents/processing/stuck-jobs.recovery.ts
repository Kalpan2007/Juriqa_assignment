import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { JOB_NAMES, type DocumentProcessJob } from '../../../infrastructure/queue/job-names';
import { DocumentsRepository } from '../documents.repository';

/**
 * Re-enqueues documents left mid-processing by a crash (ARCHITECTURE section 4).
 *
 * pg-boss already resumes jobs it still owns, so this is the second line of defence: the case
 * where the job record itself is gone — expired, or the process died between the row being
 * written and the job being created — and the document would otherwise sit in EXTRACTING
 * forever. The assignment asks for processing that recovers if the server restarts, and
 * "recovers" has to include the ugly cases.
 */
@Injectable()
export class StuckJobsRecovery implements OnApplicationBootstrap {
  private readonly logger = new Logger(StuckJobsRecovery.name);

  /**
   * How long a document must have been untouched before it counts as stuck.
   * Comfortably longer than a real processing step so an in-flight 150-page extraction on
   * another instance is never stolen mid-way.
   */
  private static readonly STUCK_AFTER_MS = 10 * 60 * 1000;

  constructor(
    private readonly repository: DocumentsRepository,
    private readonly queue: QueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const stuck = await this.repository.findStuck(StuckJobsRecovery.STUCK_AFTER_MS);
      if (stuck.length === 0) {
        this.logger.log('No stuck documents found');
        return;
      }

      for (const document of stuck) {
        // The same singletonKey as the original send, so if pg-boss still holds a job for this
        // document nothing is duplicated.
        await this.queue.send<DocumentProcessJob>(
          JOB_NAMES.documentProcess,
          { documentId: document.id },
          { singletonKey: document.id },
        );
        this.logger.warn(
          { documentId: document.id, status: document.status },
          'Re-enqueued a document that was left mid-processing',
        );
      }
    } catch (error) {
      // Recovery failing must never stop the server from starting.
      this.logger.error({ err: error }, 'Stuck-document recovery failed');
    }
  }
}
