import { FORMAL_STORY_SCHEMA_CURRENT_VERSION } from "./generated/formal-story-history.generated.js";
import {
  FORMAL_STORY_SCHEMA_VALIDATORS,
  FORMAL_STORY_SCHEMA_VERSIONS,
  type FormalStorySchemaStructureValidator,
} from "./generated/formal-story-validator-registry.generated.js";
import {
  createSafeJsonSnapshot,
  deepFreezeJson,
  type SnapshotFailureReason,
} from "./safe-json-snapshot.js";
import {
  STORY_BLUEPRINT_VALIDATION_ERROR_CODES,
  STORY_BLUEPRINT_VALIDATION_LIMITS,
  type StoryBlueprintValidationError,
  type StoryBlueprintValidationIssueCode,
} from "./validation-contract.js";

/**
 * 正式故事蓝图版本只从 append-only history manifest 进入此集合。0.x 开发版本
 * 永不登记，也不存在通向 1.0.0 的正式迁移边。
 */
export const FORMAL_STORY_BLUEPRINT_VERSIONS = Object.freeze({
  current: FORMAL_STORY_SCHEMA_CURRENT_VERSION,
  supported: FORMAL_STORY_SCHEMA_VERSIONS,
} as const);

export type FormalStoryBlueprintVersion =
  (typeof FORMAL_STORY_SCHEMA_VERSIONS)[number];

declare const validatedFormalStoryBlueprintBrand: unique symbol;

type ReadonlyJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ReadonlyJsonValue[]
  | Readonly<{ [key: string]: ReadonlyJsonValue }>;

export type ValidatedFormalStoryBlueprint = Readonly<{
  [key: string]: ReadonlyJsonValue;
}> & {
  readonly [validatedFormalStoryBlueprintBrand]: true;
};

export type FormalStoryBlueprintStructureValidationSuccess = Readonly<{
  ok: true;
  value: ValidatedFormalStoryBlueprint;
  error?: never;
}>;

export type FormalStoryBlueprintStructureValidationFailure = Readonly<{
  ok: false;
  error: StoryBlueprintValidationError;
  value?: never;
}>;

export type FormalStoryBlueprintStructureValidationResult =
  | FormalStoryBlueprintStructureValidationSuccess
  | FormalStoryBlueprintStructureValidationFailure;

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
): FormalStoryBlueprintStructureValidationFailure {
  const issue = Object.freeze({ code, path });
  const error = Object.freeze({
    code: STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validationFailed,
    issues: Object.freeze([issue]),
    truncated: false,
  });
  return Object.freeze({ ok: false, error });
}

/**
 * 仅供 story-migrations 的私有正式历史 implementation 使用。输入在 standalone
 * validator 读取前形成隔离、深冻结的安全副本；调用方不能注入 validator 或版本表。
 */
export function validateFormalStoryBlueprintStructure(
  version: FormalStoryBlueprintVersion,
  input: unknown,
): FormalStoryBlueprintStructureValidationResult {
  try {
    const structureValidator = (
      FORMAL_STORY_SCHEMA_VALIDATORS as Readonly<
        Record<string, FormalStorySchemaStructureValidator | undefined>
      >
    )[version];
    if (structureValidator === undefined) {
      return failure(
        STORY_BLUEPRINT_VALIDATION_ERROR_CODES.structureInvalid,
        "$/schemaVersion",
      );
    }

    const snapshot = createSafeJsonSnapshot(input, STORY_BLUEPRINT_VALIDATION_LIMITS);
    if (!snapshot.ok) {
      return failure(SNAPSHOT_FAILURE_CODES[snapshot.reason]);
    }

    const value = deepFreezeJson(snapshot.value);
    if (!structureValidator(value)) {
      return failure(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.structureInvalid);
    }

    return Object.freeze({
      ok: true,
      value: value as unknown as ValidatedFormalStoryBlueprint,
    });
  } catch {
    return failure(STORY_BLUEPRINT_VALIDATION_ERROR_CODES.validatorUnavailable);
  }
}
