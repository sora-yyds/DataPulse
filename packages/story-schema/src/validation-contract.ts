import type {
  AnalysisCondition,
  StoryBlueprint,
} from "./generated/formal-story-blueprint-v1_0_0.generated.js";

export type DeepReadonly<Value> = Value extends readonly unknown[]
  ? { readonly [Index in keyof Value]: DeepReadonly<Value[Index]> }
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

/**
 * 当前正式故事蓝图的对象快照资源档案。根对象深度计为 1，容器与原始值都计入节点；
 * 原始 payload 在 JSON.parse 前的字节限制由 Story Artifact Reader 负责。
 */
export const STORY_BLUEPRINT_VALIDATION_LIMITS = Object.freeze({
  profileVersion: "1.0.0",
  maxSnapshotUtf8Bytes: 16 * 1024 * 1024,
  maxDepth: 16,
  maxNodes: 65_536,
  maxReferenceOccurrences: 65_536,
  maxIssues: 32,
} as const);

export const STORY_BLUEPRINT_TEXT_RULES = Object.freeze({
  numericLexiconVersion: "zh-CN-numeric-v1",
  judgmentLexiconVersion: "zh-CN-judgment-v1",
  scannedFields: Object.freeze([
    "title-summary.content.title",
    "title-summary.content.summary",
    "kpi.label",
  ]),
} as const);

export type StoryReferenceCatalog = Readonly<{
  fieldIds: readonly string[];
  metricIds: readonly string[];
  evidenceIds: readonly string[];
  judgmentRuleIds: readonly string[];
  narrativeRuleIds: readonly string[];
}>;

/**
 * 由确定性分析／项目状态提供的可信上下文。候选蓝图自身的 references 不能扩张这些集合。
 * expectedGlobalConditions 防止不可信候选删除或放宽已经确认的全局条件。
 */
export type StoryValidationContext = Readonly<{
  expectedStoryId: string;
  expectedDatasetVersionId: string;
  references: StoryReferenceCatalog;
  expectedGlobalConditions: readonly DeepReadonly<AnalysisCondition>[];
  kpiApplicableMetricIds: readonly string[];
}>;

export const STORY_BLUEPRINT_VALIDATION_ERROR_CODES = Object.freeze({
  validationFailed: "STORY_BLUEPRINT_VALIDATION_FAILED",
  contextInvalid: "STORY_BLUEPRINT_CONTEXT_INVALID",
  inputUnreadable: "STORY_BLUEPRINT_INPUT_UNREADABLE",
  inputAccessor: "STORY_BLUEPRINT_INPUT_ACCESSOR_FORBIDDEN",
  inputSymbolProperty: "STORY_BLUEPRINT_INPUT_SYMBOL_PROPERTY_FORBIDDEN",
  inputNonPlainObject: "STORY_BLUEPRINT_INPUT_NON_PLAIN_OBJECT",
  inputSparseArray: "STORY_BLUEPRINT_INPUT_SPARSE_ARRAY",
  inputAlias: "STORY_BLUEPRINT_INPUT_ALIAS_FORBIDDEN",
  inputNonJsonValue: "STORY_BLUEPRINT_INPUT_NON_JSON_VALUE",
  depthLimit: "STORY_BLUEPRINT_DEPTH_LIMIT_EXCEEDED",
  nodeLimit: "STORY_BLUEPRINT_NODE_LIMIT_EXCEEDED",
  snapshotByteLimit: "STORY_BLUEPRINT_SNAPSHOT_BYTE_LIMIT_EXCEEDED",
  structureInvalid: "STORY_BLUEPRINT_STRUCTURE_INVALID",
  identityMismatch: "STORY_BLUEPRINT_IDENTITY_MISMATCH",
  referenceCatalogUntrusted: "STORY_BLUEPRINT_REFERENCE_CATALOG_UNTRUSTED",
  referenceUnknown: "STORY_BLUEPRINT_REFERENCE_UNKNOWN",
  referenceLimit: "STORY_BLUEPRINT_REFERENCE_LIMIT_EXCEEDED",
  blockIdDuplicate: "STORY_BLUEPRINT_BLOCK_ID_DUPLICATE",
  conditionIdDuplicate: "STORY_BLUEPRINT_CONDITION_ID_DUPLICATE",
  conditionInvalid: "STORY_BLUEPRINT_CONDITION_INVALID",
  globalConditionMismatch: "STORY_BLUEPRINT_GLOBAL_CONDITION_MISMATCH",
  conditionLoosened: "STORY_BLUEPRINT_CONDITION_LOOSENED",
  hardcodedNumber: "STORY_BLUEPRINT_HARDCODED_NUMBER",
  judgmentRuleRequired: "STORY_BLUEPRINT_JUDGMENT_RULE_REQUIRED",
  kpiMetricNotApplicable: "STORY_BLUEPRINT_KPI_METRIC_NOT_APPLICABLE",
  validatorUnavailable: "STORY_BLUEPRINT_VALIDATOR_UNAVAILABLE",
} as const);

export type StoryBlueprintValidationIssueCode = Exclude<
  (typeof STORY_BLUEPRINT_VALIDATION_ERROR_CODES)[keyof typeof STORY_BLUEPRINT_VALIDATION_ERROR_CODES],
  typeof STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validationFailed
>;

export type StoryBlueprintValidationIssue = Readonly<{
  code: StoryBlueprintValidationIssueCode;
  path: string;
}>;

export type StoryBlueprintValidationError = Readonly<{
  code: typeof STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validationFailed;
  issues: readonly StoryBlueprintValidationIssue[];
  truncated: boolean;
}>;

declare const validatedStoryBlueprintBrand: unique symbol;

export type ValidatedStoryBlueprint = DeepReadonly<StoryBlueprint> & {
  readonly [validatedStoryBlueprintBrand]: true;
};

export type StoryValidationSuccess = Readonly<{
  ok: true;
  value: ValidatedStoryBlueprint;
  error?: never;
}>;

export type StoryValidationFailure = Readonly<{
  ok: false;
  error: StoryBlueprintValidationError;
  value?: never;
}>;

export type StoryValidationResult = StoryValidationSuccess | StoryValidationFailure;
