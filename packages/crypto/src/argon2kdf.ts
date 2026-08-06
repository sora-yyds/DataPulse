import { argon2id } from "hash-wasm";

import {
  createArgon2DerivationFailedError,
  createInvalidArgumentError,
  createProfileUnknownError,
} from "./errors.js";

/**
 * Frozen Argon2id KDF profile registry (ARCHITECTURE.md section 9 and
 * ADR-0047). Readers only accept registered profile ids; a link or envelope
 * can never carry arbitrary KDF parameters.
 */
export type Argon2KdfProfile = Readonly<{
  id: string;
  algorithm: "argon2id";
  /** Argon2 version 0x13 (RFC 9106 / reference v1.3). */
  version: 0x13;
  memoryKiB: 65536;
  iterations: 3;
  parallelism: 1;
  saltBytes: 16;
  keyBytes: 32;
  binaryEncoding: "base64url-unpadded";
  textEncoding: "utf8-nfc";
}>;

export const ARGON2_KDF_PROFILES = Object.freeze({
  a2idV1_64mT3P1: Object.freeze({
    id: "a2id-v1-64m-t3-p1",
    algorithm: "argon2id",
    version: 0x13,
    memoryKiB: 65536,
    iterations: 3,
    parallelism: 1,
    saltBytes: 16,
    keyBytes: 32,
    binaryEncoding: "base64url-unpadded",
    textEncoding: "utf8-nfc",
  }),
} as const);

export type Argon2KdfProfileId =
  (typeof ARGON2_KDF_PROFILES)[keyof typeof ARGON2_KDF_PROFILES]["id"];

export type DeriveArgon2KdfKeyInput = Readonly<{
  /** Frozen profile id; arbitrary KDF parameters are never accepted. */
  profileId: string;
  /** Password; normalized to NFC then UTF-8 encoded, max 1,024 bytes. */
  password: string;
  /** Exactly `profile.saltBytes` random bytes supplied by the caller. */
  salt: Uint8Array;
}>;

const MAX_PASSWORD_UTF8_BYTES = 1024;

export function getArgon2KdfProfile(id: string): Argon2KdfProfile {
  if (id !== ARGON2_KDF_PROFILES.a2idV1_64mT3P1.id) {
    throw createProfileUnknownError();
  }
  return ARGON2_KDF_PROFILES.a2idV1_64mT3P1;
}

export function hasArgon2KdfProfile(id: string): boolean {
  return id === ARGON2_KDF_PROFILES.a2idV1_64mT3P1.id;
}

export function listArgon2KdfProfiles(): readonly Argon2KdfProfile[] {
  return Object.freeze(Object.values(ARGON2_KDF_PROFILES));
}

/**
 * Derives a 32-byte key with the frozen `a2id-v1-64m-t3-p1` profile. The
 * password is normalized to NFC before the 1,024-byte UTF-8 limit is checked
 * so the same NFC input always produces the same key on every device.
 */
export async function deriveArgon2KdfKey(
  input: DeriveArgon2KdfKeyInput,
): Promise<Uint8Array> {
  const profile = getArgon2KdfProfile(input.profileId);
  if (typeof input.password !== "string") {
    throw createInvalidArgumentError("type");
  }
  const passwordBytes = new TextEncoder().encode(input.password.normalize("NFC"));
  if (passwordBytes.byteLength > MAX_PASSWORD_UTF8_BYTES) {
    throw createInvalidArgumentError("password-length");
  }
  if (!(input.salt instanceof Uint8Array)) {
    throw createInvalidArgumentError("type");
  }
  if (input.salt.byteLength !== profile.saltBytes) {
    throw createInvalidArgumentError("salt-length");
  }
  try {
    return await argon2id({
      password: passwordBytes,
      salt: input.salt,
      iterations: profile.iterations,
      parallelism: profile.parallelism,
      memorySize: profile.memoryKiB,
      hashLength: profile.keyBytes,
      outputType: "binary",
    });
  } catch {
    throw createArgon2DerivationFailedError();
  }
}
