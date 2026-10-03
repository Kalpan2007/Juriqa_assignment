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

  // CORS configuration supporting single origin, comma-separated list, wildcard, and *.vercel.app
  const configuredOrigin = config.webOrigin.trim();
  const allowedList = configuredOrigin === '*'
    ? ['*']
    : configuredOrigin.split(',').map((o) => o.trim().replace(/\/+$/, ''));

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow non-browser requests (curl, server-to-server, health checks)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (
        allowedList.includes('*') ||
        allowedList.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost')
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
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
