import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/config.service';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { RequestIdMiddleware, REQUEST_ID_HEADER } from './core/middleware/request-id.middleware';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { LlmModule } from './infrastructure/llm/llm.module';
import { HealthModule } from './features/health/health.module';
import { DocumentsModule } from './features/documents/documents.module';
import { VerificationModule } from './features/verification/verification.module';
import { RetrievalModule } from './features/retrieval/retrieval.module';
import { ChatModule } from './features/chat/chat.module';
import { ComparisonModule } from './features/comparison/comparison.module';
import { RedlineModule } from './features/redline/redline.module';

/**
 * Throttling is PER ROUTE, never one global limit (decision D9).
 *
 * The reason is concrete: while a 150-page document is processing, the library polls its
 * status every 1.5 s — about 40 requests a minute. A single global 10/min limit would make
 * the app rate-limit its own progress indicator. So reads get a generous default here, and
 * the few routes that cost money (upload, chat, comparison, redline) are limited at the
 * controller with @Throttle when their slices are built.
 */
const READ_LIMIT_PER_MINUTE = 600;

@Module({
  imports: [
    AppConfigModule,

    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          // Readable logs while developing, JSON in production for the log aggregator.
          transport: config.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } },
          customProps: (req) => ({ requestId: (req as { requestId?: string }).requestId }),
          // Health checks are polled constantly; logging them buries everything else.
          autoLogging: {
            ignore: (req) => (req.url ?? '').startsWith('/health'),
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
            ],
            remove: true,
          },
        },
      }),
    }),

    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: READ_LIMIT_PER_MINUTE }],
    }),

    // Infrastructure (all @Global)
    PrismaModule,
    StorageModule,
    QueueModule,
    LlmModule,

    // Features
    HealthModule,
    DocumentsModule,
    VerificationModule,
    RetrievalModule,
    ChatModule,
    ComparisonModule,
    RedlineModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // ThrottlerGuard is applied globally; routes opt out with @SkipThrottle (health) or
    // tighten the limit with @Throttle (anything that spends LLM budget).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Runs before everything, so every log line and error response carries the id.
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}

export { REQUEST_ID_HEADER };
