/**
 * M0-033：analysis-engine 的稳定错误 DTO。
 *
 * 全部为封闭枚举、可 JSON 序列化、大小有界；details 只携带枚举 reason 与
 * 有界观测值，绝不携带自由文本、原始数据或完整输入体。
 */
export const ANALYSIS_ENGINE_ERROR_CODES = Object.freeze({
  inputInvalid: "ANALYSIS_INPUT_INVALID",
  inputLimitExceeded: "ANALYSIS_INPUT_LIMIT_EXCEEDED",
  engineUnavailable: "ANALYSIS_ENGINE_UNAVAILABLE",
  executionFailed: "ANALYSIS_EXECUTION_FAILED",
  cancelled: "ANALYSIS_CANCELLED",
} as const);

export type AnalysisEngineErrorCode =
  (typeof ANALYSIS_ENGINE_ERROR_CODES)[keyof typeof ANALYSIS_ENGINE_ERROR_CODES];

export type InvalidInputReason =
  | "type"
  | "shape"
  | "schema-version"
  | "request-id"
  | "arrow"
  | "metrics"
  | "metric-id"
  | "aggregate"
  | "column";

export type InputLimitReason = "arrow-bytes" | "metrics-count";

export type EngineUnavailableReason =
  | "wasm-load"
  | "wasm-instantiate"
  | "db-open"
  | "connect";

export type ExecutionFailedReason =
  | "insert"
  | "query"
  | "parse"
  | "non-finite";

type FrozenError<Code extends string, Reason extends string> = Readonly<{
  code: Code;
  details: Readonly<{ reason: Reason }>;
}>;

export type InvalidInputError = FrozenError<
  typeof ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
  InvalidInputReason
>;

export type InputLimitExceededError = Readonly<{
  code: typeof ANALYSIS_ENGINE_ERROR_CODES.inputLimitExceeded;
  details: Readonly<{
    reason: InputLimitReason;
    observed: number;
    limit: number;
  }>;
}>;

export type EngineUnavailableError = FrozenError<
  typeof ANALYSIS_ENGINE_ERROR_CODES.engineUnavailable,
  EngineUnavailableReason
>;

export type ExecutionFailedError = FrozenError<
  typeof ANALYSIS_ENGINE_ERROR_CODES.executionFailed,
  ExecutionFailedReason
>;

export type CancelledError = Readonly<{
  code: typeof ANALYSIS_ENGINE_ERROR_CODES.cancelled;
  details: Readonly<{ reason: "abort-signal" }>;
}>;

export type AnalysisEngineError =
  | InvalidInputError
  | InputLimitExceededError
  | EngineUnavailableError
  | ExecutionFailedError
  | CancelledError;

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
    throw new RangeError(`analysis-engine ${field} must be a non-negative safe integer`);
  }
}

export function createInvalidInputError(reason: InvalidInputReason): InvalidInputError {
  return freezeError(ANALYSIS_ENGINE_ERROR_CODES.inputInvalid, { reason });
}

export function createInputLimitExceededError(
  reason: InputLimitReason,
  observed: number,
  limit: number,
): InputLimitExceededError {
  assertBoundedCount(observed, "observed");
  assertBoundedCount(limit, "limit");
  return Object.freeze({
    code: ANALYSIS_ENGINE_ERROR_CODES.inputLimitExceeded,
    details: Object.freeze({ reason, observed, limit }),
  });
}

export function createEngineUnavailableError(
  reason: EngineUnavailableReason,
): EngineUnavailableError {
  return freezeError(ANALYSIS_ENGINE_ERROR_CODES.engineUnavailable, { reason });
}

export function createExecutionFailedError(
  reason: ExecutionFailedReason,
): ExecutionFailedError {
  return freezeError(ANALYSIS_ENGINE_ERROR_CODES.executionFailed, { reason });
}

export function createAnalysisCancelledError(): CancelledError {
  return freezeError(ANALYSIS_ENGINE_ERROR_CODES.cancelled, { reason: "abort-signal" });
}

const ANALYSIS_ENGINE_ERROR_CODE_VALUES: readonly AnalysisEngineErrorCode[] =
  Object.freeze(Object.values(ANALYSIS_ENGINE_ERROR_CODES));

/** Narrowing guard for the stable analysis-engine error family. */
export function isAnalysisEngineError(
  error: unknown,
): error is AnalysisEngineError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    ANALYSIS_ENGINE_ERROR_CODE_VALUES.includes(
      (error as { code: AnalysisEngineErrorCode }).code,
    )
  );
}