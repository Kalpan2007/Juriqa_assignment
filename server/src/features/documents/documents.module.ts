import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigService } from '../../config/config.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { DocumentProcessingWorker } from './processing/document-processing.worker';
import { StuckJobsRecovery } from './processing/stuck-jobs.recovery';

/**
 * Document upload, processing and read models (ARCHITECTURE.md section 4).
 *
 * `DocumentsService` is the only export: other features ask it for a READY document rather
 * than reaching into the repository (decision D14).
 */
@Module({
  imports: [
    // Files are held in memory: they go straight to Supabase Storage, and Render's disk is
    // ephemeral so writing them locally would be pointless. The limit is enforced here as
    // well as in the service, so an oversized upload is rejected before it is fully buffered.
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        limits: { fileSize: config.maxUploadBytes, files: 1 },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository, DocumentProcessingWorker, StuckJobsRecovery],
  exports: [DocumentsService],
})
export class DocumentsModule {}
