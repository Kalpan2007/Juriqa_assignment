import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmUsageRepository } from './llm-usage.repository';

@Global()
@Module({
  providers: [LlmService, LlmUsageRepository],
  exports: [LlmService],
})
export class LlmModule {}
