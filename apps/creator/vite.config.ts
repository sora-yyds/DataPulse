import type { UserConfig } from "vite";

export default {
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: "dist/site",
  },
} satisfies UserConfig;
