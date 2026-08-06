import { describe, expect, it } from "vitest";

import { createHttpPreviewConfig } from "../../playwright.config.js";

describe("Windows browser preview lifecycle", () => {
  it("launches Vite directly so Playwright owns and tears down the server process tree", () => {
    const config = createHttpPreviewConfig(
      "./tests/lifecycle-probe",
      "./test-results/lifecycle-probe",
    );
    const webServers = Array.isArray(config.webServer)
      ? config.webServer
      : [config.webServer];

    expect(webServers).toHaveLength(2);
    expect(
      webServers.map((server) => ({
        command: server?.command,
        cwd: server?.cwd,
        reuseExistingServer: server?.reuseExistingServer,
      })),
    ).toEqual([
      {
        command:
          "node ../../node_modules/vite/bin/vite.js preview " +
          "--host 127.0.0.1 --port 4173 --strictPort",
        cwd: "./apps/creator",
        reuseExistingServer: false,
      },
      {
        command:
          "node ../../node_modules/vite/bin/vite.js preview " +
          "--host 127.0.0.1 --port 4174 --strictPort",
        cwd: "./apps/viewer",
        reuseExistingServer: false,
      },
    ]);
    for (const server of webServers) {
      expect(server?.command).not.toMatch(/\b(?:corepack|pnpm)\b/u);
    }
  });
});
