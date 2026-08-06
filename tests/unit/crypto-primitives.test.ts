import { describe, expect, it } from "vitest";

import {
  CRYPTO_ERROR_CODES,
  CRYPTO_PROFILES,
  CRYPTO_PURPOSES,
  base64urlDecode,
  base64urlEncode,
  buildAuthData,
  decryptAesGcm,
  encryptAesGcm,
  getCryptoProfile,
  hasCryptoProfile,
  isCryptoPurpose,
  jcsString,
  listCryptoProfiles,
  randomBytes,
  randomNonce,
} from "../../packages/crypto/dist/index.js";
import {
  AES_256_GCM_NIST_EMPTY_TAG,
  AES_GCM_PURPOSE_VECTORS,
  BASE64URL_INVALID_INPUTS,
  BASE64URL_RFC4648_VECTORS,
  JCS_REJECTED_VALUES,
  JCS_RFC8785_EXAMPLE,
  JCS_SORTING_VECTORS,
} from "./crypto-vectors.js";

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

function utf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

describe("base64url", () => {
  it("matches the RFC 4648 section 5 unpadded vectors", () => {
    for (const vector of BASE64URL_RFC4648_VECTORS) {
      expect(base64urlEncode(utf8(vector.plaintext))).toBe(vector.encoded);
      expect(new TextDecoder().decode(base64urlDecode(vector.encoded))).toBe(
        vector.plaintext,
      );
    }
  });

  it("round-trips a deterministic byte pattern without padding", () => {
    const bytes = new Uint8Array(256).map((_, index) => index);
    const encoded = base64urlEncode(bytes);
    expect(encoded).not.toContain("=");
    expect(toHex(base64urlDecode(encoded))).toBe(toHex(bytes));
  });

  it.each(BASE64URL_INVALID_INPUTS)(
    "rejects $reason input $input",
    ({ input, reason }) => {
      expect(() => base64urlDecode(input)).toThrowError(
        expect.objectContaining({
          code: CRYPTO_ERROR_CODES.base64urlInvalid,
          details: { reason },
        }),
      );
    },
  );

  it("rejects non-string input", () => {
    expect(() => base64urlDecode(123 as unknown as string)).toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.base64urlInvalid,
        details: { reason: "type" },
      }),
    );
    expect(() => base64urlEncode("text" as unknown as Uint8Array)).toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.base64urlInvalid,
        details: { reason: "type" },
      }),
    );
  });
});

describe("jcs", () => {
  it("matches the RFC 8785 section 3.2 example", () => {
    expect(jcsString(JCS_RFC8785_EXAMPLE.input)).toBe(JCS_RFC8785_EXAMPLE.canonical);
  });

  it.each(JCS_SORTING_VECTORS)("sorts keys for $label", ({ input, canonical }) => {
    expect(jcsString(input as Record<string, unknown>)).toBe(canonical);
  });

  it("serializes negative zero as 0", () => {
    expect(jcsString({ value: -0 })).toBe('{"value":0}');
    expect(jcsString([-0])).toBe("[0]");
  });

  it.each(JCS_REJECTED_VALUES)("rejects $label values", ({ input }) => {
    expect(() => jcsString(input)).toThrowError(
      expect.objectContaining({ code: CRYPTO_ERROR_CODES.jcsInvalid }),
    );
  });

  it("rejects circular structures", () => {
    const circular: Record<string, unknown> = { name: "self" };
    circular.self = circular;
    expect(() => jcsString(circular)).toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.jcsInvalid,
        details: { reason: "circular" },
      }),
    );
    const circularArray: unknown[] = [1];
    circularArray.push(circularArray);
    expect(() => jcsString(circularArray)).toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.jcsInvalid,
        details: { reason: "circular" },
      }),
    );
  });

  it("is canonical and order-independent", () => {
    const left = jcsString({ b: [1, 2], a: { y: true, x: null } });
    const right = jcsString({ a: { x: null, y: true }, b: [1, 2] });
    expect(left).toBe(right);
    expect(left).toBe('{"a":{"x":null,"y":true},"b":[1,2]}');
  });
});

describe("random", () => {
  it("returns a fresh 12-byte nonce", () => {
    const first = randomNonce();
    const second = randomNonce();
    expect(first.byteLength).toBe(12);
    expect(toHex(first)).not.toBe(toHex(second));
  });

  it("returns the requested byte length", () => {
    expect(randomBytes(0).byteLength).toBe(0);
    expect(randomBytes(65_536).byteLength).toBe(65_536);
    expect(randomBytes(65_537).byteLength).toBe(65_537);
  });

  it("rejects invalid lengths", () => {
    expect(() => randomBytes(-1)).toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.invalidArgument,
        details: { reason: "length" },
      }),
    );
    expect(() => randomBytes(1.5)).toThrowError(
      expect.objectContaining({ code: CRYPTO_ERROR_CODES.invalidArgument }),
    );
  });
});

describe("profiles and purposes", () => {
  it("registers aes-256-gcm-v1 with frozen protocol parameters", () => {
    const profile = getCryptoProfile("aes-256-gcm-v1");
    expect(profile).toEqual({
      id: "aes-256-gcm-v1",
      algorithm: "AES-256-GCM",
      keyBytes: 32,
      nonceBytes: 12,
      tagBytes: 16,
      binaryEncoding: "base64url-unpadded",
      canonicalJson: "jcs-rfc8785",
      textEncoding: "utf8-nfc",
    });
    expect(hasCryptoProfile("aes-256-gcm-v1")).toBe(true);
    expect(hasCryptoProfile("aes-192-gcm-v1")).toBe(false);
    expect(listCryptoProfiles()).toEqual([CRYPTO_PROFILES.aes256GcmV1]);
  });

  it("rejects unknown profiles", () => {
    expect(() => getCryptoProfile("aes-192-gcm-v1")).toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.profileUnknown,
        details: { reason: "unregistered" },
      }),
    );
  });

  it("registers the protocol AAD purposes", () => {
    expect(Object.values(CRYPTO_PURPOSES)).toEqual([
      "datapulse/published-package",
      "datapulse/project-key-wrap",
      "datapulse/project-package-chunk",
      "datapulse/share-key-wrap",
    ]);
    for (const purpose of Object.values(CRYPTO_PURPOSES)) {
      expect(isCryptoPurpose(purpose)).toBe(true);
    }
    expect(isCryptoPurpose("datapulse/unknown")).toBe(false);
  });
});

describe("purpose-isolated AES-GCM", () => {
  it("matches the frozen golden vectors", async () => {
    for (const vector of AES_GCM_PURPOSE_VECTORS) {
      const key = fromHex(vector.key);
      const nonce = fromHex(vector.nonce);
      const plaintext = fromHex(vector.plaintext);
      const sealed = await encryptAesGcm({ key, purpose: vector.purpose, plaintext, nonce });
      expect(toHex(sealed.ciphertext)).toBe(vector.ciphertext);
      expect(toHex(sealed.tag)).toBe(vector.tag);
      const withFields = await encryptAesGcm({
        key,
        purpose: vector.purpose,
        plaintext,
        nonce,
        fields: { n: 1, tag: "x" },
      });
      expect(toHex(withFields.ciphertext)).toBe(vector.fieldsCiphertext);
      expect(toHex(withFields.tag)).toBe(vector.fieldsTag);
    }
  });

  it("opens golden vectors back to the plaintext", async () => {
    for (const vector of AES_GCM_PURPOSE_VECTORS) {
      const opened = await decryptAesGcm({
        key: fromHex(vector.key),
        purpose: vector.purpose,
        nonce: fromHex(vector.nonce),
        ciphertext: fromHex(vector.ciphertext),
        tag: fromHex(vector.tag),
      });
      expect(toHex(opened)).toBe(vector.plaintext);
    }
  });

  it("round-trips with a fresh random key and nonce", async () => {
    const key = randomBytes(32);
    const nonce = randomNonce();
    const plaintext = utf8("creator/viewer shared metric runtime payload");
    const sealed = await encryptAesGcm({
      key,
      purpose: CRYPTO_PURPOSES.publishedPackage,
      plaintext,
      nonce,
      fields: { publicationId: "abc", expiresAt: "2026-08-06T00:00:00Z" },
    });
    const opened = await decryptAesGcm({
      key,
      purpose: CRYPTO_PURPOSES.publishedPackage,
      nonce: sealed.nonce,
      ciphertext: sealed.ciphertext,
      tag: sealed.tag,
      fields: { publicationId: "abc", expiresAt: "2026-08-06T00:00:00Z" },
    });
    expect(new TextDecoder().decode(opened)).toBe(
      "creator/viewer shared metric runtime payload",
    );
  });

  it("isolates purposes: a ciphertext never opens under another purpose", async () => {
    const key = fromHex(AES_GCM_PURPOSE_VECTORS[0].key);
    const vector = AES_GCM_PURPOSE_VECTORS[0];
    await expect(
      decryptAesGcm({
        key,
        purpose: CRYPTO_PURPOSES.projectKeyWrap,
        nonce: fromHex(vector.nonce),
        ciphertext: fromHex(vector.ciphertext),
        tag: fromHex(vector.tag),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.authenticationFailed,
        details: { reason: "decrypt" },
      }),
    );
  });

  it("binds AAD fields into authentication", async () => {
    const key = fromHex(AES_GCM_PURPOSE_VECTORS[0].key);
    const vector = AES_GCM_PURPOSE_VECTORS[0];
    await expect(
      decryptAesGcm({
        key,
        purpose: vector.purpose,
        nonce: fromHex(vector.nonce),
        ciphertext: fromHex(vector.fieldsCiphertext),
        tag: fromHex(vector.fieldsTag),
        fields: { n: 2, tag: "x" },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: CRYPTO_ERROR_CODES.authenticationFailed }),
    );
  });

  it("rejects tampered ciphertext and tag", async () => {
    const vector = AES_GCM_PURPOSE_VECTORS[0];
    const key = fromHex(vector.key);
    const tamperedCiphertext = fromHex(vector.ciphertext);
    tamperedCiphertext[0] = tamperedCiphertext[0] === 0 ? 1 : 0;
    await expect(
      decryptAesGcm({
        key,
        purpose: vector.purpose,
        nonce: fromHex(vector.nonce),
        ciphertext: tamperedCiphertext,
        tag: fromHex(vector.tag),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: CRYPTO_ERROR_CODES.authenticationFailed }),
    );
    const tamperedTag = fromHex(vector.tag);
    tamperedTag[0] = tamperedTag[0] === 0 ? 1 : 0;
    await expect(
      decryptAesGcm({
        key,
        purpose: vector.purpose,
        nonce: fromHex(vector.nonce),
        ciphertext: fromHex(vector.ciphertext),
        tag: tamperedTag,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: CRYPTO_ERROR_CODES.authenticationFailed }),
    );
  });

  it("rejects a wrong nonce and a wrong key", async () => {
    const vector = AES_GCM_PURPOSE_VECTORS[0];
    const wrongNonce = fromHex(vector.nonce);
    wrongNonce[11] = wrongNonce[11] === 0 ? 1 : 0;
    await expect(
      decryptAesGcm({
        key: fromHex(vector.key),
        purpose: vector.purpose,
        nonce: wrongNonce,
        ciphertext: fromHex(vector.ciphertext),
        tag: fromHex(vector.tag),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: CRYPTO_ERROR_CODES.authenticationFailed }),
    );
    const wrongKey = fromHex(vector.key);
    wrongKey[0] = wrongKey[0] === 0 ? 1 : 0;
    await expect(
      decryptAesGcm({
        key: wrongKey,
        purpose: vector.purpose,
        nonce: fromHex(vector.nonce),
        ciphertext: fromHex(vector.ciphertext),
        tag: fromHex(vector.tag),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: CRYPTO_ERROR_CODES.authenticationFailed }),
    );
  });

  it("rejects malformed nonce, key and tag lengths", async () => {
    const vector = AES_GCM_PURPOSE_VECTORS[0];
    await expect(
      encryptAesGcm({
        key: fromHex(vector.key),
        purpose: vector.purpose,
        plaintext: utf8("x"),
        nonce: new Uint8Array(11),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.invalidArgument,
        details: { reason: "nonce-length" },
      }),
    );
    await expect(
      encryptAesGcm({
        key: new Uint8Array(31),
        purpose: vector.purpose,
        plaintext: utf8("x"),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.invalidArgument,
        details: { reason: "key-length" },
      }),
    );
    await expect(
      decryptAesGcm({
        key: fromHex(vector.key),
        purpose: vector.purpose,
        nonce: fromHex(vector.nonce),
        ciphertext: fromHex(vector.ciphertext),
        tag: new Uint8Array(15),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: CRYPTO_ERROR_CODES.invalidArgument,
        details: { reason: "tag-length" },
      }),
    );
  });

  it("builds canonical purpose-bound authenticated data", () => {
    expect(new TextDecoder().decode(buildAuthData(CRYPTO_PURPOSES.publishedPackage))).toBe(
      '{"purpose":"datapulse/published-package","v":1}',
    );
    expect(
      new TextDecoder().decode(
        buildAuthData(CRYPTO_PURPOSES.publishedPackage, { n: 1, tag: "x" }),
      ),
    ).toBe('{"n":1,"purpose":"datapulse/published-package","tag":"x","v":1}');
  });
});

describe("platform AES-256-GCM known-answer", () => {
  it("matches the NIST empty plaintext vector tag", async () => {
    const subtle = globalThis.crypto.subtle;
    const key = await subtle.importKey(
      "raw",
      new Uint8Array(32),
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );
    const output = new Uint8Array(
      await subtle.encrypt(
        { name: "AES-GCM", iv: new Uint8Array(12), tagLength: 128 },
        key,
        new Uint8Array(0),
      ),
    );
    expect(output.byteLength).toBe(16);
    expect(toHex(output.subarray(output.byteLength - 16))).toBe(
      AES_256_GCM_NIST_EMPTY_TAG,
    );
  });
});