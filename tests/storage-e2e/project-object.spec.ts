import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "playwright/test";
import { createServer, type ViteDevServer } from "vite";

const fixtureRoot = fileURLToPath(new URL("../storage-fixture/", import.meta.url));
const localStorageSource = fileURLToPath(
  new URL("../../packages/local-storage/src/index.ts", import.meta.url),
);
const cryptoSources = fileURLToPath(new URL("../../packages/crypto/src/index.ts", import.meta.url));

type ProjectObjectApi = {
  ensureDeviceKey: () => Promise<{ key: CryptoKey; persisted: boolean }>;
  requireStoredDeviceKey: () => Promise<CryptoKey>;
  openProjectObjectStore: (input: {
    key: CryptoKey;
  }) => Promise<{
    commitProjectObjects: (input: {
      transactionId?: string;
      objects: { objectId: string; plaintext: Uint8Array }[];
    }) => Promise<{ transactionId: string; objectIds: string[] }>;
    openProjectObject: (objectId: string) => Promise<Uint8Array>;
    recoverProjectObjects: () => Promise<{
      rolledBackTransactionIds: string[];
      removedOrphanTransactionIds: string[];
      verifiedCommittedTransactionIds: string[];
    }>;
    listCommittedObjectIds: () => Promise<string[]>;
  }>;
  openOpfsObjectStore: () => Promise<{
    writeObjectFile: (transactionId: string, objectId: string, bytes: Uint8Array) => Promise<void>;
    readObjectFile: (transactionId: string, objectId: string) => Promise<Uint8Array | undefined>;
    deleteObjectFile: (transactionId: string, objectId: string) => Promise<void>;
  }>;
  openCommitIndexStore: () => Promise<{
    beginPending: (record: {
      transactionId: string;
      status: "pending";
      createdAt: string;
    }) => Promise<void>;
    listTransactionRecords: () => Promise<
      { transactionId: string; status: string }[]
    >;
    listAllObjectRecords: () => Promise<
      { objectId: string; transactionId: string; ciphertextLength: number }[]
    >;
  }>;
};

let server: ViteDevServer | undefined;
let baseUrl = "";

test.beforeAll(async () => {
  server = await createServer({
    root: fixtureRoot,
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] },
    },
    resolve: {
      alias: [
        { find: "@datapulse/local-storage", replacement: localStorageSource },
        { find: "@datapulse/crypto", replacement: cryptoSources },
      ],
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    throw new Error("vite dev server address is unavailable");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server?.close();
});

async function openFixture(page: Page): Promise<void> {
  await page.goto(baseUrl + "/");
  await page.waitForFunction(
    () => (window as { __dpStorage?: unknown }).__dpStorage !== undefined,
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

test.describe("project object transaction core in real Chromium", () => {
  test("commits sealed objects into OPFS and opens them back", async ({ page }) => {
    await openFixture(page);

    const result = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: ProjectObjectApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      const store = await storage.openProjectObjectStore({ key: handle.key });
      const commit = await store.commitProjectObjects({
        transactionId: "tx-browser-1",
        objects: [
          { objectId: "dataset-v1", plaintext: new TextEncoder().encode("alpha-secret") },
          { objectId: "story-v1", plaintext: new TextEncoder().encode("beta-secret") },
        ],
      });
      const ids = await store.listCommittedObjectIds();
      const opfs = await storage.openOpfsObjectStore();
      const index = await storage.openCommitIndexStore();
      const records = await index.listAllObjectRecords();
      const stored = await opfs.readObjectFile("tx-browser-1", "dataset-v1");
      const toBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        for (const byte of bytes) {
          binary += String.fromCharCode(byte);
        }
        return btoa(binary);
      };
      const openedA = new TextDecoder().decode(
        await store.openProjectObject("dataset-v1"),
      );
      const openedB = new TextDecoder().decode(
        await store.openProjectObject("story-v1"),
      );
      return {
        commit,
        ids,
        recordCount: records.length,
        storedLength: stored?.byteLength ?? 0,
        storedBase64: stored ? toBase64(stored) : "",
        plaintextBase64: toBase64(new TextEncoder().encode("alpha-secret")),
        openedA,
        openedB,
        localStorageLength: window.localStorage.length,
        sessionStorageLength: window.sessionStorage.length,
      };
    });

    expect(result.commit.transactionId).toBe("tx-browser-1");
    expect(result.commit.objectIds).toEqual(["dataset-v1", "story-v1"]);
    expect(result.ids).toEqual(["dataset-v1", "story-v1"]);
    expect(result.recordCount).toBe(2);
    expect(result.storedLength).toBeGreaterThan(0);
    expect(result.storedBase64).not.toBe(result.plaintextBase64);
    expect(result.openedA).toBe("alpha-secret");
    expect(result.openedB).toBe("beta-secret");
    expect(result.localStorageLength).toBe(0);
    expect(result.sessionStorageLength).toBe(0);
  });

  test("recovery rolls back a staged-only transaction (crash before index commit)", async ({ page }) => {
    await openFixture(page);

    const result = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: ProjectObjectApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      const store = await storage.openProjectObjectStore({ key: handle.key });
      await store.commitProjectObjects({
        transactionId: "tx-keep",
        objects: [
          { objectId: "keep-obj", plaintext: new TextEncoder().encode("keep-plaintext") },
        ],
      });
      const stagedTransactionId = crypto.randomUUID();
      const opfs = await storage.openOpfsObjectStore();
      const index = await storage.openCommitIndexStore();
      await index.beginPending({
        transactionId: stagedTransactionId,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      await opfs.writeObjectFile(
        stagedTransactionId,
        "crash-obj",
        new TextEncoder().encode("staged-plaintext"),
      );
      const recovery = await store.recoverProjectObjects();
      const idsAfter = await store.listCommittedObjectIds();
      const staged = await opfs.readObjectFile(stagedTransactionId, "crash-obj");
      const transactions = await index.listTransactionRecords();
      const keep = new TextDecoder().decode(
        await store.openProjectObject("keep-obj"),
      );
      return {
        rolledBack: recovery.rolledBackTransactionIds,
        verified: recovery.verifiedCommittedTransactionIds,
        idsAfter,
        stagedExists: staged !== undefined,
        pendingCount: transactions.filter((t) => t.status === "pending").length,
        keep,
      };
    });

    expect(result.rolledBack).toHaveLength(1);
    expect(result.verified).toEqual(["tx-keep"]);
    expect(result.idsAfter).toEqual(["keep-obj"]);
    expect(result.stagedExists).toBe(false);
    expect(result.pendingCount).toBe(0);
    expect(result.keep).toBe("keep-plaintext");
  });

  test("recovery removes orphans and rolls back an incomplete committed transaction", async ({ page }) => {
    await openFixture(page);

    const result = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: ProjectObjectApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      const store = await storage.openProjectObjectStore({ key: handle.key });
      await store.commitProjectObjects({
        transactionId: "tx-keep",
        objects: [
          { objectId: "keep-obj", plaintext: new TextEncoder().encode("keep-plaintext") },
        ],
      });
      const opfs = await storage.openOpfsObjectStore();
      const orphanTransactionId = crypto.randomUUID();
      await opfs.writeObjectFile(
        orphanTransactionId,
        "ghost-obj",
        new TextEncoder().encode("ghost"),
      );
      const incompleteTransactionId = crypto.randomUUID();
      await store.commitProjectObjects({
        transactionId: incompleteTransactionId,
        objects: [
          { objectId: "x-obj", plaintext: new TextEncoder().encode("x") },
          { objectId: "y-obj", plaintext: new TextEncoder().encode("y") },
        ],
      });
      await opfs.deleteObjectFile(incompleteTransactionId, "x-obj");
      const recovery = await store.recoverProjectObjects();
      const idsAfter = await store.listCommittedObjectIds();
      let openCode = "";
      try {
        await store.openProjectObject("y-obj");
      } catch (error) {
        openCode = (error as { code?: string }).code ?? "";
      }
      return {
        removedOrphans: recovery.removedOrphanTransactionIds,
        rolledBack: recovery.rolledBackTransactionIds,
        idsAfter,
        openCode,
      };
    });

    expect(result.removedOrphans).toHaveLength(1);
    expect(result.rolledBack).toHaveLength(1);
    expect(result.idsAfter).toEqual(["keep-obj"]);
    expect(result.openCode).toBe("STORAGE_OBJECT_NOT_FOUND");
  });

  test("clearing site data destroys the device key and committed objects", async ({ page }) => {
    await openFixture(page);

    await page.evaluate(async () => {
      const storage = (window as { __dpStorage: ProjectObjectApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      const store = await storage.openProjectObjectStore({ key: handle.key });
      await store.commitProjectObjects({
        transactionId: "tx-lost",
        objects: [
          { objectId: "lost-obj", plaintext: new TextEncoder().encode("lost-secret") },
        ],
      });
    });

    const session = await page.context().newCDPSession(page);
    await session.send("Storage.clearDataForOrigin", {
      origin: baseUrl,
      storageTypes: "all",
    });

    const afterClear = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: ProjectObjectApi }).__dpStorage;
      let missingCode = "";
      try {
        await storage.requireStoredDeviceKey();
      } catch (error) {
        missingCode = (error as { code?: string }).code ?? "";
      }
      const handle = await storage.ensureDeviceKey();
      const store = await storage.openProjectObjectStore({ key: handle.key });
      const ids = await store.listCommittedObjectIds();
      let openCode = "";
      try {
        await store.openProjectObject("lost-obj");
      } catch (error) {
        openCode = (error as { code?: string }).code ?? "";
      }
      const recovery = await store.recoverProjectObjects();
      return { missingCode, ids, openCode, recovery };
    });

    expect(afterClear.missingCode).toBe("STORAGE_DEVICE_KEY_MISSING");
    expect(afterClear.ids).toEqual([]);
    expect(afterClear.openCode).toBe("STORAGE_OBJECT_NOT_FOUND");
    expect(afterClear.recovery.rolledBackTransactionIds).toEqual([]);
    expect(afterClear.recovery.verifiedCommittedTransactionIds).toEqual([]);
  });
});