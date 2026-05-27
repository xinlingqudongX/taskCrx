import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    include: [
      'apps/**/*.test.ts',
      'packages/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@team-session/shared': resolve(__dirname, './packages/shared/src'),
    },
  },
});
