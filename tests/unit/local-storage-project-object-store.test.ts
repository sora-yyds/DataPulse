import { describe, expect, it } from "vitest";
import { CRYPTO_ERROR_CODES } from "../../packages/crypto/dist/index.js";
import {
  LOCAL_STORAGE_ERROR_CODES,
  PROJECT_OBJECT_AAD_KIND,
  commitProjectObjects,
  createStorageWriteFailedError,
  listCommittedObjectIds,
  openProjectObject,
  recoverProjectObjects,
  type CommitIndexStore,
  type OpfsObjectStore,
  type ProjectObjectCoreDeps,
  type ProjectObjectRecord,
  type TransactionRecord,
} from "../../packages/local-storage/dist/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(value: string): Uint8Array {
  return encoder.encode(value);
}

function decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

function requireBytes(value: Uint8Array | undefined): Uint8Array {
  expect(value).toBeDefined();
  if (value === undefined) {
    throw new Error("expected stored bytes");
  }
  return value;
}

type FakeOpfs = OpfsObjectStore & {
  files: Map<string, Uint8Array>;
  directories: Set<string>;
  failWrites: Set<string>;
  setFile(transactionId: string, objectId: string, bytes: Uint8Array): void;
};

function createFakeOpfs(): FakeOpfs {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();
  const failWrites = new Set<string>();
  const key = (transactionId: string, objectId: string): string =>
    `${transactionId}/${objectId}`;
  const opfs: FakeOpfs = {
    files,
    directories,
    failWrites,
    setFile(transactionId, objectId, bytes) {
      directories.add(transactionId);
      files.set(key(transactionId, objectId), new Uint8Array(bytes));
    },
    async writeObjectFile(transactionId, objectId, bytes) {
      directories.add(transactionId);
      if (failWrites.has(key(transactionId, objectId))) {
        throw createStorageWriteFailedError("opfs-write");
      }
      files.set(key(transactionId, objectId), new Uint8Array(bytes));
    },
    async readObjectFile(transactionId, objectId) {
      const value = files.get(key(transactionId, objectId));
      return value === undefined ? undefined : new Uint8Array(value);
    },
    async deleteObjectFile(transactionId, objectId) {
      files.delete(key(transactionId, objectId));
    },
    async deleteTransactionDirectory(transactionId) {
      directories.delete(transactionId);
      for (const name of [...files.keys()]) {
        if (name.startsWith(`${transactionId}/`)) {
          files.delete(name);
        }
      }
    },
    async listTransactionDirectories() {
      return [...directories];
    },
  };
  return opfs;
}

type FakeIndex = CommitIndexStore & {
  state(): { transactions: TransactionRecord[]; records: ProjectObjectRecord[] };
  setRecordSha256(transactionId: string, objectId: string, sha256: string): void;
};

function createFakeIndex(): FakeIndex {
  let transactions: TransactionRecord[] = [];
  let records: ProjectObjectRecord[] = [];
  const index: FakeIndex = {
    state() {
      return {
        transactions: transactions.map((transaction) => ({ ...transaction })),
        records: records.map((record) => ({ ...record })),
      };
    },
    setRecordSha256(transactionId, objectId, sha256) {
      const record = records.find(
        (candidate) =>
          candidate.transactionId === transactionId &&
          candidate.objectId === objectId,
      );
      if (!record) {
        throw new Error("missing record");
      }
      (record as { plaintextSha256: string }).plaintextSha256 = sha256;
    },
    async listTransactionRecords() {
      return transactions.map((transaction) => ({ ...transaction }));
    },
    async listObjectRecords(transactionId) {
      return records
        .filter((record) => record.transactionId === transactionId)
        .map((record) => ({ ...record }));
    },
    async listAllObjectRecords() {
      return records.map((record) => ({ ...record }));
    },
    async beginPending(record) {
      if (transactions.some((candidate) => candidate.transactionId === record.transactionId)) {
        throw new Error("duplicate transaction");
      }
      transactions.push({ ...record });
    },
    async markCommitted(record, objectRecords) {
      const existing = transactions.find(
        (candidate) => candidate.transactionId === record.transactionId,
      );
      if (!existing || existing.status !== "pending") {
        throw new Error("not pending");
      }
      // Atomic: object records and the committed flip land together.
      transactions = transactions.map((candidate) =>
        candidate.transactionId === record.transactionId ? { ...record } : candidate,
      );
      records = [...records, ...objectRecords.map((record) => ({ ...record }))];
    },
    async removeTransaction(transactionId) {
      transactions = transactions.filter(
        (candidate) => candidate.transactionId !== transactionId,
      );
      records = records.filter(
        (candidate) => candidate.transactionId !== transactionId,
      );
    },
  };
  return index;
}

async function makeDeps(
  overrides?: Partial<ProjectObjectCoreDeps>,
): Promise<{ deps: ProjectObjectCoreDeps; opfs: FakeOpfs; index: FakeIndex }> {
  const key = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const opfs = createFakeOpfs();
  const index = createFakeIndex();
  const deps: ProjectObjectCoreDeps = Object.freeze({
    key,
    opfs,
    index,
    ...overrides,
  });
  return { deps, opfs, index };
}

describe("local-storage project object transaction core", () => {
  it("commits sealed objects to OPFS and returns plaintext on open", async () => {
    const { deps, opfs, index } = await makeDeps();
    const result = await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [
        { objectId: "dataset-v1", plaintext: encode("alpha") },
        { objectId: "story-v2", plaintext: encode("beta") },
      ],
    });
    expect(result).toEqual({
      transactionId: "tx-1",
      objectIds: ["dataset-v1", "story-v2"],
    });
    expect(index.state().transactions).toEqual([
      { transactionId: "tx-1", status: "committed", createdAt: expect.any(String) },
    ]);
    expect(PROJECT_OBJECT_AAD_KIND).toBe("project-object");
    const records = index.state().records;
    expect(records).toHaveLength(2);
    for (const record of records) {
      const stored = requireBytes(
        opfs.files.get(`${record.transactionId}/${record.objectId}`),
      );
      expect(stored.byteLength).toBe(record.ciphertextLength);
      expect(decode(stored)).not.toContain("alpha");
    }
    expect(decode(await openProjectObject(deps, "dataset-v1"))).toBe("alpha");
    expect(decode(await openProjectObject(deps, "story-v2"))).toBe("beta");
    expect(await listCommittedObjectIds(deps)).toEqual(["dataset-v1", "story-v2"]);
  });

  it("rejects duplicate object ids within one commit", async () => {
    const { deps } = await makeDeps();
    await expect(
      commitProjectObjects(deps, {
        transactionId: "tx-dup",
        objects: [
          { objectId: "a", plaintext: encode("a") },
          { objectId: "a", plaintext: encode("a") },
        ],
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
      details: { reason: "duplicate-object-id" },
    });
  });

  it("rejects invalid identifiers", async () => {
    const { deps } = await makeDeps();
    for (const objectId of ["a/b", "..", ".", "", "x".repeat(129)]) {
      await expect(
        commitProjectObjects(deps, {
          transactionId: "tx-ok",
          objects: [{ objectId, plaintext: encode("x") }],
        }),
      ).rejects.toMatchObject({
        code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
        details: { reason: "invalid-identifier" },
      });
    }
    await expect(
      commitProjectObjects(deps, {
        transactionId: "bad/id",
        objects: [{ objectId: "a", plaintext: encode("x") }],
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
      details: { reason: "invalid-identifier" },
    });
  });

  it("rejects non-Uint8Array plaintext so raw file Blobs never become objects", async () => {
    const { deps } = await makeDeps();
    const cases: unknown[] = [
      "raw text",
      new ArrayBuffer(4),
      new Blob(["blob"]),
      { size: 1, type: "text/plain" },
    ];
    for (const plaintext of cases) {
      await expect(
        commitProjectObjects(deps, {
          transactionId: "tx-type",
          objects: [{ objectId: "a", plaintext: plaintext as Uint8Array }],
        }),
      ).rejects.toMatchObject({
        code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
        details: { reason: "type" },
      });
    }
  });

  it("rejects an empty object list", async () => {
    const { deps } = await makeDeps();
    await expect(
      commitProjectObjects(deps, { transactionId: "tx-empty", objects: [] }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
    });
  });

  it("enforces the backup payload bound before any write", async () => {
    const { deps, index } = await makeDeps({
      payloadLimitBytes: 1024 * 1024 + 100,
    });
    await commitProjectObjects(deps, {
      transactionId: "tx-under",
      objects: [{ objectId: "small", plaintext: new Uint8Array(50) }],
    });
    await expect(
      commitProjectObjects(deps, {
        transactionId: "tx-over",
        objects: [{ objectId: "large", plaintext: new Uint8Array(150) }],
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.capacityExceeded,
      details: { reason: "backup-payload-exceeded" },
    });
    expect(index.state().transactions).toHaveLength(1);
  });

  it("rejects when the projected stored bytes exceed the browser quota", async () => {
    const { deps, index } = await makeDeps({ quotaBytes: 1000 });
    await expect(
      commitProjectObjects(deps, {
        transactionId: "tx-quota",
        objects: [{ objectId: "a", plaintext: encode("x") }],
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.capacityExceeded,
      details: { reason: "quota-exceeded" },
    });
    expect(index.state().transactions).toEqual([]);
  });

  it("rolls back a pending transaction on recovery (crash before index commit)", async () => {
    const { deps, opfs, index } = await makeDeps();
    await commitProjectObjects(deps, {
      transactionId: "tx-base",
      objects: [{ objectId: "base", plaintext: encode("keep") }],
    });
    await index.beginPending({
      transactionId: "tx-crash",
      status: "pending",
      createdAt: "2026-08-06T00:00:00.000Z",
    });
    await opfs.writeObjectFile("tx-crash", "staged", encode("staged"));
    const result = await recoverProjectObjects(deps);
    expect(result.rolledBackTransactionIds).toEqual(["tx-crash"]);
    expect(result.verifiedCommittedTransactionIds).toEqual(["tx-base"]);
    expect(index.state().transactions).toEqual([
      expect.objectContaining({ transactionId: "tx-base", status: "committed" }),
    ]);
    expect(opfs.directories.has("tx-crash")).toBe(false);
    expect(opfs.files.has("tx-crash/staged")).toBe(false);
    expect(decode(await openProjectObject(deps, "base"))).toBe("keep");
  });

  it("removes orphan staging directories that have no transaction record", async () => {
    const { deps, opfs } = await makeDeps();
    opfs.directories.add("ghost");
    opfs.setFile("ghost", "obj", encode("x"));
    const result = await recoverProjectObjects(deps);
    expect(result.removedOrphanTransactionIds).toEqual(["ghost"]);
    expect(result.rolledBackTransactionIds).toEqual([]);
    expect(opfs.directories.has("ghost")).toBe(false);
  });

  it("rolls back an incomplete committed transaction and keeps the last-consistent index", async () => {
    const { deps, opfs, index } = await makeDeps();
    await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("a") }],
    });
    await commitProjectObjects(deps, {
      transactionId: "tx-2",
      objects: [
        { objectId: "b", plaintext: encode("b") },
        { objectId: "c", plaintext: encode("c") },
      ],
    });
    opfs.files.delete("tx-2/b");
    const result = await recoverProjectObjects(deps);
    expect(result.rolledBackTransactionIds).toEqual(["tx-2"]);
    expect(result.verifiedCommittedTransactionIds).toEqual(["tx-1"]);
    expect(index.state().transactions).toHaveLength(1);
    expect(await listCommittedObjectIds(deps)).toEqual(["a"]);
    expect(decode(await openProjectObject(deps, "a"))).toBe("a");
    await expect(openProjectObject(deps, "b")).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.objectNotFound,
    });
  });

  it("is idempotent across repeated recovery runs", async () => {
    const { deps } = await makeDeps();
    await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("a") }],
    });
    const first = await recoverProjectObjects(deps);
    const second = await recoverProjectObjects(deps);
    expect(first).toEqual({
      rolledBackTransactionIds: [],
      removedOrphanTransactionIds: [],
      verifiedCommittedTransactionIds: ["tx-1"],
    });
    expect(second).toEqual(first);
  });

  it("surfaces STORAGE_OBJECT_NOT_FOUND for unknown object ids", async () => {
    const { deps } = await makeDeps();
    await expect(openProjectObject(deps, "missing")).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.objectNotFound,
      details: { reason: "not-found" },
    });
  });

  it("rejects tampered OPFS ciphertext with an authentication failure", async () => {
    const { deps, opfs } = await makeDeps();
    await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("secret") }],
    });
    const tampered = new Uint8Array(requireBytes(opfs.files.get("tx-1/a")));
    tampered[0] = tampered[0] ^ 0xff;
    opfs.setFile("tx-1", "a", tampered);
    await expect(openProjectObject(deps, "a")).rejects.toMatchObject({
      code: CRYPTO_ERROR_CODES.authenticationFailed,
    });
  });

  it("rejects a committed object whose OPFS file has the wrong length", async () => {
    const { deps, opfs } = await makeDeps();
    await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("secret") }],
    });
    opfs.setFile("tx-1", "a", new Uint8Array([1, 2, 3]));
    await expect(openProjectObject(deps, "a")).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.unavailable,
      details: { reason: "object-file-missing" },
    });
  });

  it("rejects a committed object whose plaintext hash does not match the index", async () => {
    const { deps, index } = await makeDeps();
    await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("secret") }],
    });
    index.setRecordSha256("tx-1", "a", "0".repeat(64));
    await expect(openProjectObject(deps, "a")).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.unavailable,
      details: { reason: "integrity-mismatch" },
    });
  });

  it("leaves a pending transaction for recovery when an OPFS write fails", async () => {
    const { deps, opfs, index } = await makeDeps();
    opfs.failWrites.add("tx-2/obj-b");
    await expect(
      commitProjectObjects(deps, {
        transactionId: "tx-2",
        objects: [
          { objectId: "obj-a", plaintext: encode("a") },
          { objectId: "obj-b", plaintext: encode("b") },
        ],
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.writeFailed,
      details: { reason: "opfs-write" },
    });
    expect(index.state().transactions).toEqual([
      expect.objectContaining({ transactionId: "tx-2", status: "pending" }),
    ]);
    const result = await recoverProjectObjects(deps);
    expect(result.rolledBackTransactionIds).toEqual(["tx-2"]);
    expect(index.state().transactions).toEqual([]);
  });

  it("is idempotent when the same transaction id is committed twice", async () => {
    const { deps, index } = await makeDeps();
    const first = await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("a") }],
    });
    const second = await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("a") }],
    });
    expect(second).toEqual(first);
    expect(index.state().records).toHaveLength(1);
    expect(index.state().transactions).toEqual([
      expect.objectContaining({ transactionId: "tx-1", status: "committed" }),
    ]);
  });

  it("rejects reusing a committed transaction id with different objects", async () => {
    const { deps } = await makeDeps();
    await commitProjectObjects(deps, {
      transactionId: "tx-1",
      objects: [{ objectId: "a", plaintext: encode("a") }],
    });
    await expect(
      commitProjectObjects(deps, {
        transactionId: "tx-1",
        objects: [{ objectId: "z", plaintext: encode("z") }],
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
      details: { reason: "duplicate-transaction-id" },
    });
  });

  it("generates a transaction id when none is supplied", async () => {
    const { deps } = await makeDeps();
    const result = await commitProjectObjects(deps, {
      objects: [{ objectId: "a", plaintext: encode("a") }],
    });
    expect(result.transactionId.length).toBeGreaterThan(0);
    expect(result.objectIds).toEqual(["a"]);
  });
});