import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * One row per LLM call (ARCHITECTURE section 3.5).
 *
 * This is cost visibility for a product whose running cost is dominated by one API. Without
 * it, "why did this month cost twice as much" has no answer, and a prompt change that doubles
 * token use looks free.
 */
export interface LlmCallRecord {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string | null;
}

@Injectable()
export class LlmUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(call: LlmCallRecord): Promise<void> {
    await this.prisma.llmCall.create({
      data: {
        purpose: call.purpose,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        latencyMs: call.latencyMs,
        ok: call.ok,
        errorCode: call.errorCode ?? null,
      },
    });
  }
}
