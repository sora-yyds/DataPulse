/** Stable, closed-enum error DTOs for the local-storage package. */

import type { StoryArtifactReadErrorCode } from "@datapulse/story-migrations";

export const LOCAL_STORAGE_ERROR_CODES = Object.freeze({
  unavailable: "STORAGE_UNAVAILABLE",
  persistenceUnavailable: "STORAGE_PERSISTENCE_UNAVAILABLE",
  deviceKeyMissing: "STORAGE_DEVICE_KEY_MISSING",
  writeFailed: "STORAGE_WRITE_FAILED",
  invalidDeviceKey: "STORAGE_INVALID_DEVICE_KEY",
  invalidArgument: "STORAGE_INVALID_ARGUMENT",
  objectNotFound: "STORAGE_OBJECT_NOT_FOUND",
  quotaUnavailable: "STORAGE_QUOTA_UNAVAILABLE",
  capacityExceeded: "STORAGE_CAPACITY_EXCEEDED",
  storyInvalid: "STORAGE_STORY_INVALID",
} as const);

export type LocalStorageErrorCode =
  (typeof LOCAL_STORAGE_ERROR_CODES)[keyof typeof LOCAL_STORAGE_ERROR_CODES];

export type StorageUnavailableReason =
  | "indexeddb-missing"
  | "opfs-missing"
  | "open-failed"
  | "read-failed"
  | "delete-failed"
  | "object-file-missing"
  | "integrity-mismatch";

export type PersistenceUnavailableReason = "persist-unsupported" | "persist-denied";

export type DeviceKeyMissingReason = "not-found";

export type WriteFailedReason =
  | "indexeddb-write"
  | "indexeddb-commit"
  | "opfs-write";

export type InvalidDeviceKeyReason =
  | "type"
  | "algorithm"
  | "length"
  | "usages"
  | "extractable";

export type InvalidArgumentReason =
  | "type"
  | "negative-length"
  | "invalid-identifier"
  | "duplicate-object-id"
  | "duplicate-transaction-id";

export type QuotaUnavailableReason = "estimate-unsupported" | "estimate-failed";

export type ObjectNotFoundReason = "not-found";

export type CapacityExceededReason =
  | "quota-exceeded"
  | "backup-payload-exceeded"
  | "quota-and-payload-exceeded";

/** Stable story-reader rejection reason: the public Artifact Reader error code. */
export type StoryInvalidReason = StoryArtifactReadErrorCode;

type FrozenError<Code extends LocalStorageErrorCode, Reason extends string> = Readonly<{
  code: Code;
  details: Readonly<{ reason: Reason }>;
}>;

export type StorageUnavailableError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.unavailable,
  StorageUnavailableReason
>;
export type PersistenceUnavailableError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.persistenceUnavailable,
  PersistenceUnavailableReason
>;
export type DeviceKeyMissingError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.deviceKeyMissing,
  DeviceKeyMissingReason
>;
export type StorageWriteFailedError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.writeFailed,
  WriteFailedReason
>;
export type InvalidDeviceKeyError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.invalidDeviceKey,
  InvalidDeviceKeyReason
>;
export type InvalidArgumentError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.invalidArgument,
  InvalidArgumentReason
>;
export type QuotaUnavailableError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.quotaUnavailable,
  QuotaUnavailableReason
>;
export type CapacityExceededError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.capacityExceeded,
  CapacityExceededReason
>;
export type ObjectNotFoundError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.objectNotFound,
  ObjectNotFoundReason
>;
export type StoryInvalidError = FrozenError<
  typeof LOCAL_STORAGE_ERROR_CODES.storyInvalid,
  StoryInvalidReason
>;

export type LocalStorageError =
  | StorageUnavailableError
  | PersistenceUnavailableError
  | DeviceKeyMissingError
  | StorageWriteFailedError
  | InvalidDeviceKeyError
  | InvalidArgumentError
  | QuotaUnavailableError
  | CapacityExceededError
  | ObjectNotFoundError
  | StoryInvalidError;

function freezeError<Code extends LocalStorageErrorCode, Reason extends string>(
  code: Code,
  reason: Reason,
): FrozenError<Code, Reason> {
  return Object.freeze({ code, details: Object.freeze({ reason }) });
}

export function createStorageUnavailableError(
  reason: StorageUnavailableReason,
): StorageUnavailableError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.unavailable, reason);
}

export function createPersistenceUnavailableError(
  reason: PersistenceUnavailableReason,
): PersistenceUnavailableError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.persistenceUnavailable, reason);
}

export function createDeviceKeyMissingError(): DeviceKeyMissingError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.deviceKeyMissing, "not-found");
}

export function createStorageWriteFailedError(
  reason: WriteFailedReason = "indexeddb-write",
): StorageWriteFailedError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.writeFailed, reason);
}

export function createInvalidDeviceKeyError(reason: InvalidDeviceKeyReason): InvalidDeviceKeyError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.invalidDeviceKey, reason);
}

export function createInvalidArgumentError(reason: InvalidArgumentReason): InvalidArgumentError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.invalidArgument, reason);
}

export function createQuotaUnavailableError(
  reason: QuotaUnavailableReason,
): QuotaUnavailableError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.quotaUnavailable, reason);
}

export function createCapacityExceededError(
  reason: CapacityExceededReason,
): CapacityExceededError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.capacityExceeded, reason);
}

export function createObjectNotFoundError(): ObjectNotFoundError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.objectNotFound, "not-found");
}

export function createStoryInvalidError(reason: StoryInvalidReason): StoryInvalidError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.storyInvalid, reason);
}
/** Narrowing guard for the stable local-storage error family. */
export function isLocalStorageError(error: unknown): error is LocalStorageError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    String((error as { code: unknown }).code).startsWith("STORAGE_")
  );
}