import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import path from 'node:path';
import { validateEnv } from './env.schema';
import { AppConfigService } from './config.service';

/**
 * Loads and validates configuration from the SINGLE root `.env` (decision D24).
 *
 * The path is resolved relative to this file so it works the same from `src/` under ts-node
 * and from `dist/` in production. On Render no `.env` exists at all — variables come from the
 * service environment, and `ignoreEnvFile` is irrelevant because a missing file is not an error.
 */
const ROOT_ENV = path.resolve(__dirname, '..', '..', '..', '.env');

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [ROOT_ENV],
      validate: validateEnv,
      cache: true,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
