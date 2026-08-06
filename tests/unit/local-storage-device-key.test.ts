import { describe, expect, it } from "vitest";
import {
  CRYPTO_ERROR_CODES,
  CRYPTO_PURPOSES,
  decryptAesGcm,
  encryptAesGcm,
} from "../../packages/crypto/dist/index.js";
import {
  LOCAL_STORAGE_ERROR_CODES,
  clearDeviceKey,
  createDeviceKeyMissingError,
  createInvalidDeviceKeyError,
  createPersistenceUnavailableError,
  createStorageUnavailableError,
  createStorageWriteFailedError,
  ensureDeviceKey,
  generateDeviceKey,
  hasDeviceKey,
  isPersisted,
  openDeviceBound,
  requestPersistentStorage,
  sealDeviceBound,
} from "../../packages/local-storage/dist/index.js";

const PLAINTEXT = new TextEncoder().encode("device-bound secret");

function toHex(input: Uint8Array): string {
  return Array.from(input, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("local-storage device key", () => {
  it("generates a non-exportable AES-256-GCM device key", async () => {
    const key = await generateDeviceKey();
    expect(key.extractable).toBe(false);
    const algorithm = key.algorithm as AesKeyAlgorithm;
    expect(algorithm.name).toBe("AES-GCM");
    expect(algorithm.length).toBe(256);
    expect([...key.usages].sort()).toEqual(["decrypt", "encrypt"]);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("seals and opens a device-bound object with the same handle", async () => {
    const key = await generateDeviceKey();
    const sealed = await sealDeviceBound({ key, plaintext: PLAINTEXT });
    expect(sealed.nonce.byteLength).toBe(12);
    expect(sealed.tag.byteLength).toBe(16);
    const opened = await openDeviceBound({ key, ...sealed });
    expect(toHex(opened)).toBe(toHex(PLAINTEXT));
  });

  it("uses a fresh nonce on every seal", async () => {
    const key = await generateDeviceKey();
    const first = await sealDeviceBound({ key, plaintext: PLAINTEXT });
    const second = await sealDeviceBound({ key, plaintext: PLAINTEXT });
    expect(toHex(first.nonce)).not.toBe(toHex(second.nonce));
  });

  it("rejects tampered ciphertext with the stable authentication error", async () => {
    const key = await generateDeviceKey();
    const sealed = await sealDeviceBound({ key, plaintext: PLAINTEXT });
    const tampered = new Uint8Array(sealed.ciphertext);
    tampered[0] = tampered[0] ^ 0xff;
    await expect(
      openDeviceBound({ key, nonce: sealed.nonce, ciphertext: tampered, tag: sealed.tag }),
    ).rejects.toMatchObject({
      code: CRYPTO_ERROR_CODES.authenticationFailed,
      details: { reason: "decrypt" },
    });
  });

  it("rejects a different device key handle", async () => {
    const key = await generateDeviceKey();
    const other = await generateDeviceKey();
    const sealed = await sealDeviceBound({ key, plaintext: PLAINTEXT });
    await expect(
      openDeviceBound({ key: other, nonce: sealed.nonce, ciphertext: sealed.ciphertext, tag: sealed.tag }),
    ).rejects.toMatchObject({ code: CRYPTO_ERROR_CODES.authenticationFailed });
  });

  it("isolates purposes: a published-package ciphertext never opens as device-bound", async () => {
    const key = await generateDeviceKey();
    const sealed = await encryptAesGcm({
      key,
      purpose: CRYPTO_PURPOSES.publishedPackage,
      plaintext: PLAINTEXT,
    });
    await expect(
      openDeviceBound({ key, nonce: sealed.nonce, ciphertext: sealed.ciphertext, tag: sealed.tag }),
    ).rejects.toMatchObject({ code: CRYPTO_ERROR_CODES.authenticationFailed });
  });

  it("binds seal fields into the authenticated data", async () => {
    const key = await generateDeviceKey();
    const fields = Object.freeze({ kind: "model-credential", provider: "bailian" });
    const sealed = await sealDeviceBound({ key, plaintext: PLAINTEXT, fields });
    await expect(
      openDeviceBound({ key, ...sealed, fields: Object.freeze({ kind: "model-credential", provider: "other" }) }),
    ).rejects.toMatchObject({ code: CRYPTO_ERROR_CODES.authenticationFailed });
    const opened = await openDeviceBound({ key, ...sealed, fields });
    expect(toHex(opened)).toBe(toHex(PLAINTEXT));
  });

  it("rejects an extractable key handle for device-bound sealing", async () => {
    const extractable = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    await expect(
      sealDeviceBound({ key: extractable, plaintext: PLAINTEXT }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidDeviceKey,
      details: { reason: "extractable" },
    });
  });

  it("rejects a non-key value with the stable invalid-handle error", async () => {
    await expect(
      sealDeviceBound({ key: {} as unknown as CryptoKey, plaintext: PLAINTEXT }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidDeviceKey,
      details: { reason: "algorithm" },
    });
  });

  it("reports persistence state without claiming durable storage in Node", async () => {
    expect(await isPersisted()).toBe(false);
    await expect(requestPersistentStorage()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.persistenceUnavailable,
      details: { reason: "persist-unsupported" },
    });
  });

  it("surfaces STORAGE_UNAVAILABLE when IndexedDB is missing", async () => {
    await expect(ensureDeviceKey()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.unavailable,
      details: { reason: "indexeddb-missing" },
    });
    await expect(hasDeviceKey()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.unavailable,
    });
    await expect(clearDeviceKey()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.unavailable,
    });
  });

  it("defines stable closed-enum error DTOs", () => {
    expect(Object.values(LOCAL_STORAGE_ERROR_CODES).sort()).toEqual([
      "STORAGE_DEVICE_KEY_MISSING",
      "STORAGE_INVALID_DEVICE_KEY",
      "STORAGE_PERSISTENCE_UNAVAILABLE",
      "STORAGE_UNAVAILABLE",
      "STORAGE_WRITE_FAILED",
    ]);
    expect(createDeviceKeyMissingError()).toMatchObject({
      code: "STORAGE_DEVICE_KEY_MISSING",
      details: { reason: "not-found" },
    });
    expect(createPersistenceUnavailableError("persist-denied")).toMatchObject({
      code: "STORAGE_PERSISTENCE_UNAVAILABLE",
      details: { reason: "persist-denied" },
    });
    expect(createStorageUnavailableError("open-failed")).toMatchObject({
      code: "STORAGE_UNAVAILABLE",
      details: { reason: "open-failed" },
    });
    expect(createStorageWriteFailedError()).toMatchObject({
      code: "STORAGE_WRITE_FAILED",
      details: { reason: "indexeddb-write" },
    });
    expect(createInvalidDeviceKeyError("usages")).toMatchObject({
      code: "STORAGE_INVALID_DEVICE_KEY",
      details: { reason: "usages" },
    });
  });
});
