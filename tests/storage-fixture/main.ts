import {
  DEVICE_KEY_DB_NAME,
  DEVICE_KEY_RECORD_ID,
  DEVICE_KEY_STORE_NAME,
  LOCAL_STORAGE_ERROR_CODES,
  clearDeviceKey,
  ensureDeviceKey,
  generateDeviceKey,
  hasDeviceKey,
  isPersisted,
  openDeviceBound,
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
  ensureDeviceKey,
  generateDeviceKey,
  hasDeviceKey,
  isPersisted,
  openDeviceBound,
  requestPersistentStorage,
  requireStoredDeviceKey,
  sealDeviceBound,
  DEVICE_KEY_DB_NAME,
  DEVICE_KEY_RECORD_ID,
  DEVICE_KEY_STORE_NAME,
  LOCAL_STORAGE_ERROR_CODES,
});

window.__dpStorage = api;
const status = document.querySelector<HTMLParagraphElement>("#status");
if (status) {
  status.textContent = "ready";
}
