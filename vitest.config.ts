import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts', 'web/src/**/*.test.ts'],
    environment: 'node',
    // Run tests in a real Node process rather than a transformed environment, so
    // builtins like node:sqlite resolve normally (DD-20).
    pool: 'forks',
    server: { deps: { external: [/node:sqlite/, /^node:/] } },
  },
  resolve: {
    alias: [{ find: /^node:sqlite$/, replacement: require.resolve('./scripts/sqlite-shim.cjs') }],
  },
});
