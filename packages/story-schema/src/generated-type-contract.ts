import type {
  ExperimentalStoryBlueprint,
  KpiBlock,
  StoryBlock,
  TitleSummaryBlock,
} from "./generated/experimental-story-blueprint.generated.js";
import type {
  KpiBlock as FormalKpiBlock,
  StoryBlock as FormalStoryBlock,
  StoryBlueprint,
  TitleSummaryBlock as FormalTitleSummaryBlock,
} from "./generated/formal-story-blueprint-v1_0_0.generated.js";

type Expect<Value extends true> = Value;
type IsExactly<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
        (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false;

type _GeneratedRootKeepsExperimentalVersion = Expect<
  IsExactly<ExperimentalStoryBlueprint["schemaVersion"], "0.1.0">
>;
type _GeneratedRootKeepsRegisteredBlockUnion = Expect<
  IsExactly<StoryBlock, TitleSummaryBlock | KpiBlock>
>;
type _GeneratedRootRejectsArbitraryHtml = Expect<
  "html" extends keyof ExperimentalStoryBlueprint ? false : true
>;
type _GeneratedKpiBindsMetricById = Expect<
  IsExactly<KpiBlock["metricId"], string>
>;
type _GeneratedRootKeepsFormalVersion = Expect<
  IsExactly<StoryBlueprint["schemaVersion"], "1.0.0">
>;
type _GeneratedFormalRootKeepsRegisteredBlockUnion = Expect<
  IsExactly<FormalStoryBlock, FormalTitleSummaryBlock | FormalKpiBlock>
>;
type _GeneratedFormalRootRejectsArbitraryHtml = Expect<
  "html" extends keyof StoryBlueprint ? false : true
>;
type _GeneratedFormalKpiBindsMetricById = Expect<
  IsExactly<FormalKpiBlock["metricId"], string>
>;

export {};
