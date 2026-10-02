import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppConfigService } from '../../config/config.service';
import { AppError } from '../../core/errors/app-error';

/**
 * Original uploads and generated redline files, in a PRIVATE Supabase Storage bucket.
 *
 * Render's disk is ephemeral, so nothing may be persisted locally (ARCHITECTURE section 1).
 * Storage keys are always built from the document's UUID — the user's filename is display-only,
 * which removes any path-traversal question (section 3.3).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(config: AppConfigService) {
    const { url, serviceRoleKey, bucket } = config.supabase;
    this.bucket = bucket;
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** `documents/<id>/original.<ext>` — never contains anything the user typed. */
  static originalKey(documentId: string, extension: 'pdf' | 'docx'): string {
    return `documents/${documentId}/original.${extension}`;
  }

  /** `documents/<id>/redline-<redlineId>.docx` */
  static redlineKey(documentId: string, redlineId: string): string {
    return `documents/${documentId}/redline-${redlineId}.docx`;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, body, {
      contentType,
      upsert: true,
    });
    if (error) {
      this.logger.error({ err: error, key }, 'Storage upload failed');
      throw new AppError('STORAGE_UNAVAILABLE', 503, 'The file could not be saved. Please try again.');
    }
  }

  async download(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) {
      this.logger.error({ err: error, key }, 'Storage download failed');
      throw new AppError('STORAGE_UNAVAILABLE', 503, 'The file could not be read. Please try again.');
    }
    return Buffer.from(await data.arrayBuffer());
  }

  /**
   * Deletes an object. A missing object is NOT an error: delete must stay idempotent so a
   * retried document deletion cannot fail half-way and leave an undeletable row.
   */
  async remove(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) {
      this.logger.warn({ err: error, key }, 'Storage delete failed; continuing');
    }
  }

  /** True when the bucket is reachable — used by `/health/ready`. */
  async isHealthy(): Promise<boolean> {
    try {
      const { error } = await this.client.storage.from(this.bucket).list('', { limit: 1 });
      if (error) {
        this.logger.warn({ err: error }, 'Storage health check failed');
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'Storage health check threw');
      return false;
    }
  }
}
