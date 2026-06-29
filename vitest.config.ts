// vitest.config.ts — Vitest configuration for IndustriaX
//
// Run all test types via `npm test`. The `RUN_LIVE_TESTS=1` env var
// (or `BASE_URL`/`NEWS_GENERATOR_URL` overrides) enables network-bound
// integration and security tests. Default is to skip those (CI mode).

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    // Skip PostCSS plugin discovery — Tailwind is configured in next.config
    postcss: { plugins: [] },
  },
  test: {
    // Allow glob patterns from CLI to filter
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    // Exclude heavy / unrelated dirs
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.history/**',
      'cloudflare/**',
      'planning/**',
      'public/**',
      'scripts/**',
      'supabase/**',
      // Legacy node:test files — run via `npm test` (tsx --test), not Vitest
      'tests/integration/**',
      'tests/security/**',
    ],
    // happy-dom is lighter than jsdom and works for our React components
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    reporters: process.env.CI ? ['default'] : ['default', 'html'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/**/index.ts',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
      ],
    },
  },
});
