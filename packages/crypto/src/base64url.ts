import {
  CRYPTO_ERROR_CODES,
  createBase64UrlInvalidError,
} from "./errors.js";

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const BASE64URL_LOOKUP = (() => {
  const lookup = new Int8Array(128).fill(-1);
  for (let index = 0; index < BASE64URL_ALPHABET.length; index += 1) {
    lookup[BASE64URL_ALPHABET.charCodeAt(index)] = index;
  }
  return lookup;
})();

/**
 * RFC 4648 section 5 unpadded base64url encoding.
 * Returns only [A-Za-z0-9_-] characters and never emits "=" padding.
 */
export function base64urlEncode(input: Uint8Array): string {
  if (!(input instanceof Uint8Array)) {
    throw createBase64UrlInvalidError("type");
  }
  const output: string[] = [];
  const length = input.length;
  for (let offset = 0; offset < length; offset += 3) {
    const remaining = length - offset;
    const first = input[offset] ?? 0;
    const second = remaining > 1 ? (input[offset + 1] ?? 0) : 0;
    const third = remaining > 2 ? (input[offset + 2] ?? 0) : 0;
    output.push(BASE64URL_ALPHABET.charAt(first >> 2));
    output.push(BASE64URL_ALPHABET.charAt(((first & 0x03) << 4) | (second >> 4)));
    if (remaining > 1) {
      output.push(BASE64URL_ALPHABET.charAt(((second & 0x0f) << 2) | (third >> 6)));
    }
    if (remaining > 2) {
      output.push(BASE64URL_ALPHABET.charAt(third & 0x3f));
    }
  }
  return output.join("");
}

/**
 * Strict RFC 4648 section 5 unpadded base64url decoding.
 * Rejects whitespace, "=" padding, out-of-alphabet characters, lengths whose
 * remainder is 1, and non-canonical trailing padding bits.
 */
export function base64urlDecode(input: string): Uint8Array {
  if (typeof input !== "string") {
    throw createBase64UrlInvalidError("type");
  }
  if (/[\u0000-\u0020\u007f]/u.test(input)) {
    throw createBase64UrlInvalidError("whitespace");
  }
  if (input.includes("=")) {
    throw createBase64UrlInvalidError("padding");
  }
  const length = input.length;
  if (length % 4 === 1) {
    throw createBase64UrlInvalidError("length");
  }
  const values = new Int8Array(length);
  for (let index = 0; index < length; index += 1) {
    const code = input.charCodeAt(index);
    const value = code < BASE64URL_LOOKUP.length ? BASE64URL_LOOKUP[code] : -1;
    if (value === undefined || value === -1) {
      throw createBase64UrlInvalidError("alphabet");
    }
    values[index] = value;
  }
  if (length % 4 === 2) {
    const last = values[length - 1] ?? 0;
    if ((last & 0x0f) !== 0) {
      throw createBase64UrlInvalidError("padding-bits");
    }
  }
  if (length % 4 === 3) {
    const last = values[length - 1] ?? 0;
    if ((last & 0x03) !== 0) {
      throw createBase64UrlInvalidError("padding-bits");
    }
  }
  const byteLength = Math.floor((length * 6) / 8);
  const output = new Uint8Array(byteLength);
  let accumulator = 0;
  let bits = 0;
  let outputIndex = 0;
  for (let index = 0; index < length; index += 1) {
    accumulator = (accumulator << 6) | (values[index] ?? 0);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outputIndex] = (accumulator >> bits) & 0xff;
      outputIndex += 1;
    }
  }
  return output;
}