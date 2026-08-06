import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_STORAGE_ERROR_CODES,
  PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES,
  PROJECT_ENVELOPE_CHUNK_BYTES,
  PROJECT_ENVELOPE_CHUNK_LENGTH_FIELD_BYTES,
  PROJECT_ENVELOPE_CHUNK_TAG_BYTES,
  PROJECT_ENVELOPE_HEADER_LIMIT_BYTES,
  PROJECT_ENVELOPE_MANIFEST_LIMIT_BYTES,
  PROJECT_ENVELOPE_WRAPPED_KEY_BYTES,
  assertWriteCapacityAllowed,
  assessProjectWriteCapacity,
  computeBackupPayloadBytes,
  computeProjectedStoredBytes,
  estimateAvailableQuota,
  evaluateWriteCapacity,
} from "../../packages/local-storage/dist/index.js";

const MAX_QUOTA = Number.MAX_SAFE_INTEGER;

function expectInvalidArgument(fn: () => unknown, reason: string): void {
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({
    code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
    details: { reason },
  });
}

describe("local-storage quota and write capacity", () => {
  it("computes full-backup payload as parts plus the 1 MiB manifest bound", () => {
    expect(computeBackupPayloadBytes([])).toBe(
      PROJECT_ENVELOPE_MANIFEST_LIMIT_BYTES,
    );
    expect(
      computeBackupPayloadBytes([{ byteLength: 100 }, { byteLength: 200 }]),
    ).toBe(PROJECT_ENVELOPE_MANIFEST_LIMIT_BYTES + 300);
  });

  it("rejects malformed or negative payload parts", () => {
    expectInvalidArgument(
      () => computeBackupPayloadBytes(null as never),
      "type",
    );
    expectInvalidArgument(
      () => computeBackupPayloadBytes([null as never]),
      "type",
    );
    expectInvalidArgument(
      () => computeBackupPayloadBytes([{ byteLength: Number.NaN }]),
      "type",
    );
    expectInvalidArgument(
      () => computeBackupPayloadBytes([{ byteLength: -1 }]),
      "negative-length",
    );
  });

  it("projects stored bytes with header, wrapped key and per-chunk framing", () => {
    expect(computeProjectedStoredBytes(0)).toBe(
      PROJECT_ENVELOPE_HEADER_LIMIT_BYTES +
        PROJECT_ENVELOPE_WRAPPED_KEY_BYTES,
    );
    const perChunkOverhead =
      PROJECT_ENVELOPE_CHUNK_TAG_BYTES +
      PROJECT_ENVELOPE_CHUNK_LENGTH_FIELD_BYTES;
    const oneChunk =
      PROJECT_ENVELOPE_HEADER_LIMIT_BYTES +
      PROJECT_ENVELOPE_WRAPPED_KEY_BYTES +
      PROJECT_ENVELOPE_CHUNK_BYTES +
      perChunkOverhead;
    expect(computeProjectedStoredBytes(PROJECT_ENVELOPE_CHUNK_BYTES)).toBe(
      oneChunk,
    );
    expect(
      computeProjectedStoredBytes(PROJECT_ENVELOPE_CHUNK_BYTES + 1),
    ).toBe(oneChunk + perChunkOverhead + 1);
  });

  it("rejects invalid projected stored byte inputs", () => {
    expectInvalidArgument(
      () => computeProjectedStoredBytes(Number.NaN),
      "type",
    );
    expectInvalidArgument(
      () => computeProjectedStoredBytes(Number.POSITIVE_INFINITY),
      "type",
    );
    expectInvalidArgument(
      () => computeProjectedStoredBytes(-1),
      "negative-length",
    );
  });

  it("allows a full-backup payload exactly at the 4 GiB bound", () => {
    const decision = evaluateWriteCapacity({
      currentPayloadBytes: PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES - 1,
      addedBytes: 1,
      availableQuotaBytes: MAX_QUOTA,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.projectedPayloadBytes).toBe(
      PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES,
    );
    expect(decision.reasons).toEqual([]);
  });

  it("rejects a payload one byte over the 4 GiB bound", () => {
    const decision = evaluateWriteCapacity({
      currentPayloadBytes: PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES - 1,
      addedBytes: 2,
      availableQuotaBytes: MAX_QUOTA,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.projectedPayloadBytes).toBe(
      PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES + 1,
    );
    expect(decision.reasons).toEqual(["backup-payload-exceeded"]);
  });

  it("rejects when projected stored bytes exceed the available quota", () => {
    const decision = evaluateWriteCapacity({
      currentPayloadBytes: 100,
      addedBytes: 100,
      availableQuotaBytes: 100,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toEqual(["quota-exceeded"]);
  });

  it("reports both reasons when quota and payload bound are crossed", () => {
    const decision = evaluateWriteCapacity({
      currentPayloadBytes: PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES,
      addedBytes: 1,
      availableQuotaBytes: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toEqual([
      "quota-exceeded",
      "backup-payload-exceeded",
    ]);
  });

  it("rejects invalid evaluate inputs", () => {
    expectInvalidArgument(
      () =>
        evaluateWriteCapacity({
          currentPayloadBytes: -1,
          addedBytes: 0,
          availableQuotaBytes: 1,
        }),
      "negative-length",
    );
    expectInvalidArgument(
      () =>
        evaluateWriteCapacity({
          currentPayloadBytes: 0,
          addedBytes: Number.NaN,
          availableQuotaBytes: 1,
        }),
      "type",
    );
    expectInvalidArgument(
      () =>
        evaluateWriteCapacity({
          currentPayloadBytes: 0,
          addedBytes: 1,
          availableQuotaBytes: Number.POSITIVE_INFINITY,
        }),
      "type",
    );
  });

  it("assertWriteCapacityAllowed accepts allowed decisions", () => {
    expect(() =>
      assertWriteCapacityAllowed(
        evaluateWriteCapacity({
          currentPayloadBytes: 0,
          addedBytes: 0,
          availableQuotaBytes: MAX_QUOTA,
        }),
      ),
    ).not.toThrow();
  });

  it("assertWriteCapacityAllowed throws with the capacity reason", () => {
    const quotaOnly = evaluateWriteCapacity({
      currentPayloadBytes: 0,
      addedBytes: 1,
      availableQuotaBytes: 0,
    });
    expect(() => assertWriteCapacityAllowed(quotaOnly)).toThrowError(
      expect.objectContaining({
        code: LOCAL_STORAGE_ERROR_CODES.capacityExceeded,
        details: { reason: "quota-exceeded" },
      }),
    );

    const payloadOnly = evaluateWriteCapacity({
      currentPayloadBytes: PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES,
      addedBytes: 1,
      availableQuotaBytes: MAX_QUOTA,
    });
    expect(() => assertWriteCapacityAllowed(payloadOnly)).toThrowError(
      expect.objectContaining({
        code: LOCAL_STORAGE_ERROR_CODES.capacityExceeded,
        details: { reason: "backup-payload-exceeded" },
      }),
    );

    const both = evaluateWriteCapacity({
      currentPayloadBytes: PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES,
      addedBytes: 1,
      availableQuotaBytes: 0,
    });
    expect(() => assertWriteCapacityAllowed(both)).toThrowError(
      expect.objectContaining({
        code: LOCAL_STORAGE_ERROR_CODES.capacityExceeded,
        details: { reason: "quota-and-payload-exceeded" },
      }),
    );
  });

  it("estimateAvailableQuota throws STORAGE_QUOTA_UNAVAILABLE in Node", async () => {
    await expect(estimateAvailableQuota()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.quotaUnavailable,
      details: { reason: "estimate-unsupported" },
    });
  });

  it("estimateAvailableQuota rejects unsupported or inconsistent estimates", async () => {
    vi.stubGlobal("navigator", { storage: {} });
    await expect(estimateAvailableQuota()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.quotaUnavailable,
      details: { reason: "estimate-unsupported" },
    });

    vi.stubGlobal("navigator", {
      storage: {
        estimate: async () => ({ quota: 100, usage: 200 }),
      },
    });
    await expect(estimateAvailableQuota()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.quotaUnavailable,
      details: { reason: "estimate-failed" },
    });

    vi.stubGlobal("navigator", {
      storage: {
        estimate: async () => {
          throw new Error("boom");
        },
      },
    });
    await expect(estimateAvailableQuota()).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.quotaUnavailable,
      details: { reason: "estimate-failed" },
    });
  });

  it("estimateAvailableQuota returns a frozen consistent estimate", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        estimate: async () => ({ quota: 1000, usage: 250 }),
      },
    });
    const estimate = await estimateAvailableQuota();
    expect(estimate).toEqual({ quota: 1000, usage: 250, available: 750 });
    expect(Object.isFrozen(estimate)).toBe(true);
  });

  it("assessProjectWriteCapacity rejects in Node before any write", async () => {
    await expect(
      assessProjectWriteCapacity({ parts: [], newBytes: 1 }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.quotaUnavailable,
    });
  });
});