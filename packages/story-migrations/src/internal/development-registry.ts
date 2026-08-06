import {
  createVersionRegistry,
  resolveVersion,
} from "@datapulse/domain";
import {
  DEVELOPMENT_STORY_BLUEPRINT_VERSIONS,
  validateDevelopmentStoryBlueprintStructure,
  type DevelopmentStoryBlueprintStructureValidationResult,
  type DevelopmentStoryBlueprintVersion,
} from "@datapulse/story-schema/development-migration-support";
import { STORY_ARTIFACT_READER_LIMITS } from "../contract.js";

const REGISTRY_KIND = "experimental-story-blueprint" as const;

type MigrationDescriptor = Readonly<{
  from: DevelopmentStoryBlueprintVersion;
  to: DevelopmentStoryBlueprintVersion;
  migrate: (input: unknown) => unknown;
}>;

function migrateLegacyStoryTimezone(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("validated legacy story blueprint root is unavailable");
  }

  const source = input as Readonly<Record<string, unknown>>;
  const migrated: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (key !== "schemaVersion" && key !== "storyTimeZone") {
      Object.defineProperty(migrated, key, {
        configurable: true,
        enumerable: true,
        value: source[key],
        writable: true,
      });
    }
  }
  Object.defineProperties(migrated, {
    schemaVersion: {
      configurable: true,
      enumerable: true,
      value: DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.current,
      writable: true,
    },
    storyTimezone: {
      configurable: true,
      enumerable: true,
      value: source["storyTimeZone"],
      writable: true,
    },
  });
  return migrated;
}

const MIGRATIONS: readonly MigrationDescriptor[] = Object.freeze([
  Object.freeze({
    from: DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.legacy,
    to: DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.current,
    migrate: migrateLegacyStoryTimezone,
  }),
]);

const registryResult = createVersionRegistry(REGISTRY_KIND, [
  DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.legacy,
  DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.current,
]);

const registry = registryResult.ok ? registryResult.value : undefined;

export type DevelopmentMigrationStepResult =
  | Readonly<{
      ok: true;
      value: DevelopmentStoryBlueprintStructureValidationResult & { readonly ok: true };
      version: DevelopmentStoryBlueprintVersion;
      steps: number;
    }>
  | Readonly<{
      ok: false;
      reason: "migration_unavailable" | "migration_failed" | "structure_invalid";
      version: DevelopmentStoryBlueprintVersion;
      stepIndex: number;
      validation?: DevelopmentStoryBlueprintStructureValidationResult & { readonly ok: false };
    }>;

export function registryIsAvailable(): boolean {
  return registry !== undefined;
}

export function resolveDevelopmentVersion(input: unknown):
  | Readonly<{ ok: true; value: DevelopmentStoryBlueprintVersion }>
  | Readonly<{ ok: false; reason: "invalid" | "unsupported" }> {
  if (registry === undefined) {
    return Object.freeze({ ok: false, reason: "invalid" });
  }

  const resolved = resolveVersion(registry, REGISTRY_KIND, input);
  if (resolved.ok) {
    return Object.freeze({
      ok: true,
      value: resolved.value as unknown as DevelopmentStoryBlueprintVersion,
    });
  }
  if (resolved.error.code === "DOMAIN_VERSION_UNSUPPORTED") {
    return Object.freeze({ ok: false, reason: "unsupported" });
  }
  return Object.freeze({ ok: false, reason: "invalid" });
}

export function validateDevelopmentSource(
  version: DevelopmentStoryBlueprintVersion,
  input: unknown,
): DevelopmentStoryBlueprintStructureValidationResult {
  return validateDevelopmentStoryBlueprintStructure(version, input);
}

export function migrateDevelopmentStoryBlueprint(
  sourceVersion: DevelopmentStoryBlueprintVersion,
  source: unknown,
): DevelopmentMigrationStepResult {
  let version = sourceVersion;
  let value = source;
  const seen = new Set<DevelopmentStoryBlueprintVersion>();

  for (
    let stepIndex = 0;
    stepIndex < STORY_ARTIFACT_READER_LIMITS.maxMigrationSteps;
    stepIndex += 1
  ) {
    if (version === DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.current) {
      const validated = validateDevelopmentStoryBlueprintStructure(version, value);
      if (!validated.ok) {
        return Object.freeze({
          ok: false,
          reason: "structure_invalid",
          stepIndex,
          validation: validated,
          version,
        });
      }
      return Object.freeze({
        ok: true,
        steps: stepIndex,
        value: validated,
        version,
      });
    }
    if (seen.has(version)) {
      return Object.freeze({
        ok: false,
        reason: "migration_unavailable",
        stepIndex,
        version,
      });
    }
    seen.add(version);

    const descriptor = MIGRATIONS.find((candidate) => candidate.from === version);
    if (descriptor === undefined) {
      return Object.freeze({
        ok: false,
        reason: "migration_unavailable",
        stepIndex,
        version,
      });
    }

    let candidate: unknown;
    try {
      candidate = descriptor.migrate(value);
    } catch {
      return Object.freeze({
        ok: false,
        reason: "migration_failed",
        stepIndex,
        version,
      });
    }
    const validated = validateDevelopmentStoryBlueprintStructure(descriptor.to, candidate);
    if (!validated.ok) {
      return Object.freeze({
        ok: false,
        reason: "structure_invalid",
        stepIndex,
        validation: validated,
        version: descriptor.to,
      });
    }
    value = validated.value;
    version = descriptor.to;
  }

  return Object.freeze({
    ok: false,
    reason: "migration_unavailable",
    stepIndex: STORY_ARTIFACT_READER_LIMITS.maxMigrationSteps,
    version,
  });
}
