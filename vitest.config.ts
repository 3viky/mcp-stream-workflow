/**
 * Vitest Configuration
 *
 * Test configuration for Stream Workflow Manager MCP Server
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test/**',
        'src/**/*.d.ts',
        'node_modules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 30000, // 30 seconds for git operations
    hookTimeout: 10000,
    // Setup files
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
    },
  },
});
