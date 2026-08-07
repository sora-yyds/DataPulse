/**
 * M0-033：analysis-engine 的输入/结果契约。
 *
 * 本文件只冻结 AnalysisInput 的形状、运行时校验、AnalysisResult 与 runner
 * seam；DuckDB-WASM 执行细节在 engine.ts。输入只携带 Arrow IPC 流与指标
 * 请求，结果只携带版本化 MetricAccumulator，不直接产出 Evidence、文案或
 * Story 区块。
 */
import {
  parseMetricId,
  type MetricId,
  type Result,
} from "@datapulse/domain";
import type { MetricAccumulator } from "@datapulse/metric-runtime";
import type { AnalysisEngineError } from "./errors.js";
import {
  createInputLimitExceededError,
  createInvalidInputError,
} from "./errors.js";
import {
  ANALYSIS_ENGINE_LIMITS,
  ANALYSIS_ENGINE_SCHEMA_VERSION,
} from "./limits.js";

declare const analysisRequestIdBrand: unique symbol;

export type AnalysisRequestId = string & {
  readonly [analysisRequestIdBrand]: true;
};

export function isAnalysisRequestId(value: unknown): value is AnalysisRequestId {
  return (
    typeof value === "string" &&
    value.length >= ANALYSIS_ENGINE_LIMITS.requestIdMinLength &&
    value.length <= ANALYSIS_ENGINE_LIMITS.requestIdMaxLength &&
    ANALYSIS_ENGINE_LIMITS.requestIdPattern.test(value)
  );
}

export type AnalysisAggregate = "COUNT_ROWS" | "SUM";

export type AnalysisMetricRequest = Readonly<{
  metricId: MetricId;
  aggregate: AnalysisAggregate;
  /** SUM 必填且必须是严格标识符；COUNT_ROWS 不得携带。 */
  column?: string;
}>;

export type AnalysisInput = Readonly<{
  schemaVersion: typeof ANALYSIS_ENGINE_SCHEMA_VERSION;
  requestId: AnalysisRequestId;
  /** 有界 Arrow IPC 流字节；引擎只聚合，不逐行外传。 */
  arrow: Uint8Array;
  metrics: readonly AnalysisMetricRequest[];
}>;

export type AnalysisResult = Readonly<{
  schemaVersion: typeof ANALYSIS_ENGINE_SCHEMA_VERSION;
  requestId: AnalysisRequestId;
  /** 与输入 metrics 顺序一致；每个都是版本化 metric-runtime accumulator。 */
  accumulators: readonly MetricAccumulator[];
}>;

export type AnalysisInputValidationResult = Result<
  AnalysisInput,
  AnalysisEngineError
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMetricRequest(value: unknown): value is AnalysisMetricRequest {
  return isRecord(value);
}

function isColumnName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= ANALYSIS_ENGINE_LIMITS.columnNameMinLength &&
    value.length <= ANALYSIS_ENGINE_LIMITS.columnNameMaxLength &&
    ANALYSIS_ENGINE_LIMITS.columnNamePattern.test(value)
  );
}

function invalidInputFailure(
  reason: Parameters<typeof createInvalidInputError>[0],
): AnalysisInputValidationResult {
  return Object.freeze({
    ok: false,
    error: createInvalidInputError(reason),
  });
}

function limitFailure(
  reason: Parameters<typeof createInputLimitExceededError>[0],
  observed: number,
  limit: number,
): AnalysisInputValidationResult {
  return Object.freeze({
    ok: false,
    error: createInputLimitExceededError(reason, observed, limit),
  });
}

/**
 * 运行时校验 AnalysisInput。失败返回封闭错误，成功返回冻结请求对象，
 * 保证后续消费者只能读取不可变输入。
 */
export function validateAnalysisInput(value: unknown): AnalysisInputValidationResult {
  if (!isRecord(value)) {
    return invalidInputFailure("type");
  }
  if (value["schemaVersion"] !== ANALYSIS_ENGINE_SCHEMA_VERSION) {
    return invalidInputFailure("schema-version");
  }
  const requestId = value["requestId"];
  if (!isAnalysisRequestId(requestId)) {
    return invalidInputFailure("request-id");
  }
  const arrow = value["arrow"];
  if (!(arrow instanceof Uint8Array)) {
    return invalidInputFailure("arrow");
  }
  if (arrow.byteLength > ANALYSIS_ENGINE_LIMITS.arrowIpcMaxBytes) {
    return limitFailure(
      "arrow-bytes",
      arrow.byteLength,
      ANALYSIS_ENGINE_LIMITS.arrowIpcMaxBytes,
    );
  }
  const metricsValue = value["metrics"];
  if (!Array.isArray(metricsValue)) {
    return invalidInputFailure("metrics");
  }
  if (
    metricsValue.length < ANALYSIS_ENGINE_LIMITS.metricsMinCount ||
    metricsValue.length > ANALYSIS_ENGINE_LIMITS.metricsMaxCount
  ) {
    return limitFailure(
      "metrics-count",
      metricsValue.length,
      ANALYSIS_ENGINE_LIMITS.metricsMaxCount,
    );
  }

  const metrics: AnalysisMetricRequest[] = [];
  for (const candidate of metricsValue) {
    if (!isMetricRequest(candidate)) {
      return invalidInputFailure("metrics");
    }
    const metricIdResult = parseMetricId(candidate["metricId"]);
    if (!metricIdResult.ok) {
      return invalidInputFailure("metric-id");
    }
    const aggregate = candidate["aggregate"];
    if (aggregate !== "COUNT_ROWS" && aggregate !== "SUM") {
      return invalidInputFailure("aggregate");
    }
    const column = candidate["column"];
    if (aggregate === "SUM") {
      if (!isColumnName(column)) {
        return invalidInputFailure("column");
      }
      metrics.push(
        Object.freeze({
          metricId: metricIdResult.value,
          aggregate,
          column,
        }),
      );
    } else {
      if (column !== undefined) {
        return invalidInputFailure("column");
      }
      metrics.push(
        Object.freeze({
          metricId: metricIdResult.value,
          aggregate,
        }),
      );
    }
  }

  const input: AnalysisInput = Object.freeze({
    schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
    requestId,
    arrow,
    metrics: Object.freeze(metrics),
  });
  return Object.freeze({ ok: true, value: input });
}

export type AnalysisRunnerOptions = Readonly<{
  signal?: AbortSignal;
}>;

export type AnalysisEngineRunResult = Result<AnalysisResult, AnalysisEngineError>;

/** M0 seam：`runAnalysis(input, options) -> Promise<AnalysisEngineRunResult>`。 */
export type AnalysisRunner = (
  input: unknown,
  options?: AnalysisRunnerOptions,
) => Promise<AnalysisEngineRunResult>;