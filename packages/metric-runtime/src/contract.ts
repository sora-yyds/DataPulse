import type { MetricId, Result } from "@datapulse/domain";

import type { MetricAccumulator } from "./generated/metric-accumulator-v1_0_0.generated.js";
import type { MetricEvaluationPlan } from "./generated/metric-evaluation-plan-v1_0_0.generated.js";

export type { MetricAccumulator, MetricEvaluationPlan };

export type MetricAggregate = MetricEvaluationPlan["aggregate"];

export type CountRowsAccumulatorDraft = Readonly<{
  metricId: string;
  aggregate: "COUNT_ROWS";
  mergeOrdinal: number;
  count: number;
}>;

export type SumAccumulatorDraft = Readonly<{
  metricId: string;
  aggregate: "SUM";
  mergeOrdinal: number;
  sum: number;
}>;

export type MetricAccumulatorDraft =
  | CountRowsAccumulatorDraft
  | SumAccumulatorDraft;

export const METRIC_RUNTIME_ERROR_CODES = Object.freeze({
  draftInvalid: "METRIC_RUNTIME_DRAFT_INVALID",
  planInvalid: "METRIC_RUNTIME_PLAN_INVALID",
  accumulatorInvalid: "METRIC_RUNTIME_ACCUMULATOR_INVALID",
  versionInvalid: "METRIC_RUNTIME_VERSION_INVALID",
  versionUnsupported: "METRIC_RUNTIME_VERSION_UNSUPPORTED",
  inputLimitExceeded: "METRIC_RUNTIME_INPUT_LIMIT_EXCEEDED",
  contractMismatch: "METRIC_RUNTIME_CONTRACT_MISMATCH",
  mergeOrdinalDuplicate: "METRIC_RUNTIME_MERGE_ORDINAL_DUPLICATE",
} as const);

export type MetricAccumulatorDraftInvalidReason =
  | "type"
  | "shape"
  | "metric_id"
  | "merge_ordinal"
  | "count"
  | "sum";

export type MetricPlanInvalidReason = "shape";
export type MetricAccumulatorInvalidReason = "collection_type" | "shape";
export type MetricVersionReason = "plan_version" | "accumulator_version";
export type MetricInputLimitReason = "accumulator_count";
export type MetricContractMismatchReason = "metric_id" | "aggregate";
export type MetricMergeOrdinalDuplicateReason = "merge_ordinal";

type FrozenError<Code extends string, Reason extends string> = Readonly<{
  code: Code;
  details: Readonly<{ reason: Reason }>;
}>;

export type MetricAccumulatorDraftInvalidError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.draftInvalid,
  MetricAccumulatorDraftInvalidReason
>;

export type MetricPlanInvalidError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.planInvalid,
  MetricPlanInvalidReason
>;

export type MetricAccumulatorInvalidError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.accumulatorInvalid,
  MetricAccumulatorInvalidReason
>;

export type MetricVersionInvalidError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.versionInvalid,
  MetricVersionReason
>;

export type MetricVersionUnsupportedError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.versionUnsupported,
  MetricVersionReason
>;

export type MetricInputLimitExceededError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.inputLimitExceeded,
  MetricInputLimitReason
>;

export type MetricContractMismatchError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.contractMismatch,
  MetricContractMismatchReason
>;

export type MetricMergeOrdinalDuplicateError = FrozenError<
  typeof METRIC_RUNTIME_ERROR_CODES.mergeOrdinalDuplicate,
  MetricMergeOrdinalDuplicateReason
>;

export type MetricRuntimeError =
  | MetricAccumulatorDraftInvalidError
  | MetricPlanInvalidError
  | MetricAccumulatorInvalidError
  | MetricVersionInvalidError
  | MetricVersionUnsupportedError
  | MetricInputLimitExceededError
  | MetricContractMismatchError
  | MetricMergeOrdinalDuplicateError;

export type MetricUnavailableReason = "EMPTY_SELECTION" | "NUMERIC_OVERFLOW";

export type MetricAvailableEvaluation = Readonly<{
  status: "available";
  metricId: MetricId;
  aggregate: MetricAggregate;
  value: number;
}>;

export type MetricUnavailableEvaluation = Readonly<{
  status: "unavailable";
  metricId: MetricId;
  aggregate: MetricAggregate;
  reason: MetricUnavailableReason;
}>;

export type MetricEvaluation =
  | MetricAvailableEvaluation
  | MetricUnavailableEvaluation;

export type MetricAccumulatorCreationResult = Result<
  MetricAccumulator,
  MetricAccumulatorDraftInvalidError
>;

export type MetricEvaluationResult = Result<MetricEvaluation, MetricRuntimeError>;
