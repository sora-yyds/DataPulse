import {
  createStorageUnavailableError,
  createStorageWriteFailedError,
} from "./errors.js";

export const PROJECT_INDEX_DB_NAME = "datapulse-project-index";
export const PROJECT_INDEX_DB_VERSION = 1;
export const PROJECT_TRANSACTIONS_STORE = "transactions";
export const PROJECT_OBJECTS_STORE = "project-objects";
export const PROJECT_OBJECTS_BY_TRANSACTION_INDEX = "by-transaction";

export type TransactionRecord = Readonly<{
  transactionId: string;
  status: "pending" | "committed";
  createdAt: string;
}>;

export type ProjectObjectRecord = Readonly<{
  objectId: string;
  transactionId: string;
  opfsPath: string;
  ciphertextLength: number;
  plaintextSize: number;
  plaintextSha256: string;
  nonce: Uint8Array;
  tag: Uint8Array;
}>;

/**
 * IndexedDB seam for the project object commit index. IndexedDB is the
 * commit point: object records are only ever visible to readers after
 * markCommitted() flips the owning transaction to "committed" in the same
 * IDB transaction, so a crash before that leaves only OPFS staging files.
 */
export type CommitIndexStore = Readonly<{
  listTransactionRecords(): Promise<readonly TransactionRecord[]>;
  listObjectRecords(transactionId: string): Promise<readonly ProjectObjectRecord[]>;
  listAllObjectRecords(): Promise<readonly ProjectObjectRecord[]>;
  /** Registers a pending transaction before any OPFS write. */
  beginPending(record: TransactionRecord): Promise<void>;
  /** Atomic: writes object records AND flips the transaction to committed. */
  markCommitted(
    record: TransactionRecord,
    objectRecords: readonly ProjectObjectRecord[],
  ): Promise<void>;
  /** Removes the transaction and all of its object records; idempotent. */
  removeTransaction(transactionId: string): Promise<void>;
}>;

let databasePromise: Promise<IDBDatabase> | undefined;

/** Opens the project index database. Throws STORAGE_UNAVAILABLE when missing. */
export async function openCommitIndexStore(): Promise<CommitIndexStore> {
  const db = await openProjectIndexDatabase();

  return Object.freeze({
    async listTransactionRecords() {
      return runRequest(
        PROJECT_TRANSACTIONS_STORE,
        "readonly",
        (store) => store.getAll() as IDBRequest<unknown>,
        db,
        "read-failed",
      ).then((records) =>
        Object.freeze(
          (records as TransactionRecord[]).map((record) => Object.freeze(record)),
        ),
      );
    },

    async listObjectRecords(transactionId) {
      return runRequest(
        PROJECT_OBJECTS_STORE,
        "readonly",
        (store) => store.index(PROJECT_OBJECTS_BY_TRANSACTION_INDEX).getAll(transactionId) as IDBRequest<unknown>,
        db,
        "read-failed",
      ).then((records) =>
        Object.freeze(
          (records as ProjectObjectRecord[]).map((record) => Object.freeze(record)),
        ),
      );
    },

    async listAllObjectRecords() {
      return runRequest(
        PROJECT_OBJECTS_STORE,
        "readonly",
        (store) => store.getAll() as IDBRequest<unknown>,
        db,
        "read-failed",
      ).then((records) =>
        Object.freeze(
          (records as ProjectObjectRecord[]).map((record) => Object.freeze(record)),
        ),
      );
    },

    async beginPending(record) {
      if (
        record.status !== "pending" ||
        typeof record.transactionId !== "string" ||
        record.transactionId.length === 0
      ) {
        throw new Error("invalid pending transaction record");
      }
      try {
        await runReadWriteTransaction(db, (transactions, objects) => {
          transactions.put(record);
          void objects;
        });
      } catch (error) {
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageWriteFailedError("indexeddb-commit");
      }
    },

    async markCommitted(record, objectRecords) {
      if (
        record.status !== "committed" ||
        typeof record.transactionId !== "string" ||
        record.transactionId.length === 0
      ) {
        throw new Error("invalid committed transaction record");
      }
      try {
        await runReadWriteTransaction(db, (transactions, objects) => {
          for (const objectRecord of objectRecords) {
            objects.put(objectRecord);
          }
          transactions.put(record);
        });
      } catch (error) {
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageWriteFailedError("indexeddb-commit");
      }
    },

    async removeTransaction(transactionId) {
      try {
        await runReadWriteTransaction(db, (transactions, objects) => {
          transactions.delete(transactionId);
          const index = objects.index(PROJECT_OBJECTS_BY_TRANSACTION_INDEX);
          const cursorRequest = index.openKeyCursor(transactionId);
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
              return;
            }
            objects.delete(cursor.primaryKey);
            cursor.continue();
          };
        });
      } catch (error) {
        if (isLocalStorageError(error)) {
          throw error;
        }
        throw createStorageUnavailableError("delete-failed");
      }
    },
  });
}

function openProjectIndexDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }
  const idb = globalThis.indexedDB;
  if (!idb) {
    throw createStorageUnavailableError("indexeddb-missing");
  }
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(PROJECT_INDEX_DB_NAME, PROJECT_INDEX_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_TRANSACTIONS_STORE)) {
        db.createObjectStore(PROJECT_TRANSACTIONS_STORE, { keyPath: "transactionId" });
      }
      if (!db.objectStoreNames.contains(PROJECT_OBJECTS_STORE)) {
        const objects = db.createObjectStore(PROJECT_OBJECTS_STORE, { keyPath: "objectId" });
        objects.createIndex(
          PROJECT_OBJECTS_BY_TRANSACTION_INDEX,
          "transactionId",
          { unique: false },
        );
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      db.onclose = () => {
        databasePromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(createStorageUnavailableError("open-failed"));
    };
  });
  return databasePromise;
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<unknown>,
  db: IDBDatabase,
  failureReason: "read-failed" | "delete-failed",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(createStorageUnavailableError(failureReason));
    } catch {
      reject(createStorageUnavailableError(failureReason));
    }
  });
}

function runReadWriteTransaction(
  db: IDBDatabase,
  operation: (
    transactions: IDBObjectStore,
    objects: IDBObjectStore,
  ) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const transaction = db.transaction(
        [PROJECT_TRANSACTIONS_STORE, PROJECT_OBJECTS_STORE],
        "readwrite",
      );
      operation(
        transaction.objectStore(PROJECT_TRANSACTIONS_STORE),
        transaction.objectStore(PROJECT_OBJECTS_STORE),
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(createStorageWriteFailedError("indexeddb-commit"));
      transaction.onabort = () =>
        reject(createStorageWriteFailedError("indexeddb-commit"));
    } catch {
      reject(createStorageWriteFailedError("indexeddb-commit"));
    }
  });
}

function isLocalStorageError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    String((error as { code: unknown }).code).startsWith("STORAGE_")
  );
}