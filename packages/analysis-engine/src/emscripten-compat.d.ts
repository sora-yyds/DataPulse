/**
 * duckdb-wasm 1.32.0 的 d.ts 引用 `Emscripten.WebAssemblyExports`，而
 * `@types/emscripten`（1.41.5）未导出该成员。此处仅补足这一缺失的返回类型
 * 以通过仓库的严格类型检查；不改变任何运行时行为。
 */
declare global {
  namespace Emscripten {
    type WebAssemblyExports = Record<string, unknown>;
  }
}

export {};