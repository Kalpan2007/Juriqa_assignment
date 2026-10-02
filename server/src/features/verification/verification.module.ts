import { Module } from '@nestjs/common';
import { QuoteVerifierService } from './quote-verifier.service';

/**
 * Quote verification (ARCHITECTURE.md section 5) — the heart of the application.
 *
 * `QuoteVerifierService` is the only export. Chat, multi-document chat and the redline
 * locator all go through it, so there is exactly one implementation of "is this quote real".
 */
@Module({
  providers: [QuoteVerifierService],
  exports: [QuoteVerifierService],
})
export class VerificationModule {}
