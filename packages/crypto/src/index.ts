export {
  CRYPTO_ERROR_CODES,
  createArgon2DerivationFailedError,
  createAuthenticationFailedError,
  createBase64UrlInvalidError,
  createInvalidArgumentError,
  createJcsInvalidError,
  createKeyInvalidError,
  createProfileUnknownError,
  createRandomSourceUnavailableError,
  type Argon2DerivationFailedError,
  type Argon2DerivationFailedReason,
  type AuthenticationFailedError,
  type Base64UrlInvalidError,
  type Base64UrlInvalidReason,
  type CryptoError,
  type CryptoErrorCode,
  type InvalidArgumentError,
  type InvalidArgumentReason,
  type JcsInvalidError,
  type JcsInvalidReason,
  type KeyInvalidError,
  type KeyInvalidReason,
  type ProfileUnknownError,
  type ProfileUnknownReason,
  type RandomSourceUnavailableError,
  type RandomSourceUnavailableReason,
} from "./errors.js";

export { base64urlDecode, base64urlEncode } from "./base64url.js";

export { jcs, jcsString, type JcsPrimitive, type JcsValue } from "./jcs.js";

export { randomBytes, randomNonce } from "./random.js";

export {
  CRYPTO_PURPOSES,
  assertCryptoPurpose,
  isCryptoPurpose,
  type CryptoPurpose,
} from "./purposes.js";

export {
  CRYPTO_PROFILES,
  getCryptoProfile,
  hasCryptoProfile,
  listCryptoProfiles,
  type CryptoProfile,
} from "./profiles.js";

export {
  ARGON2_KDF_PROFILES,
  deriveArgon2KdfKey,
  getArgon2KdfProfile,
  hasArgon2KdfProfile,
  listArgon2KdfProfiles,
  type Argon2KdfProfile,
  type Argon2KdfProfileId,
  type DeriveArgon2KdfKeyInput,
} from "./argon2kdf.js";

export {
  buildAuthData,
  decryptAesGcm,
  encryptAesGcm,
  type AesGcmKey,
  type OpenAesGcmInput,
  type SealedCiphertext,
  type SealAesGcmInput,
} from "./aes-gcm.js";