/** Domain 包自身冻结的最小错误码集合。下游包应定义自己的专用错误码。 */
export const DOMAIN_ERROR_CODES = Object.freeze({
  idInvalid: "DOMAIN_ID_INVALID",
  versionInvalid: "DOMAIN_VERSION_INVALID",
  versionDuplicate: "DOMAIN_VERSION_DUPLICATE",
  versionUnsupported: "DOMAIN_VERSION_UNSUPPORTED",
} as const);

export type DomainErrorCode =
  (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES];

export type DomainIdInvalidReason = "kind" | "type" | "prefix" | "length" | "format";

export type DomainVersionInvalidReason =
  | "type"
  | "format"
  | "range"
  | "registry_type"
  | "registry_kind"
  | "registry_empty"
  | "registry_size";

export type DomainIdInvalidError = Readonly<{
  code: typeof DOMAIN_ERROR_CODES.idInvalid;
  details: Readonly<{ reason: DomainIdInvalidReason }>;
}>;

export type DomainVersionInvalidError = Readonly<{
  code: typeof DOMAIN_ERROR_CODES.versionInvalid;
  details: Readonly<{ reason: DomainVersionInvalidReason }>;
}>;

export type DomainVersionDuplicateError = Readonly<{
  code: typeof DOMAIN_ERROR_CODES.versionDuplicate;
  details: Readonly<{ reason: "duplicate" }>;
}>;

export type DomainVersionUnsupportedError = Readonly<{
  code: typeof DOMAIN_ERROR_CODES.versionUnsupported;
  details: Readonly<{ reason: "unregistered" }>;
}>;

/**
 * Domain 错误只携带封闭枚举 details，不接受自由文本或原始输入。
 * 因而错误 DTO 可 JSON 序列化、大小有界，也不会意外回显用户内容。
 */
export type DomainError =
  | DomainIdInvalidError
  | DomainVersionInvalidError
  | DomainVersionDuplicateError
  | DomainVersionUnsupportedError;

function freezeError<Code extends DomainErrorCode, Reason extends string>(
  code: Code,
  reason: Reason,
): Readonly<{ code: Code; details: Readonly<{ reason: Reason }> }> {
  const details = Object.freeze({ reason });
  return Object.freeze({ code, details });
}

export function createDomainIdInvalidError(
  reason: DomainIdInvalidReason,
): DomainIdInvalidError {
  return freezeError(DOMAIN_ERROR_CODES.idInvalid, reason);
}

export function createDomainVersionInvalidError(
  reason: DomainVersionInvalidReason,
): DomainVersionInvalidError {
  return freezeError(DOMAIN_ERROR_CODES.versionInvalid, reason);
}

export function createDomainVersionDuplicateError(): DomainVersionDuplicateError {
  return freezeError(DOMAIN_ERROR_CODES.versionDuplicate, "duplicate");
}

export function createDomainVersionUnsupportedError(): DomainVersionUnsupportedError {
  return freezeError(DOMAIN_ERROR_CODES.versionUnsupported, "unregistered");
}
