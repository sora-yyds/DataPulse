import { defineConfig, devices } from "playwright/test";

/**
 * M0-032 real-browser Worker CSP negation and lifecycle release matrix.
 * Serves the worker-csp fixture over http://127.0.0.1 from spec-owned local
 * HTTP servers with per-page Content-Security-Policy headers, so the pinned
 * two-webServer preview lifecycle contract for Creator/Viewer is untouched.
 */
export default defineConfig({
  testDir: "./tests/worker-csp",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/worker-csp",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["line"]],
  use: {
    acceptDownloads: false,
    colorScheme: "light",
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    locale: "zh-CN",
    serviceWorkers: "block",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "worker-csp-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});