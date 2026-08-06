import {
  DEVELOPMENT_STORY_BLUEPRINT_VERSIONS,
  validateExperimentalStoryBlueprint,
  type DevelopmentStoryBlueprintVersion,
  type ExperimentalStoryBlueprintValidationContext,
  type ValidatedExperimentalStoryBlueprint,
} from "@datapulse/story-schema/development-migration-support";
import type { StoryArtifactReadResultFor } from "../contract.js";
import {
  migrateDevelopmentStoryBlueprint,
  registryIsAvailable,
  resolveDevelopmentVersion,
  validateDevelopmentSource,
} from "./development-registry.js";
import type {
  StoryHistoryAdapter,
  StoryHistoryMigrationResult,
} from "./history-adapter.js";
import { readStoryArtifactWithHistory } from "./reader-core.js";

export type DevelopmentStoryArtifactValidationContext =
  ExperimentalStoryBlueprintValidationContext;

export type DevelopmentStoryArtifactReadResult = StoryArtifactReadResultFor<
  DevelopmentStoryBlueprintVersion,
  ValidatedExperimentalStoryBlueprint
>;

function migrateDevelopmentHistory(
  sourceVersion: DevelopmentStoryBlueprintVersion,
  source: unknown,
): StoryHistoryMigrationResult<DevelopmentStoryBlueprintVersion> {
  const migrated = migrateDevelopmentStoryBlueprint(sourceVersion, source);
  if (!migrated.ok) return migrated;

  return Object.freeze({
    ok: true,
    steps: migrated.steps,
    value: migrated.value.value,
    version: migrated.version,
  });
}

const developmentStoryHistoryAdapter: StoryHistoryAdapter<
  DevelopmentStoryBlueprintVersion,
  ExperimentalStoryBlueprintValidationContext,
  ValidatedExperimentalStoryBlueprint
> = Object.freeze({
  currentVersion: DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.current,
  isAvailable: registryIsAvailable,
  migrate: migrateDevelopmentHistory,
  resolveVersion: resolveDevelopmentVersion,
  validateCurrent: validateExperimentalStoryBlueprint,
  validateSource: validateDevelopmentSource,
});

/**
 * 仅供包内测试保留 M0-013 的未发布 0.x Reader／复制迁移覆盖。该函数不从
 * package root 导出，不能成为 Creator、观看者或 Project Repository 的兼容 seam。
 */
export function readDevelopmentStoryArtifact(
  input: Uint8Array,
  context: DevelopmentStoryArtifactValidationContext,
): DevelopmentStoryArtifactReadResult {
  return readStoryArtifactWithHistory(
    input,
    context,
    developmentStoryHistoryAdapter,
  );
}
