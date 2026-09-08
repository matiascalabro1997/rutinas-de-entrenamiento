import { defineConfig } from 'vitest/config';

// Config propia para no arrastrar el plugin de React ni el proxy del dev server:
// estos tests ejercitan lógica pura de sincronización de caché.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
