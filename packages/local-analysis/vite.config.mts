import type { UserConfig } from "vite";

// M0-031：把 Worker 外壳源码打包为无运行时 import 的单文件模块 Worker。
// 只允许默认配置发现（禁止 --config/-c/--root 改写入口）；产物进入 dist/worker，
// 不含 source map，供固定静态 URL 直接创建 module Worker。
export default {
  build: {
    outDir: "dist/worker",
    emptyOutDir: true,
    lib: {
      entry: "src/worker/local-analysis-worker.ts",
      formats: ["es"],
      fileName: "local-analysis-worker",
    },
    sourcemap: false,
    minify: false,
    target: "es2022",
    cssCodeSplit: false,
    assetsInlineLimit: 0,
  },
} satisfies UserConfig;