import { parseCoreVersion } from "@datapulse/domain";
import type { StoryBlueprintValidationError } from "@datapulse/story-schema";
import {
  STORY_ARTIFACT_READER_LIMITS,
  STORY_ARTIFACT_READ_ERROR_CODES,
  type StoryArtifactReadErrorFor,
  type StoryArtifactReadFailureFor,
  type StoryArtifactReadResultFor,
  type StoryArtifactReadSuccessFor,
} from "../contract.js";
import type { StoryHistoryAdapter } from "./history-adapter.js";

type TextDecoderInstance = Readonly<{
  decode(input?: ArrayBufferView): string;
}>;

type TextDecoderConstructor = new (
  label?: string,
  options?: Readonly<{ fatal?: boolean; ignoreBOM?: boolean }>,
) => TextDecoderInstance;

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  Symbol.toStringTag,
)?.get;
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;
const uint8ArraySet = Uint8Array.prototype.set;
const parseJson = JSON.parse;
const textDecoderConstructor = (
  globalThis as unknown as Readonly<{ TextDecoder?: TextDecoderConstructor }>
).TextDecoder;

type ByteSnapshotResult =
  | Readonly<{ ok: true; value: Uint8Array }>
  | Readonly<{
      ok: false;
      reason: "input_invalid" | "byte_limit";
      observedBytes?: number;
    }>;

function snapshotBytes(input: Uint8Array): ByteSnapshotResult {
  try {
    if (
      typedArrayByteLengthGetter === undefined ||
      typedArrayBufferGetter === undefined ||
      typedArrayTagGetter === undefined ||
      arrayBufferByteLengthGetter === undefined
    ) {
      return Object.freeze({ ok: false, reason: "input_invalid" });
    }

    const byteLength = typedArrayByteLengthGetter.call(input) as unknown;
    const intrinsicTag = typedArrayTagGetter.call(input) as unknown;
    if (
      typeof byteLength !== "number" ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      intrinsicTag !== "Uint8Array"
    ) {
      return Object.freeze({ ok: false, reason: "input_invalid" });
    }

    const buffer = typedArrayBufferGetter.call(input) as unknown;
    const bufferByteLength = arrayBufferByteLengthGetter.call(buffer) as unknown;
    if (
      typeof bufferByteLength !== "number" ||
      !Number.isSafeInteger(bufferByteLength) ||
      bufferByteLength < 0
    ) {
      return Object.freeze({ ok: false, reason: "input_invalid" });
    }

    if (byteLength > STORY_ARTIFACT_READER_LIMITS.maxInputBytes) {
      return Object.freeze({
        ok: false,
        observedBytes: byteLength,
        reason: "byte_limit",
      });
    }

    const copy = new Uint8Array(byteLength);
    uint8ArraySet.call(copy, input);
    return Object.freeze({ ok: true, value: copy });
  } catch {
    return Object.freeze({ ok: false, reason: "input_invalid" });
  }
}

type SimpleReadErrorCode =
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.inputInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.utf8Invalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.jsonInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.rootInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.versionInvalid
  | typeof STORY_ARTIFACT_READ_ERROR_CODES.readerUnavailable;

function simpleFailure<Version extends string>(
  code: SimpleReadErrorCode,
  phase: StoryArtifactReadErrorFor<Version>["phase"],
): StoryArtifactReadFailureFor<Version> {
  return Object.freeze({
    error: Object.freeze({ code, phase }) as StoryArtifactReadErrorFor<Version>,
    ok: false,
  });
}

function validationFailure<Version extends string>(
  code:
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.sourceStructureInvalid
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migratedStructureInvalid
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.finalValidationFailed,
  phase: "source-validation" | "step-validation" | "final-validation",
  validationError: StoryBlueprintValidationError,
): StoryArtifactReadFailureFor<Version> {
  const details = Object.freeze({
    issues: validationError.issues,
    truncated: validationError.truncated,
  });
  return Object.freeze({
    error: Object.freeze({ code, details, phase }),
    ok: false,
  });
}

function migrationFailure<Version extends string>(
  code:
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migrationUnavailable
    | typeof STORY_ARTIFACT_READ_ERROR_CODES.migrationFailed,
  sourceVersion: Version,
  currentVersion: Version,
  stepIndex: number,
): StoryArtifactReadFailureFor<Version> {
  const details = Object.freeze({
    currentVersion,
    sourceVersion,
    stepIndex,
  });
  return Object.freeze({
    error: Object.freeze({ code, details, phase: "migration" }),
    ok: false,
  });
}

function readRootVersion(input: unknown):
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; reason: "root" | "version" }> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    return Object.freeze({ ok: false, reason: "root" });
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, "schemaVersion");
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "string"
  ) {
    return Object.freeze({ ok: false, reason: "version" });
  }
  return Object.freeze({ ok: true, value: descriptor.value });
}

type Utf8DecodeResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; reason: "invalid" | "unavailable" }>;

function decodeUtf8(input: Uint8Array): Utf8DecodeResult {
  if (textDecoderConstructor === undefined) {
    return Object.freeze({ ok: false, reason: "unavailable" });
  }
  const hasBom =
    input.length >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf;
  const encodedJson = hasBom ? input.subarray(3) : input;

  let decoder: TextDecoderInstance;
  try {
    decoder = new textDecoderConstructor("utf-8", {
      fatal: true,
      // BOM is handled above so one leading BOM is accepted explicitly. Any
      // second BOM remains in the decoded text and JSON.parse rejects it.
      ignoreBOM: true,
    });
  } catch {
    return Object.freeze({ ok: false, reason: "unavailable" });
  }
  try {
    return Object.freeze({ ok: true, value: decoder.decode(encodedJson) });
  } catch {
    return Object.freeze({ ok: false, reason: "invalid" });
  }
}

/**
 * 原始字节 Reader 的私有复用 implementation。history adapter 只能由正式 wrapper
 * 或包内开发测试 wrapper 选择，不能由 package root 调用方注入。
 */
export function readStoryArtifactWithHistory<
  Version extends string,
  Context,
  Value,
>(
  input: Uint8Array,
  context: Context,
  history: StoryHistoryAdapter<Version, Context, Value>,
): StoryArtifactReadResultFor<Version, Value> {
  try {
    if (!history.isAvailable()) {
      return simpleFailure(
        STORY_ARTIFACT_READ_ERROR_CODES.readerUnavailable,
        "reader",
      );
    }

    const bytes = snapshotBytes(input);
    if (!bytes.ok) {
      if (bytes.reason === "byte_limit" && bytes.observedBytes !== undefined) {
        const details = Object.freeze({
          maxBytes: STORY_ARTIFACT_READER_LIMITS.maxInputBytes,
          observedBytes: bytes.observedBytes,
        });
        return Object.freeze({
          error: Object.freeze({
            code: STORY_ARTIFACT_READ_ERROR_CODES.byteLimitExceeded,
            details,
            phase: "size",
          }),
          ok: false,
        });
      }
      return simpleFailure(STORY_ARTIFACT_READ_ERROR_CODES.inputInvalid, "input");
    }

    const decoded = decodeUtf8(bytes.value);
    if (!decoded.ok) {
      return simpleFailure(
        decoded.reason === "unavailable"
          ? STORY_ARTIFACT_READ_ERROR_CODES.readerUnavailable
          : STORY_ARTIFACT_READ_ERROR_CODES.utf8Invalid,
        decoded.reason === "unavailable" ? "reader" : "decode",
      );
    }

    let parsed: unknown;
    try {
      parsed = parseJson(decoded.value) as unknown;
    } catch {
      return simpleFailure(STORY_ARTIFACT_READ_ERROR_CODES.jsonInvalid, "parse");
    }

    const rootVersion = readRootVersion(parsed);
    if (!rootVersion.ok) {
      return simpleFailure(
        rootVersion.reason === "root"
          ? STORY_ARTIFACT_READ_ERROR_CODES.rootInvalid
          : STORY_ARTIFACT_READ_ERROR_CODES.versionInvalid,
        rootVersion.reason === "root" ? "root" : "version",
      );
    }

    const parsedVersion = parseCoreVersion(rootVersion.value);
    if (!parsedVersion.ok) {
      return simpleFailure(
        STORY_ARTIFACT_READ_ERROR_CODES.versionInvalid,
        "version",
      );
    }
    const resolvedVersion = history.resolveVersion(parsedVersion.value);
    if (!resolvedVersion.ok) {
      if (resolvedVersion.reason === "unsupported") {
        return Object.freeze({
          error: Object.freeze({
            code: STORY_ARTIFACT_READ_ERROR_CODES.versionUnsupported,
            phase: "version",
          }),
          ok: false,
        });
      }
      return simpleFailure(
        STORY_ARTIFACT_READ_ERROR_CODES.readerUnavailable,
        "reader",
      );
    }

    const sourceVersion = resolvedVersion.value;
    const sourceValidation = history.validateSource(sourceVersion, parsed);
    if (!sourceValidation.ok) {
      return validationFailure(
        STORY_ARTIFACT_READ_ERROR_CODES.sourceStructureInvalid,
        "source-validation",
        sourceValidation.error,
      );
    }

    const migrated = history.migrate(sourceVersion, sourceValidation.value);
    if (!migrated.ok) {
      if (
        migrated.reason === "structure_invalid" &&
        migrated.validation !== undefined
      ) {
        return validationFailure(
          STORY_ARTIFACT_READ_ERROR_CODES.migratedStructureInvalid,
          "step-validation",
          migrated.validation.error,
        );
      }
      return migrationFailure(
        migrated.reason === "migration_failed"
          ? STORY_ARTIFACT_READ_ERROR_CODES.migrationFailed
          : STORY_ARTIFACT_READ_ERROR_CODES.migrationUnavailable,
        sourceVersion,
        history.currentVersion,
        migrated.stepIndex,
      );
    }

    const finalValidation = history.validateCurrent(migrated.value, context);
    if (!finalValidation.ok) {
      return validationFailure(
        STORY_ARTIFACT_READ_ERROR_CODES.finalValidationFailed,
        "final-validation",
        finalValidation.error,
      );
    }

    const success: StoryArtifactReadSuccessFor<Version, Value> = Object.freeze({
      currentVersion: history.currentVersion,
      migrated: migrated.steps > 0,
      ok: true,
      sourceVersion,
      value: finalValidation.value,
    });
    return success;
  } catch {
    return simpleFailure(
      STORY_ARTIFACT_READ_ERROR_CODES.readerUnavailable,
      "reader",
    );
  }
}
