import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "playwright/test";

const PREVIEW_HOST = "127.0.0.1";
const CREATOR_PREVIEW_PORT = 4173;
const VIEWER_PREVIEW_PORT = 4174;

const creatorBaseUrl = `http://${PREVIEW_HOST}:${CREATOR_PREVIEW_PORT}`;
const viewerBaseUrl = `http://${PREVIEW_HOST}:${VIEWER_PREVIEW_PORT}`;

/**
 * M0-016 only exercises deterministic HTTP production previews. HTTPS,
 * four-Origin isolation, complete WCAG conformance, and real-device coverage
 * remain separate gates.
 */
export function createHttpPreviewConfig(
  testDir: string,
  outputDir: string,
): PlaywrightTestConfig {
  return defineConfig({
    testDir,
    testMatch: "**/*.spec.ts",
    outputDir,
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    timeout: 30_000,
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
      permissions: [],
      reducedMotion: "reduce",
      screenshot: "only-on-failure",
      serviceWorkers: "block",
      timezoneId: "Asia/Shanghai",
      trace: "retain-on-failure",
      video: "off",
    },
    webServer: [
      {
        command:
          `node ../../node_modules/vite/bin/vite.js preview ` +
          `--host ${PREVIEW_HOST} --port ${CREATOR_PREVIEW_PORT} --strictPort`,
        cwd: "./apps/creator",
        url: `${creatorBaseUrl}/`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
      {
        command:
          `node ../../node_modules/vite/bin/vite.js preview ` +
          `--host ${PREVIEW_HOST} --port ${VIEWER_PREVIEW_PORT} --strictPort`,
        cwd: "./apps/viewer",
        url: `${viewerBaseUrl}/`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
    ],
    projects: [
      {
        name: "creator-http-chromium",
        use: {
          ...devices["Desktop Chrome"],
          baseURL: creatorBaseUrl,
        },
      },
      {
        name: "viewer-http-chromium",
        use: {
          ...devices["Desktop Chrome"],
          baseURL: viewerBaseUrl,
        },
      },
    ],
  });
}

export default createHttpPreviewConfig(
  "./tests/e2e",
  "./test-results/e2e",
);
