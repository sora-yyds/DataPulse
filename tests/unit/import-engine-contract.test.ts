import { describe, expect, it } from "vitest";
import {
  IMPORT_ADMISSION_LIMITS,
  IMPORT_ERROR_CODES,
  IMPORT_RUN_STATES,
  IMPORT_STATE_TRANSITION_INVALID,
  canTransitionImportRunState,
  createCellCountExceededError,
  createColumnLimitExceededError,
  createCompressionRatioExceededError,
  createCsvDecodeFailedError,
  createDecompressedSizeExceededError,
  createFileSizeExceededError,
  createImportCancelledError,
  createImportProgress,
  createInvalidImportRequestError,
  createMemoryEstimateExceededError,
  createRowLimitExceededError,
  createUnsupportedFormatError,
  isImportError,
  isImportRequestId,
  isTerminalImportRunState,
  transitionImportRunState,
  validateImportRequest,
  type ImportRequest,
  type ImportRequestId,
} from "../../packages/import-engine/dist/index.js";

function requestId(value = "req_import_001"): ImportRequestId {
  return value as ImportRequestId;
}

const VALID_REQUEST = Object.freeze({
  requestId: requestId(),
  fileName: "orders.csv",
  byteLength: 2048,
  format: "csv",
  csvEncoding: "utf-8",
});

describe("import admission limits (ADR-0050)", () => {
  it("freezes the admission limit constants", () => {
    expect(Object.isFrozen(IMPORT_ADMISSION_LIMITS)).toBe(true);
  });

  it("pins the exact byte/row/column/cell/ratio limits", () => {
    expect(IMPORT_ADMISSION_LIMITS.maxFileBytes).toBe(50 * 1024 * 1024);
    expect(IMPORT_ADMISSION_LIMITS.maxRows).toBe(200_000);
    expect(IMPORT_ADMISSION_LIMITS.maxColumns).toBe(100);
    expect(IMPORT_ADMISSION_LIMITS.maxNonEmptyCells).toBe(5_000_000);
    expect(IMPORT_ADMISSION_LIMITS.maxXlsxDecompressedBytes).toBe(500 * 1024 * 1024);
    expect(IMPORT_ADMISSION_LIMITS.maxXlsxCompressionRatio).toBe(100);
    expect(IMPORT_ADMISSION_LIMITS.maxEstimatedWorkingMemoryBytes).toBe(1_610_612_736);
  });
});

describe("import rejection errors", () => {
  it("carries concrete observed and limit values for file size", () => {
    const error = createFileSizeExceededError(60 * 1024 * 1024);
    expect(error.code).toBe(IMPORT_ERROR_CODES.fileSizeExceeded);
    expect(error.details).toEqual({
      reason: "file-size",
      observedBytes: 60 * 1024 * 1024,
      limitBytes: IMPORT_ADMISSION_LIMITS.maxFileBytes,
    });
  });

  it("pins observed values for every dimensional limit error", () => {
    expect(createRowLimitExceededError(200_001).details).toMatchObject({
      reason: "row-limit",
      observedRows: 200_001,
      limitRows: 200_000,
    });
    expect(createColumnLimitExceededError(101).details).toMatchObject({
      reason: "column-limit",
      observedColumns: 101,
      limitColumns: 100,
    });
    expect(createCellCountExceededError(5_000_001).details).toMatchObject({
      reason: "cell-count",
      observedCells: 5_000_001,
      limitCells: 5_000_000,
    });
    expect(createDecompressedSizeExceededError(500 * 1024 * 1024 + 1).details).toMatchObject({
      reason: "decompressed-size",
      observedBytes: 500 * 1024 * 1024 + 1,
      limitBytes: 500 * 1024 * 1024,
    });
    expect(
      createMemoryEstimateExceededError(1_610_612_737).details,
    ).toMatchObject({
      reason: "memory-estimate",
      observedBytes: 1_610_612_737,
      limitBytes: 1_610_612_736,
    });
  });

  it("computes the observed compression ratio from byte counts", () => {
    const error = createCompressionRatioExceededError(1_000, 100_000_000);
    expect(error.code).toBe(IMPORT_ERROR_CODES.compressionRatioExceeded);
    expect(error.details).toEqual({
      reason: "compression-ratio",
      observedRatio: 100_000,
      limitRatio: 100,
      compressedBytes: 1_000,
      decompressedBytes: 100_000_000,
    });
  });

  it("rejects malformed observed values with RangeError", () => {
    expect(() => createFileSizeExceededError(-1)).toThrow(RangeError);
    expect(() => createFileSizeExceededError(Number.NaN)).toThrow(RangeError);
    expect(() => createFileSizeExceededError(1.5)).toThrow(RangeError);
    expect(() => createRowLimitExceededError(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
    expect(() => createCompressionRatioExceededError(0, Number.NaN)).toThrow(
      RangeError,
    );
  });

  it("keeps unsupported-format, decode and cancellation reasons closed", () => {
    expect(createUnsupportedFormatError("xls").code).toBe(
      IMPORT_ERROR_CODES.unsupportedFormat,
    );
    expect(createUnsupportedFormatError("ods").details.reason).toBe("ods");
    expect(createCsvDecodeFailedError("fatal-utf8").code).toBe(
      IMPORT_ERROR_CODES.csvDecodeFailed,
    );
    expect(createImportCancelledError()).toEqual({
      code: IMPORT_ERROR_CODES.cancelled,
      details: { reason: "abort-signal" },
    });
    expect(createInvalidImportRequestError("request-id").code).toBe(
      IMPORT_ERROR_CODES.invalidRequest,
    );
  });

  it("serializes to bounded JSON without leaking free text", () => {
    const error = createFileSizeExceededError(70 * 1024 * 1024);
    const roundTripped = JSON.parse(JSON.stringify(error)) as unknown;
    expect(roundTripped).toEqual(error);
  });

  it("narrows only the stable import error family", () => {
    expect(isImportError(createImportCancelledError())).toBe(true);
    expect(isImportError(createCsvDecodeFailedError("bom-conflict"))).toBe(true);
    expect(isImportError({ code: "IMPORT_UNKNOWN" })).toBe(false);
    expect(isImportError({ code: 42 })).toBe(false);
    expect(isImportError(null)).toBe(false);
    expect(isImportError(undefined)).toBe(false);
    expect(isImportError(new Error("boom"))).toBe(false);
  });
});

describe("import request DTO", () => {
  it("accepts a valid csv request and freezes it", () => {
    const result = validateImportRequest(VALID_REQUEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(VALID_REQUEST);
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value as ImportRequest)).toBe(true);
    }
  });

  it("accepts xlsx without csvEncoding", () => {
    const result = validateImportRequest({
      requestId: requestId(),
      fileName: "workbook.xlsx",
      byteLength: 4096,
      format: "xlsx",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe("xlsx");
      expect("csvEncoding" in result.value).toBe(false);
    }
  });

  it("rejects malformed requests with the matching reason", () => {
    const cases: Array<[unknown, "type" | "request-id" | "file-name" | "byte-length" | "format" | "encoding"]> = [
      [null, "type"],
      ["orders.csv", "type"],
      [{ ...VALID_REQUEST, requestId: "short" }, "request-id"],
      [{ ...VALID_REQUEST, requestId: "bad id!" }, "request-id"],
      [{ ...VALID_REQUEST, fileName: "" }, "file-name"],
      [{ ...VALID_REQUEST, fileName: "x".repeat(256) }, "file-name"],
      [{ ...VALID_REQUEST, byteLength: -1 }, "byte-length"],
      [{ ...VALID_REQUEST, byteLength: 1.5 }, "byte-length"],
      [{ ...VALID_REQUEST, byteLength: Number.NaN }, "byte-length"],
      [{ ...VALID_REQUEST, format: "parquet" }, "format"],
      [{ ...VALID_REQUEST, csvEncoding: "latin1" }, "encoding"],
    ];
    for (const [input, expectedReason] of cases) {
      const result = validateImportRequest(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(IMPORT_ERROR_CODES.invalidRequest);
        expect(result.error.details.reason).toBe(expectedReason);
      }
    }
  });

  it("validates request id boundaries", () => {
    expect(isImportRequestId("a".repeat(8))).toBe(true);
    expect(isImportRequestId("a".repeat(128))).toBe(true);
    expect(isImportRequestId("a".repeat(7))).toBe(false);
    expect(isImportRequestId("a".repeat(129))).toBe(false);
    expect(isImportRequestId("")).toBe(false);
    expect(isImportRequestId(42)).toBe(false);
    expect(isImportRequestId("req/import")).toBe(false);
  });
});

describe("import progress state machine", () => {
  it("creates frozen progress DTOs", () => {
    const progress = createImportProgress(requestId(), "admission", {
      bytesRead: 1024,
      rows: 5,
    });
    expect(Object.isFrozen(progress)).toBe(true);
    expect(Object.isFrozen(progress.observed)).toBe(true);
    expect(progress).toEqual({
      requestId: "req_import_001",
      phase: "admission",
      observed: { bytesRead: 1024, rows: 5 },
    });
  });

  it("rejects invalid observed progress values", () => {
    expect(() =>
      createImportProgress(requestId(), "admission", { rows: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      createImportProgress(requestId(), "admission", { bytesRead: 1.5 }),
    ).toThrow(RangeError);
  });

  it("allows only explicit legal transitions", () => {
    expect(canTransitionImportRunState("not-started", "admission")).toBe(true);
    expect(canTransitionImportRunState("admission", "parsing")).toBe(true);
    expect(canTransitionImportRunState("admission", "completed")).toBe(true);
    expect(canTransitionImportRunState("parsing", "finalizing")).toBe(true);
    expect(canTransitionImportRunState("finalizing", "completed")).toBe(true);
    expect(canTransitionImportRunState("not-started", "completed")).toBe(false);
    expect(canTransitionImportRunState("completed", "admission")).toBe(false);
    expect(canTransitionImportRunState("cancelled", "admission")).toBe(false);
    expect(canTransitionImportRunState("admission", "not-started")).toBe(false);
  });

  it("returns the new state on success and a closed error on violation", () => {
    const ok = transitionImportRunState("not-started", "admission");
    expect(ok).toEqual({ ok: true, value: "admission" });
    const bad = transitionImportRunState("completed", "admission");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe(IMPORT_STATE_TRANSITION_INVALID);
      expect(bad.error.details).toEqual({
        reason: "invalid-transition",
        from: "completed",
        to: "admission",
      });
    }
  });

  it("recognises terminal states", () => {
    expect(isTerminalImportRunState("completed")).toBe(true);
    expect(isTerminalImportRunState("rejected")).toBe(true);
    expect(isTerminalImportRunState("cancelled")).toBe(true);
    expect(isTerminalImportRunState("admission")).toBe(false);
    expect(isTerminalImportRunState("not-started")).toBe(false);
    expect(IMPORT_RUN_STATES).toMatchObject({
      notStarted: "not-started",
      cancelled: "cancelled",
    });
  });
});