import {
  createVersionRegistry,
  parseMetricId,
  resolveVersion,
  type MetricId,
  type ResultFailure,
  type ResultSuccess,
  type VersionRegistry,
} from "@datapulse/domain";

import {
  METRIC_RUNTIME_ERROR_CODES,
  type MetricAccumulator,
  type MetricAccumulatorCreationResult,
  type MetricAccumulatorDraftInvalidError,
  type MetricAccumulatorDraftInvalidReason,
  type MetricAccumulatorInvalidError,
  type MetricAccumulatorInvalidReason,
  type MetricAvailableEvaluation,
  type MetricContractMismatchError,
  type MetricContractMismatchReason,
  type MetricEvaluationPlan,
  type MetricEvaluationResult,
  type MetricInputLimitExceededError,
  type MetricMergeOrdinalDuplicateError,
  type MetricPlanInvalidError,
  type MetricRuntimeError,
  type MetricUnavailableEvaluation,
  type MetricVersionInvalidError,
  type MetricVersionReason,
  type MetricVersionUnsupportedError,
} from "./contract.js";
import validateAccumulatorGenerated from "./generated/metric-accumulator-v1_0_0.validator.generated.js";
import validatePlanGenerated from "./generated/metric-evaluation-plan-v1_0_0.validator.generated.js";
import {
  METRIC_RUNTIME_CURRENT_VERSION,
  METRIC_RUNTIME_MAX_ACCUMULATORS_PER_EVALUATION,
  METRIC_RUNTIME_REGISTERED_VERSIONS,
} from "./generated/metric-runtime-history.generated.js";
import {
  addFiniteF64,
  canonicalizeNumericZero,
  decodeFiniteF64,
  encodeFiniteF64,
} from "./internal/f64.js";
import {
  hasExactKeys,
  snapshotDenseArray,
  snapshotRecord,
  type SafeRecord,
} from "./internal/snapshot.js";

type Validator = (value: unknown) => boolean;
const validateAccumulator = validateAccumulatorGenerated as Validator;
const validatePlan = validatePlanGenerated as Validator;

const DRAFT_KEYS = new Set(["metricId", "aggregate", "mergeOrdinal", "count", "sum"]);
const PLAN_KEYS = new Set(["schemaVersion", "metricId", "aggregate"]);
const ACCUMULATOR_KEYS = new Set([
  "schemaVersion",
  "metricId",
  "aggregate",
  "mergeKind",
  "interactionCapability",
  "mergeOrdinal",
  "state",
]);
const ACCUMULATOR_STATE_KEYS = new Set(["count", "sumF64"]);

type ParsedPlan = Readonly<{
  metricId: MetricId;
  aggregate: MetricEvaluationPlan["aggregate"];
}>;

type ParsedCountRowsAccumulator = Readonly<{
  metricId: MetricId;
  aggregate: "COUNT_ROWS";
  mergeOrdinal: number;
  count: number;
}>;

type ParsedSumAccumulator = Readonly<{
  metricId: MetricId;
  aggregate: "SUM";
  mergeOrdinal: number;
  sum: number;
}>;

type ParsedAccumulator = ParsedCountRowsAccumulator | ParsedSumAccumulator;

type AccumulatorParseError =
  | MetricAccumulatorInvalidError
  | MetricVersionInvalidError
  | MetricVersionUnsupportedError;

type AccumulatorCandidateError = AccumulatorParseError | MetricContractMismatchError;

const ACCUMULATOR_FAILURE_PRIORITY = Object.freeze({
  accumulatorShape: 0,
  accumulatorVersionInvalid: 1,
  accumulatorVersionUnsupported: 2,
  metricIdMismatch: 3,
  aggregateMismatch: 4,
} as const);

function success<Value>(value: Value): ResultSuccess<Value> {
  return Object.freeze({ ok: true, value });
}

function failure<Error>(error: Error): ResultFailure<Error> {
  return Object.freeze({ ok: false, error });
}

function frozenError<Code extends string, Reason extends string>(
  code: Code,
  reason: Reason,
): Readonly<{ code: Code; details: Readonly<{ reason: Reason }> }> {
  return Object.freeze({ code, details: Object.freeze({ reason }) });
}

function draftError(
  reason: MetricAccumulatorDraftInvalidReason,
): MetricAccumulatorDraftInvalidError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.draftInvalid, reason);
}

function planError(): MetricPlanInvalidError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.planInvalid, "shape");
}

function accumulatorError(
  reason: MetricAccumulatorInvalidReason,
): MetricAccumulatorInvalidError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.accumulatorInvalid, reason);
}

function invalidVersionError(reason: MetricVersionReason): MetricVersionInvalidError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.versionInvalid, reason);
}

function unsupportedVersionError(
  reason: MetricVersionReason,
): MetricVersionUnsupportedError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.versionUnsupported, reason);
}

function contractMismatchError(
  reason: MetricContractMismatchReason,
): MetricContractMismatchError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.contractMismatch, reason);
}

function inputLimitError(): MetricInputLimitExceededError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.inputLimitExceeded, "accumulator_count");
}

function duplicateOrdinalError(): MetricMergeOrdinalDuplicateError {
  return frozenError(METRIC_RUNTIME_ERROR_CODES.mergeOrdinalDuplicate, "merge_ordinal");
}

function accumulatorCandidateErrorPriority(error: AccumulatorCandidateError): number {
  switch (error.code) {
    case METRIC_RUNTIME_ERROR_CODES.accumulatorInvalid:
      return ACCUMULATOR_FAILURE_PRIORITY.accumulatorShape;
    case METRIC_RUNTIME_ERROR_CODES.versionInvalid:
      return ACCUMULATOR_FAILURE_PRIORITY.accumulatorVersionInvalid;
    case METRIC_RUNTIME_ERROR_CODES.versionUnsupported:
      return ACCUMULATOR_FAILURE_PRIORITY.accumulatorVersionUnsupported;
    case METRIC_RUNTIME_ERROR_CODES.contractMismatch:
      return error.details.reason === "metric_id"
        ? ACCUMULATOR_FAILURE_PRIORITY.metricIdMismatch
        : ACCUMULATOR_FAILURE_PRIORITY.aggregateMismatch;
  }
}

function selectAccumulatorCandidateError(
  errors: readonly AccumulatorCandidateError[],
): AccumulatorCandidateError {
  const first = errors[0];
  if (first === undefined) {
    throw new Error("Accumulator candidate error selection requires at least one error");
  }
  let selected = first;
  let selectedPriority = accumulatorCandidateErrorPriority(first);
  for (let index = 1; index < errors.length; index += 1) {
    const candidate = errors[index];
    if (candidate === undefined) continue;
    const candidatePriority = accumulatorCandidateErrorPriority(candidate);
    if (candidatePriority < selectedPriority) {
      selected = candidate;
      selectedPriority = candidatePriority;
    }
  }
  return selected;
}

function createRegistry<const Kind extends "metric-accumulator" | "metric-evaluation-plan">(
  kind: Kind,
): VersionRegistry<Kind> {
  const result = createVersionRegistry(kind, METRIC_RUNTIME_REGISTERED_VERSIONS);
  if (!result.ok) {
    throw new Error("Generated Metric Runtime version history is invalid");
  }
  return result.value;
}

const accumulatorVersionRegistry = createRegistry("metric-accumulator");
const evaluationPlanVersionRegistry = createRegistry("metric-evaluation-plan");

function versionError(
  registry: VersionRegistry<"metric-accumulator"> | VersionRegistry<"metric-evaluation-plan">,
  expectedKind: "metric-accumulator" | "metric-evaluation-plan",
  value: unknown,
  reason: MetricVersionReason,
): MetricVersionInvalidError | MetricVersionUnsupportedError | undefined {
  const resolved = resolveVersion(
    registry as VersionRegistry<typeof expectedKind>,
    expectedKind,
    value,
  );
  if (resolved.ok) {
    return undefined;
  }
  return resolved.error.code === "DOMAIN_VERSION_UNSUPPORTED"
    ? unsupportedVersionError(reason)
    : invalidVersionError(reason);
}

function snapshotAccumulator(input: unknown): SafeRecord | undefined {
  const accumulator = snapshotRecord(input, ACCUMULATOR_KEYS);
  if (accumulator === undefined) {
    return undefined;
  }
  const state = snapshotRecord(accumulator["state"], ACCUMULATOR_STATE_KEYS);
  if (state === undefined) {
    return undefined;
  }
  accumulator["state"] = Object.freeze(state);
  return Object.freeze(accumulator);
}

function parsePlan(input: unknown):
  | Readonly<{ ok: true; value: ParsedPlan }>
  | Readonly<{ ok: false; error: MetricRuntimeError }> {
  const snapshot = snapshotRecord(input, PLAN_KEYS);
  if (snapshot === undefined || !Object.hasOwn(snapshot, "schemaVersion")) {
    return failure(planError());
  }
  const versionFailure = versionError(
    evaluationPlanVersionRegistry,
    "metric-evaluation-plan",
    snapshot["schemaVersion"],
    "plan_version",
  );
  if (versionFailure !== undefined) {
    return failure(versionFailure);
  }
  if (!validatePlan(snapshot)) {
    return failure(planError());
  }
  const metricId = parseMetricId(snapshot["metricId"]);
  if (
    !metricId.ok ||
    (snapshot["aggregate"] !== "COUNT_ROWS" && snapshot["aggregate"] !== "SUM")
  ) {
    return failure(planError());
  }
  return success(
    Object.freeze({
      metricId: metricId.value,
      aggregate: snapshot["aggregate"],
    }),
  );
}

function parseAccumulator(input: unknown):
  | Readonly<{ ok: true; value: ParsedAccumulator }>
  | Readonly<{ ok: false; error: AccumulatorParseError }> {
  const snapshot = snapshotAccumulator(input);
  if (snapshot === undefined || !Object.hasOwn(snapshot, "schemaVersion")) {
    return failure(accumulatorError("shape"));
  }
  const versionFailure = versionError(
    accumulatorVersionRegistry,
    "metric-accumulator",
    snapshot["schemaVersion"],
    "accumulator_version",
  );
  if (versionFailure !== undefined) {
    return failure(versionFailure);
  }
  if (!validateAccumulator(snapshot)) {
    return failure(accumulatorError("shape"));
  }

  const metricId = parseMetricId(snapshot["metricId"]);
  if (!metricId.ok || !Number.isSafeInteger(snapshot["mergeOrdinal"])) {
    return failure(accumulatorError("shape"));
  }
  const mergeOrdinal = canonicalizeNumericZero(snapshot["mergeOrdinal"] as number);
  const state = snapshot["state"] as SafeRecord;
  if (
    snapshot["aggregate"] === "COUNT_ROWS" &&
    Number.isSafeInteger(state["count"])
  ) {
    return success(
      Object.freeze({
        metricId: metricId.value,
        aggregate: "COUNT_ROWS" as const,
        mergeOrdinal,
        count: canonicalizeNumericZero(state["count"] as number),
      }),
    );
  }
  if (snapshot["aggregate"] === "SUM" && typeof state["sumF64"] === "string") {
    const sum = decodeFiniteF64(state["sumF64"]);
    if (sum !== undefined) {
      return success(
        Object.freeze({
          metricId: metricId.value,
          aggregate: "SUM" as const,
          mergeOrdinal,
          sum,
        }),
      );
    }
  }
  return failure(accumulatorError("shape"));
}

export function createMetricAccumulator(input: unknown): MetricAccumulatorCreationResult {
  const draft = snapshotRecord(input, DRAFT_KEYS);
  if (draft === undefined) {
    const reason = typeof input !== "object" || input === null ? "type" : "shape";
    return failure(draftError(reason));
  }
  const metricId = parseMetricId(draft["metricId"]);
  if (!metricId.ok) {
    return failure(draftError("metric_id"));
  }
  if (
    !Number.isSafeInteger(draft["mergeOrdinal"]) ||
    (draft["mergeOrdinal"] as number) < 0
  ) {
    return failure(draftError("merge_ordinal"));
  }

  let accumulator: MetricAccumulator;
  if (draft["aggregate"] === "COUNT_ROWS") {
    if (!hasExactKeys(draft, ["metricId", "aggregate", "mergeOrdinal", "count"])) {
      return failure(draftError("shape"));
    }
    if (!Number.isSafeInteger(draft["count"]) || (draft["count"] as number) < 0) {
      return failure(draftError("count"));
    }
    accumulator = Object.freeze({
      schemaVersion: METRIC_RUNTIME_CURRENT_VERSION,
      metricId: metricId.value,
      aggregate: "COUNT_ROWS",
      mergeKind: "count",
      interactionCapability: "exact",
      mergeOrdinal: canonicalizeNumericZero(draft["mergeOrdinal"] as number),
      state: Object.freeze({
        count: canonicalizeNumericZero(draft["count"] as number),
      }),
    });
  } else if (draft["aggregate"] === "SUM") {
    if (!hasExactKeys(draft, ["metricId", "aggregate", "mergeOrdinal", "sum"])) {
      return failure(draftError("shape"));
    }
    if (typeof draft["sum"] !== "number") {
      return failure(draftError("sum"));
    }
    const encoded = encodeFiniteF64(draft["sum"]);
    if (encoded === undefined) {
      return failure(draftError("sum"));
    }
    accumulator = Object.freeze({
      schemaVersion: METRIC_RUNTIME_CURRENT_VERSION,
      metricId: metricId.value,
      aggregate: "SUM",
      mergeKind: "sum-f64-v1",
      interactionCapability: "exact",
      mergeOrdinal: canonicalizeNumericZero(draft["mergeOrdinal"] as number),
      state: Object.freeze({ sumF64: encoded }),
    });
  } else {
    return failure(draftError("shape"));
  }

  if (!validateAccumulator(accumulator)) {
    return failure(draftError("shape"));
  }
  return success(accumulator);
}

function available(
  plan: ParsedPlan,
  value: number,
): ResultSuccess<MetricAvailableEvaluation> {
  return success(
    Object.freeze({
      status: "available" as const,
      metricId: plan.metricId,
      aggregate: plan.aggregate,
      value: Object.is(value, -0) ? 0 : value,
    }),
  );
}

function unavailable(
  plan: ParsedPlan,
  reason: MetricUnavailableEvaluation["reason"],
): ResultSuccess<MetricUnavailableEvaluation> {
  return success(
    Object.freeze({
      status: "unavailable" as const,
      metricId: plan.metricId,
      aggregate: plan.aggregate,
      reason,
    }),
  );
}

function compareMergeOrdinal(left: ParsedAccumulator, right: ParsedAccumulator): number {
  if (left.mergeOrdinal < right.mergeOrdinal) return -1;
  if (left.mergeOrdinal > right.mergeOrdinal) return 1;
  return 0;
}

export function evaluateMetric(planInput: unknown, accumulatorInput: unknown): MetricEvaluationResult {
  const planResult = parsePlan(planInput);
  if (!planResult.ok) {
    return planResult;
  }

  const accumulatorSnapshot = snapshotDenseArray(
    accumulatorInput,
    METRIC_RUNTIME_MAX_ACCUMULATORS_PER_EVALUATION,
  );
  if (!accumulatorSnapshot.ok && accumulatorSnapshot.reason === "limit") {
    return failure(inputLimitError());
  }
  if (!accumulatorSnapshot.ok) {
    const reason = accumulatorSnapshot.reason === "type" ? "collection_type" : "shape";
    return failure(accumulatorError(reason));
  }

  const accumulators: ParsedAccumulator[] = [];
  const candidateErrors: AccumulatorCandidateError[] = [];
  for (const candidate of accumulatorSnapshot.value) {
    const parsed = parseAccumulator(candidate);
    if (!parsed.ok) {
      candidateErrors.push(parsed.error);
      continue;
    }
    if (parsed.value.metricId !== planResult.value.metricId) {
      candidateErrors.push(contractMismatchError("metric_id"));
      continue;
    }
    if (parsed.value.aggregate !== planResult.value.aggregate) {
      candidateErrors.push(contractMismatchError("aggregate"));
      continue;
    }
    accumulators.push(parsed.value);
  }

  if (candidateErrors.length > 0) {
    return failure(selectAccumulatorCandidateError(candidateErrors));
  }

  accumulators.sort(compareMergeOrdinal);
  for (let index = 1; index < accumulators.length; index += 1) {
    if (accumulators[index - 1]?.mergeOrdinal === accumulators[index]?.mergeOrdinal) {
      return failure(duplicateOrdinalError());
    }
  }

  if (planResult.value.aggregate === "COUNT_ROWS") {
    let total = 0;
    for (const accumulator of accumulators) {
      if (accumulator.aggregate !== "COUNT_ROWS") {
        return failure(contractMismatchError("aggregate"));
      }
      if (accumulator.count > Number.MAX_SAFE_INTEGER - total) {
        return unavailable(planResult.value, "NUMERIC_OVERFLOW");
      }
      total += accumulator.count;
    }
    return available(planResult.value, total);
  }

  if (accumulators.length === 0) {
    return unavailable(planResult.value, "EMPTY_SELECTION");
  }
  let total = 0;
  for (const accumulator of accumulators) {
    if (accumulator.aggregate !== "SUM") {
      return failure(contractMismatchError("aggregate"));
    }
    const next = addFiniteF64(total, accumulator.sum);
    if (next === undefined) {
      return unavailable(planResult.value, "NUMERIC_OVERFLOW");
    }
    total = next;
  }
  return available(planResult.value, total);
}
