/**
 * Frozen fixed interoperability vectors for the M0-021 crypto primitives.
 * Fixed keys, nonces and tags are ONLY allowed inside these test fixtures.
 */

export type Base64UrlVector = Readonly<{ plaintext: string; encoded: string }>;

export const BASE64URL_RFC4648_VECTORS: readonly Base64UrlVector[] = Object.freeze([
  Object.freeze({ plaintext: "", encoded: "" }),
  Object.freeze({ plaintext: "f", encoded: "Zg" }),
  Object.freeze({ plaintext: "fo", encoded: "Zm8" }),
  Object.freeze({ plaintext: "foo", encoded: "Zm9v" }),
  Object.freeze({ plaintext: "foob", encoded: "Zm9vYg" }),
  Object.freeze({ plaintext: "fooba", encoded: "Zm9vYmE" }),
  Object.freeze({ plaintext: "foobar", encoded: "Zm9vYmFy" }),
]);

export const BASE64URL_INVALID_INPUTS: readonly Readonly<{
  input: string;
  reason: string;
}>[] = Object.freeze([
  Object.freeze({ input: "Zg=", reason: "padding" }),
  Object.freeze({ input: "Zm9vYg==", reason: "padding" }),
  Object.freeze({ input: "Z g", reason: "whitespace" }),
  Object.freeze({ input: "Zg\n", reason: "whitespace" }),
  Object.freeze({ input: "Zg+", reason: "alphabet" }),
  Object.freeze({ input: "Zg/", reason: "alphabet" }),
  Object.freeze({ input: "Z", reason: "length" }),
  Object.freeze({ input: "Zh", reason: "padding-bits" }),
  Object.freeze({ input: "Zm9vY2", reason: "padding-bits" }),
]);

export const JCS_SORTING_VECTORS: readonly Readonly<{
  label: string;
  input: Record<string, unknown>;
  canonical: string;
}>[] = Object.freeze([
  Object.freeze({
    label: "already-sorted",
    input: { a: "z", b: "y" },
    canonical: '{"a":"z","b":"y"}',
  }),
  Object.freeze({
    label: "reverse-input-order",
    input: { b: "y", a: "z" },
    canonical: '{"a":"z","b":"y"}',
  }),
  Object.freeze({
    label: "utf16-code-unit-order",
    input: { a: 1, A: 2 },
    canonical: '{"A":2,"a":1}',
  }),
  Object.freeze({
    label: "nested-arrays-and-literals",
    input: { z: [null, true, false], m: { b: 2, a: 1 } },
    canonical: '{"m":{"a":1,"b":2},"z":[null,true,false]}',
  }),
]);

const RFC_8785_TAIL = String.fromCharCode(
  0x5c, 0x22, // escaped quote
  0x5c, 0x5c, // escaped backslash
  0x5c, 0x5c, // escaped backslash
  0x5c, 0x22, // escaped quote
  0x2f, // slash
);

/** RFC 8785 section 3.2 example: numbers, unicode, escaped control chars. */
export const JCS_RFC8785_EXAMPLE: Readonly<{
  input: Record<string, unknown>;
  canonical: string;
}> = Object.freeze({
  input: Object.freeze({
    numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
    string: "\u20ac$\u000f\u000aA'\u0042\u0022\u005c\\\"/",
    literals: [null, true, false],
  }),
  canonical: '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"' +
    "\u20ac" +
    "$\\u000f\\nA'B" +
    RFC_8785_TAIL +
    '"}',
});

/**
 * AES-256-GCM known-answer tag (zero key, zero IV, empty AAD and plaintext)
 * from the NIST GCM test vectors. Pins the platform AES-GCM primitive.
 */
export const AES_256_GCM_NIST_EMPTY_TAG = "530f8afbc74536b9a963b4f1c4cb738b";

export type AesGcmGoldenVector = Readonly<{
  purpose: string;
  key: string;
  nonce: string;
  plaintext: string;
  ciphertext: string;
  tag: string;
  fieldsCiphertext: string;
  fieldsTag: string;
}>;

/**
 * Purpose-isolated golden vectors. Fixed key/nonce appear only in this
 * fixture; production material must come from the Web Crypto CSPRNG.
 */
export const AES_GCM_PURPOSE_VECTORS: readonly AesGcmGoldenVector[] = Object.freeze([
  Object.freeze({
    purpose: "datapulse/published-package",
    key: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    nonce: "202122232425262728292a2b",
    plaintext: "68656c6c6f2063727970746f",
    ciphertext: "ba5fca1c03b8797c630c36a1",
    tag: "ceeec784184a8553c42469f790175f27",
    fieldsCiphertext: "ba5fca1c03b8797c630c36a1",
    fieldsTag: "4af901872e68a68e4a3c09b661573aac",
  }),
  Object.freeze({
    purpose: "datapulse/project-key-wrap",
    key: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    nonce: "202122232425262728292a2b",
    plaintext: "68656c6c6f2063727970746f",
    ciphertext: "ba5fca1c03b8797c630c36a1",
    tag: "88b88596aca0965929b86bd0def6c16b",
    fieldsCiphertext: "ba5fca1c03b8797c630c36a1",
    fieldsTag: "38d353c6bc703867f780b5c365e03490",
  }),
  Object.freeze({
    purpose: "datapulse/project-package-chunk",
    key: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    nonce: "202122232425262728292a2b",
    plaintext: "68656c6c6f2063727970746f",
    ciphertext: "ba5fca1c03b8797c630c36a1",
    tag: "54dc45330ee08c694b8f1c11f86b6aeb",
    fieldsCiphertext: "ba5fca1c03b8797c630c36a1",
    fieldsTag: "c253c0522102aa623f56e124d288eecf",
  }),
]);

export const JCS_REJECTED_VALUES: readonly Readonly<{
  label: string;
  input: unknown;
}>[] = Object.freeze([
  Object.freeze({ label: "nan", input: Number.NaN }),
  Object.freeze({ label: "positive-infinity", input: Number.POSITIVE_INFINITY }),
  Object.freeze({ label: "negative-infinity", input: Number.NEGATIVE_INFINITY }),
  Object.freeze({ label: "bigint", input: 1n }),
  Object.freeze({ label: "undefined", input: undefined }),
  Object.freeze({ label: "function", input: () => undefined }),
]);