import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'tests/.playwright/artifacts'
const reportDir = process.env.PLAYWRIGHT_REPORT_DIR ?? 'playwright-report'
const headless = process.env.PLAYWRIGHT_HEADLESS !== '0'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: reportDir, open: 'never' }],
  ],
  use: {
    baseURL,
    headless,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
