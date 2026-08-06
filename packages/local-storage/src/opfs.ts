import {
  createInvalidArgumentError,
  createStorageUnavailableError,
  createStorageWriteFailedError,
} from "./errors.js";

/** Root directory holding all project object ciphertext under OPFS. */
export const PROJECT_OBJECTS_ROOT_DIR = "datapulse-project-objects";

/** Per-transaction directory name inside the root. */
export const PROJECT_OBJECTS_TRANSACTIONS_DIR = "transactions";

/** Suffix for sealed project object files. */
export const PROJECT_OBJECT_FILE_SUFFIX = ".v1.seal";

/**
 * Browser seam over Origin Private File System. The core transaction logic
 * never touches OPFS APIs directly; it talks to this bounded interface so
 * crash points and recovery can be exercised deterministically in Node with
 * an in-memory fake.
 */
export type OpfsObjectStore = Readonly<{
  /** Writes raw sealed bytes; overwrites any existing file. */
  writeObjectFile(transactionId: string, objectId: string, bytes: Uint8Array): Promise<void>;
  /** Reads raw sealed bytes; resolves undefined when the file is missing. */
  readObjectFile(transactionId: string, objectId: string): Promise<Uint8Array | undefined>;
  /** Deletes a single object file; missing files are ignored. */
  deleteObjectFile(transactionId: string, objectId: string): Promise<void>;
  /** Deletes the whole per-transaction directory tree; idempotent. */
  deleteTransactionDirectory(transactionId: string): Promise<void>;
  /** Lists existing per-transaction directory names. */
  listTransactionDirectories(): Promise<readonly string[]>;
}>;

const SAFE_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertSafeComponent(value: string, label: "transactionId" | "objectId"): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    !SAFE_COMPONENT.test(value)
  ) {
    throw createInvalidArgumentError("invalid-identifier");
  }
}

function fileName(objectId: string): string {
  return objectId + PROJECT_OBJECT_FILE_SUFFIX;
}

function isLocalStorageError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    String((error as { code: unknown }).code).startsWith("STORAGE_")
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "NotFoundError"
  );
}

/**
 * Opens the OPFS-backed object store. Throws STORAGE_UNAVAILABLE when OPFS is
 * unavailable in the current context (e.g. Node, non-secure origin).
 */
export async function openOpfsObjectStore(): Promise<OpfsObjectStore> {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.getDirectory !== "function") {
    throw createStorageUnavailableError("opfs-missing");
  }
  let root: FileSystemDirectoryHandle;
  try {
    root = await storage.getDirectory();
    const base = await root.getDirectoryHandle(PROJECT_OBJECTS_ROOT_DIR, { create: true });
    await base.getDirectoryHandle(PROJECT_OBJECTS_TRANSACTIONS_DIR, { create: true });
  } catch (error) {
    if (isLocalStorageError(error)) {
      throw error;
    }
    throw createStorageUnavailableError("open-failed");
  }

  async function transactionsDirectory(): Promise<FileSystemDirectoryHandle> {
    const base = await root.getDirectoryHandle(PROJECT_OBJECTS_ROOT_DIR);
    return base.getDirectoryHandle(PROJECT_OBJECTS_TRANSACTIONS_DIR);
  }

  async function transactionDirectory(
    transactionId: string,
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    const transactions = await transactionsDirectory();
    return transactions.getDirectoryHandle(transactionId, { create });
  }

  return Object.freeze({
    async writeObjectFile(transactionId, objectId, bytes) {
      assertSafeComponent(transactionId, "transactionId");
      assertSafeComponent(objectId, "objectId");
      if (!(bytes instanceof Uint8Array)) {
        throw createInvalidArgumentError("type");
      }
      try {
        const dir = await transactionDirectory(transactionId, true);
        const handle = await dir.getFileHandle(fileName(objectId), { create: true });
        const writable = await handle.createWritable();
        await writable.write(new Uint8Array(bytes));
        await writable.close();
      } catch (error) {
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageWriteFailedError("opfs-write");
      }
    },

    async readObjectFile(transactionId, objectId) {
      assertSafeComponent(transactionId, "transactionId");
      assertSafeComponent(objectId, "objectId");
      try {
        const dir = await transactionDirectory(transactionId, false);
        const handle = await dir.getFileHandle(fileName(objectId));
        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageUnavailableError("read-failed");
      }
    },

    async deleteObjectFile(transactionId, objectId) {
      assertSafeComponent(transactionId, "transactionId");
      assertSafeComponent(objectId, "objectId");
      try {
        const dir = await transactionDirectory(transactionId, false);
        await dir.removeEntry(fileName(objectId));
      } catch (error) {
        if (isNotFound(error)) {
          return;
        }
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageUnavailableError("delete-failed");
      }
    },

    async deleteTransactionDirectory(transactionId) {
      assertSafeComponent(transactionId, "transactionId");
      try {
        const transactions = await transactionsDirectory();
        await transactions.removeEntry(transactionId, { recursive: true });
      } catch (error) {
        if (isNotFound(error)) {
          return;
        }
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageUnavailableError("delete-failed");
      }
    },

    async listTransactionDirectories() {
      try {
        const transactions = await transactionsDirectory();
        const names: string[] = [];
        for await (const [name] of transactions.entries()) {
          names.push(name);
        }
        return Object.freeze(names);
      } catch (error) {
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageUnavailableError("read-failed");
      }
    },
  });
}