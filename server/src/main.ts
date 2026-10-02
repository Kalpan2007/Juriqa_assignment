import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // pino takes over once the app is up; buffer startup logs until then.
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));
  const config = app.get(AppConfigService);

  app.use(helmet({
    // The API serves JSON and file streams, never HTML, so CSP here would only restrict
    // responses no browser renders. The client sets its own policy.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Exactly one origin, from config (ARCHITECTURE section 3.3).
  app.enableCors({
    origin: config.webOrigin,
    credentials: false,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 86_400,
  });

  // JSON bodies are small (a question, a list of ids); uploads go through multer with its own
  // limit, so a large global JSON limit would only widen the attack surface.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // NOTE: no compression middleware anywhere. It would buffer SSE and break token-by-token
  // streaming (decision D22).

  // Lets pg-boss finish an in-flight job and close its pool instead of being killed.
  app.enableShutdownHooks();

  const port = config.port;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(PinoLogger);
  logger.log(
    `Server listening on port ${port} (${config.nodeEnv}), CORS origin ${config.webOrigin}`,
  );
}

void bootstrap();
