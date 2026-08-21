import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    // Los test files comparten la misma DB, así que deben correr en serie.
    // Sin esto, cleanDb() de un archivo elimina usuarios que el otro acaba de crear.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
