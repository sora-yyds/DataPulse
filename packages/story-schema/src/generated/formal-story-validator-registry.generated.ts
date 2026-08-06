/* 由 scripts/generate-artifacts.mjs 确定性生成；请勿手工修改。 */
import validateFormalStoryStructureV1_0_0_0 from "./formal-story-blueprint-v1_0_0.validator.generated.js";

export const FORMAL_STORY_SCHEMA_VERSIONS = Object.freeze(["1.0.0"] as const);

export type FormalStorySchemaVersion =
  (typeof FORMAL_STORY_SCHEMA_VERSIONS)[number];

export type FormalStorySchemaStructureValidator = ((value: unknown) => boolean) & {
  errors?: readonly Readonly<{ instancePath?: unknown }>[] | null;
};

export const FORMAL_STORY_SCHEMA_VALIDATORS = Object.freeze({
  "1.0.0": validateFormalStoryStructureV1_0_0_0 as FormalStorySchemaStructureValidator,
} satisfies Record<FormalStorySchemaVersion, FormalStorySchemaStructureValidator>);
