/**
 * M0-029：导入前峰值工作内存的确定性静态估算。
 *
 * 估算公式为保守上界，只使用请求字节数与已观测的行/列/单元格结构，
 * 不依赖当前设备内存、运行时或非固定随机数；所有系数冻结，跨平台字节稳定。
 * CSV 按“原始字节解码为 UTF-16 文本 + 行/列/单元格对象”建模，
 * XLSX 按“压缩字节 + 解压 XML/字符串表 + 目录条目”建模。
 */
import { IMPORT_ADMISSION_LIMITS } from "./limits.js";

export const CSV_MEMORY_ESTIMATE = Object.freeze({
  /** 每个输入字节按最坏情况解码为 2 个 UTF-16 字节。 */
  decodedTextBytesPerInputByte: 2,
  /** 每行记录结构的保守字节开销。 */
  perRowBytes: 48,
  /** 每列 schema/元数据字节开销。 */
  perColumnBytes: 256,
  /** 每个非空单元格值的保守字节开销。 */
  perCellBytes: 96,
} as const);

export type CsvMemoryEstimateProfile = typeof CSV_MEMORY_ESTIMATE;

export const XLSX_MEMORY_ESTIMATE = Object.freeze({
  /** 压缩字节按原样驻留内存。 */
  compressedBytesFactor: 1,
  /** 解压 XML/字符串表按 3 倍字节开销驻留内存。 */
  decompressedBytesFactor: 3,
  /** 每个 ZIP 目录条目的固定开销。 */
  perEntryBytes: 4096,
} as const);

export type XlsxMemoryEstimateProfile = typeof XLSX_MEMORY_ESTIMATE;

function assertBoundedCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `import-engine ${field} must be a non-negative safe integer`,
    );
  }
}

/** 估算 CSV 解析峰值工作内存（字节）。 */
export function estimateCsvWorkingMemoryBytes(
  byteLength: number,
  rows: number,
  columns: number,
  nonEmptyCells: number,
): number {
  assertBoundedCount(byteLength, "byteLength");
  assertBoundedCount(rows, "rows");
  assertBoundedCount(columns, "columns");
  assertBoundedCount(nonEmptyCells, "nonEmptyCells");
  const profile = CSV_MEMORY_ESTIMATE;
  return (
    byteLength * profile.decodedTextBytesPerInputByte +
    rows * profile.perRowBytes +
    columns * profile.perColumnBytes +
    nonEmptyCells * profile.perCellBytes
  );
}

/** 估算 `.xlsx` 解析峰值工作内存（字节）。 */
export function estimateXlsxWorkingMemoryBytes(
  compressedBytes: number,
  decompressedBytes: number,
  entryCount: number,
): number {
  assertBoundedCount(compressedBytes, "compressedBytes");
  assertBoundedCount(decompressedBytes, "decompressedBytes");
  assertBoundedCount(entryCount, "entryCount");
  const profile = XLSX_MEMORY_ESTIMATE;
  return (
    compressedBytes * profile.compressedBytesFactor +
    decompressedBytes * profile.decompressedBytesFactor +
    entryCount * profile.perEntryBytes
  );
}

/** 判定估算值是否超过 ADR-0050 冻结的 1.5 GiB 峰值工作内存上限。 */
export function isWorkingMemoryWithinLimit(
  estimatedBytes: number,
  limitBytes: number = IMPORT_ADMISSION_LIMITS.maxEstimatedWorkingMemoryBytes,
): boolean {
  assertBoundedCount(estimatedBytes, "estimatedBytes");
  assertBoundedCount(limitBytes, "limitBytes");
  return estimatedBytes <= limitBytes;
}