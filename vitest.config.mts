import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    clearMocks: true,
    environment: "node",
    hookTimeout: 10_000,
    include: [
      "tests/unit/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
      "packages/*/tests/**/*.test.ts",
      "services/*/tests/**/*.test.ts",
    ],
    maxWorkers: 1,
    minWorkers: 1,
    passWithNoTests: false,
    pool: "forks",
    restoreMocks: true,
    sequence: {
      concurrent: false,
    },
    testTimeout: 10_000,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
