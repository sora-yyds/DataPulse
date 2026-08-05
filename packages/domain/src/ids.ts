import {
  createDomainIdInvalidError,
  type DomainIdInvalidError,
} from "./errors.js";
import {
  domainFailure,
  domainSuccess,
  type DomainResult,
} from "./results.js";

export const DOMAIN_ID_PREFIXES = Object.freeze({
  story: "story_",
  datasetVersion: "dataset_version_",
  field: "field_",
  storyBlock: "story_block_",
  analysisCondition: "analysis_condition_",
  metric: "metric_",
  evidence: "evidence_",
  judgmentRule: "judgment_rule_",
  narrativeRule: "narrative_rule_",
} as const);

/**
 * 后缀仅承载不透明身份，不承载用户内容。单段允许 1–64 个 ASCII 字符；
 * 连字符只能分隔非空的小写字母／数字段，解析器不会 trim 或规范化输入。
 */
export const DOMAIN_ID_SUFFIX_LIMITS = Object.freeze({ minLength: 1, maxLength: 64 } as const);

export type DomainIdKind = keyof typeof DOMAIN_ID_PREFIXES;
export type DomainIdPrefix<Kind extends DomainIdKind> =
  (typeof DOMAIN_ID_PREFIXES)[Kind];

declare const domainIdBrand: unique symbol;

export type DomainId<Kind extends DomainIdKind> =
  `${DomainIdPrefix<Kind>}${string}` & {
    readonly [domainIdBrand]: Kind;
  };

export type StoryId = DomainId<"story">;
export type DatasetVersionId = DomainId<"datasetVersion">;
export type FieldId = DomainId<"field">;
export type StoryBlockId = DomainId<"storyBlock">;
export type AnalysisConditionId = DomainId<"analysisCondition">;
export type MetricId = DomainId<"metric">;
export type EvidenceId = DomainId<"evidence">;
export type JudgmentRuleId = DomainId<"judgmentRule">;
export type NarrativeRuleId = DomainId<"narrativeRule">;

const DOMAIN_ID_SUFFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isDomainIdKind(value: unknown): value is DomainIdKind {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(DOMAIN_ID_PREFIXES, value)
  );
}

export function parseDomainId<Kind extends DomainIdKind>(
  kind: Kind,
  input: unknown,
): DomainResult<DomainId<Kind>, DomainIdInvalidError> {
  if (!isDomainIdKind(kind)) {
    return domainFailure(createDomainIdInvalidError("kind"));
  }

  if (typeof input !== "string") {
    return domainFailure(createDomainIdInvalidError("type"));
  }

  const prefix = DOMAIN_ID_PREFIXES[kind];
  if (!input.startsWith(prefix)) {
    return domainFailure(createDomainIdInvalidError("prefix"));
  }

  if (
    input.length < prefix.length + DOMAIN_ID_SUFFIX_LIMITS.minLength ||
    input.length > prefix.length + DOMAIN_ID_SUFFIX_LIMITS.maxLength
  ) {
    return domainFailure(createDomainIdInvalidError("length"));
  }

  const suffix = input.slice(prefix.length);
  if (!DOMAIN_ID_SUFFIX_PATTERN.test(suffix)) {
    return domainFailure(createDomainIdInvalidError("format"));
  }

  return domainSuccess(input as DomainId<Kind>);
}

export function isDomainId<Kind extends DomainIdKind>(
  kind: Kind,
  input: unknown,
): input is DomainId<Kind> {
  return parseDomainId(kind, input).ok;
}

export function parseStoryId(
  input: unknown,
): DomainResult<StoryId, DomainIdInvalidError> {
  return parseDomainId("story", input);
}

export function parseDatasetVersionId(
  input: unknown,
): DomainResult<DatasetVersionId, DomainIdInvalidError> {
  return parseDomainId("datasetVersion", input);
}

export function parseFieldId(
  input: unknown,
): DomainResult<FieldId, DomainIdInvalidError> {
  return parseDomainId("field", input);
}

export function parseStoryBlockId(
  input: unknown,
): DomainResult<StoryBlockId, DomainIdInvalidError> {
  return parseDomainId("storyBlock", input);
}

export function parseAnalysisConditionId(
  input: unknown,
): DomainResult<AnalysisConditionId, DomainIdInvalidError> {
  return parseDomainId("analysisCondition", input);
}

export function parseMetricId(
  input: unknown,
): DomainResult<MetricId, DomainIdInvalidError> {
  return parseDomainId("metric", input);
}

export function parseEvidenceId(
  input: unknown,
): DomainResult<EvidenceId, DomainIdInvalidError> {
  return parseDomainId("evidence", input);
}

export function parseJudgmentRuleId(
  input: unknown,
): DomainResult<JudgmentRuleId, DomainIdInvalidError> {
  return parseDomainId("judgmentRule", input);
}

export function parseNarrativeRuleId(
  input: unknown,
): DomainResult<NarrativeRuleId, DomainIdInvalidError> {
  return parseDomainId("narrativeRule", input);
}

type ExpectFalse<Value extends false> = Value;
type _StoryIdRejectsUnparsedLiteral = ExpectFalse<
  "story_alpha" extends StoryId ? true : false
>;
type _DomainIdKindsStayDistinct = ExpectFalse<StoryId extends MetricId ? true : false>;
type _RuleIdKindsStayDistinct = ExpectFalse<
  JudgmentRuleId extends NarrativeRuleId ? true : false
>;
