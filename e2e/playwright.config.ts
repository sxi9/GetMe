import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const API_PORT = 4100, WEB_PORT = 5174;
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'off', browserName: 'chromium', viewport: { width: 402, height: 874 }, deviceScaleFactor: 1,
    // the sandbox ships its own Chromium; elsewhere `pnpm exec playwright install chromium` provides one
    launchOptions: existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {} },
  webServer: [
    { command: `rm -rf ${join(import.meta.dirname, '.data')} && DATA_DIR=${join(import.meta.dirname, '.data')} PORT=${API_PORT} SIM_BOTS=0 LOG=0 node --import tsx src/server.ts`, cwd: join(import.meta.dirname, '../apps/api'), url: `http://localhost:${API_PORT}/api/health`, reuseExistingServer: false, timeout: 30_000 },
    { command: `API_PORT=${API_PORT} pnpm exec vite --port ${WEB_PORT} --strictPort`, cwd: join(import.meta.dirname, '../apps/web'), url: `http://localhost:${WEB_PORT}/`, reuseExistingServer: false, timeout: 60_000 },
  ],
});
