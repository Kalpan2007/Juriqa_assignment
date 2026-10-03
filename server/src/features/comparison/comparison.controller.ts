import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createComparisonSchema,
  type ComparisonResultDto,
  type CreateComparisonInput,
} from '@ca/shared';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { ComparisonService } from './comparison.service';

@Controller('comparisons')
export class ComparisonController {
  constructor(private readonly comparison: ComparisonService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createComparison(
    @Body(new ZodValidationPipe(createComparisonSchema)) body: CreateComparisonInput,
  ): Promise<ComparisonResultDto> {
    return this.comparison.compare(body);
  }

  @Get(':id')
  async getComparison(@Param('id', ParseUUIDPipe) id: string): Promise<ComparisonResultDto> {
    return this.comparison.getComparison(id);
  }
}
