#!/usr/bin/env node
/**
 * M0-028：确定性生成 200,000 行 x 3 列窄表 CSV（import-admission-narrow 夹具）。
 *
 * 只使用固定种子 mulberry32；输出为 LF 结尾、无 BOM 的 UTF-8，跨平台字节稳定。
 * 用法：node generate-narrow.mjs <output.csv>
 */
import { writeFileSync } from "node:fs";

const SEED = 0x9e3779b9;
const ROWS = 200_000;
const COLUMNS = 3;
const CITIES = ["北京", "上海", "广州", "深圳"];

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
const lines = new Array(ROWS + 1);
lines[0] = "id,城市,金额";
for (let i = 1; i <= ROWS; i += 1) {
  const id = "n" + String(i).padStart(8, "0");
  const city = CITIES[i % CITIES.length];
  const amount = (random() * 1000).toFixed(2);
  lines[i] = id + "," + city + "," + amount;
}
writeFileSync(process.argv[2], lines.join("\n") + "\n", "utf8");