import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Las pruebas de integración comparten datos en Supabase: se ejecutan en serie.
    fileParallelism: false,
  },
});
