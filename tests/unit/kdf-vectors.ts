/**
 * Frozen fixed interoperability vectors for the M0-022 Argon2id KDF profile
 * `a2id-v1-64m-t3-p1`. Fixed salts appear only inside this test fixture;
 * production salts must come from the Web Crypto CSPRNG.
 *
 * Every vector was cross-validated on 2026-08-06 with argon2-cffi 25.1.0
 * (reference C implementation, Argon2id version 0x13, m=65536 KiB, t=3,
 * p=1, 32-byte output) and with hash-wasm 4.12.0; both implementations
 * produce the identical bytes.
 */

export const ARGON2_KDF_PROFILE_ID = "a2id-v1-64m-t3-p1";

export type Argon2KdfGoldenVector = Readonly<{
  label: string;
  /** NFC-normalized password; the module normalizes input before deriving. */
  password: string;
  /** Hex of the 16-byte salt. */
  salt: string;
  /** Hex of the 32-byte derived key. */
  key: string;
}>;

export const ARGON2_KDF_GOLDEN_VECTORS: readonly Argon2KdfGoldenVector[] =
  Object.freeze([
    Object.freeze({
      label: "ascii-passphrase",
      password: "correct horse battery staple",
      salt: "42424242424242424242424242424242",
      key: "072ff0797a5f92ef6138da5a67dc311a330469923b4b14390e9ddfbbc97ab683",
    }),
    Object.freeze({
      label: "unicode-nfc-passphrase",
      password: "café 口令🔐 비밀번호",
      salt: "000102030405060708090a0b0c0d0e0f",
      key: "9ee0c60fd4f1f015da4e322263c5b7b547de7ed152790a5209bbfdc2e6c72a41",
    }),
  ]);

/** The same passphrase in NFD form must normalize to the NFC golden vector. */
export const ARGON2_KDF_NFD_PASSPHRASE =
  "cafe\u0301 口令\ud83d\udd10 \u1107\u1175\u1106\u1175\u11af\u1107\u1165\u11ab\u1112\u1169";
