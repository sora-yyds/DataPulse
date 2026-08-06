import {
  createAuthenticationFailedError,
  createInvalidArgumentError,
  createKeyInvalidError,
  createRandomSourceUnavailableError,
} from "./errors.js";
import { jcs, type JcsValue } from "./jcs.js";
import { CRYPTO_PROFILES } from "./profiles.js";
import { assertCryptoPurpose, type CryptoPurpose } from "./purposes.js";
import { randomNonce } from "./random.js";

export type AesGcmKey = CryptoKey | Uint8Array;

export type SealAesGcmInput = Readonly<{
  key: AesGcmKey;
  purpose: CryptoPurpose;
  plaintext: Uint8Array;
  /** Protocol fields bound into the JCS authenticated data. */
  fields?: Readonly<Record<string, JcsValue>>;
  /** 12-byte nonce; a fresh random nonce is used when omitted. */
  nonce?: Uint8Array;
}>;

export type OpenAesGcmInput = Readonly<{
  key: AesGcmKey;
  purpose: CryptoPurpose;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
  /** Must be byte-identical to the fields used at seal time. */
  fields?: Readonly<Record<string, JcsValue>>;
}>;

export type SealedCiphertext = Readonly<{
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}>;

/**
 * Purpose-isolated JCS authenticated data: `{v: 1, purpose, ...fields}`.
 * The protocol version and purpose are always injected first so a caller can
 * never bind a ciphertext to the wrong protocol context.
 */
export function buildAuthData(
  purpose: CryptoPurpose,
  fields: Readonly<Record<string, JcsValue>> = {},
): Uint8Array {
  assertCryptoPurpose(purpose);
  return jcs({ v: 1, purpose, ...fields });
}

/** AES-256-GCM seal with 12-byte nonce, 128-bit tag, and purpose-bound AAD. */
export async function encryptAesGcm(input: SealAesGcmInput): Promise<SealedCiphertext> {
  const purpose = assertCryptoPurpose(input.purpose);
  const nonce = input.nonce ?? randomNonce();
  validateNonce(nonce);
  if (!(input.plaintext instanceof Uint8Array)) {
    throw createInvalidArgumentError("type");
  }
  const subtle = requireSubtle();
  const key = await importAesGcmKey(input.key);
  const additionalData = buildAuthData(purpose, input.fields ?? {});
  const encrypted = new Uint8Array(
    await subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toWebCryptoBytes(nonce),
        additionalData: toWebCryptoBytes(additionalData),
        tagLength: 128,
      },
      key,
      toWebCryptoBytes(input.plaintext),
    ),
  );
  if (encrypted.length < CRYPTO_PROFILES.aes256GcmV1.tagBytes) {
    throw createAuthenticationFailedError();
  }
  const tagOffset = encrypted.length - CRYPTO_PROFILES.aes256GcmV1.tagBytes;
  return Object.freeze({
    nonce: new Uint8Array(nonce),
    ciphertext: new Uint8Array(encrypted.subarray(0, tagOffset)),
    tag: new Uint8Array(encrypted.subarray(tagOffset)),
  });
}

/** AES-256-GCM open with purpose-bound AAD; any integrity failure throws. */
export async function decryptAesGcm(input: OpenAesGcmInput): Promise<Uint8Array> {
  const purpose = assertCryptoPurpose(input.purpose);
  validateNonce(input.nonce);
  if (!(input.ciphertext instanceof Uint8Array)) {
    throw createInvalidArgumentError("type");
  }
  if (!(input.tag instanceof Uint8Array)) {
    throw createInvalidArgumentError("type");
  }
  if (input.tag.byteLength !== CRYPTO_PROFILES.aes256GcmV1.tagBytes) {
    throw createInvalidArgumentError("tag-length");
  }
  const subtle = requireSubtle();
  const key = await importAesGcmKey(input.key);
  const additionalData = buildAuthData(purpose, input.fields ?? {});
  const combined = new Uint8Array(input.ciphertext.byteLength + input.tag.byteLength);
  combined.set(input.ciphertext, 0);
  combined.set(input.tag, input.ciphertext.byteLength);
  try {
    const plaintext = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toWebCryptoBytes(input.nonce),
        additionalData: toWebCryptoBytes(additionalData),
        tagLength: 128,
      },
      key,
      combined,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw createAuthenticationFailedError();
  }
}

function validateNonce(nonce: Uint8Array): void {
  if (!(nonce instanceof Uint8Array)) {
    throw createInvalidArgumentError("type");
  }
  if (nonce.byteLength !== CRYPTO_PROFILES.aes256GcmV1.nonceBytes) {
    throw createInvalidArgumentError("nonce-length");
  }
}

function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw createRandomSourceUnavailableError();
  }
  return subtle;
}

function isCryptoKeyLike(value: unknown): value is CryptoKey {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as CryptoKey;
  return (
    typeof candidate.algorithm === "object" &&
    candidate.algorithm !== null &&
    Array.isArray(candidate.usages)
  );
}

async function importAesGcmKey(key: AesGcmKey): Promise<CryptoKey> {
  if (key instanceof Uint8Array) {
    if (key.byteLength !== CRYPTO_PROFILES.aes256GcmV1.keyBytes) {
      throw createInvalidArgumentError("key-length");
    }
    const subtle = requireSubtle();
    return subtle.importKey(
      "raw",
      toWebCryptoBytes(key),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  }
  if (isCryptoKeyLike(key)) {
    const algorithm = key.algorithm as AesKeyAlgorithm;
    if (algorithm.name !== "AES-GCM") {
      throw createKeyInvalidError("algorithm");
    }
    if (algorithm.length !== CRYPTO_PROFILES.aes256GcmV1.keyBytes * 8) {
      throw createKeyInvalidError("length");
    }
    if (
      !key.usages.includes("encrypt") ||
      !key.usages.includes("decrypt")
    ) {
      throw createKeyInvalidError("usages");
    }
    return key;
  }
  throw createKeyInvalidError("type");
}
/**
 * Web Crypto requires ArrayBuffer-backed views; copy any typed array into a
 * fresh ArrayBuffer so SharedArrayBuffer-backed views are also accepted.
 */
function toWebCryptoBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(input);
}