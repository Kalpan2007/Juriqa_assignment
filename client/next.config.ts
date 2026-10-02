import path from 'node:path';
import dotenv from 'dotenv';
import type { NextConfig } from 'next';

/**
 * This monorepo keeps ONE `.env` at the repository root (decision D24), but Next only loads
 * `.env` from the app directory. Loading it here puts the variables into `process.env` before
 * Next reads them, so `NEXT_PUBLIC_*` is still inlined at build time as normal.
 *
 * On Render there is no file: variables come from the service environment and this is a no-op.
 */
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `@ca/shared` ships compiled CommonJS + .d.ts (decision D5), so no transpilePackages.
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  typedRoutes: true,
};

export default nextConfig;
