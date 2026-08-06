/**
 * M0-029：导入准入编排——文件/行/列/非空单元格、`.xlsx` ZIP 目录/解压大小/
 * 压缩比与工作内存静态估算的完整拒绝入口。
 *
 * 拒绝优先级冻结：invalid-request → file-size → (xlsx) decompressed-size →
 * compression-ratio → (csv 扫描中按流顺序) row/column/cell → memory-estimate →
 * abort-signal 取消。任何超限都完整拒绝，不抽样、不截断、不转云端。
 */
import type { Result } from "@datapulse/domain";

import { CsvShapeScanner, type CsvShape } from "./csv-shape.js";
import {
  validateImportRequest,
  type ImportDatasetSummary,
  type ImportRequest,
  type ImportRequestId,
  type ImportSourceFormat,
} from "./contract.js";
import {
  createFileSizeExceededError,
  createImportCancelledError,
  createCompressionRatioExceededError,
  createDecompressedSizeExceededError,
  createMemoryEstimateExceededError,
  type ImportError,
} from "./errors.js";
import { IMPORT_ADMISSION_LIMITS } from "./limits.js";
import {
  estimateCsvWorkingMemoryBytes,
  estimateXlsxWorkingMemoryBytes,
} from "./memory.js";
import {
  createImportProgress,
  type ImportProgress,
} from "./progress.js";
import { inspectXlsxArchive, type XlsxArchiveInspection } from "./zip-archive.js";

export type CsvAdmission = Readonly<{
  dataset: ImportDatasetSummary;
  estimatedWorkingMemoryBytes: number;
}>;

export type XlsxAdmission = Readonly<{
  archive: XlsxArchiveInspection;
  estimatedWorkingMemoryBytes: number;
}>;

export type ImportAdmissionSuccess = Readonly<{
  requestId: ImportRequestId;
  format: ImportSourceFormat;
  admission: CsvAdmission | XlsxAdmission;
}>;

export type ImportAdmissionOptions = Readonly<{
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
}>;

export type ImportAdmissionResult = Result<ImportAdmissionSuccess, ImportError>;

export type { CsvShape };

const CSV_ADMISSION_CHUNK_BYTES = 64 * 1024;
const XLSX_ADMISSION_CHUNK_BYTES = 1024 * 1024;

function success(value: ImportAdmissionSuccess): ImportAdmissionResult {
  return Object.freeze({ ok: true, value });
}

function failure(error: ImportError): ImportAdmissionResult {
  return Object.freeze({ ok: false, error });
}

function emitProgress(
  requestId: ImportRequestId,
  onProgress: ((progress: ImportProgress) => void) | undefined,
  bytesRead: number,
  rows?: number,
): void {
  if (typeof onProgress !== "function") return;
  onProgress(
    createImportProgress(requestId, "admission", {
      ...(rows === undefined ? {} : { rows }),
      bytesRead,
    }),
  );
}

function assertSignalNotAborted(signal: AbortSignal | undefined): ImportError | null {
  return signal?.aborted === true ? createImportCancelledError() : null;
}

async function admitCsv(
  request: ImportRequest,
  bytes: Uint8Array,
  options: ImportAdmissionOptions,
): Promise<ImportAdmissionResult> {
  const scanner = new CsvShapeScanner();
  const limits = IMPORT_ADMISSION_LIMITS;
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += CSV_ADMISSION_CHUNK_BYTES
  ) {
    const aborted = assertSignalNotAborted(options.signal);
    if (aborted !== null) return failure(aborted);
    const end = Math.min(offset + CSV_ADMISSION_CHUNK_BYTES, bytes.byteLength);
    const chunk = bytes.subarray(offset, end);
    const scanError = scanner.push(chunk);
    if (scanError !== null) return failure(scanError);
    emitProgress(request.requestId, options.onProgress, end, scanner.observedRows);
  }
  const shapeResult = scanner.finish();
  if (!shapeResult.ok) return failure(shapeResult.error);
  const shape: CsvShape = shapeResult.value;
  const estimatedWorkingMemoryBytes = estimateCsvWorkingMemoryBytes(
    bytes.byteLength,
    shape.rows,
    shape.columns,
    shape.nonEmptyCells,
  );
  if (estimatedWorkingMemoryBytes > limits.maxEstimatedWorkingMemoryBytes) {
    return failure(createMemoryEstimateExceededError(estimatedWorkingMemoryBytes));
  }
  return success({
    requestId: request.requestId,
    format: "csv",
    admission: {
      dataset: shape,
      estimatedWorkingMemoryBytes,
    },
  });
}

async function admitXlsx(
  request: ImportRequest,
  bytes: Uint8Array,
  options: ImportAdmissionOptions,
): Promise<ImportAdmissionResult> {
  const limits = IMPORT_ADMISSION_LIMITS;
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += XLSX_ADMISSION_CHUNK_BYTES
  ) {
    const aborted = assertSignalNotAborted(options.signal);
    if (aborted !== null) return failure(aborted);
    const end = Math.min(offset + XLSX_ADMISSION_CHUNK_BYTES, bytes.byteLength);
    emitProgress(request.requestId, options.onProgress, end);
  }
  const inspectionResult = inspectXlsxArchive(bytes);
  if (!inspectionResult.ok) return failure(inspectionResult.error);
  const archive = inspectionResult.value;
  if (archive.decompressedBytes > limits.maxXlsxDecompressedBytes) {
    return failure(
      createDecompressedSizeExceededError(archive.decompressedBytes),
    );
  }
  if (archive.compressionRatio > limits.maxXlsxCompressionRatio) {
    return failure(
      createCompressionRatioExceededError(
        archive.compressedBytes,
        archive.decompressedBytes,
      ),
    );
  }
  const estimatedWorkingMemoryBytes = estimateXlsxWorkingMemoryBytes(
    archive.compressedBytes,
    archive.decompressedBytes,
    archive.entryCount,
  );
  if (estimatedWorkingMemoryBytes > limits.maxEstimatedWorkingMemoryBytes) {
    return failure(createMemoryEstimateExceededError(estimatedWorkingMemoryBytes));
  }
  return success({
    requestId: request.requestId,
    format: "xlsx",
    admission: {
      archive,
      estimatedWorkingMemoryBytes,
    },
  });
}

/**
 * 执行一次导入准入：校验请求、文件大小、维度/解压/压缩比/内存估算，
 * 任意超限完整拒绝；`signal` 取消返回 IMPORT_CANCELLED。
 */
export async function admitImport(
  request: ImportRequest,
  bytes: Uint8Array,
  options: ImportAdmissionOptions = Object.freeze({}),
): Promise<ImportAdmissionResult> {
  const validated = validateImportRequest(request);
  if (!validated.ok) {
    return failure(validated.error);
  }
  if (bytes.byteLength > IMPORT_ADMISSION_LIMITS.maxFileBytes) {
    return failure(createFileSizeExceededError(bytes.byteLength));
  }
  const aborted = assertSignalNotAborted(options.signal);
  if (aborted !== null) return failure(aborted);
  if (request.format === "csv") {
    return admitCsv(request, bytes, options);
  }
  return admitXlsx(request, bytes, options);
}