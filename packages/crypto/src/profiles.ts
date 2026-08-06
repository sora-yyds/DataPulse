import { createProfileUnknownError } from "./errors.js";

export type CryptoProfile = Readonly<{
  id: string;
  algorithm: "AES-256-GCM";
  keyBytes: 32;
  nonceBytes: 12;
  tagBytes: 16;
  binaryEncoding: "base64url-unpadded";
  canonicalJson: "jcs-rfc8785";
  textEncoding: "utf8-nfc";
}>;

/**
 * Frozen profile registry. Readers only accept registered profiles; unknown
 * or legacy ids are rejected and are never reinterpreted under a new name.
 */
export const CRYPTO_PROFILES = Object.freeze({
  aes256GcmV1: Object.freeze({
    id: "aes-256-gcm-v1",
    algorithm: "AES-256-GCM",
    keyBytes: 32,
    nonceBytes: 12,
    tagBytes: 16,
    binaryEncoding: "base64url-unpadded",
    canonicalJson: "jcs-rfc8785",
    textEncoding: "utf8-nfc",
  }),
} as const);

export function getCryptoProfile(id: string): CryptoProfile {
  if (id !== CRYPTO_PROFILES.aes256GcmV1.id) {
    throw createProfileUnknownError();
  }
  return CRYPTO_PROFILES.aes256GcmV1;
}

export function hasCryptoProfile(id: string): boolean {
  return id === CRYPTO_PROFILES.aes256GcmV1.id;
}

export function listCryptoProfiles(): readonly CryptoProfile[] {
  return Object.freeze(Object.values(CRYPTO_PROFILES));
}