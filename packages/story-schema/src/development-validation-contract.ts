import type { ExperimentalStoryBlueprint } from "./generated/experimental-story-blueprint.generated.js";
import {
  STORY_BLUEPRINT_TEXT_RULES,
  STORY_BLUEPRINT_VALIDATION_LIMITS,
  type DeepReadonly,
  type StoryBlueprintValidationError,
  type StoryReferenceCatalog,
  type StoryValidationContext,
} from "./validation-contract.js";

/** 仅供未发布 0.x 开发 seam 使用；不从包根导出。 */
export const EXPERIMENTAL_STORY_BLUEPRINT_VALIDATION_LIMITS = Object.freeze({
  ...STORY_BLUEPRINT_VALIDATION_LIMITS,
  profileVersion: "0.1.0",
} as const);

export const EXPERIMENTAL_STORY_BLUEPRINT_TEXT_RULES = STORY_BLUEPRINT_TEXT_RULES;

export type ExperimentalStoryBlueprintReferenceCatalog = StoryReferenceCatalog;
export type ExperimentalStoryBlueprintValidationContext = StoryValidationContext;

declare const validatedExperimentalStoryBlueprintBrand: unique symbol;

export type ValidatedExperimentalStoryBlueprint =
  DeepReadonly<ExperimentalStoryBlueprint> & {
    readonly [validatedExperimentalStoryBlueprintBrand]: true;
  };

export type ExperimentalStoryBlueprintValidationSuccess = Readonly<{
  ok: true;
  value: ValidatedExperimentalStoryBlueprint;
  error?: never;
}>;

export type ExperimentalStoryBlueprintValidationFailure = Readonly<{
  ok: false;
  error: StoryBlueprintValidationError;
  value?: never;
}>;

export type ExperimentalStoryBlueprintValidationResult =
  | ExperimentalStoryBlueprintValidationSuccess
  | ExperimentalStoryBlueprintValidationFailure;
