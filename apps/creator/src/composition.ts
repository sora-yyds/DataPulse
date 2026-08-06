import type {
  ResolvedStoryComposition,
  StoryRendererProps,
} from "@datapulse/renderer";
import {
  readStoryArtifact,
  type StoryArtifactValidationContext,
} from "@datapulse/story-migrations";

import { evaluateCreatorMetric } from "./main.js";

type ValidatedStoryBlueprint = StoryRendererProps["blueprint"];
type ValidatedStoryBlock = ValidatedStoryBlueprint["blocks"][number];
type ValidatedKpiBlock = Extract<
  ValidatedStoryBlock,
  { readonly blockType: "kpi" }
>;

const EXPECTED_CASE_ID = "count-rows-merge";
const EXPECTED_METRIC_ID = "metric_order-count";
const EXPECTED_METRIC_VALUE = 23 as const;
const MAX_METRIC_FIXTURE_BYTES = 65_536;

export const M0_015_STORY_CONTEXT = Object.freeze({
  expectedStoryId: "story_m0-015-renderer",
  expectedDatasetVersionId: "dataset_version_m0-015-renderer",
  references: Object.freeze({
    fieldIds: Object.freeze([]),
    metricIds: Object.freeze(["metric_order-count"]),
    evidenceIds: Object.freeze(["evidence_order-count"]),
    judgmentRuleIds: Object.freeze([]),
    narrativeRuleIds: Object.freeze([]),
  }),
  expectedGlobalConditions: Object.freeze([]),
  kpiApplicableMetricIds: Object.freeze(["metric_order-count"]),
}) satisfies StoryArtifactValidationContext;

const ZH_CN_NUMBER_FORMAT = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 20,
  useGrouping: true,
});

export const COMPOSITION_ERROR_CODES = Object.freeze({
  fixtureTooLarge: "M0_015_METRIC_FIXTURE_TOO_LARGE",
  fixtureUtf8Invalid: "M0_015_METRIC_FIXTURE_UTF8_INVALID",
  fixtureJsonInvalid: "M0_015_METRIC_FIXTURE_JSON_INVALID",
  fixtureInvalid: "M0_015_METRIC_FIXTURE_INVALID",
  evaluationFailed: "M0_015_METRIC_EVALUATION_FAILED",
  resultUnavailable: "M0_015_METRIC_RESULT_UNAVAILABLE",
  resultMismatch: "M0_015_METRIC_RESULT_MISMATCH",
  storyKpiMissing: "M0_015_STORY_KPI_MISSING",
  storyScopeMismatch: "M0_015_STORY_SCOPE_MISMATCH",
} as const);

export type CompositionErrorCode =
  (typeof COMPOSITION_ERROR_CODES)[keyof typeof COMPOSITION_ERROR_CODES];

export type CompositionFailure = Readonly<{
  ok: false;
  error: Readonly<{
    code: CompositionErrorCode;
    message: string;
  }>;
  composition?: never;
}>;

export type CompositionSuccess = Readonly<{
  ok: true;
  composition: ResolvedStoryComposition;
  error?: never;
}>;

export type CompositionResult = CompositionSuccess | CompositionFailure;

export type PreparedStoryFailure = Readonly<{
  ok: false;
  error: Readonly<{
    code: string;
    message: string;
  }>;
  blueprint?: never;
  composition?: never;
}>;

export type PreparedStorySuccess = Readonly<{
  ok: true;
  blueprint: ValidatedStoryBlueprint;
  composition: ResolvedStoryComposition;
  error?: never;
}>;

export type PreparedStoryResult =
  | PreparedStorySuccess
  | PreparedStoryFailure;

type MetricFixture = Readonly<{
  plan: unknown;
  accumulators: unknown;
  expectedValue: typeof EXPECTED_METRIC_VALUE;
}>;

type MetricFixtureReadResult =
  | Readonly<{ ok: true; value: MetricFixture }>
  | CompositionFailure;

function failure(
  code: CompositionErrorCode,
  message: string,
): CompositionFailure {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readMetricFixture(
  input: Uint8Array,
): MetricFixtureReadResult {
  if (input.byteLength > MAX_METRIC_FIXTURE_BYTES) {
    return failure(
      COMPOSITION_ERROR_CODES.fixtureTooLarge,
      "指标夹具超过验证页面允许的字节上限，未显示候选内容。",
    );
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return failure(
      COMPOSITION_ERROR_CODES.fixtureUtf8Invalid,
      "指标夹具不是有效的 UTF-8 字节，未显示候选内容。",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return failure(
      COMPOSITION_ERROR_CODES.fixtureJsonInvalid,
      "指标夹具不是有效的 JSON，未显示候选内容。",
    );
  }

  if (!isRecord(parsed)) {
    return failure(
      COMPOSITION_ERROR_CODES.fixtureInvalid,
      "指标夹具结构无效，未显示候选内容。",
    );
  }
  const expected = parsed["expected"];
  if (!isRecord(expected)) {
    return failure(
      COMPOSITION_ERROR_CODES.fixtureInvalid,
      "指标夹具结构无效，未显示候选内容。",
    );
  }

  if (
    parsed["fixtureVersion"] !== "1.0.0" ||
    parsed["caseId"] !== EXPECTED_CASE_ID ||
    expected["status"] !== "available" ||
    expected["value"] !== EXPECTED_METRIC_VALUE ||
    !("plan" in parsed) ||
    !("accumulators" in parsed)
  ) {
    return failure(
      COMPOSITION_ERROR_CODES.fixtureInvalid,
      "指标夹具与固定验证合同不匹配，未显示候选内容。",
    );
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      plan: parsed["plan"],
      accumulators: parsed["accumulators"],
      expectedValue: EXPECTED_METRIC_VALUE,
    }),
  });
}

/**
 * 从指标 fixture 原始字节构建 Renderer DTO。指标数值只来自共享
 * metric-runtime；该层仅校验固定 M0 合成合同并执行显式 zh-CN 格式化。
 */
export function composeCreatorStory(
  blueprint: ValidatedStoryBlueprint,
  metricFixtureBytes: Uint8Array,
): CompositionResult {
  const fixtureResult = readMetricFixture(metricFixtureBytes);
  if (!fixtureResult.ok) {
    return fixtureResult;
  }

  const evaluationResult = evaluateCreatorMetric(
    fixtureResult.value.plan,
    fixtureResult.value.accumulators,
  );
  if (!evaluationResult.ok) {
    return failure(
      COMPOSITION_ERROR_CODES.evaluationFailed,
      "指标运行时拒绝了指标输入，未显示候选内容。",
    );
  }

  const evaluation = evaluationResult.value;
  if (evaluation.status !== "available") {
    return failure(
      COMPOSITION_ERROR_CODES.resultUnavailable,
      "固定合成指标当前不可用，未显示候选内容。",
    );
  }

  if (
    String(evaluation.metricId) !== EXPECTED_METRIC_ID ||
    evaluation.aggregate !== "COUNT_ROWS" ||
    evaluation.value !== fixtureResult.value.expectedValue
  ) {
    return failure(
      COMPOSITION_ERROR_CODES.resultMismatch,
      "指标结果与固定合成合同不一致，未显示候选内容。",
    );
  }

  const kpiBlock = blueprint.blocks.find(
    (block): block is ValidatedKpiBlock =>
      block.blockType === "kpi" &&
      block.metricId === String(evaluation.metricId),
  );
  if (kpiBlock === undefined) {
    return failure(
      COMPOSITION_ERROR_CODES.storyKpiMissing,
      "正式故事缺少与指标结果匹配的 KPI 区块，未显示候选内容。",
    );
  }
  if (
    blueprint.conditions.length !== 0 ||
    blueprint.globalConditionIds.length !== 0 ||
    kpiBlock.additionalConditionIds.length !== 0
  ) {
    return failure(
      COMPOSITION_ERROR_CODES.storyScopeMismatch,
      "正式故事条件与固定全量范围不一致，未显示候选内容。",
    );
  }

  const composition = Object.freeze({
    kpis: Object.freeze([
      Object.freeze({
        blockId: kpiBlock.blockId,
        metricId: kpiBlock.metricId,
        scopeText: "范围：全部数据（无附加条件）",
        status: "available",
        valueText: ZH_CN_NUMBER_FORMAT.format(evaluation.value),
      }),
    ]),
  }) satisfies ResolvedStoryComposition;

  return Object.freeze({ ok: true, composition });
}

/**
 * Creator 浏览器与测试共用的 fail-closed seam。只有正式 Story Reader 和
 * 确定性指标 composition 都成功时，调用方才会取得可交给 Renderer 的候选。
 */
export function prepareCreatorStory(
  storyArtifactBytes: Uint8Array,
  metricFixtureBytes: Uint8Array,
): PreparedStoryResult {
  const storyResult = readStoryArtifact(
    storyArtifactBytes,
    M0_015_STORY_CONTEXT,
  );
  if (!storyResult.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: storyResult.error.code,
        message: "正式故事读取或校验失败，未显示候选内容。",
      }),
    });
  }

  const compositionResult = composeCreatorStory(
    storyResult.value,
    metricFixtureBytes,
  );
  if (!compositionResult.ok) {
    return compositionResult;
  }

  return Object.freeze({
    ok: true,
    blueprint: storyResult.value,
    composition: compositionResult.composition,
  });
}
