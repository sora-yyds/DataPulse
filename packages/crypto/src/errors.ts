/** Stable, closed-enum error DTOs for the crypto package. */

export const CRYPTO_ERROR_CODES = Object.freeze({
  base64urlInvalid: "CRYPTO_BASE64URL_INVALID",
  jcsInvalid: "CRYPTO_JCS_INVALID",
  invalidArgument: "CRYPTO_INVALID_ARGUMENT",
  keyInvalid: "CRYPTO_KEY_INVALID",
  authenticationFailed: "CRYPTO_AES_GCM_AUTHENTICATION_FAILED",
  profileUnknown: "CRYPTO_PROFILE_UNKNOWN",
  randomSourceUnavailable: "CRYPTO_RANDOM_SOURCE_UNAVAILABLE",
  argon2DerivationFailed: "CRYPTO_ARGON2_DERIVATION_FAILED",
} as const);

export type CryptoErrorCode =
  (typeof CRYPTO_ERROR_CODES)[keyof typeof CRYPTO_ERROR_CODES];

export type Base64UrlInvalidReason =
  | "type"
  | "whitespace"
  | "padding"
  | "alphabet"
  | "length"
  | "padding-bits";

export type JcsInvalidReason =
  | "unsupported-type"
  | "non-finite"
  | "bigint"
  | "circular";

export type InvalidArgumentReason =
  | "type"
  | "length"
  | "key-length"
  | "nonce-length"
  | "tag-length"
  | "purpose"
  | "password-length"
  | "salt-length";

export type KeyInvalidReason = "type" | "algorithm" | "length" | "usages";
export type AuthenticationFailedReason = "decrypt";
export type ProfileUnknownReason = "unregistered";
export type RandomSourceUnavailableReason = "crypto-missing";
export type Argon2DerivationFailedReason = "derivation";

type FrozenError<Code extends CryptoErrorCode, Reason extends string> = Readonly<{
  code: Code;
  details: Readonly<{ reason: Reason }>;
}>;

export type Base64UrlInvalidError = FrozenError<
  typeof CRYPTO_ERROR_CODES.base64urlInvalid,
  Base64UrlInvalidReason
>;
export type JcsInvalidError = FrozenError<
  typeof CRYPTO_ERROR_CODES.jcsInvalid,
  JcsInvalidReason
>;
export type InvalidArgumentError = FrozenError<
  typeof CRYPTO_ERROR_CODES.invalidArgument,
  InvalidArgumentReason
>;
export type KeyInvalidError = FrozenError<
  typeof CRYPTO_ERROR_CODES.keyInvalid,
  KeyInvalidReason
>;
export type AuthenticationFailedError = FrozenError<
  typeof CRYPTO_ERROR_CODES.authenticationFailed,
  AuthenticationFailedReason
>;
export type ProfileUnknownError = FrozenError<
  typeof CRYPTO_ERROR_CODES.profileUnknown,
  ProfileUnknownReason
>;
export type RandomSourceUnavailableError = FrozenError<
  typeof CRYPTO_ERROR_CODES.randomSourceUnavailable,
  RandomSourceUnavailableReason
>;
export type Argon2DerivationFailedError = FrozenError<
  typeof CRYPTO_ERROR_CODES.argon2DerivationFailed,
  Argon2DerivationFailedReason
>;

export type CryptoError =
  | Base64UrlInvalidError
  | JcsInvalidError
  | InvalidArgumentError
  | KeyInvalidError
  | AuthenticationFailedError
  | ProfileUnknownError
  | RandomSourceUnavailableError
  | Argon2DerivationFailedError;

function freezeError<Code extends CryptoErrorCode, Reason extends string>(
  code: Code,
  reason: Reason,
): FrozenError<Code, Reason> {
  return Object.freeze({ code, details: Object.freeze({ reason }) });
}

export function createBase64UrlInvalidError(
  reason: Base64UrlInvalidReason,
): Base64UrlInvalidError {
  return freezeError(CRYPTO_ERROR_CODES.base64urlInvalid, reason);
}

export function createJcsInvalidError(reason: JcsInvalidReason): JcsInvalidError {
  return freezeError(CRYPTO_ERROR_CODES.jcsInvalid, reason);
}

export function createInvalidArgumentError(
  reason: InvalidArgumentReason,
): InvalidArgumentError {
  return freezeError(CRYPTO_ERROR_CODES.invalidArgument, reason);
}

export function createKeyInvalidError(reason: KeyInvalidReason): KeyInvalidError {
  return freezeError(CRYPTO_ERROR_CODES.keyInvalid, reason);
}

export function createAuthenticationFailedError(): AuthenticationFailedError {
  return freezeError(CRYPTO_ERROR_CODES.authenticationFailed, "decrypt");
}

export function createProfileUnknownError(): ProfileUnknownError {
  return freezeError(CRYPTO_ERROR_CODES.profileUnknown, "unregistered");
}

export function createRandomSourceUnavailableError(): RandomSourceUnavailableError {
  return freezeError(CRYPTO_ERROR_CODES.randomSourceUnavailable, "crypto-missing");
}

export function createArgon2DerivationFailedError(): Argon2DerivationFailedError {
  return freezeError(CRYPTO_ERROR_CODES.argon2DerivationFailed, "derivation");
}