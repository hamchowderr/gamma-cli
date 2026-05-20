import { defineConfig } from '@playwright/test';

/**
 * Playwright config for gamma-cli E2E tests.
 *
 * Playwright is used here as a generic test runner (not a browser harness).
 * Tests spawn the built CLI (`node dist/cli.js ...`) as a child process and
 * assert on exit codes, stdout, and stderr.
 *
 * Run `npm run build` before `npm run test:e2e` so dist/cli.js exists.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // No browser — these tests drive a CLI binary, not a page.
    // Keep config minimal so Playwright doesn't try to launch one.
  },
  timeout: 30_000,
});
