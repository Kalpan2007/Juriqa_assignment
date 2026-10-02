import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { RetrievalService } from './retrieval.service';
import { ChunkSearchRepository } from './chunk-search.repository';

/**
 * Retrieval and coverage (ARCHITECTURE.md section 6).
 *
 * Imports DocumentsModule for page geometry and the document kind, which it gets through
 * that feature's exported service rather than its repository (decision D14).
 */
@Module({
  imports: [DocumentsModule],
  providers: [RetrievalService, ChunkSearchRepository],
  exports: [RetrievalService],
})
export class RetrievalModule {}
