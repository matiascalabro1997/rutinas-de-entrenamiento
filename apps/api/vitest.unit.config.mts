import { defineConfig } from 'vitest/config';

// Tests puros: no tocan PostgreSQL, así que no cargan tests/setup.ts ni
// necesitan correr en serie. Se pueden ejecutar sin base levantada.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['./tests/unit/**/*.test.ts'],
  },
});
