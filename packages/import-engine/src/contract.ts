/**
 * M0-028：导入探针 DTO 与 runImport seam。
 *
 * 本文件只冻结请求/成功/进度/runner 边界与校验规则，不实现解析。
 * 解析与资源准入在 M0-029 / M0-054 / M0-055 实现；生成器与消费者共享本契约。
 */
import type { Result } from "@datapulse/domain";
import {
  createInvalidImportRequestError,
  type ImportError,
  type InvalidRequestError,
  type InvalidRequestReason,
} from "./errors.js";
import type { ImportProgress } from "./progress.js";

export const IMPORT_SOURCE_FORMATS = Object.freeze(["csv", "xlsx"] as const);
export type ImportSourceFormat = (typeof IMPORT_SOURCE_FORMATS)[number];

export const CSV_ENCODINGS = Object.freeze(["utf-8", "gbk", "gb18030"] as const);
export type CsvEncoding = (typeof CSV_ENCODINGS)[number];

export const IMPORT_REQUEST_ID_MIN_LENGTH = 8;
export const IMPORT_REQUEST_ID_MAX_LENGTH = 128;
export const IMPORT_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
export const IMPORT_FILE_NAME_MAX_LENGTH = 255;

declare const importRequestIdBrand: unique symbol;

export type ImportRequestId = string & {
  readonly [importRequestIdBrand]: true;
};

export function isImportRequestId(value: unknown): value is ImportRequestId {
  return (
    typeof value === "string" &&
    value.length >= IMPORT_REQUEST_ID_MIN_LENGTH &&
    value.length <= IMPORT_REQUEST_ID_MAX_LENGTH &&
    IMPORT_REQUEST_ID_PATTERN.test(value)
  );
}

export type ImportRequest = Readonly<{
  requestId: ImportRequestId;
  fileName: string;
  byteLength: number;
  format: ImportSourceFormat;
  csvEncoding?: CsvEncoding;
}>;

export type ImportRequestValidationResult = Result<
  ImportRequest,
  InvalidRequestError
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 运行时校验导入请求 DTO。失败返回封闭的 IMPORT_INVALID_REQUEST 错误；
 * 成功返回冻结的请求对象，保证后续消费者只能读取。
 */
export function validateImportRequest(
  value: unknown,
): ImportRequestValidationResult {
  if (!isRecord(value)) {
    return invalidRequestFailure("type");
  }
  const requestId = value["requestId"];
  if (!isImportRequestId(requestId)) {
    return invalidRequestFailure("request-id");
  }
  const fileName = value["fileName"];
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    fileName.length > IMPORT_FILE_NAME_MAX_LENGTH
  ) {
    return invalidRequestFailure("file-name");
  }
  const byteLength = value["byteLength"];
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0) {
    return invalidRequestFailure("byte-length");
  }
  const format = value["format"];
  if (format !== "csv" && format !== "xlsx") {
    return invalidRequestFailure("format");
  }
  const csvEncoding = value["csvEncoding"];
  if (
    csvEncoding !== undefined &&
    csvEncoding !== "utf-8" &&
    csvEncoding !== "gbk" &&
    csvEncoding !== "gb18030"
  ) {
    return invalidRequestFailure("encoding");
  }
  const request: ImportRequest = Object.freeze({
    requestId,
    fileName,
    byteLength: byteLength as number,
    format: format as ImportSourceFormat,
    ...(csvEncoding === undefined
      ? {}
      : { csvEncoding: csvEncoding as CsvEncoding }),
  });
  return Object.freeze({ ok: true, value: request });
}

function invalidRequestFailure(
  reason: InvalidRequestReason,
): ImportRequestValidationResult {
  return Object.freeze({
    ok: false,
    error: createInvalidImportRequestError(reason),
  });
}

export type ImportDatasetSummary = Readonly<{
  rows: number;
  columns: number;
  nonEmptyCells: number;
}>;

export type ImportSuccess = Readonly<{
  requestId: ImportRequestId;
  dataset: ImportDatasetSummary;
}>;

export type ImportResult = Result<ImportSuccess, ImportError>;

export type ImportRunnerOptions = Readonly<{
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
}>;

/** M0 seam：`runImport(request, options) -> Promise<ImportResult>`。 */
export type ImportRunner = (
  request: ImportRequest,
  options?: ImportRunnerOptions,
) => Promise<ImportResult>;