import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    clearMocks: true,
    environment: "jsdom",
    hookTimeout: 10_000,
    include: ["tests/component/**/*.test.tsx"],
    maxWorkers: 1,
    minWorkers: 1,
    passWithNoTests: false,
    pool: "forks",
    restoreMocks: true,
    sequence: {
      concurrent: false,
    },
    setupFiles: ["tests/component/setup.ts"],
    testTimeout: 10_000,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
