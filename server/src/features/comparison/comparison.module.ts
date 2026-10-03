import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';

/**
 * ComparisonModule — slice F7 (ARCHITECTURE.md section 10).
 */
@Module({
  imports: [DocumentsModule],
  controllers: [ComparisonController],
  providers: [ComparisonService],
  exports: [ComparisonService],
})
export class ComparisonModule {}
