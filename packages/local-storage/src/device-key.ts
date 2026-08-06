import {
  CRYPTO_PURPOSES,
  decryptAesGcm,
  encryptAesGcm,
  type JcsValue,
  type SealedCiphertext,
} from "@datapulse/crypto";
import {
  deleteStoredDeviceKey,
  loadStoredDeviceKey,
  storeDeviceKey,
} from "./device-key-store.js";
import {
  createDeviceKeyMissingError,
  createInvalidDeviceKeyError,
  createPersistenceUnavailableError,
  createStorageUnavailableError,
  type PersistenceUnavailableReason,
} from "./errors.js";

export type DeviceKeyHandle = Readonly<{
  /** Opaque non-exportable AES-256-GCM key handle. */
  key: CryptoKey;
  /**
   * True only when the browser reports durable persistence
   * (navigator.storage.persisted()); false means the caller must not claim
   * that the device binding survives site-data eviction.
   */
  persisted: boolean;
}>;

export type SealDeviceBoundInput = Readonly<{
  key: CryptoKey;
  plaintext: Uint8Array;
  /** Optional protocol fields bound into the JCS authenticated data. */
  fields?: Readonly<Record<string, JcsValue>>;
}>;

export type OpenDeviceBoundInput = Readonly<{
  key: CryptoKey;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
  /** Must be byte-identical to the fields used at seal time. */
  fields?: Readonly<Record<string, JcsValue>>;
}>;

/**
 * Loads the device-bound key handle, generating and persisting it on first
 * use. The handle is non-exportable (extractable=false) and only ever
 * persisted through IndexedDB structured clone. Throws STORAGE_UNAVAILABLE
 * when IndexedDB is unavailable.
 */
export async function ensureDeviceKey(): Promise<DeviceKeyHandle> {
  const existing = await loadStoredDeviceKey();
  if (existing) {
    return { key: existing, persisted: await isPersisted() };
  }
  const key = await generateDeviceKey();
  await storeDeviceKey(key);
  return { key, persisted: await isPersisted() };
}

/** True when a device-bound key handle is already stored. */
export async function hasDeviceKey(): Promise<boolean> {
  return (await loadStoredDeviceKey()) !== undefined;
}

/**
 * Deletes the stored device-bound key handle. Sealed objects become
 * permanently unreadable afterwards. Returns true when a handle existed.
 */
export async function clearDeviceKey(): Promise<boolean> {
  return deleteStoredDeviceKey();
}

/**
 * Requests durable persistence for the current origin
 * (navigator.storage.persist()). Throws STORAGE_PERSISTENCE_UNAVAILABLE when
 * the API is unsupported or the browser refuses the request; the caller must
 * not claim durable persistence otherwise.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.persist !== "function") {
    throw persistenceUnavailable("persist-unsupported");
  }
  try {
    const granted = await storage.persist();
    if (!granted) {
      throw persistenceUnavailable("persist-denied");
    }
    return true;
  } catch (error) {
    if (isPersistenceUnavailable(error)) {
      throw error;
    }
    throw persistenceUnavailable("persist-denied");
  }
}

/** Reports whether the browser currently grants durable persistence. */
export async function isPersisted(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.persisted !== "function") {
    return false;
  }
  try {
    return await storage.persisted();
  } catch {
    return false;
  }
}

/**
 * Seals a device-bound object with the device key handle under the
 * datapulse/device-bound-seal purpose. Only a non-exportable AES-256-GCM
 * handle with encrypt/decrypt usages is accepted.
 */
export async function sealDeviceBound(input: SealDeviceBoundInput): Promise<SealedCiphertext> {
  assertDeviceKeyHandle(input.key);
  return encryptAesGcm({
    key: input.key,
    purpose: CRYPTO_PURPOSES.deviceBoundSeal,
    plaintext: input.plaintext,
    ...(input.fields === undefined ? {} : { fields: input.fields }),
  });
}

/**
 * Opens a device-bound object. Any integrity failure or purpose mismatch
 * throws; clearing site data makes the key handle unavailable and surfaces
 * STORAGE_DEVICE_KEY_MISSING at the load boundary.
 */
export async function openDeviceBound(input: OpenDeviceBoundInput): Promise<Uint8Array> {
  assertDeviceKeyHandle(input.key);
  return decryptAesGcm({
    key: input.key,
    purpose: CRYPTO_PURPOSES.deviceBoundSeal,
    nonce: input.nonce,
    ciphertext: input.ciphertext,
    tag: input.tag,
    ...(input.fields === undefined ? {} : { fields: input.fields }),
  });
}

/** Loads the stored handle or throws STORAGE_DEVICE_KEY_MISSING. */
export async function requireStoredDeviceKey(): Promise<CryptoKey> {
  const key = await loadStoredDeviceKey();
  if (!key) {
    throw createDeviceKeyMissingError();
  }
  return key;
}

export async function generateDeviceKey(): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw createStorageUnavailableError("indexeddb-missing");
  }
  const key = await subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return key;
}

function persistenceUnavailable(reason: PersistenceUnavailableReason) {
  return createPersistenceUnavailableError(reason);
}

function isPersistenceUnavailable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "STORAGE_PERSISTENCE_UNAVAILABLE"
  );
}

function assertDeviceKeyHandle(key: CryptoKey): void {
  if (typeof key !== "object" || key === null) {
    throw createInvalidDeviceKeyError("type");
  }
  const algorithm = key.algorithm as AesKeyAlgorithm | undefined;
  if (!algorithm || algorithm.name !== "AES-GCM") {
    throw createInvalidDeviceKeyError("algorithm");
  }
  if (algorithm.length !== 256) {
    throw createInvalidDeviceKeyError("length");
  }
  if (!key.usages.includes("encrypt") || !key.usages.includes("decrypt")) {
    throw createInvalidDeviceKeyError("usages");
  }
  if (key.extractable !== false) {
    throw createInvalidDeviceKeyError("extractable");
  }
}
