/**
 * M0-030：LocalAnalysis 的稳定错误 DTO。
 *
 * 全部为封闭枚举、可 JSON 序列化、大小有界；details 只携带枚举 reason 与
 * 有界观测值，绝不携带自由文本、原始数据或完整消息体。
 */
export const LOCAL_ANALYSIS_ERROR_CODES = Object.freeze({
  invalidRequest: "LOCAL_ANALYSIS_INVALID_REQUEST",
  transferLimitExceeded: "LOCAL_ANALYSIS_TRANSFER_LIMIT_EXCEEDED",
  stateTransitionInvalid: "LOCAL_ANALYSIS_STATE_TRANSITION_INVALID",
  cancelled: "LOCAL_ANALYSIS_CANCELLED",
  workerFailed: "LOCAL_ANALYSIS_WORKER_FAILED",
} as const);

export type LocalAnalysisErrorCode =
  (typeof LOCAL_ANALYSIS_ERROR_CODES)[keyof typeof LOCAL_ANALYSIS_ERROR_CODES];

export type InvalidRequestReason =
  | "type"
  | "shape"
  | "schema-version"
  | "kind"
  | "task-id"
  | "nonce"
  | "message-size"
  | "transferable"
  | "transferable-count"
  | "transferable-bytes"
  | "payload-size"
  | "wasm"
  | "phase"
  | "result"
  | "error";

export type TransferLimitReason = "count" | "item-bytes" | "total-bytes";

export type WorkerFailedReason =
  | "wasm-fetch-failed"
  | "wasm-hash-mismatch"
  | "worker-unreachable"
  | "worker-terminated"
  | "worker-invalid-message";

type FrozenError<Code extends string, Reason extends string> = Readonly<{
  code: Code;
  details: Readonly<{ reason: Reason }>;
}>;

export type InvalidRequestError = FrozenError<
  typeof LOCAL_ANALYSIS_ERROR_CODES.invalidRequest,
  InvalidRequestReason
>;

export type TransferLimitExceededError = Readonly<{
  code: typeof LOCAL_ANALYSIS_ERROR_CODES.transferLimitExceeded;
  details: Readonly<{
    reason: TransferLimitReason;
    observed: number;
    limit: number;
  }>;
}>;

export type StateTransitionInvalidError = Readonly<{
  code: typeof LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid;
  details: Readonly<{
    reason: "invalid-transition";
    from: string;
    to: string;
  }>;
}>;

export type CancelledError = Readonly<{
  code: typeof LOCAL_ANALYSIS_ERROR_CODES.cancelled;
  details: Readonly<{ reason: "abort-signal" }>;
}>;

export type WorkerFailedError = Readonly<{
  code: typeof LOCAL_ANALYSIS_ERROR_CODES.workerFailed;
  details: Readonly<{ reason: WorkerFailedReason }>;
}>;

export type LocalAnalysisError =
  | InvalidRequestError
  | TransferLimitExceededError
  | StateTransitionInvalidError
  | CancelledError
  | WorkerFailedError;

function freezeError<Code extends string, Reason extends string>(
  code: Code,
  details: Readonly<{ reason: Reason }>,
): FrozenError<Code, Reason> {
  return Object.freeze({
    code,
    details: Object.freeze(details),
  });
}

function assertBoundedCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`local-analysis ${field} must be a non-negative safe integer`);
  }
}

export function createInvalidRequestError(reason: InvalidRequestReason): InvalidRequestError {
  return freezeError(LOCAL_ANALYSIS_ERROR_CODES.invalidRequest, { reason });
}

export function createTransferLimitExceededError(
  reason: TransferLimitReason,
  observed: number,
  limit: number,
): TransferLimitExceededError {
  assertBoundedCount(observed, "observed");
  assertBoundedCount(limit, "limit");
  return Object.freeze({
    code: LOCAL_ANALYSIS_ERROR_CODES.transferLimitExceeded,
    details: Object.freeze({ reason, observed, limit }),
  });
}

export function createStateTransitionInvalidError(
  from: string,
  to: string,
): StateTransitionInvalidError {
  return Object.freeze({
    code: LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid,
    details: Object.freeze({ reason: "invalid-transition", from, to }),
  });
}

export function createCancelledError(): CancelledError {
  return freezeError(LOCAL_ANALYSIS_ERROR_CODES.cancelled, { reason: "abort-signal" });
}

export function createWorkerFailedError(reason: WorkerFailedReason): WorkerFailedError {
  return freezeError(LOCAL_ANALYSIS_ERROR_CODES.workerFailed, { reason });
}

const LOCAL_ANALYSIS_ERROR_CODE_VALUES: readonly LocalAnalysisErrorCode[] = Object.freeze(
  Object.values(LOCAL_ANALYSIS_ERROR_CODES),
);

/** Narrowing guard for the stable LocalAnalysis error family. */
export function isLocalAnalysisError(error: unknown): error is LocalAnalysisError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    LOCAL_ANALYSIS_ERROR_CODE_VALUES.includes(
      (error as { code: LocalAnalysisErrorCode }).code,
    )
  );
}