import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so dist/ works from the root of any domain or any sub-folder.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Keep the build to one plain module script; no preload helpers.
    modulePreload: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
