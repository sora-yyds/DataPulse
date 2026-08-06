import {
  createVersionRegistry,
  resolveVersion,
} from "@datapulse/domain";
import {
  validateCurrentStory,
  type StoryValidationContext,
  type ValidatedStoryBlueprint,
} from "@datapulse/story-schema";
import {
  FORMAL_STORY_BLUEPRINT_VERSIONS,
  validateFormalStoryBlueprintStructure,
  type FormalStoryBlueprintVersion,
} from "@datapulse/story-schema/formal-migration-support";
import type {
  StoryHistoryAdapter,
  StoryHistoryMigrationResult,
  StoryHistoryStructureValidationResult,
} from "./history-adapter.js";

const REGISTRY_KIND = "story-blueprint" as const;

const registryResult = createVersionRegistry(
  REGISTRY_KIND,
  FORMAL_STORY_BLUEPRINT_VERSIONS.supported,
);

const registry = registryResult.ok ? registryResult.value : undefined;

function registryIsAvailable(): boolean {
  return registry !== undefined;
}

function isFormalStoryBlueprintVersion(
  input: string,
): input is FormalStoryBlueprintVersion {
  return (FORMAL_STORY_BLUEPRINT_VERSIONS.supported as readonly string[]).includes(
    input,
  );
}

function resolveFormalVersion(input: unknown):
  | Readonly<{ ok: true; value: FormalStoryBlueprintVersion }>
  | Readonly<{ ok: false; reason: "invalid" | "unsupported" }> {
  if (registry === undefined) {
    return Object.freeze({ ok: false, reason: "invalid" });
  }

  const resolved = resolveVersion(registry, REGISTRY_KIND, input);
  if (resolved.ok) {
    if (isFormalStoryBlueprintVersion(resolved.value)) {
      return Object.freeze({
        ok: true,
        value: resolved.value,
      });
    }
    return Object.freeze({ ok: false, reason: "invalid" });
  }
  if (resolved.error.code === "DOMAIN_VERSION_UNSUPPORTED") {
    return Object.freeze({ ok: false, reason: "unsupported" });
  }
  return Object.freeze({ ok: false, reason: "invalid" });
}

function validateFormalSource(
  version: FormalStoryBlueprintVersion,
  input: unknown,
): StoryHistoryStructureValidationResult {
  return validateFormalStoryBlueprintStructure(version, input);
}

/**
 * 1.0.0 是首个正式历史节点，因此当前没有正式迁移边。重复执行当前结构校验，
 * 使首个节点与未来逐步迁移节点保持同一条 fail-closed implementation 路径。
 */
function migrateFormalStoryBlueprint(
  sourceVersion: FormalStoryBlueprintVersion,
  source: unknown,
): StoryHistoryMigrationResult<FormalStoryBlueprintVersion> {
  if (sourceVersion !== FORMAL_STORY_BLUEPRINT_VERSIONS.current) {
    return Object.freeze({
      ok: false,
      reason: "migration_unavailable",
      stepIndex: 0,
      version: sourceVersion,
    });
  }

  const validated = validateFormalStoryBlueprintStructure(
    FORMAL_STORY_BLUEPRINT_VERSIONS.current,
    source,
  );
  if (!validated.ok) {
    return Object.freeze({
      ok: false,
      reason: "structure_invalid",
      stepIndex: 0,
      validation: validated,
      version: FORMAL_STORY_BLUEPRINT_VERSIONS.current,
    });
  }

  return Object.freeze({
    ok: true,
    steps: 0,
    value: validated.value,
    version: FORMAL_STORY_BLUEPRINT_VERSIONS.current,
  });
}

export const formalStoryHistoryAdapter: StoryHistoryAdapter<
  FormalStoryBlueprintVersion,
  StoryValidationContext,
  ValidatedStoryBlueprint
> = Object.freeze({
  currentVersion: FORMAL_STORY_BLUEPRINT_VERSIONS.current,
  isAvailable: registryIsAvailable,
  migrate: migrateFormalStoryBlueprint,
  resolveVersion: resolveFormalVersion,
  validateCurrent: validateCurrentStory,
  validateSource: validateFormalSource,
});
