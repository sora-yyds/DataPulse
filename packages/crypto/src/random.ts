import {
  createInvalidArgumentError,
  createRandomSourceUnavailableError,
} from "./errors.js";

const MAX_RANDOM_BYTES_PER_CALL = 65_536;

/**
 * CSPRNG bytes from Web Crypto. Chunked because getRandomValues rejects
 * requests larger than 65,536 bytes.
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw createInvalidArgumentError("length");
  }
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject || typeof cryptoObject.getRandomValues !== "function") {
    throw createRandomSourceUnavailableError();
  }
  const output = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += MAX_RANDOM_BYTES_PER_CALL) {
    const chunkLength = Math.min(MAX_RANDOM_BYTES_PER_CALL, length - offset);
    cryptoObject.getRandomValues(output.subarray(offset, offset + chunkLength));
  }
  return output;
}

/** Fresh 12-byte AES-GCM nonce. */
export function randomNonce(): Uint8Array {
  return randomBytes(12);
}