import { defineConfig, devices } from "playwright/test";

/**
 * M0-026 real-browser device-key negative verification. Serves the
 * storage fixture over http://127.0.0.1 (a potentially-trustworthy origin)
 * from a spec-owned Vite dev server, so the pinned two-webServer preview
 * lifecycle contract for Creator/Viewer is untouched.
 */
export default defineConfig({
  testDir: "./tests/storage-e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/storage",
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
      name: "storage-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
