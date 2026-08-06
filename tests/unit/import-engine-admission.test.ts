import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSV_MEMORY_ESTIMATE,
  IMPORT_ADMISSION_LIMITS,
  IMPORT_ERROR_CODES,
  XLSX_MEMORY_ESTIMATE,
  admitImport,
  createArchiveInvalidError,
  estimateCsvWorkingMemoryBytes,
  estimateXlsxWorkingMemoryBytes,
  inspectXlsxArchive,
  isImportError,
  isWorkingMemoryWithinLimit,
  scanCsvShape,
  CsvShapeScanner,
  type ImportRequest,
  type ImportRequestId,
} from "../../packages/import-engine/dist/index.js";

function requestId(value = "req_import_001"): ImportRequestId {
  return value as ImportRequestId;
}

function csvRequest(overrides: Partial<ImportRequest> = {}): ImportRequest {
  return Object.freeze({
    requestId: requestId(),
    fileName: "table.csv",
    byteLength: 0,
    format: "csv",
    csvEncoding: "utf-8",
    ...overrides,
  });
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** 用固定 chunk 大小驱动增量扫描器（验证 chunk 边界无关性）。 */
function scanWithChunks(bytes: Uint8Array, chunkSize: number) {
  const scanner = new CsvShapeScanner();
  let error: ReturnType<CsvShapeScanner["push"]> = null;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    error = scanner.push(bytes.subarray(offset, offset + chunkSize));
    if (error !== null) break;
  }
  if (error !== null) return { ok: false as const, error };
  return scanner.finish();
}

// ---------------------------------------------------------------------------
// ZIP 构造辅助（测试专用）：只声明中央目录，不写入实际压缩数据。
// ---------------------------------------------------------------------------
interface TestZipEntry {
  readonly name: string;
  readonly csize: number;
  readonly usize: number;
}

function buildZip(
  entries: readonly TestZipEntry[],
  flags = 0,
): Uint8Array {
  const parts: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const local = Buffer.alloc(30 + nameBytes.byteLength);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(entry.csize, 18);
    local.writeUInt32LE(entry.usize, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    nameBytes.copy(local, 30);
    parts.push(local);

    const header = Buffer.alloc(46 + nameBytes.byteLength);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt32LE(entry.csize, 20);
    header.writeUInt32LE(entry.usize, 24);
    header.writeUInt16LE(nameBytes.byteLength, 28);
    header.writeUInt32LE(localOffset, 42);
    nameBytes.copy(header, 46);
    centralDirectory.push(header);
    localOffset += local.byteLength;
  }
  const centralDirectoryBytes = Buffer.concat(centralDirectory);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectoryBytes.byteLength, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return new Uint8Array(
    Buffer.concat([...parts, centralDirectoryBytes, eocd]),
  );
}

const repositoryRoot = new URL("../../", import.meta.url);
function fixtureBytes(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(relativePath, repositoryRoot)));
}

describe("M0-029 working memory static estimation", () => {
  it("freezes the CSV and XLSX estimate profiles", () => {
    expect(Object.isFrozen(CSV_MEMORY_ESTIMATE)).toBe(true);
    expect(Object.isFrozen(XLSX_MEMORY_ESTIMATE)).toBe(true);
    expect(CSV_MEMORY_ESTIMATE).toEqual({
      decodedTextBytesPerInputByte: 2,
      perRowBytes: 48,
      perColumnBytes: 256,
      perCellBytes: 96,
    });
    expect(XLSX_MEMORY_ESTIMATE).toEqual({
      compressedBytesFactor: 1,
      decompressedBytesFactor: 3,
      perEntryBytes: 4096,
    });
  });

  it("pins the exact CSV estimate formula", () => {
    expect(estimateCsvWorkingMemoryBytes(1_000, 10, 5, 100)).toBe(13_360);
    expect(estimateCsvWorkingMemoryBytes(0, 0, 0, 0)).toBe(0);
    // 50 MiB / 200k 行 / 100 列 / 5M 单元格的满档上限仍低于 1.5 GiB
    const fullLoad = estimateCsvWorkingMemoryBytes(
      50 * 1024 * 1024,
      200_000,
      100,
      5_000_000,
    );
    expect(isWorkingMemoryWithinLimit(fullLoad)).toBe(true);
  });

  it("pins the exact XLSX estimate formula", () => {
    expect(estimateXlsxWorkingMemoryBytes(1_000, 2_000, 3)).toBe(19_288);
    expect(estimateXlsxWorkingMemoryBytes(0, 0, 0)).toBe(0);
  });

  it("rejects invalid estimator inputs with RangeError", () => {
    expect(() => estimateCsvWorkingMemoryBytes(-1, 0, 0, 0)).toThrow(RangeError);
    expect(() => estimateCsvWorkingMemoryBytes(1, 1.5, 0, 0)).toThrow(RangeError);
    expect(() => estimateCsvWorkingMemoryBytes(1, 0, 0, Number.NaN)).toThrow(
      RangeError,
    );
    expect(() => estimateXlsxWorkingMemoryBytes(0, 0, -1)).toThrow(RangeError);
    expect(() => estimateXlsxWorkingMemoryBytes(Number.POSITIVE_INFINITY, 0, 0)).toThrow(
      RangeError,
    );
    expect(() => isWorkingMemoryWithinLimit(-2)).toThrow(RangeError);
  });
});

describe("M0-029 CSV shape scanning", () => {
  it("counts data rows excluding the header row", () => {
    const result = scanCsvShape(
      encode("类别,数量,金额\nA,12,100.50\nB,23,200.25\nC,34,300.75\nD,45,400.00\n"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ rows: 4, columns: 3, nonEmptyCells: 12 });
    }
  });

  it("matches the committed small/common fixture oracles", () => {
    const small = scanCsvShape(fixtureBytes("tests/fixtures/import-admission/small.csv"));
    expect(small.ok).toBe(true);
    if (small.ok) {
      expect(small.value).toEqual({ rows: 5, columns: 3, nonEmptyCells: 15 });
    }
    const common = scanCsvShape(fixtureBytes("tests/fixtures/import-admission/common.csv"));
    expect(common.ok).toBe(true);
    if (common.ok) {
      expect(common.value).toEqual({ rows: 50, columns: 6, nonEmptyCells: 300 });
    }
  });

  it("handles quoted fields, embedded newlines and escaped quotes", () => {
    const result = scanCsvShape(
      encode('h1,h2\n"a,b",c\n"x\ny",z\n"say ""hi""",w\n'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ rows: 3, columns: 2, nonEmptyCells: 6 });
    }
  });

  it("treats CRLF, LF and unterminated final rows identically", () => {
    const crlf = scanCsvShape(encode("a,b\r\nc,d\r\n"));
    const lf = scanCsvShape(encode("a,b\nc,d\n"));
    const unterminated = scanCsvShape(encode("a,b\nc,d"));
    for (const result of [crlf, lf, unterminated]) {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ rows: 1, columns: 2, nonEmptyCells: 2 });
      }
    }
  });

  it("returns zero shape for empty and header-only inputs", () => {
    expect(scanCsvShape(new Uint8Array(0))).toEqual({
      ok: true,
      value: { rows: 0, columns: 0, nonEmptyCells: 0 },
    });
    const headerOnly = scanCsvShape(encode("a,b,c\n"));
    expect(headerOnly.ok).toBe(true);
    if (headerOnly.ok) {
      expect(headerOnly.value).toEqual({ rows: 0, columns: 3, nonEmptyCells: 0 });
    }
  });

  it("is independent of chunk boundaries", () => {
    const bytes = encode('h1,h2,h3\n"a,b",c,"x\ny"\n"say ""hi""",w,zz\nd,e,f\n');
    const whole = scanCsvShape(bytes);
    expect(whole.ok).toBe(true);
    for (const chunkSize of [1, 2, 7, 64]) {
      const chunked = scanWithChunks(bytes, chunkSize);
      expect(chunked, `chunk size ${chunkSize}`).toEqual(whole);
    }
  });

  it("rejects rows beyond 200,000 with the observed count", () => {
    const lines = ["h"];
    for (let index = 0; index < 200_001; index += 1) lines.push("x");
    const result = scanCsvShape(encode(lines.join("\n") + "\n"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IMPORT_ERROR_CODES.rowLimitExceeded);
      expect(result.error.details).toMatchObject({
        reason: "row-limit",
        observedRows: 200_001,
        limitRows: 200_000,
      });
    }
  });

  it("rejects columns beyond 100 with the observed count", () => {
    const row = Array.from({ length: 101 }, (_, index) => `c${index}`).join(",");
    const result = scanCsvShape(encode(`h\n${row}\n`));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IMPORT_ERROR_CODES.columnLimitExceeded);
      expect(result.error.details).toMatchObject({
        reason: "column-limit",
        observedColumns: 101,
        limitColumns: 100,
      });
    }
  });

  it("rejects non-empty cells beyond 5,000,000 with the observed count", () => {
    // 50,000 行 x 100 列恰好 5,000,000 单元格；再补一行触发超限
    const row = Array.from({ length: 100 }, () => "0").join(",");
    const lines = ["h"];
    for (let index = 0; index < 50_000; index += 1) lines.push(row);
    lines.push("0");
    const result = scanCsvShape(encode(lines.join("\n") + "\n"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IMPORT_ERROR_CODES.cellCountExceeded);
      expect(result.error.details).toMatchObject({
        reason: "cell-count",
        observedCells: 5_000_001,
        limitCells: 5_000_000,
      });
    }
  });

  it("passes the exact wide-table boundary of 5,000,000 cells", () => {
    const row = Array.from({ length: 100 }, () => "0").join(",");
    const lines = ["h"];
    for (let index = 0; index < 50_000; index += 1) lines.push(row);
    const result = scanCsvShape(encode(lines.join("\n") + "\n"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        rows: 50_000,
        columns: 100,
        nonEmptyCells: 5_000_000,
      });
    }
  });
});

describe("M0-029 XLSX ZIP central directory inspection", () => {
  it("sums entry compressed/uncompressed sizes and ratio", () => {
    const zip = buildZip([
      { name: "[Content_Types].xml", csize: 100, usize: 200 },
      { name: "xl/workbook.xml", csize: 50, usize: 1_000 },
    ]);
    const result = inspectXlsxArchive(zip);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        entryCount: 2,
        compressedBytes: 150,
        decompressedBytes: 1_200,
        compressionRatio: 8,
      });
    }
  });

  it("rejects non-zip bytes with missing-eocd", () => {
    const result = inspectXlsxArchive(encode("this is not a zip archive"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(createArchiveInvalidError("missing-eocd"));
    }
  });

  it("rejects encrypted entries with the closed archive error", () => {
    const zip = buildZip([{ name: "a.xml", csize: 10, usize: 10 }], 0x0001);
    const result = inspectXlsxArchive(zip);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(
        createArchiveInvalidError("encrypted-entry"),
      );
    }
  });

  it("rejects truncated central directories", () => {
    const zip = buildZip([{ name: "a.xml", csize: 10, usize: 10 }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const eocdOffset = zip.byteLength - 22;
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    // 截断中央目录中间段，但保留完整 EOCD
    const truncated = new Uint8Array(
      Buffer.concat([
        Buffer.from(zip.subarray(0, centralDirectoryOffset + 10)),
        Buffer.from(zip.subarray(eocdOffset)),
      ]),
    );
    const result = inspectXlsxArchive(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(
        createArchiveInvalidError("truncated-central-directory"),
      );
    }
  });

  it("rejects entry-count mismatches as truncated", () => {
    const zip = buildZip([
      { name: "a.xml", csize: 10, usize: 10 },
      { name: "b.xml", csize: 20, usize: 20 },
    ]);
    // 手工改写 EOCD 的 totalEntries，使其与真实条目数不一致
    const tampered = new Uint8Array(zip);
    const view = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
    const eocdOffset = tampered.byteLength - 22;
    view.setUint16(eocdOffset + 10, 1, true);
    const result = inspectXlsxArchive(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(
        createArchiveInvalidError("truncated-central-directory"),
      );
    }
  });
});

describe("M0-029 admitImport end-to-end", () => {
  it("admits a csv file with dataset summary, memory estimate and progress", async () => {
    const bytes = encode("类别,数量,金额\nA,12,100.50\nB,23,200.25\nC,34,300.75\nD,45,400.00\n");
    const progress: unknown[] = [];
    const result = await admitImport(
      csvRequest({ byteLength: bytes.byteLength }),
      bytes,
      {
        onProgress: (event) => progress.push(event),
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe("csv");
      expect(result.value.requestId).toBe("req_import_001");
      if ("dataset" in result.value.admission) {
        const admission = result.value.admission as {
          dataset: { rows: number; columns: number; nonEmptyCells: number };
          estimatedWorkingMemoryBytes: number;
        };
        expect(admission.dataset).toEqual({ rows: 4, columns: 3, nonEmptyCells: 12 });
        expect(admission.estimatedWorkingMemoryBytes).toBe(
          estimateCsvWorkingMemoryBytes(bytes.byteLength, 4, 3, 12),
        );
      } else {
        throw new Error("expected a csv admission");
      }
    }
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0]).toMatchObject({ phase: "admission" });
  });

  it("admits an xlsx file with archive inspection and memory estimate", async () => {
    const zip = buildZip([
      { name: "[Content_Types].xml", csize: 100, usize: 200 },
      { name: "xl/workbook.xml", csize: 50, usize: 1_000 },
    ]);
    const result = await admitImport(
      csvRequest({ fileName: "book.xlsx", byteLength: zip.byteLength, format: "xlsx" }),
      zip,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe("xlsx");
      const admission = result.value.admission as {
        archive: { entryCount: number };
        estimatedWorkingMemoryBytes: number;
      };
      expect(admission.archive.entryCount).toBe(2);
      expect(admission.estimatedWorkingMemoryBytes).toBe(
        estimateXlsxWorkingMemoryBytes(150, 1_200, 2),
      );
    }
  });

  it("rejects files larger than 50 MiB before scanning", async () => {
    const oversized = new Uint8Array(50 * 1024 * 1024 + 1);
    const result = await admitImport(
      csvRequest({ byteLength: oversized.byteLength }),
      oversized,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IMPORT_ERROR_CODES.fileSizeExceeded);
      expect(result.error.details).toMatchObject({
        reason: "file-size",
        observedBytes: 50 * 1024 * 1024 + 1,
        limitBytes: 50 * 1024 * 1024,
      });
    }
  });

  it("rejects malformed requests with the closed invalid-request error", async () => {
    const bytes = encode("a,b\nc,d\n");
    const result = await admitImport(
      { requestId: "short", fileName: "t.csv", byteLength: bytes.byteLength, format: "csv" },
      bytes,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IMPORT_ERROR_CODES.invalidRequest);
    }
  });

  it("returns a stable cancelled error on an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const bytes = encode("a,b\nc,d\n");
    const result = await admitImport(
      csvRequest({ byteLength: bytes.byteLength }),
      bytes,
      { signal: controller.signal },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: IMPORT_ERROR_CODES.cancelled,
        details: { reason: "abort-signal" },
      });
    }
  });

  it("rejects xlsx decompressed size, compression ratio and memory overruns", async () => {
    const decompressedOverrun = buildZip([
      { name: "a.xml", csize: 1_000, usize: 500 * 1024 * 1024 + 1 },
    ]);
    const decompressedResult = await admitImport(
      csvRequest({ fileName: "big.xlsx", byteLength: decompressedOverrun.byteLength, format: "xlsx" }),
      decompressedOverrun,
    );
    expect(decompressedResult.ok).toBe(false);
    if (!decompressedResult.ok) {
      expect(decompressedResult.error.code).toBe(
        IMPORT_ERROR_CODES.decompressedSizeExceeded,
      );
    }

    const ratioOverrun = buildZip([{ name: "a.xml", csize: 1_000, usize: 200_000 }]);
    const ratioResult = await admitImport(
      csvRequest({ fileName: "ratio.xlsx", byteLength: ratioOverrun.byteLength, format: "xlsx" }),
      ratioOverrun,
    );
    expect(ratioResult.ok).toBe(false);
    if (!ratioResult.ok) {
      expect(ratioResult.error.code).toBe(
        IMPORT_ERROR_CODES.compressionRatioExceeded,
      );
      expect(ratioResult.error.details).toMatchObject({
        reason: "compression-ratio",
        observedRatio: 200,
        limitRatio: 100,
      });
    }

    // 解压恰好 500 MiB、压缩 40 MB：解压与压缩比均通过，但工作内存估算超 1.5 GiB
    const memoryOverrun = buildZip([
      { name: "xl/sharedStrings.xml", csize: 40_000_000, usize: 500 * 1024 * 1024 },
    ]);
    const memoryResult = await admitImport(
      csvRequest({ fileName: "memory.xlsx", byteLength: memoryOverrun.byteLength, format: "xlsx" }),
      memoryOverrun,
    );
    expect(memoryResult.ok).toBe(false);
    if (!memoryResult.ok) {
      expect(memoryResult.error.code).toBe(
        IMPORT_ERROR_CODES.memoryEstimateExceeded,
      );
      expect(memoryResult.error.details).toMatchObject({
        reason: "memory-estimate",
        observedBytes: 1_612_868_096,
        limitBytes: IMPORT_ADMISSION_LIMITS.maxEstimatedWorkingMemoryBytes,
      });
    }
  });
});

describe("M0-029 archive-invalid error contract", () => {
  it("is a stable closed error in the import error family", () => {
    const error = createArchiveInvalidError("missing-eocd");
    expect(error.code).toBe(IMPORT_ERROR_CODES.archiveInvalid);
    expect(error.details.reason).toBe("missing-eocd");
    expect(isImportError(error)).toBe(true);
    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
  });
});