/**
 * M0-028：ADR-0050 冻结的本地导入准入边界。
 *
 * 单位一律为字节；"50 MB / 500 MB / 1.5 GB" 按二进制 MiB / GiB 解释，
 * 保证跨平台确定性测试与实现一致。边界只允许被此常量引用，不得在包外重算。
 */
export const IMPORT_ADMISSION_LIMITS = Object.freeze({
  maxFileBytes: 50 * 1024 * 1024,
  maxRows: 200_000,
  maxColumns: 100,
  maxNonEmptyCells: 5_000_000,
  maxXlsxDecompressedBytes: 500 * 1024 * 1024,
  maxXlsxCompressionRatio: 100,
  maxEstimatedWorkingMemoryBytes: 1_610_612_736,
} as const);

export type ImportAdmissionLimits = typeof IMPORT_ADMISSION_LIMITS;