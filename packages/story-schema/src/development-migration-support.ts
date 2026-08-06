import type { ExperimentalStoryBlueprint } from "./generated/experimental-story-blueprint.generated.js";
import type { ExperimentalStoryBlueprintV0_0_1 } from "./generated/experimental-story-blueprint-v0_0_1.generated.js";
import validateCurrentStructure from "./generated/experimental-story-blueprint.validator.generated.js";
import validateLegacyStructure from "./generated/experimental-story-blueprint-v0_0_1.validator.generated.js";
import {
  createSafeJsonSnapshot,
  deepFreezeJson,
  type SnapshotFailureReason,
} from "./safe-json-snapshot.js";
import {
  EXPERIMENTAL_STORY_BLUEPRINT_VALIDATION_LIMITS,
} from "./development-validation-contract.js";
import {
  STORY_BLUEPRINT_VALIDATION_ERROR_CODES,
  type DeepReadonly,
  type StoryBlueprintValidationError,
  type StoryBlueprintValidationIssueCode,
} from "./validation-contract.js";

/**
 * 仅供 M0-013 复制迁移执行器及其开发夹具使用。两个 0.x 版本均未发布，
 * 不属于 ADR-0036 的正式历史，也不建立 M0-048 之后的永久兼容承诺。
 */
export const DEVELOPMENT_STORY_BLUEPRINT_VERSIONS = Object.freeze({
  legacy: "0.0.1",
  current: "0.1.0",
} as const);

export type DevelopmentStoryBlueprintVersion =
  (typeof DEVELOPMENT_STORY_BLUEPRINT_VERSIONS)[keyof typeof DEVELOPMENT_STORY_BLUEPRINT_VERSIONS];

export type DevelopmentStoryBlueprint =
  | ExperimentalStoryBlueprintV0_0_1
  | ExperimentalStoryBlueprint;

declare const validatedDevelopmentStoryBlueprintBrand: unique symbol;

export type ValidatedDevelopmentStoryBlueprint =
  DeepReadonly<DevelopmentStoryBlueprint> & {
    readonly [validatedDevelopmentStoryBlueprintBrand]: true;
  };

export type DevelopmentStoryBlueprintStructureValidationSuccess = Readonly<{
  ok: true;
  value: ValidatedDevelopmentStoryBlueprint;
  error?: never;
}>;

export type DevelopmentStoryBlueprintStructureValidationFailure = Readonly<{
  ok: false;
  error: StoryBlueprintValidationError;
  value?: never;
}>;

export type DevelopmentStoryBlueprintStructureValidationResult =
  | DevelopmentStoryBlueprintStructureValidationSuccess
  | DevelopmentStoryBlueprintStructureValidationFailure;

const SNAPSHOT_FAILURE_CODES: Readonly<
  Record<SnapshotFailureReason, StoryBlueprintValidationIssueCode>
> = Object.freeze({
  accessor: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputAccessor,
  alias: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputAlias,
  byte_limit: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.snapshotByteLimit,
  depth_limit: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.depthLimit,
  non_json_value: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonJsonValue,
  non_plain_object: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputNonPlainObject,
  node_limit: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.nodeLimit,
  sparse_array: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputSparseArray,
  symbol_property: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputSymbolProperty,
  unreadable: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.inputUnreadable,
});

function failure(
  code: StoryBlueprintValidationIssueCode,
  path = "$",
): DevelopmentStoryBlueprintStructureValidationFailure {
  const issue = Object.freeze({ code, path });
  const issues = Object.freeze([issue]);
  const error = Object.freeze({
    code: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validationFailed,
    issues,
    truncated: false,
  });
  return Object.freeze({ ok: false, error });
}

/**
 * 对已解析的未发布开发故事蓝图执行版本化结构校验。输入会在任何 standalone
 * validator 读取前形成隔离、深冻结的安全副本；失败 DTO 有界且不回显输入。
 * 原始字节准入、fatal UTF-8、JSON.parse 与迁移顺序属于 Story Artifact Reader。
 */
export function validateDevelopmentStoryBlueprintStructure(
  version: DevelopmentStoryBlueprintVersion,
  input: unknown,
): DevelopmentStoryBlueprintStructureValidationResult {
  try {
    const snapshot = createSafeJsonSnapshot(
      input,
      EXPERIMENTAL_STORY_BLUEPRINT_VALIDATION_LIMITS,
    );
    if (!snapshot.ok) {
      return failure(SNAPSHOT_FAILURE_CODES[snapshot.reason]);
    }

    const value = deepFreezeJson(snapshot.value);
    let valid: boolean;
    if (version === DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.legacy) {
      valid = validateLegacyStructure(value);
    } else if (version === DEVELOPMENT_STORY_BLUEPRINT_VERSIONS.current) {
      valid = validateCurrentStructure(value);
    } else {
      return failure(
        STORY_BLUEPRINT_VALIDATION_ERROR_CODES.structureInvalid,
        "$/schemaVersion",
      );
    }

    if (!valid) {
      return failure(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.structureInvalid);
    }

    return Object.freeze({
      ok: true,
      value: value as unknown as ValidatedDevelopmentStoryBlueprint,
    });
  } catch {
    return failure(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validatorUnavailable);
  }
}

export { validateExperimentalStoryBlueprint } from "./experimental-validator.js";
export type {
  ExperimentalStoryBlueprintValidationContext,
  ValidatedExperimentalStoryBlueprint,
} from "./development-validation-contract.js";
export type {
  StoryBlueprintValidationError,
} from "./validation-contract.js";
