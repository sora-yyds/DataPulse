import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  plugins: [
    storybookTest({
      configDir: resolve(process.cwd(), ".storybook"),
    }),
  ],
  test: {
    allowOnly: false,
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
    name: "storybook",
    passWithNoTests: false,
  },
});
