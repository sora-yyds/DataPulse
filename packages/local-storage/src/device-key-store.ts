import {
  createStorageUnavailableError,
  createStorageWriteFailedError,
} from "./errors.js";

export const DEVICE_KEY_DB_NAME = "datapulse-device-key";
export const DEVICE_KEY_STORE_NAME = "device-keys";
export const DEVICE_KEY_RECORD_ID = "device-key-v1";
export const DEVICE_KEY_DB_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | undefined;

/**
 * IndexedDB seam for the non-exportable device key handle. Only the opaque
 * CryptoKey handle is persisted via structured clone; raw key bytes are never
 * written. Throws STORAGE_UNAVAILABLE when IndexedDB is missing or the
 * database cannot be opened.
 */
export async function loadStoredDeviceKey(): Promise<CryptoKey | undefined> {
  const db = await openDeviceDatabase();
  const record = await runRequest<CryptoKey | undefined>(
    "readonly",
    (store) => store.get(DEVICE_KEY_RECORD_ID),
    db,
  );
  return record;
}

export async function storeDeviceKey(key: CryptoKey): Promise<void> {
  const db = await openDeviceDatabase();
  try {
    await runRequest<IDBValidKey>(
      "readwrite",
      (store) => store.put(key, DEVICE_KEY_RECORD_ID),
      db,
    );
  } catch (error) {
    if (isLocalStorageError(error)) {
      throw error;
    }
    throw createStorageWriteFailedError();
  }
}

export async function deleteStoredDeviceKey(): Promise<boolean> {
  const db = await openDeviceDatabase();
  const existing = await loadStoredDeviceKeyFrom(db);
  if (!existing) {
    return false;
  }
  await runRequest<undefined>(
    "readwrite",
    (store) => store.delete(DEVICE_KEY_RECORD_ID),
    db,
  );
  return true;
}

function openDeviceDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }
  const idb = globalThis.indexedDB;
  if (!idb) {
    throw createStorageUnavailableError("indexeddb-missing");
  }
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(DEVICE_KEY_DB_NAME, DEVICE_KEY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_KEY_STORE_NAME)) {
        db.createObjectStore(DEVICE_KEY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = undefined;
      reject(createStorageUnavailableError("open-failed"));
    };
  });
  return databasePromise;
}

async function loadStoredDeviceKeyFrom(db: IDBDatabase): Promise<CryptoKey | undefined> {
  return runRequest<CryptoKey | undefined>(
    "readonly",
    (store) => store.get(DEVICE_KEY_RECORD_ID),
    db,
  );
}

function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  db: IDBDatabase,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE_NAME, mode);
    const request = operation(transaction.objectStore(DEVICE_KEY_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(createStorageUnavailableError("read-failed"));
  });
}

function isLocalStorageError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    String((error as { code: unknown }).code).startsWith("STORAGE_")
  );
}
