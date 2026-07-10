/**
 * VITEST CONFIG  (vitest.config.ts)
 *
 * Vitest uses Vite's esbuild pipeline to transpile TypeScript, so it handles
 * `.ts` files natively. When it sees an import like `'./foo.js'`, it checks
 * whether `foo.js` exists — if not, it tries `foo.ts`. This makes NodeNext-style
 * TypeScript imports (.js extensions) work transparently in tests.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Enables describe/it/expect globally (no need to import in each test file)
    globals: true,
    // Only run tests matching this pattern — avoids accidentally running seed etc.
    include: ['src/__tests__/**/*.test.ts'],
    // Increase timeout for integration tests that build the Fastify app
    testTimeout: 10_000,
  },
});
