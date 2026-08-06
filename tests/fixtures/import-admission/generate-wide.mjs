#!/usr/bin/env node
/**
 * M0-028：确定性生成 50,000 行 x 100 列宽表 CSV（import-admission-wide 夹具）。
 *
 * 边界口径：文件约 50 MB（低于 50 MiB 上限）、100 列、5,000,000 非空单元格
 * （恰好等于非空单元格上限），用于准入边界与性能探针。只使用固定种子
 * mulberry32；输出为 LF 结尾、无 BOM 的 UTF-8，跨平台字节稳定。
 * 用法：node generate-wide.mjs <output.csv>
 */
import { writeFileSync } from "node:fs";

const SEED = 0x85ebca6b;
const ROWS = 50_000;
const COLUMNS = 100;

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);
const header = new Array(COLUMNS);
for (let c = 1; c <= COLUMNS; c += 1) {
  header[c - 1] = "col" + String(c).padStart(2, "0");
}
const lines = new Array(ROWS + 1);
lines[0] = header.join(",");
for (let r = 1; r <= ROWS; r += 1) {
  const cells = new Array(COLUMNS);
  for (let c = 0; c < COLUMNS; c += 1) {
    cells[c] = "v" + String(Math.floor(random() * 100000000)).padStart(8, "0");
  }
  lines[r] = cells.join(",");
}
writeFileSync(process.argv[2], lines.join("\n") + "\n", "utf8");