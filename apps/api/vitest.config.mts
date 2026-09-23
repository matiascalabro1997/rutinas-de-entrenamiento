import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.test.ts'],
    // tests/unit son puros y corren con vitest.unit.config.mts, sin base.
    exclude: ['./tests/unit/**'],
    testTimeout: 15000,
    // Los test files comparten la misma DB, así que deben correr en serie.
    // Sin esto, cleanDb() de un archivo elimina usuarios que el otro acaba de crear.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
