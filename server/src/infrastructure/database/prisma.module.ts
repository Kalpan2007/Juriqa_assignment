import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so repositories can inject PrismaService without every feature module importing it.
 * Note the layering rule from CLAUDE.md: Prisma is used ONLY inside `*.repository.ts` files.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
