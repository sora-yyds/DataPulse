import schema from "./formal/1.0.0/story-blueprint.schema.json" with { type: "json" };
import { CURRENT_FORMAL_STORY_SCHEMA_METADATA } from "./generated/formal-story-history.generated.js";

type SchemaDeepReadonly<Value> = Value extends readonly unknown[]
  ? { readonly [Index in keyof Value]: SchemaDeepReadonly<Value[Index]> }
  : Value extends object
    ? { readonly [Key in keyof Value]: SchemaDeepReadonly<Value[Key]> }
    : Value;

const deepFreeze = <Value>(value: Value): SchemaDeepReadonly<Value> => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value as SchemaDeepReadonly<Value>;
  }

  Object.freeze(value);
  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return value as SchemaDeepReadonly<Value>;
};

/**
 * 当前正式故事蓝图契约。Schema hash 对原始 UTF-8、LF、无 BOM 源字节计算；
 * 正式历史只能追加新版本和相邻迁移，不能覆写此版本的既有字节。
 */
export const currentStoryContract = deepFreeze({
  schemaVersion: CURRENT_FORMAL_STORY_SCHEMA_METADATA.version,
  schemaId: CURRENT_FORMAL_STORY_SCHEMA_METADATA.schemaId,
  schemaBytes: CURRENT_FORMAL_STORY_SCHEMA_METADATA.schemaBytes,
  schemaSha256: CURRENT_FORMAL_STORY_SCHEMA_METADATA.schemaSha256,
  schema,
});

export type {
  AnalysisCondition,
  AnalysisConditionId,
  BlockLayout,
  CategoryCondition,
  CategoryConditionValue,
  DatasetVersionId,
  EvidenceId,
  FieldId,
  JudgmentRuleId,
  KpiBlock,
  MetricId,
  NarrativeRuleId,
  NumberRangeCondition,
  ReferenceCatalog,
  StoryBlock,
  StoryBlockId,
  StoryBlueprint,
  StoryId,
  StoryVisual,
  Theme,
  TimeRangeCondition,
  TitleSummaryBlock,
} from "./generated/formal-story-blueprint-v1_0_0.generated.js";

export {
  STORY_BLUEPRINT_TEXT_RULES,
  STORY_BLUEPRINT_VALIDATION_ERROR_CODES,
  STORY_BLUEPRINT_VALIDATION_LIMITS,
  type DeepReadonly,
  type StoryBlueprintValidationError,
  type StoryBlueprintValidationIssue,
  type StoryBlueprintValidationIssueCode,
  type StoryReferenceCatalog,
  type StoryValidationContext,
  type StoryValidationFailure,
  type StoryValidationResult,
  type StoryValidationSuccess,
  type ValidatedStoryBlueprint,
} from "./validation-contract.js";

export { validateCurrentStory } from "./validator.js";
