import { defineConfig, devices } from "@playwright/test"
import dotenv from "dotenv"
import { existsSync } from "fs"
import { E2E_AUTH_ENV } from "./e2e/auth"
import { E2E_OPS_ENV } from "./e2e/ops-env"

// Carregar variáveis de ambiente do .env.test (específico para E2E)
// Se .env.test não existir, fallback para .env.local
if (existsSync(".env.test")) {
  dotenv.config({ path: ".env.test", override: true })
} else {
  dotenv.config({ path: ".env.local", override: true })
}

/**
 * Playwright Configuration for E2E Tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",

  /* A single Next dev server is more stable with serialized files */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Keep the suite deterministic locally and on CI */
  workers: 1,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    ["list"],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: "http://localhost:3000",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video on first retry */
    video: "retain-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // Throwaway auth values the specs mint session cookies with, and the fake bot dispatcher. A reused
    // server must be started with the same values (see e2e/auth.ts, e2e/ops-env.ts), or specs fail closed.
    env: { ...E2E_AUTH_ENV, ...E2E_OPS_ENV },
  },
})
