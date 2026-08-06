import {
  openCommitIndexStore,
  type CommitIndexStore,
  type ProjectObjectRecord,
  type TransactionRecord,
} from "./commit-index.js";
import { openDeviceBound, sealDeviceBound } from "./device-key.js";
import {
  createCapacityExceededError,
  createInvalidArgumentError,
  createObjectNotFoundError,
  createStorageUnavailableError,
} from "./errors.js";
import {
  openOpfsObjectStore,
  PROJECT_OBJECT_FILE_SUFFIX,
  type OpfsObjectStore,
} from "./opfs.js";
import {
  PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES,
  assertWriteCapacityAllowed,
  computeBackupPayloadBytes,
  evaluateWriteCapacity,
} from "./quota.js";

/** AAD marker bound into every project object seal. */
export const PROJECT_OBJECT_AAD_KIND = "project-object";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Derives the OPFS path recorded in the commit index for an object. */
export function projectObjectPath(transactionId: string, objectId: string): string {
  return `transactions/${transactionId}/${objectId}${PROJECT_OBJECT_FILE_SUFFIX}`;
}

export type ProjectObjectInput = Readonly<{
  /** Logical object id (dataset version, story blueprint, resource...). */
  objectId: string;
  /**
   * Plaintext payload. Only sealed ciphertext is ever written to OPFS;
   * original file Blobs, strings and ArrayBuffers are rejected so raw files
   * can never become project objects (FR-IMP-005).
   */
  plaintext: Uint8Array;
}>;

export type CommitProjectObjectsInput = Readonly<{
  objects: readonly ProjectObjectInput[];
  /** Optional explicit id; a fresh UUID is generated when omitted. */
  transactionId?: string;
}>;

export type CommitProjectObjectsResult = Readonly<{
  transactionId: string;
  objectIds: readonly string[];
}>;

export type RecoveryResult = Readonly<{
  /** Transactions rolled back (pending or incomplete committed). */
  rolledBackTransactionIds: readonly string[];
  /** Staging directories with no matching transaction record, removed. */
  removedOrphanTransactionIds: readonly string[];
  /** Committed transactions whose object files all verified. */
  verifiedCommittedTransactionIds: readonly string[];
}>;

export type ProjectObjectCoreDeps = Readonly<{
  key: CryptoKey;
  opfs: OpfsObjectStore;
  index: CommitIndexStore;
  /** Optional browser quota; absent skips the quota check. */
  quotaBytes?: number;
  /** Existing project payload bytes to fold into the capacity check. */
  currentPayloadBytes?: number;
  /** Injectable payload bound; defaults to the pinned 4 GiB limit. */
  payloadLimitBytes?: number;
}>;

export type OpenProjectObjectStoreInput = Readonly<{
  key: CryptoKey;
  quotaBytes?: number;
  currentPayloadBytes?: number;
}>;

export type ProjectObjectStore = Readonly<{
  commitProjectObjects(input: CommitProjectObjectsInput): Promise<CommitProjectObjectsResult>;
  openProjectObject(objectId: string): Promise<Uint8Array>;
  recoverProjectObjects(): Promise<RecoveryResult>;
  listCommittedObjectIds(): Promise<readonly string[]>;
}>;

function assertIdentifier(value: unknown, label: "transactionId" | "objectId"): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    !SAFE_ID.test(value)
  ) {
    throw createInvalidArgumentError("invalid-identifier");
  }
}

function assertPlaintextBytes(value: unknown): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw createInvalidArgumentError("type");
  }
}

/**
 * OPFS write-first, IndexedDB index write-after commit. Every object is
 * sealed with the device-bound key, staged under its transaction directory,
 * and only then published to the commit index in one atomic IDB transaction.
 * A failure at any point leaves only a pending transaction and OPFS staging
 * files, never a partial committed index; recoverProjectObjects() rolls
 * those back without touching the last consistent committed state.
 */
export async function commitProjectObjects(
  deps: ProjectObjectCoreDeps,
  input: CommitProjectObjectsInput,
): Promise<CommitProjectObjectsResult> {
  const transactionId = input.transactionId ?? globalThis.crypto.randomUUID();
  assertIdentifier(transactionId, "transactionId");
  if (!Array.isArray(input.objects) || input.objects.length === 0) {
    throw createInvalidArgumentError("type");
  }

  const objectIds: string[] = [];
  const seen = new Set<string>();
  const parts: ReadonlyArray<{ byteLength: number }> = input.objects.map((object) => {
    assertIdentifier(object.objectId, "objectId");
    assertPlaintextBytes(object.plaintext);
    if (seen.has(object.objectId)) {
      throw createInvalidArgumentError("duplicate-object-id");
    }
    seen.add(object.objectId);
    objectIds.push(object.objectId);
    return { byteLength: object.plaintext.byteLength };
  });

  // M0-051 double estimation before any allocation or OPFS write.
  const payloadLimitBytes = deps.payloadLimitBytes ?? PROJECT_BACKUP_PAYLOAD_LIMIT_BYTES;
  const projectedPayloadBytes = computeBackupPayloadBytes(parts);
  if (projectedPayloadBytes > payloadLimitBytes) {
    throw createCapacityExceededError("backup-payload-exceeded");
  }
  if (deps.quotaBytes !== undefined) {
    assertWriteCapacityAllowed(
      evaluateWriteCapacity({
        currentPayloadBytes: deps.currentPayloadBytes ?? 0,
        addedBytes: projectedPayloadBytes,
        availableQuotaBytes: deps.quotaBytes,
      }),
    );
  }

  const existingCommitted = await findCommittedTransaction(
    deps,
    transactionId,
    seen,
  );
  if (existingCommitted) {
    return Object.freeze({ transactionId, objectIds: Object.freeze(objectIds) });
  }

  const createdAt = new Date().toISOString();
  const pendingRecord: TransactionRecord = Object.freeze({
    transactionId,
    status: "pending",
    createdAt,
  });
  await deps.index.beginPending(pendingRecord);

  const records: ProjectObjectRecord[] = [];
  try {
    for (const object of input.objects) {
      const plaintextSha256 = await sha256Hex(object.plaintext);
      const sealed = await sealDeviceBound({
        key: deps.key,
        plaintext: object.plaintext,
        fields: { kind: PROJECT_OBJECT_AAD_KIND, objectId: object.objectId },
      });
      await deps.opfs.writeObjectFile(
        transactionId,
        object.objectId,
        sealed.ciphertext,
      );
      records.push(
        Object.freeze({
          objectId: object.objectId,
          transactionId,
          opfsPath: projectObjectPath(transactionId, object.objectId),
          ciphertextLength: sealed.ciphertext.byteLength,
          plaintextSize: object.plaintext.byteLength,
          plaintextSha256,
          nonce: sealed.nonce,
          tag: sealed.tag,
        }),
      );
    }
    await deps.index.markCommitted(
      Object.freeze({ ...pendingRecord, status: "committed" }),
      records,
    );
  } catch (error) {
    // Never touch the last committed index here; recovery handles the
    // pending transaction and its OPFS staging files.
    throw error;
  }

  return Object.freeze({ transactionId, objectIds: Object.freeze(objectIds) });
}

/** Opens a committed project object; integrity failures throw. */
export async function openProjectObject(
  deps: ProjectObjectCoreDeps,
  objectId: string,
): Promise<Uint8Array> {
  assertIdentifier(objectId, "objectId");
  const records = await deps.index.listAllObjectRecords();
  const record = records.find((candidate) => candidate.objectId === objectId);
  if (!record) {
    throw createObjectNotFoundError();
  }
  const ciphertext = await deps.opfs.readObjectFile(
    record.transactionId,
    record.objectId,
  );
  if (ciphertext === undefined || ciphertext.byteLength !== record.ciphertextLength) {
    throw createStorageUnavailableError("object-file-missing");
  }
  const plaintext = await openDeviceBound({
    key: deps.key,
    nonce: record.nonce,
    ciphertext,
    tag: record.tag,
    fields: { kind: PROJECT_OBJECT_AAD_KIND, objectId: record.objectId },
  });
  const digest = await sha256Hex(plaintext);
  if (digest !== record.plaintextSha256) {
    throw createStorageUnavailableError("integrity-mismatch");
  }
  return plaintext;
}

/**
 * Crash recovery. Pending transactions and incomplete committed transactions
 * are rolled back (index records removed) so the remaining index is exactly
 * the set of objects whose OPFS files exist; orphan staging directories are
 * removed. Idempotent: a second run is a no-op.
 */
export async function recoverProjectObjects(
  deps: ProjectObjectCoreDeps,
): Promise<RecoveryResult> {
  const transactions = await deps.index.listTransactionRecords();
  const knownTransactionIds = new Set(
    transactions.map((transaction) => transaction.transactionId),
  );
  const rolledBack: string[] = [];
  const verified: string[] = [];

  for (const transaction of transactions) {
    if (transaction.status === "pending") {
      await deps.opfs.deleteTransactionDirectory(transaction.transactionId);
      await deps.index.removeTransaction(transaction.transactionId);
      rolledBack.push(transaction.transactionId);
      continue;
    }
    const records = await deps.index.listObjectRecords(transaction.transactionId);
    let complete = true;
    for (const record of records) {
      const bytes = await deps.opfs.readObjectFile(
        record.transactionId,
        record.objectId,
      );
      if (bytes === undefined || bytes.byteLength !== record.ciphertextLength) {
        complete = false;
        break;
      }
    }
    if (!complete) {
      await deps.opfs.deleteTransactionDirectory(transaction.transactionId);
      await deps.index.removeTransaction(transaction.transactionId);
      rolledBack.push(transaction.transactionId);
    } else {
      verified.push(transaction.transactionId);
    }
  }

  const orphans: string[] = [];
  for (const directory of await deps.opfs.listTransactionDirectories()) {
    if (!knownTransactionIds.has(directory)) {
      await deps.opfs.deleteTransactionDirectory(directory);
      orphans.push(directory);
    }
  }

  return Object.freeze({
    rolledBackTransactionIds: Object.freeze(rolledBack),
    removedOrphanTransactionIds: Object.freeze(orphans),
    verifiedCommittedTransactionIds: Object.freeze(verified),
  });
}

/** Lists object ids visible in the committed index. */
export async function listCommittedObjectIds(
  deps: ProjectObjectCoreDeps,
): Promise<readonly string[]> {
  const records = await deps.index.listAllObjectRecords();
  return Object.freeze(records.map((record) => record.objectId));
}

/**
 * Wires the real OPFS and IndexedDB seams into a store instance with
 * serialized commit/recovery (browser only; Node tests inject fakes into the
 * core functions directly).
 */
export async function openProjectObjectStore(
  input: OpenProjectObjectStoreInput,
): Promise<ProjectObjectStore> {
  const opfs = await openOpfsObjectStore();
  const index = await openCommitIndexStore();
  const deps: ProjectObjectCoreDeps = Object.freeze({
    key: input.key,
    opfs,
    index,
    ...(input.quotaBytes === undefined ? {} : { quotaBytes: input.quotaBytes }),
    ...(input.currentPayloadBytes === undefined
      ? {}
      : { currentPayloadBytes: input.currentPayloadBytes }),
  });
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return Object.freeze({
    commitProjectObjects: (commitInput) =>
      serialized(() => commitProjectObjects(deps, commitInput)),
    openProjectObject: (objectId) => openProjectObject(deps, objectId),
    recoverProjectObjects: () => serialized(() => recoverProjectObjects(deps)),
    listCommittedObjectIds: () => listCommittedObjectIds(deps),
  });
}

/**
 * Returns the committed transaction with the same id when it already covers
 * exactly the requested object ids, so a retried commit is a no-op instead of
 * downgrading a committed transaction back to pending.
 */
async function findCommittedTransaction(
  deps: ProjectObjectCoreDeps,
  transactionId: string,
  requestedObjectIds: ReadonlySet<string>,
): Promise<TransactionRecord | undefined> {
  const transactions = await deps.index.listTransactionRecords();
  const committed = transactions.find(
    (transaction) =>
      transaction.transactionId === transactionId &&
      transaction.status === "committed",
  );
  if (!committed) {
    return undefined;
  }
  const existingRecords = await deps.index.listObjectRecords(transactionId);
  const existingIds = new Set(existingRecords.map((record) => record.objectId));
  if (
    existingIds.size === requestedObjectIds.size &&
    [...requestedObjectIds].every((objectId) => existingIds.has(objectId))
  ) {
    return committed;
  }
  throw createInvalidArgumentError("duplicate-transaction-id");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw createStorageUnavailableError("read-failed");
  }
  const digest = await subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}