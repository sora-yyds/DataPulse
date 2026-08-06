import { createInvalidArgumentError } from "./errors.js";

/**
 * Registered AAD purposes from the end-to-end encryption protocol
 * (ARCHITECTURE.md section 9). Each purpose is always embedded in the JCS
 * authenticated data so ciphertext produced for one purpose can never
 * authenticate under another.
 */
export const CRYPTO_PURPOSES = Object.freeze({
  publishedPackage: "datapulse/published-package",
  projectKeyWrap: "datapulse/project-key-wrap",
  projectPackageChunk: "datapulse/project-package-chunk",
} as const);

export type CryptoPurpose =
  (typeof CRYPTO_PURPOSES)[keyof typeof CRYPTO_PURPOSES];

const PURPOSE_SET = new Set<string>(Object.values(CRYPTO_PURPOSES));

export function isCryptoPurpose(value: string): value is CryptoPurpose {
  return PURPOSE_SET.has(value);
}

export function assertCryptoPurpose(value: string): CryptoPurpose {
  if (!isCryptoPurpose(value)) {
    throw createInvalidArgumentError("purpose");
  }
  return value;
}