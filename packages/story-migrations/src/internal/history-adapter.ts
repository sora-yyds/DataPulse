import type { StoryBlueprintValidationError } from "@datapulse/story-schema";

export type StoryHistoryStructureValidationResult =
  | Readonly<{
      ok: true;
      value: unknown;
      error?: never;
    }>
  | Readonly<{
      ok: false;
      error: StoryBlueprintValidationError;
      value?: never;
    }>;

export type StoryHistoryMigrationResult<Version extends string> =
  | Readonly<{
      ok: true;
      value: unknown;
      version: Version;
      steps: number;
    }>
  | Readonly<{
      ok: false;
      reason: "migration_unavailable" | "migration_failed" | "structure_invalid";
      version: Version;
      stepIndex: number;
      validation?: StoryHistoryStructureValidationResult & { readonly ok: false };
    }>;

export type StoryHistoryFinalValidationResult<Value> =
  | Readonly<{
      ok: true;
      value: Value;
      error?: never;
    }>
  | Readonly<{
      ok: false;
      error: StoryBlueprintValidationError;
      value?: never;
    }>;

/**
 * Reader implementation 的私有 history seam。正式历史与未发布开发历史是两个
 * adapter；调用方不能从 package root 注入或替换它们。
 */
export type StoryHistoryAdapter<
  Version extends string,
  Context,
  Value,
> = Readonly<{
  currentVersion: Version;
  isAvailable(): boolean;
  resolveVersion(input: unknown):
    | Readonly<{ ok: true; value: Version }>
    | Readonly<{ ok: false; reason: "invalid" | "unsupported" }>;
  validateSource(
    version: Version,
    input: unknown,
  ): StoryHistoryStructureValidationResult;
  migrate(
    sourceVersion: Version,
    source: unknown,
  ): StoryHistoryMigrationResult<Version>;
  validateCurrent(
    input: unknown,
    context: Context,
  ): StoryHistoryFinalValidationResult<Value>;
}>;
