/**
 * M0-028：导入探针的稳定拒绝错误 DTO。
 *
 * 全部为封闭枚举、可 JSON 序列化、大小有界；details 只携带枚举 reason 与
 * 有界观测数值，绝不携带自由文本或原始文件内容。
 */
import { IMPORT_ADMISSION_LIMITS } from "./limits.js";

export const IMPORT_ERROR_CODES = Object.freeze({
  invalidRequest: "IMPORT_INVALID_REQUEST",
  unsupportedFormat: "IMPORT_UNSUPPORTED_FORMAT",
  fileSizeExceeded: "IMPORT_FILE_SIZE_EXCEEDED",
  rowLimitExceeded: "IMPORT_ROW_LIMIT_EXCEEDED",
  columnLimitExceeded: "IMPORT_COLUMN_LIMIT_EXCEEDED",
  cellCountExceeded: "IMPORT_CELL_COUNT_EXCEEDED",
  decompressedSizeExceeded: "IMPORT_DECOMPRESSED_SIZE_EXCEEDED",
  compressionRatioExceeded: "IMPORT_COMPRESSION_RATIO_EXCEEDED",
  memoryEstimateExceeded: "IMPORT_MEMORY_ESTIMATE_EXCEEDED",
  csvDecodeFailed: "IMPORT_CSV_DECODE_FAILED",
  archiveInvalid: "IMPORT_ARCHIVE_INVALID",
  cancelled: "IMPORT_CANCELLED",
} as const);

export type ImportErrorCode =
  (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];

export type InvalidRequestReason =
  | "type"
  | "request-id"
  | "file-name"
  | "byte-length"
  | "format"
  | "encoding";

export type UnsupportedFormatReason = "xls" | "xlsm" | "ods" | "unknown";

export type CsvDecodeFailedReason =
  | "fatal-utf8"
  | "bom-conflict"
  | "invalid-byte-sequence";

export type ArchiveInvalidReason =
  | "missing-eocd"
  | "truncated-central-directory"
  | "encrypted-entry";

export type ImportCancelledReason = "abort-signal";

type FrozenImportError<Code extends ImportErrorCode, Details extends object> =
  Readonly<{
    code: Code;
    details: Readonly<Details>;
  }>;

export type InvalidRequestError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.invalidRequest,
  { reason: InvalidRequestReason }
>;

export type UnsupportedFormatError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.unsupportedFormat,
  { reason: UnsupportedFormatReason }
>;

export type FileSizeExceededError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.fileSizeExceeded,
  { reason: "file-size"; observedBytes: number; limitBytes: number }
>;

export type RowLimitExceededError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.rowLimitExceeded,
  { reason: "row-limit"; observedRows: number; limitRows: number }
>;

export type ColumnLimitExceededError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.columnLimitExceeded,
  { reason: "column-limit"; observedColumns: number; limitColumns: number }
>;

export type CellCountExceededError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.cellCountExceeded,
  { reason: "cell-count"; observedCells: number; limitCells: number }
>;

export type DecompressedSizeExceededError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.decompressedSizeExceeded,
  { reason: "decompressed-size"; observedBytes: number; limitBytes: number }
>;

export type CompressionRatioExceededError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.compressionRatioExceeded,
  {
    reason: "compression-ratio";
    observedRatio: number;
    limitRatio: number;
    compressedBytes: number;
    decompressedBytes: number;
  }
>;

export type MemoryEstimateExceededError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.memoryEstimateExceeded,
  { reason: "memory-estimate"; observedBytes: number; limitBytes: number }
>;

export type CsvDecodeFailedError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.csvDecodeFailed,
  { reason: CsvDecodeFailedReason }
>;

export type ArchiveInvalidError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.archiveInvalid,
  { reason: ArchiveInvalidReason }
>;

export type ImportCancelledError = FrozenImportError<
  typeof IMPORT_ERROR_CODES.cancelled,
  { reason: ImportCancelledReason }
>;

export type ImportError =
  | InvalidRequestError
  | UnsupportedFormatError
  | FileSizeExceededError
  | RowLimitExceededError
  | ColumnLimitExceededError
  | CellCountExceededError
  | DecompressedSizeExceededError
  | CompressionRatioExceededError
  | MemoryEstimateExceededError
  | CsvDecodeFailedError
  | ArchiveInvalidError
  | ImportCancelledError;

function freezeError<Code extends ImportErrorCode, Details extends object>(
  code: Code,
  details: Details,
): FrozenImportError<Code, Details> {
  return Object.freeze({ code, details: Object.freeze(details) });
}

function assertBoundedCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `import-engine ${field} must be a non-negative safe integer`,
    );
  }
}

function assertPositiveRatio(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `import-engine ${field} must be a finite non-negative number`,
    );
  }
}

export function createInvalidImportRequestError(
  reason: InvalidRequestReason,
): InvalidRequestError {
  return freezeError(IMPORT_ERROR_CODES.invalidRequest, { reason });
}

export function createUnsupportedFormatError(
  reason: UnsupportedFormatReason,
): UnsupportedFormatError {
  return freezeError(IMPORT_ERROR_CODES.unsupportedFormat, { reason });
}

export function createFileSizeExceededError(
  observedBytes: number,
  limitBytes: number = IMPORT_ADMISSION_LIMITS.maxFileBytes,
): FileSizeExceededError {
  assertBoundedCount(observedBytes, "observedBytes");
  assertBoundedCount(limitBytes, "limitBytes");
  return freezeError(IMPORT_ERROR_CODES.fileSizeExceeded, {
    reason: "file-size",
    observedBytes,
    limitBytes,
  });
}

export function createRowLimitExceededError(
  observedRows: number,
  limitRows: number = IMPORT_ADMISSION_LIMITS.maxRows,
): RowLimitExceededError {
  assertBoundedCount(observedRows, "observedRows");
  assertBoundedCount(limitRows, "limitRows");
  return freezeError(IMPORT_ERROR_CODES.rowLimitExceeded, {
    reason: "row-limit",
    observedRows,
    limitRows,
  });
}

export function createColumnLimitExceededError(
  observedColumns: number,
  limitColumns: number = IMPORT_ADMISSION_LIMITS.maxColumns,
): ColumnLimitExceededError {
  assertBoundedCount(observedColumns, "observedColumns");
  assertBoundedCount(limitColumns, "limitColumns");
  return freezeError(IMPORT_ERROR_CODES.columnLimitExceeded, {
    reason: "column-limit",
    observedColumns,
    limitColumns,
  });
}

export function createCellCountExceededError(
  observedCells: number,
  limitCells: number = IMPORT_ADMISSION_LIMITS.maxNonEmptyCells,
): CellCountExceededError {
  assertBoundedCount(observedCells, "observedCells");
  assertBoundedCount(limitCells, "limitCells");
  return freezeError(IMPORT_ERROR_CODES.cellCountExceeded, {
    reason: "cell-count",
    observedCells,
    limitCells,
  });
}

export function createDecompressedSizeExceededError(
  observedBytes: number,
  limitBytes: number = IMPORT_ADMISSION_LIMITS.maxXlsxDecompressedBytes,
): DecompressedSizeExceededError {
  assertBoundedCount(observedBytes, "observedBytes");
  assertBoundedCount(limitBytes, "limitBytes");
  return freezeError(IMPORT_ERROR_CODES.decompressedSizeExceeded, {
    reason: "decompressed-size",
    observedBytes,
    limitBytes,
  });
}

export function createCompressionRatioExceededError(
  compressedBytes: number,
  decompressedBytes: number,
  limitRatio: number = IMPORT_ADMISSION_LIMITS.maxXlsxCompressionRatio,
): CompressionRatioExceededError {
  assertBoundedCount(compressedBytes, "compressedBytes");
  assertBoundedCount(decompressedBytes, "decompressedBytes");
  assertPositiveRatio(limitRatio, "limitRatio");
  const observedRatio =
    compressedBytes === 0 ? 0 : decompressedBytes / compressedBytes;
  return freezeError(IMPORT_ERROR_CODES.compressionRatioExceeded, {
    reason: "compression-ratio",
    observedRatio,
    limitRatio,
    compressedBytes,
    decompressedBytes,
  });
}

export function createMemoryEstimateExceededError(
  observedBytes: number,
  limitBytes: number = IMPORT_ADMISSION_LIMITS.maxEstimatedWorkingMemoryBytes,
): MemoryEstimateExceededError {
  assertBoundedCount(observedBytes, "observedBytes");
  assertBoundedCount(limitBytes, "limitBytes");
  return freezeError(IMPORT_ERROR_CODES.memoryEstimateExceeded, {
    reason: "memory-estimate",
    observedBytes,
    limitBytes,
  });
}

export function createCsvDecodeFailedError(
  reason: CsvDecodeFailedReason,
): CsvDecodeFailedError {
  return freezeError(IMPORT_ERROR_CODES.csvDecodeFailed, { reason });
}

export function createArchiveInvalidError(
  reason: ArchiveInvalidReason,
): ArchiveInvalidError {
  return freezeError(IMPORT_ERROR_CODES.archiveInvalid, { reason });
}

export function createImportCancelledError(): ImportCancelledError {
  return freezeError(IMPORT_ERROR_CODES.cancelled, { reason: "abort-signal" });
}

const IMPORT_ERROR_CODE_VALUES: readonly ImportErrorCode[] = Object.freeze(
  Object.values(IMPORT_ERROR_CODES),
);

/** Narrowing guard for the stable import rejection error family. */
export function isImportError(error: unknown): error is ImportError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    IMPORT_ERROR_CODE_VALUES.includes(
      (error as { code: ImportErrorCode }).code,
    )
  );
}