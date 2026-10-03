import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { VerificationModule } from '../verification/verification.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository } from './chat.repository';
import { ThoroughRunner } from './thorough-runner';

/**
 * Chat with a document (ARCHITECTURE.md section 7).
 *
 * Uses the other features only through their exported services: DocumentsService for a READY
 * document, RetrievalService for what to read, QuoteVerifierService for whether a quote is
 * genuine (CLAUDE.md feature boundaries).
 */
@Module({
  imports: [DocumentsModule, RetrievalModule, VerificationModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ThoroughRunner],
  exports: [ChatService],
})
export class ChatModule implements OnApplicationBootstrap {
  constructor(private readonly chat: ChatService) {}

  async onApplicationBootstrap(): Promise<void> {
    // A browser that vanished mid-answer leaves a message STREAMING, which the UI would show
    // as an answer still being written. Clear those on boot (ARCHITECTURE section 7).
    await this.chat.failStaleStreamingMessages();
  }
}
