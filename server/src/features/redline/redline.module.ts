import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { LlmModule } from '../../infrastructure/llm/llm.module';
import { RedlineController } from './redline.controller';
import { RedlineService } from './redline.service';

@Module({
  imports: [DocumentsModule, StorageModule, LlmModule],
  controllers: [RedlineController],
  providers: [RedlineService],
  exports: [RedlineService],
})
export class RedlineModule {}
