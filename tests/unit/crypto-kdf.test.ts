import { describe, expect, it } from "vitest";

import {
  ARGON2_KDF_PROFILES,
  CRYPTO_ERROR_CODES,
  deriveArgon2KdfKey,
  getArgon2KdfProfile,
  hasArgon2KdfProfile,
  listArgon2KdfProfiles,
} from "../../packages/crypto/dist/index.js";
import {
  ARGON2_KDF_GOLDEN_VECTORS,
  ARGON2_KDF_NFD_PASSPHRASE,
  ARGON2_KDF_PROFILE_ID,
} from "./kdf-vectors.js";

function fromHex(hex: string): Uint8Array {
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function toHex(input: Uint8Array): string {
  return Array.from(input, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const DERIVATION_TIMEOUT_MS = 30_000;

describe("argon2id KDF profile registry", () => {
  it("freezes the single whitelisted profile with fixed parameters", () => {
    expect(Object.isFrozen(ARGON2_KDF_PROFILES)).toBe(true);
    expect(Object.isFrozen(ARGON2_KDF_PROFILES.a2idV1_64mT3P1)).toBe(true);
    expect(ARGON2_KDF_PROFILES.a2idV1_64mT3P1).toEqual({
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
    });
  });

  it("exposes exactly one profile and rejects any other id", () => {
    expect(listArgon2KdfProfiles()).toHaveLength(1);
    expect(hasArgon2KdfProfile(ARGON2_KDF_PROFILE_ID)).toBe(true);
    expect(hasArgon2KdfProfile("a2id-v1-16m-t3-p1")).toBe(false);
    expect(hasArgon2KdfProfile("a2id-v1-64m-t1-p1")).toBe(false);
    expect(() => getArgon2KdfProfile("a2id-v1-64m-t3-p2")).toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.profileUnknown,
        details: { reason: "unregistered" },
      }),
    );
  });
});

describe("argon2id KDF derivation", () => {
  it(
    "matches the frozen golden vector for an ASCII passphrase",
    { timeout: DERIVATION_TIMEOUT_MS },
    async () => {
      const vector = ARGON2_KDF_GOLDEN_VECTORS[0]!;
      const key = await deriveArgon2KdfKey({
        profileId: ARGON2_KDF_PROFILE_ID,
        password: vector.password,
        salt: fromHex(vector.salt),
      });
      expect(toHex(key)).toBe(vector.key);
      expect(key.byteLength).toBe(32);
    },
  );

  it(
    "matches the frozen golden vector for a Unicode NFC passphrase",
    { timeout: DERIVATION_TIMEOUT_MS },
    async () => {
      const vector = ARGON2_KDF_GOLDEN_VECTORS[1]!;
      const key = await deriveArgon2KdfKey({
        profileId: ARGON2_KDF_PROFILE_ID,
        password: vector.password,
        salt: fromHex(vector.salt),
      });
      expect(toHex(key)).toBe(vector.key);
    },
  );

  it(
    "normalizes NFD input to NFC before deriving",
    { timeout: DERIVATION_TIMEOUT_MS },
    async () => {
      const vector = ARGON2_KDF_GOLDEN_VECTORS[1]!;
      const key = await deriveArgon2KdfKey({
        profileId: ARGON2_KDF_PROFILE_ID,
        password: ARGON2_KDF_NFD_PASSPHRASE,
        salt: fromHex(vector.salt),
      });
      expect(toHex(key)).toBe(vector.key);
    },
  );

  it(
    "is deterministic for identical inputs",
    { timeout: DERIVATION_TIMEOUT_MS },
    async () => {
      const vector = ARGON2_KDF_GOLDEN_VECTORS[0]!;
      const input = {
        profileId: ARGON2_KDF_PROFILE_ID,
        password: vector.password,
        salt: fromHex(vector.salt),
      };
      const first = await deriveArgon2KdfKey(input);
      const second = await deriveArgon2KdfKey(input);
      expect(toHex(first)).toBe(toHex(second));
    },
  );

  it(
    "changes the output when the salt changes",
    { timeout: DERIVATION_TIMEOUT_MS },
    async () => {
      const vector = ARGON2_KDF_GOLDEN_VECTORS[0]!;
      const otherSalt = fromHex(vector.salt);
      otherSalt[0] = 0x00;
      const key = await deriveArgon2KdfKey({
        profileId: ARGON2_KDF_PROFILE_ID,
        password: vector.password,
        salt: otherSalt,
      });
      expect(toHex(key)).not.toBe(vector.key);
    },
  );
});

describe("argon2id KDF rejection boundaries", () => {
  it("rejects a salt of the wrong length before allocating KDF memory", async () => {
    const vector = ARGON2_KDF_GOLDEN_VECTORS[0]!;
    for (const salt of [new Uint8Array(15), new Uint8Array(17)]) {
      await expect(
        deriveArgon2KdfKey({
          profileId: ARGON2_KDF_PROFILE_ID,
          password: vector.password,
          salt,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: CRYPTO_ERROR_CODES.invalidArgument,
          details: { reason: "salt-length" },
        }),
      );
    }
  });

  it("rejects a password longer than 1,024 UTF-8 bytes", async () => {
    const vector = ARGON2_KDF_GOLDEN_VECTORS[0]!;
    await expect(
      deriveArgon2KdfKey({
        profileId: ARGON2_KDF_PROFILE_ID,
        password: "a".repeat(1025),
        salt: fromHex(vector.salt),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.invalidArgument,
        details: { reason: "password-length" },
      }),
    );
  });

  it("rejects non-string passwords and non-Uint8Array salts", async () => {
    const vector = ARGON2_KDF_GOLDEN_VECTORS[0]!;
    await expect(
      deriveArgon2KdfKey({
        profileId: ARGON2_KDF_PROFILE_ID,
        password: 123 as unknown as string,
        salt: fromHex(vector.salt),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.invalidArgument,
        details: { reason: "type" },
      }),
    );
    await expect(
      deriveArgon2KdfKey({
        profileId: ARGON2_KDF_PROFILE_ID,
        password: vector.password,
        salt: [1, 2, 3] as unknown as Uint8Array,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.invalidArgument,
        details: { reason: "type" },
      }),
    );
  });

  it("rejects unknown profile ids without running a derivation", async () => {
    const vector = ARGON2_KDF_GOLDEN_VECTORS[0]!;
    await expect(
      deriveArgon2KdfKey({
        profileId: "a2id-v1-16m-t3-p1",
        password: vector.password,
        salt: fromHex(vector.salt),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.profileUnknown,
        details: { reason: "unregistered" },
      }),
    );
  });
});
