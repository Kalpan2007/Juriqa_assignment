import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * The server's tests are compiled with SWC, not esbuild.
 *
 * This is not a preference. NestJS resolves constructor dependencies from the
 * `design:paramtypes` metadata that `emitDecoratorMetadata` writes, and esbuild — which
 * vitest uses by default — does not emit it. Under esbuild every injected dependency in an
 * integration test arrives `undefined` and the application fails to build, with an error that
 * points at the constructor rather than at the compiler. SWC emits the metadata, so the DI
 * container behaves exactly as it does in production.
 *
 * (The same limitation is why the server cannot be run with `tsx` — see docs/NOTES.md.)
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // An integration test uploads a document and waits for a worker to process it.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The suites share one database; running them in parallel would make them race.
    fileParallelism: false,
  },
});
