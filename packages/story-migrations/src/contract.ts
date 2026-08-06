import type {
  StoryBlueprintValidationError,
  StoryValidationContext,
  ValidatedStoryBlueprint,
} from "@datapulse/story-schema";

type StoryBlueprintValidationIssue = StoryBlueprintValidationError["issues"][number];

export const STORY_ARTIFACT_READER_LIMITS = Object.freeze({
  profileVersion: "1.0.0",
  maxInputBytes: 16_777_216,
  maxMigrationSteps: 64,
} as const);

export const STORY_ARTIFACT_READ_ERROR_CODES = Object.freeze({
  inputInvalid: "STORY_ARTIFACT_INPUT_INVALID",
  byteLimitExceeded: "STORY_ARTIFACT_BYTE_LIMIT_EXCEEDED",
  utf8Invalid: "STORY_ARTIFACT_UTF8_INVALID",
  jsonInvalid: "STORY_ARTIFACT_JSON_INVALID",
  rootInvalid: "STORY_ARTIFACT_ROOT_INVALID",
  versionInvalid: "STORY_ARTIFACT_VERSION_INVALID",
  versionUnsupported: "STORY_ARTIFACT_VERSION_UNSUPPORTED",
  sourceStructureInvalid: "STORY_ARTIFACT_SOURCE_STRUCTURE_INVALID",
  migrationUnavailable: "STORY_ARTIFACT_MIGRATION_UNAVAILABLE",
  migrationFailed: "STORY_ARTIFACT_MIGRATION_FAILED",
  migratedStructureInvalid: "STORY_ARTIFACT_MIGRATED_STRUCTURE_INVALID",
  finalValidationFailed: "STORY_ARTIFACT_FINAL_VALIDATION_FAILED",
  readerUnavailable: "STORY_ARTIFACT_READER_UNAVAILABLE",
} as const);

export type StoryArtifactReadErrorCode =
  (typeof STORY_ARTIFACT_READ_ERROR_CODES)[keyof typeof STORY_ARTIFACT_READ_ERROR_CODES];

export type StoryArtifactReadPhase =
  | "input"
  | "size"
  | "decode"
  | "parse"
  | "root"
  | "version"
  | "source-validation"
  | "migration"
  | "step-validation"
  | "final-validation"
  | "reader";

type SimpleReadErrorCode =
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.inputInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.utf8Invalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.jsonInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.rootInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.versionInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.readerUnavailable;

export type StoryArtifactSimpleReadError = Readonly<{
  code: SimpleReadErrorCode;
  phase: StoryArtifactReadPhase;
}>;

export type StoryArtifactByteLimitError = Readonly<{
  code: typeof STORY_ARTIFACT_READ_ERROR_CODES.byteLimitExceeded;
  phase: "size";
  details: Readonly<{
    observedBytes: number;
    maxBytes: typeof STORY_ARTIFACT_READER_LIMITS.maxInputBytes;
  }>;
}>;

export type StoryArtifactUnsupportedVersionError = Readonly<{
  code: typeof STORY_ARTIFACT_READ_ERROR_CODES.versionUnsupported;
  phase: "version";
}>;

export type StoryArtifactValidationReadError = Readonly<{
  code:
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.sourceStructureInvalid
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migratedStructureInvalid
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.finalValidationFailed;
  phase: "source-validation" | "step-validation" | "final-validation";
  details: Readonly<{
    issues: readonly StoryBlueprintValidationIssue[];
    truncated: boolean;
  }>;
}>;

export type StoryArtifactMigrationReadErrorFor<Version extends string> = Readonly<{
  code:
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migrationUnavailable
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migrationFailed;
  phase: "migration";
  details: Readonly<{
    sourceVersion: Version;
    currentVersion: Version;
    stepIndex: number;
  }>;
}>;

export type StoryArtifactReadErrorFor<Version extends string> =
  | StoryArtifactSimpleReadError
  | StoryArtifactByteLimitError
  | StoryArtifactUnsupportedVersionError
  | StoryArtifactValidationReadError
  | StoryArtifactMigrationReadErrorFor<Version>;

export type StoryArtifactReadSuccessFor<Version extends string, Value> = Readonly<{
  ok: true;
  value: Value;
  sourceVersion: Version;
  currentVersion: Version;
  migrated: boolean;
  error?: never;
}>;

export type StoryArtifactReadFailureFor<Version extends string> = Readonly<{
  ok: false;
  error: StoryArtifactReadErrorFor<Version>;
  value?: never;
}>;

export type StoryArtifactReadResultFor<Version extends string, Value> =
  | StoryArtifactReadSuccessFor<Version, Value>
  | StoryArtifactReadFailureFor<Version>;

/** Public failures explain the bounded read without exposing migration routing. */
export type StoryArtifactMigrationReadError = Readonly<{
  code:
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migrationUnavailable
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migrationFailed;
  phase: "migration";
}>;

export type StoryArtifactReadError =
  | StoryArtifactSimpleReadError
  | StoryArtifactByteLimitError
  | StoryArtifactUnsupportedVersionError
  | StoryArtifactValidationReadError
  | StoryArtifactMigrationReadError;

export type StoryArtifactReadSuccess = Readonly<{
  ok: true;
  value: ValidatedStoryBlueprint;
  error?: never;
}>;

export type StoryArtifactReadFailure = Readonly<{
  ok: false;
  error: StoryArtifactReadError;
  value?: never;
}>;

export type StoryArtifactReadResult =
  | StoryArtifactReadSuccess
  | StoryArtifactReadFailure;

export type StoryArtifactValidationContext = StoryValidationContext;
