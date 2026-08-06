import {
  createCapacityExceededError,
  createInvalidArgumentError,
  createQuotaUnavailableError,
  type CapacityExceededReason,
  type QuotaUnavailableReason,
} from "./errors.js";

/** 4 GiB hard limit for the complete project plaintext backup payload. */
export const PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024 * 1024;

/** project-envelope-v1 manifest bound (1 MiB), used as conservative overhead. */
export const PROJECT_ENVELOPE_MANIFEST_LIMIT_BYTES = 1024 * 1024;

/** project-envelope-v1 header bound (4 KiB). */
export const PROJECT_ENVELOPE_HEADER_LIMIT_BYTES = 4 * 1024;

/** project-envelope-v1 chunk plaintext size (1 MiB). */
export const PROJECT_ENVELOPE_CHUNK_BYTES = 1024 * 1024;

/** project-envelope-v1 per-chunk tag size (128-bit). */
export const PROJECT_ENVELOPE_CHUNK_TAG_BYTES = 16;

/** project-envelope-v1 per-chunk ciphertext length field (uint32be). */
export const PROJECT_ENVELOPE_CHUNK_LENGTH_FIELD_BYTES = 4;

/** Wrapped package key wire bytes (32 ciphertext + 16 tag). */
export const PROJECT_ENVELOPE_WRAPPED_KEY_BYTES = 32 + 16;

export type BackupPayloadPart = Readonly<{ byteLength: number }>;

export type QuotaEstimate = Readonly<{
  quota: number;
  usage: number;
  available: number;
}>;

export type WriteCapacityRejectionReason =
  | "quota-exceeded"
  | "backup-payload-exceeded";

export type WriteCapacityDecision = Readonly<{
  allowed: boolean;
  availableQuotaBytes: number;
  projectedPayloadBytes: number;
  projectedStoredBytes: number;
  payloadLimitBytes: number;
  reasons: readonly WriteCapacityRejectionReason[];
}>;

export type EvaluateWriteCapacityInput = Readonly<{
  currentPayloadBytes: number;
  addedBytes: number;
  availableQuotaBytes: number;
}>;

export type AssessProjectWriteCapacityInput = Readonly<{
  parts: readonly BackupPayloadPart[];
  newBytes: number;
}>;

/**
 * Estimated full-backup plaintext payload: the sum of every version and
 * resource part plus a conservative 1 MiB manifest bound. The result must
 * stay <= PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES (FR-PROJ-009).
 */
export function computeBackupPayloadBytes(parts: readonly BackupPayloadPart[]): number {
  if (!Array.isArray(parts)) {
    throw createInvalidArgumentError("type");
  }
  let total = PROJECT_ENVELOPE_MANIFEST_LIMIT_BYTES;
  for (const part of parts) {
    if (
      typeof part !== "object" ||
      part === null ||
      typeof part.byteLength !== "number" ||
      !Number.isFinite(part.byteLength)
    ) {
      throw createInvalidArgumentError("type");
    }
    if (part.byteLength < 0) {
      throw createInvalidArgumentError("negative-length");
    }
    total += part.byteLength;
  }
  return total;
}

/**
 * Projected encrypted stored bytes for quota comparison: plaintext payload
 * plus header bound, wrapped key bytes and per-chunk tag/framing overhead.
 */
export function computeProjectedStoredBytes(payloadBytes: number): number {
  if (typeof payloadBytes !== "number" || !Number.isFinite(payloadBytes)) {
    throw createInvalidArgumentError("type");
  }
  if (payloadBytes < 0) {
    throw createInvalidArgumentError("negative-length");
  }
  const chunkCount = Math.ceil(payloadBytes / PROJECT_ENVELOPE_CHUNK_BYTES);
  return (
    PROJECT_ENVELOPE_HEADER_LIMIT_BYTES +
    PROJECT_ENVELOPE_WRAPPED_KEY_BYTES +
    payloadBytes +
    chunkCount *
      (PROJECT_ENVELOPE_CHUNK_TAG_BYTES + PROJECT_ENVELOPE_CHUNK_LENGTH_FIELD_BYTES)
  );
}

/**
 * Deterministic pre-write double estimation: the projected encrypted stored
 * bytes must fit the available quota AND the projected full backup payload
 * must stay within the 4 GiB bound. Both are checked before any allocation
 * or commit, so a rejected write never touches the last readable index.
 */
export function evaluateWriteCapacity(
  input: EvaluateWriteCapacityInput,
): WriteCapacityDecision {
  for (const [label, value] of [
    ["currentPayloadBytes", input.currentPayloadBytes],
    ["addedBytes", input.addedBytes],
    ["availableQuotaBytes", input.availableQuotaBytes],
  ]) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw createInvalidArgumentError("type");
    }
    if (value < 0) {
      throw createInvalidArgumentError("negative-length");
    }
  }
  const projectedPayloadBytes = input.currentPayloadBytes + input.addedBytes;
  const projectedStoredBytes = computeProjectedStoredBytes(projectedPayloadBytes);
  const reasons: WriteCapacityRejectionReason[] = [];
  if (projectedStoredBytes > input.availableQuotaBytes) {
    reasons.push("quota-exceeded");
  }
  if (projectedPayloadBytes > PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES) {
    reasons.push("backup-payload-exceeded");
  }
  return Object.freeze({
    allowed: reasons.length === 0,
    availableQuotaBytes: input.availableQuotaBytes,
    projectedPayloadBytes,
    projectedStoredBytes,
    payloadLimitBytes: PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES,
    reasons: Object.freeze(reasons),
  });
}

/**
 * Browser seam over navigator.storage.estimate(). Throws
 * STORAGE_QUOTA_UNAVAILABLE when the API is missing or the estimate is
 * inconsistent.
 */
export async function estimateAvailableQuota(): Promise<QuotaEstimate> {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.estimate !== "function") {
    throw quotaUnavailable("estimate-unsupported");
  }
  try {
    const estimate = await storage.estimate();
    const quota = estimate.quota ?? 0;
    const usage = estimate.usage ?? 0;
    if (!Number.isFinite(quota) || !Number.isFinite(usage) || quota < usage) {
      throw quotaUnavailable("estimate-failed");
    }
    return Object.freeze({ quota, usage, available: quota - usage });
  } catch (error) {
    if (isQuotaUnavailableError(error)) {
      throw error;
    }
    throw quotaUnavailable("estimate-failed");
  }
}

/** Combines the browser quota estimate with the deterministic double check. */
export async function assessProjectWriteCapacity(
  input: AssessProjectWriteCapacityInput,
): Promise<WriteCapacityDecision> {
  const currentPayloadBytes = computeBackupPayloadBytes(input.parts);
  if (
    typeof input.newBytes !== "number" ||
    !Number.isFinite(input.newBytes) ||
    input.newBytes < 0
  ) {
    throw createInvalidArgumentError("negative-length");
  }
  const { available } = await estimateAvailableQuota();
  return evaluateWriteCapacity({
    currentPayloadBytes,
    addedBytes: input.newBytes,
    availableQuotaBytes: available,
  });
}

/**
 * Explicit pre-write rejection: throws STORAGE_CAPACITY_EXCEEDED when the
 * decision is not allowed, so callers reject before allocation or commit.
 */
export function assertWriteCapacityAllowed(decision: WriteCapacityDecision): void {
  if (decision.allowed) {
    return;
  }
  const reason = toCapacityExceededReason(decision.reasons);
  throw createCapacityExceededError(reason);
}

function toCapacityExceededReason(
  reasons: readonly WriteCapacityRejectionReason[],
): CapacityExceededReason {
  if (reasons.length >= 2) {
    return "quota-and-payload-exceeded";
  }
  return reasons[0] === "quota-exceeded"
    ? "quota-exceeded"
    : "backup-payload-exceeded";
}

function quotaUnavailable(reason: QuotaUnavailableReason) {
  return createQuotaUnavailableError(reason);
}

function isQuotaUnavailableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "STORAGE_QUOTA_UNAVAILABLE"
  );
}
