import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  pagesQuerySchema,
  type DocumentDto,
  type DocumentHtmlDto,
  type DocumentLayoutDto,
  type PagesResponseDto,
  type UploadResponseDto,
} from '@ca/shared';
import { AppError } from '../../core/errors/app-error';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { DocumentsService } from './documents.service';

/**
 * Controllers validate and delegate, nothing more (CLAUDE.md server rules).
 *
 * Throttling is per route (decision D9): uploads are limited because each one starts real
 * work, while the GETs stay on the generous default because the library polls
 * `GET /documents/:id` every 1.5 s while a document processes — a shared limit would make the
 * app rate-limit its own progress indicator.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: Express.Multer.File): Promise<UploadResponseDto> {
    if (file === undefined) {
      throw AppError.badRequest('BAD_REQUEST', 'No file was uploaded.');
    }
    return this.documents.upload(file);
  }

  @Post('seed-samples')
  async seedSamples(): Promise<{ seeded: DocumentDto[]; count: number }> {
    return this.documents.seedSamples();
  }

  @Get()
  async list(): Promise<{ documents: DocumentDto[] }> {
    return { documents: await this.documents.list() };
  }

  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentDto> {
    return this.documents.getById(id);
  }

  /** Page geometry only, so the viewer can size placeholders before fetching content. */
  @Get(':id/layout')
  async getLayout(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentLayoutDto> {
    return this.documents.getLayout(id);
  }

  /** A bounded window of pages with text and item maps (decision D20). */
  @Get(':id/pages')
  async getPages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(pagesQuerySchema)) query: { from: number; to: number },
  ): Promise<PagesResponseDto> {
    return this.documents.getPages(id, query.from, query.to);
  }

  /** The sanitised reading view. DOCX only. */
  @Get(':id/html')
  async getHtml(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentHtmlDto> {
    return this.documents.getHtml(id);
  }

  /** The original file, streamed from storage so the browser can render the PDF itself. */
  @Get(':id/file')
  async getFile(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { buffer, filename, contentType } = await this.documents.getFileStream(id);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    // `inline` so the viewer can display it; the filename is quoted because it is user-supplied.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.end(buffer);
  }

  /** Scanned-page warning text, or null. Separate so the library list stays cheap. */
  @Get(':id/warnings')
  async getWarnings(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ scannedPages: string | null }> {
    return { scannedPages: await this.documents.getScannedPagesWarning(id) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.documents.delete(id);
  }
}
