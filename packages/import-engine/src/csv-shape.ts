/**
 * M0-029：CSV 数据行形状扫描与维度上限拒绝。
 *
 * 口径：CSV 首行视为表头，不计入数据行数与数据非空单元格数；列数为任意行
 * （含表头）的最大字段数。字节级扫描，不依赖编码解码；引号字段、"" 转义、
 * 引号内换行、CRLF/LF 均按 RFC 4180 处理。任一维度超限立即返回对应稳定
 * 拒绝错误，不抽样、不截断。扫描器为增量状态机，chunk 边界不影响结果。
 */
import type { Result } from "@datapulse/domain";

import {
  createCellCountExceededError,
  createColumnLimitExceededError,
  createRowLimitExceededError,
  type ImportError,
} from "./errors.js";
import { IMPORT_ADMISSION_LIMITS } from "./limits.js";

export type CsvShape = Readonly<{
  /** 数据行数（不含表头）。 */
  rows: number;
  /** 任意行（含表头）的最大字段数。 */
  columns: number;
  /** 数据行的非空单元格数（不含表头）。 */
  nonEmptyCells: number;
}>;

export type CsvShapeResult = Result<CsvShape, ImportError>;

const COMMA = 0x2c;
const QUOTE = 0x22;
const CR = 0x0d;
const LF = 0x0a;

function success(value: CsvShape): CsvShapeResult {
  return Object.freeze({ ok: true, value });
}

function failure(error: ImportError): CsvShapeResult {
  return Object.freeze({ ok: false, error });
}

/**
 * 增量 CSV 形状扫描器。push() 返回首个超限错误（如有），finish() 产出形状。
 * chunk 边界不影响结果：所有跨 chunk 状态（引号候选、CRLF 合并）都是显式状态。
 */
export class CsvShapeScanner {
  private readonly limits = IMPORT_ADMISSION_LIMITS;
  private headerSeen = false;
  private inQuotes = false;
  private quoteCandidate = false;
  private pendingLf = false;
  private sawAnyByte = false;
  private fieldHasContent = false;
  private currentFields = 1;
  private columns = 0;
  private rows = 0;
  private nonEmptyCells = 0;
  private lastByteWasTerminator = false;
  private error: ImportError | null = null;

  /** 当前已完成的非空单元格数（数据行，不含表头）。 */
  get observedCells(): number {
    return this.nonEmptyCells;
  }

  /** 当前已完成的数据行数（不含表头）。 */
  get observedRows(): number {
    return this.rows;
  }

  push(chunk: Uint8Array): ImportError | null {
    if (this.error !== null) return this.error;
    for (let index = 0; index < chunk.length; index += 1) {
      const byte = chunk[index]!;
      this.sawAnyByte = true;
      if (this.pendingLf) {
        this.pendingLf = false;
        if (byte === LF) continue; // CRLF：行终止已在 CR 处记录
      }
      if (this.inQuotes) {
        if (this.quoteCandidate) {
          this.quoteCandidate = false;
          if (byte === QUOTE) {
            this.fieldHasContent = true;
            this.lastByteWasTerminator = false;
            continue;
          }
          this.inQuotes = false;
          // fall through: closing quote followed by a regular byte
        } else if (byte === QUOTE) {
          this.quoteCandidate = true;
          this.lastByteWasTerminator = false;
          continue;
        } else {
          this.fieldHasContent = true;
          this.lastByteWasTerminator = false;
          continue;
        }
      }
      if (byte === QUOTE) {
        if (this.fieldHasContent) {
          // 宽松处理：字段中间的引号视为内容
          this.fieldHasContent = true;
        } else {
          this.inQuotes = true;
        }
        this.lastByteWasTerminator = false;
      } else if (byte === COMMA) {
        this.lastByteWasTerminator = false;
        this.finalizeField();
        if (this.error !== null) return this.error;
      } else if (byte === LF) {
        this.lastByteWasTerminator = true;
        this.finalizeRow();
        if (this.error !== null) return this.error;
      } else if (byte === CR) {
        this.lastByteWasTerminator = true;
        this.pendingLf = true;
        this.finalizeRow();
        if (this.error !== null) return this.error;
      } else {
        this.fieldHasContent = true;
        this.lastByteWasTerminator = false;
      }
    }
    return this.error;
  }

  finish(): CsvShapeResult {
    if (this.error !== null) return failure(this.error);
    if (!this.headerSeen) {
      if (this.sawAnyByte) {
        this.headerSeen = true;
        this.columns = Math.max(this.columns, this.currentFields);
      }
    } else if (!this.lastByteWasTerminator) {
      this.rows += 1;
      if (this.rows > this.limits.maxRows) {
        return failure(createRowLimitExceededError(this.rows));
      }
      this.columns = Math.max(this.columns, this.currentFields);
      if (this.fieldHasContent) {
        this.nonEmptyCells += 1;
        if (this.nonEmptyCells > this.limits.maxNonEmptyCells) {
          return failure(
            createCellCountExceededError(this.nonEmptyCells),
          );
        }
      }
    }
    return success({
      rows: this.rows,
      columns: this.columns,
      nonEmptyCells: this.nonEmptyCells,
    });
  }

  private finalizeField(): void {
    if (this.error !== null) return;
    if (!this.headerSeen) {
      this.currentFields += 1;
      if (this.currentFields > this.limits.maxColumns) {
        this.error = createColumnLimitExceededError(this.currentFields);
        return;
      }
    } else {
      if (this.fieldHasContent) {
        this.nonEmptyCells += 1;
        if (this.nonEmptyCells > this.limits.maxNonEmptyCells) {
          this.error = createCellCountExceededError(this.nonEmptyCells);
          return;
        }
      }
      this.currentFields += 1;
      if (this.currentFields > this.limits.maxColumns) {
        this.error = createColumnLimitExceededError(this.currentFields);
        return;
      }
    }
    this.fieldHasContent = false;
  }

  private finalizeRow(): void {
    if (this.error !== null) return;
    if (!this.headerSeen) {
      this.headerSeen = true;
      this.columns = Math.max(this.columns, this.currentFields);
    } else {
      this.rows += 1;
      if (this.rows > this.limits.maxRows) {
        this.error = createRowLimitExceededError(this.rows);
        return;
      }
      this.columns = Math.max(this.columns, this.currentFields);
      if (this.fieldHasContent) {
        this.nonEmptyCells += 1;
        if (this.nonEmptyCells > this.limits.maxNonEmptyCells) {
          this.error = createCellCountExceededError(this.nonEmptyCells);
          return;
        }
      }
    }
    this.currentFields = 1;
    this.fieldHasContent = false;
  }
}

/** 对完整字节缓冲执行一次 CSV 形状扫描（单 chunk 驱动）。 */
export function scanCsvShape(bytes: Uint8Array): CsvShapeResult {
  const scanner = new CsvShapeScanner();
  const scanError = scanner.push(bytes);
  if (scanError !== null) return failure(scanError);
  return scanner.finish();
}