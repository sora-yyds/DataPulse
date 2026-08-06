export {
  LOCAL_STORAGE_ERROR_CODES,
  createDeviceKeyMissingError,
  createInvalidDeviceKeyError,
  createPersistenceUnavailableError,
  createStorageUnavailableError,
  createStorageWriteFailedError,
  type DeviceKeyMissingError,
  type InvalidDeviceKeyError,
  type LocalStorageError,
  type LocalStorageErrorCode,
  type PersistenceUnavailableError,
  type PersistenceUnavailableReason,
  type StorageUnavailableError,
  type StorageUnavailableReason,
  type StorageWriteFailedError,
  type WriteFailedReason,
} from "./errors.js";

export {
  DEVICE_KEY_DB_NAME,
  DEVICE_KEY_DB_VERSION,
  DEVICE_KEY_RECORD_ID,
  DEVICE_KEY_STORE_NAME,
} from "./device-key-store.js";

export {
  clearDeviceKey,
  ensureDeviceKey,
  generateDeviceKey,
  hasDeviceKey,
  isPersisted,
  openDeviceBound,
  requestPersistentStorage,
  requireStoredDeviceKey,
  sealDeviceBound,
  type DeviceKeyHandle,
  type OpenDeviceBoundInput,
  type SealDeviceBoundInput,
} from "./device-key.js";
