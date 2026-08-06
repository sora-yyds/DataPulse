/**
 * M0-028：导入探针的进度/取消状态机。
 *
 * 状态机只允许显式合法迁移；终态（completed/rejected/cancelled）不可再迁移。
 * 取消通过 AbortSignal 表达，最终落到稳定的 IMPORT_CANCELLED 错误。
 */
import type { Result } from "@datapulse/domain";
import { isImportRequestId, type ImportRequestId } from "./contract.js";

export const IMPORT_RUN_STATES = Object.freeze({
  notStarted: "not-started",
  admission: "admission",
  parsing: "parsing",
  finalizing: "finalizing",
  completed: "completed",
  rejected: "rejected",
  cancelled: "cancelled",
} as const);

export type ImportRunState =
  (typeof IMPORT_RUN_STATES)[keyof typeof IMPORT_RUN_STATES];

/** 上报给调用方的进度阶段，排除仅内部使用的 not-started。 */
export type ImportRunPhase = Exclude<ImportRunState, "not-started">;

export type ImportObservedProgress = Readonly<{
  bytesRead?: number;
  rows?: number;
  columns?: number;
  nonEmptyCells?: number;
}>;

export type ImportProgress = Readonly<{
  requestId: ImportRequestId;
  phase: ImportRunPhase;
  observed: ImportObservedProgress;
}>;

const LEGAL_TRANSITIONS: Readonly<Record<ImportRunState, readonly ImportRunState[]>> =
  Object.freeze({
    "not-started": Object.freeze(["admission", "cancelled"] as const),
    admission: Object.freeze([
      "parsing",
      "finalizing",
      "completed",
      "rejected",
      "cancelled",
    ] as const),
    parsing: Object.freeze(["finalizing", "completed", "rejected", "cancelled"] as const),
    finalizing: Object.freeze(["completed", "rejected", "cancelled"] as const),
    completed: Object.freeze([]),
    rejected: Object.freeze([]),
    cancelled: Object.freeze([]),
  });

export function canTransitionImportRunState(
  from: ImportRunState,
  to: ImportRunState,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export const IMPORT_STATE_TRANSITION_INVALID = "IMPORT_STATE_TRANSITION_INVALID" as const;

export type ImportStateTransitionInvalidError = Readonly<{
  code: typeof IMPORT_STATE_TRANSITION_INVALID;
  details: Readonly<{
    reason: "invalid-transition";
    from: ImportRunState;
    to: ImportRunState;
  }>;
}>;

export type ImportStateTransitionResult = Result<
  ImportRunState,
  ImportStateTransitionInvalidError
>;

/**
 * 执行一次状态迁移。非法迁移返回封闭错误而不是抛出或静默忽略，
 * 便于上层把状态机错误当作可观测结果处理。
 */
export function transitionImportRunState(
  from: ImportRunState,
  to: ImportRunState,
): ImportStateTransitionResult {
  if (canTransitionImportRunState(from, to)) {
    return Object.freeze({ ok: true, value: to });
  }
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: IMPORT_STATE_TRANSITION_INVALID,
      details: Object.freeze({ reason: "invalid-transition", from, to }),
    }),
  });
}

export function isTerminalImportRunState(state: ImportRunState): boolean {
  return state === "completed" || state === "rejected" || state === "cancelled";
}

function assertBoundedCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `import-engine ${field} must be a non-negative safe integer`,
    );
  }
}

/** 创建冻结的进度 DTO；requestId 与观测值非法时抛 RangeError（编程错误）。 */
export function createImportProgress(
  requestId: ImportRequestId,
  phase: ImportRunPhase,
  observed: ImportObservedProgress = Object.freeze({}),
): ImportProgress {
  if (!isImportRequestId(requestId)) {
    throw new RangeError("import-engine requestId must be a valid import request id");
  }
  const entries: Array<[keyof ImportObservedProgress, number]> = [];
  if (observed.bytesRead !== undefined) {
    assertBoundedCount(observed.bytesRead, "bytesRead");
    entries.push(["bytesRead", observed.bytesRead]);
  }
  if (observed.rows !== undefined) {
    assertBoundedCount(observed.rows, "rows");
    entries.push(["rows", observed.rows]);
  }
  if (observed.columns !== undefined) {
    assertBoundedCount(observed.columns, "columns");
    entries.push(["columns", observed.columns]);
  }
  if (observed.nonEmptyCells !== undefined) {
    assertBoundedCount(observed.nonEmptyCells, "nonEmptyCells");
    entries.push(["nonEmptyCells", observed.nonEmptyCells]);
  }
  return Object.freeze({
    requestId,
    phase,
    observed: Object.freeze(Object.fromEntries(entries)),
  });
}