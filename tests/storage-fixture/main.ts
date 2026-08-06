import {
  DEVICE_KEY_DB_NAME,
  DEVICE_KEY_RECORD_ID,
  DEVICE_KEY_STORE_NAME,
  LOCAL_STORAGE_ERROR_CODES,
  PROJECT_REPOSITORY_OBJECT_IDS,
  clearDeviceKey,
  createProjectRepository,
  ensureDeviceKey,
  generateDeviceKey,
  hasDeviceKey,
  isPersisted,
  openCommitIndexStore,
  openDeviceBound,
  openOpfsObjectStore,
  openProjectObjectStore,
  requestPersistentStorage,
  requireStoredDeviceKey,
  sealDeviceBound,
} from "@datapulse/local-storage";

declare global {
  interface Window {
    __dpStorage: Record<string, unknown>;
  }
}

const api = Object.freeze({
  clearDeviceKey,
  createProjectRepository,
  ensureDeviceKey,
  generateDeviceKey,
  hasDeviceKey,
  isPersisted,
  openCommitIndexStore,
  openDeviceBound,
  openOpfsObjectStore,
  openProjectObjectStore,
  requestPersistentStorage,
  requireStoredDeviceKey,
  sealDeviceBound,
  DEVICE_KEY_DB_NAME,
  DEVICE_KEY_RECORD_ID,
  DEVICE_KEY_STORE_NAME,
  LOCAL_STORAGE_ERROR_CODES,
  PROJECT_REPOSITORY_OBJECT_IDS,
});

window.__dpStorage = api;
const status = document.querySelector<HTMLParagraphElement>("#status");
if (status) {
  status.textContent = "ready";
}