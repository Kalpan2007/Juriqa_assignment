import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  createRedlinePlanSchema,
  applyRedlineSchema,
  type CreateRedlinePlanInput,
  type ApplyRedlineInput,
  type RedlinePlanResponseDto,
  type ApplyRedlineResponseDto,
} from '@ca/shared';
import { RedlineService } from './redline.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';

@Controller()
export class RedlineController {
  constructor(private readonly redlineService: RedlineService) {}

  @Post('documents/:id/redlines')
  async createPlan(
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body(new ZodValidationPipe(createRedlinePlanSchema)) input: CreateRedlinePlanInput,
  ): Promise<RedlinePlanResponseDto> {
    return this.redlineService.createPlan(documentId, input);
  }

  @Post('redlines/:id/apply')
  async apply(
    @Param('id', ParseUUIDPipe) redlineId: string,
    @Body(new ZodValidationPipe(applyRedlineSchema)) input: ApplyRedlineInput,
  ): Promise<ApplyRedlineResponseDto> {
    return this.redlineService.apply(redlineId, input);
  }

  @Get('redlines/:id/download')
  async download(
    @Param('id', ParseUUIDPipe) redlineId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.redlineService.getDownload(redlineId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
