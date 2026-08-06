/** Stable, closed-enum error DTOs for the local-storage package. */

export const LOCAL_STORAGE_ERROR_CODES = Object.freeze({
  unavailable: "STORAGE_UNAVAILABLE",
  persistenceUnavailable: "STORAGE_PERSISTENCE_UNAVAILABLE",
  deviceKeyMissing: "STORAGE_DEVICE_KEY_MISSING",
  writeFailed: "STORAGE_WRITE_FAILED",
  invalidDeviceKey: "STORAGE_INVALID_DEVICE_KEY",
  invalidArgument: "STORAGE_INVALID_ARGUMENT",
  quotaUnavailable: "STORAGE_QUOTA_UNAVAILABLE",
  capacityExceeded: "STORAGE_CAPACITY_EXCEEDED",
} as const);

export type LocalStorageErrorCode =
  (typeof LOCAL_STORAGE_ERROR_CODES)[keyof typeof LOCAL_STORAGE_ERROR_CODES];

export type StorageUnavailableReason =
  | "indexeddb-missing"
  | "open-failed"
  | "read-failed"
  | "delete-failed";

export type PersistenceUnavailableReason = "persist-unsupported" | "persist-denied";

export type DeviceKeyMissingReason = "not-found";

export type WriteFailedReason = "indexeddb-write";

export type InvalidDeviceKeyReason =
  | "type"
  | "algorithm"
  | "length"
  | "usages"
  | "extractable";

export type InvalidArgumentReason = "type" | "negative-length";

export type QuotaUnavailableReason = "estimate-unsupported" | "estimate-failed";

export type CapacityExceededReason =
  | "quota-exceeded"
  | "backup-payload-exceeded"
  | "quota-and-payload-exceeded";

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

export type LocalStorageError =
  | StorageUnavailableError
  | PersistenceUnavailableError
  | DeviceKeyMissingError
  | StorageWriteFailedError
  | InvalidDeviceKeyError
  | InvalidArgumentError
  | QuotaUnavailableError
  | CapacityExceededError;

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

export function createStorageWriteFailedError(): StorageWriteFailedError {
  return freezeError(LOCAL_STORAGE_ERROR_CODES.writeFailed, "indexeddb-write");
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
