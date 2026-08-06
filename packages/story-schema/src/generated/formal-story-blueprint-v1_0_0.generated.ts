/* 由 scripts/generate-artifacts.mjs 确定性生成；请勿手工修改。 */

export type StoryId = string;
export type DatasetVersionId = string;
export type FieldId = string;
/**
 * @maxItems 256
 */
export type FieldIdList = FieldId[];
export type MetricId = string;
/**
 * @maxItems 256
 */
export type MetricIdList = MetricId[];
export type EvidenceId = string;
/**
 * @maxItems 256
 */
export type EvidenceIdList = EvidenceId[];
export type JudgmentRuleId = string;
/**
 * @maxItems 256
 */
export type JudgmentRuleIdList = JudgmentRuleId[];
export type NarrativeRuleId = string;
/**
 * @maxItems 256
 */
export type NarrativeRuleIdList = NarrativeRuleId[];
export type AnalysisCondition = TimeRangeCondition | CategoryCondition | NumberRangeCondition;
export type AnalysisConditionId = string;
export type CategoryConditionValue = string | number | boolean;
export type NumberRangeCondition = NumberRangeCondition1 & {
  conditionId: AnalysisConditionId;
  kind: "number-range";
  fieldId: FieldId;
  minimum?: number;
  maximum?: number;
};
export type NumberRangeCondition1 =
  | {
      minimum: number;
    }
  | {
      maximum: number;
    };
/**
 * @maxItems 64
 */
export type AnalysisConditionIdList = AnalysisConditionId[];
export type StoryBlock = TitleSummaryBlock | KpiBlock;
export type StoryBlockId = string;

/**
 * DataPulse AI 首个正式故事蓝图契约；自 M0-048 起属于永久兼容历史。
 */
export interface StoryBlueprint {
  schemaVersion: "1.0.0";
  storyId: StoryId;
  datasetVersionId: DatasetVersionId;
  reportGoal: string;
  storyTimezone: string;
  references: ReferenceCatalog;
  /**
   * @maxItems 64
   */
  conditions: AnalysisCondition[];
  globalConditionIds: AnalysisConditionIdList;
  theme: Theme;
  visual: StoryVisual;
  /**
   * @minItems 1
   * @maxItems 64
   */
  blocks: [StoryBlock, ...StoryBlock[]];
}
export interface ReferenceCatalog {
  fieldIds: FieldIdList;
  metricIds: MetricIdList;
  evidenceIds: EvidenceIdList;
  judgmentRuleIds: JudgmentRuleIdList;
  narrativeRuleIds: NarrativeRuleIdList;
}
export interface TimeRangeCondition {
  conditionId: AnalysisConditionId;
  kind: "time-range";
  fieldId: FieldId;
  start: string;
  end: string;
}
export interface CategoryCondition {
  conditionId: AnalysisConditionId;
  kind: "category-in";
  fieldId: FieldId;
  /**
   * @minItems 1
   * @maxItems 64
   */
  values: [CategoryConditionValue, ...CategoryConditionValue[]];
  includeMissing: boolean;
}
export interface Theme {
  themeId: "deep-space-neon" | "soft-glass" | "data-editorial" | "enterprise-minimal";
}
export interface StoryVisual {
  renderMode: "2d";
  scenePreset: "none";
  motionPreset: "none";
}
export interface TitleSummaryBlock {
  blockId: StoryBlockId;
  blockType: "title-summary";
  layout: BlockLayout;
  additionalConditionIds: AnalysisConditionIdList;
  evidenceIds: EvidenceIdList;
  judgmentRuleIds: JudgmentRuleIdList;
  narrativeRuleIds: NarrativeRuleIdList;
  content: {
    title: string;
    summary: string;
  };
  visualVariant: "hero" | "plain";
}
export interface BlockLayout {
  variant: "full-width" | "split-left" | "split-right" | "emphasis";
}
export interface KpiBlock {
  blockId: StoryBlockId;
  blockType: "kpi";
  layout: BlockLayout;
  additionalConditionIds: AnalysisConditionIdList;
  metricId: MetricId;
  /**
   * @minItems 1
   * @maxItems 256
   */
  evidenceIds: [EvidenceId, ...EvidenceId[]];
  judgmentRuleIds: JudgmentRuleIdList;
  narrativeRuleIds: NarrativeRuleIdList;
  label: string;
  visualVariant: "metric-card" | "metric-feature";
}
