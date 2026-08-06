import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "playwright/test";
import { createServer, type ViteDevServer } from "vite";

const fixtureRoot = fileURLToPath(new URL("../storage-fixture/", import.meta.url));
const localStorageSource = fileURLToPath(
  new URL("../../packages/local-storage/src/index.ts", import.meta.url),
);
const cryptoSources = fileURLToPath(new URL("../../packages/crypto/src/index.ts", import.meta.url));

type StorageApi = {
  ensureDeviceKey: () => Promise<{ key: CryptoKey; persisted: boolean }>;
  hasDeviceKey: () => Promise<boolean>;
  clearDeviceKey: () => Promise<boolean>;
  requestPersistentStorage: () => Promise<boolean>;
  isPersisted: () => Promise<boolean>;
  requireStoredDeviceKey: () => Promise<CryptoKey>;
  sealDeviceBound: (input: {
    key: CryptoKey;
    plaintext: Uint8Array;
  }) => Promise<{ nonce: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array }>;
  openDeviceBound: (input: {
    key: CryptoKey;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    tag: Uint8Array;
  }) => Promise<Uint8Array>;
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

test.describe("device-bound key in real Chromium", () => {
  test("creates a non-exportable key, seals and opens device-bound objects", async ({ page }) => {
    await openFixture(page);

    const keyInfo = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      const algorithm = handle.key.algorithm as AesKeyAlgorithm;
      const sealed = await storage.sealDeviceBound({
        key: handle.key,
        plaintext: new TextEncoder().encode("device-bound secret"),
      });
      const opened = await storage.openDeviceBound({
        key: handle.key,
        nonce: sealed.nonce,
        ciphertext: sealed.ciphertext,
        tag: sealed.tag,
      });
      let exportRejected = false;
      try {
        await crypto.subtle.exportKey("raw", handle.key);
      } catch {
        exportRejected = true;
      }
      let tamperRejectedCode = "";
      const tampered = new Uint8Array(sealed.ciphertext);
      tampered[0] = tampered[0] ^ 0xff;
      try {
        await storage.openDeviceBound({
          key: handle.key,
          nonce: sealed.nonce,
          ciphertext: tampered,
          tag: sealed.tag,
        });
      } catch (error) {
        tamperRejectedCode = (error as { code?: string }).code ?? "";
      }
      return {
        extractable: handle.key.extractable,
        algorithm: algorithm.name,
        length: algorithm.length,
        usages: [...handle.key.usages].sort(),
        roundtrip: new TextDecoder().decode(opened),
        exportRejected,
        tamperRejectedCode,
        persistedType: typeof handle.persisted,
      };
    });

    expect(keyInfo.extractable).toBe(false);
    expect(keyInfo.algorithm).toBe("AES-GCM");
    expect(keyInfo.length).toBe(256);
    expect(keyInfo.usages).toEqual(["decrypt", "encrypt"]);
    expect(keyInfo.roundtrip).toBe("device-bound secret");
    expect(keyInfo.exportRejected).toBe(true);
    expect(keyInfo.tamperRejectedCode).toBe("CRYPTO_AES_GCM_AUTHENTICATION_FAILED");
    expect(keyInfo.persistedType).toBe("boolean");
  });

  test("persists the same handle across reloads and removes it on demand", async ({ page }) => {
    await openFixture(page);

    const sealed = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      return storage.sealDeviceBound({
        key: handle.key,
        plaintext: new TextEncoder().encode("persisted-secret"),
      });
    });

    await page.reload();
    await page.waitForFunction(
      () => (window as { __dpStorage?: unknown }).__dpStorage !== undefined,
    );

    const reopened = await page.evaluate(async (value) => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      return new TextDecoder().decode(
        await storage.openDeviceBound({
          key: handle.key,
          nonce: value.nonce,
          ciphertext: value.ciphertext,
          tag: value.tag,
        }),
      );
    }, { nonce: sealed.nonce, ciphertext: sealed.ciphertext, tag: sealed.tag });
    expect(reopened).toBe("persisted-secret");

    const removal = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      const removed = await storage.clearDeviceKey();
      const present = await storage.hasDeviceKey();
      let missingCode = "";
      try {
        await storage.requireStoredDeviceKey();
      } catch (error) {
        missingCode = (error as { code?: string }).code ?? "";
      }
      return { removed, present, missingCode };
    });
    expect(removal).toEqual({
      removed: true,
      present: false,
      missingCode: "STORAGE_DEVICE_KEY_MISSING",
    });
  });

  test("stores only the opaque non-exportable handle in IndexedDB, never raw bytes", async ({ page }) => {
    await openFixture(page);
    await page.evaluate(async () => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      await storage.ensureDeviceKey();
    });

    const inspection = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: Record<string, string> }).__dpStorage;
      const dbName = storage.DEVICE_KEY_DB_NAME as string;
      const storeName = storage.DEVICE_KEY_STORE_NAME as string;
      const recordId = storage.DEVICE_KEY_RECORD_ID as string;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(recordId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const key = record as { algorithm?: AesKeyAlgorithm; extractable?: boolean; usages?: string[]; type?: string } | null;
      return {
        storeNames: [...db.objectStoreNames],
        recordExists: record !== undefined,
        tag: Object.prototype.toString.call(record),
        keyType: key?.type ?? "",
        extractable: key?.extractable ?? null,
        algorithm: key?.algorithm?.name ?? "",
        length: key?.algorithm?.length ?? null,
        usages: [...(key?.usages ?? [])].sort(),
        looksLikeRawBytes:
          record instanceof Uint8Array ||
          record instanceof ArrayBuffer ||
          (typeof record === "string" && /^[0-9a-fA-F]{64}$/.test(record)),
        hasRawFields:
          typeof record === "object" &&
          record !== null &&
          ("keyHex" in record || "keyBytes" in record || "raw" in record),
      };
    });

    expect(inspection.storeNames).toEqual(["device-keys"]);
    expect(inspection.recordExists).toBe(true);
    expect(inspection.keyType).toBe("secret");
    expect(inspection.extractable).toBe(false);
    expect(inspection.algorithm).toBe("AES-GCM");
    expect(inspection.length).toBe(256);
    expect(inspection.usages).toEqual(["decrypt", "encrypt"]);
    expect(inspection.looksLikeRawBytes).toBe(false);
    expect(inspection.hasRawFields).toBe(false);
  });

  test("clearing site data makes sealed objects permanently unrecoverable", async ({ page }) => {
    await openFixture(page);

    const sealed = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      const handle = await storage.ensureDeviceKey();
      return storage.sealDeviceBound({
        key: handle.key,
        plaintext: new TextEncoder().encode("lost-secret"),
      });
    });

    const session = await page.context().newCDPSession(page);
    await session.send("Storage.clearDataForOrigin", {
      origin: baseUrl,
      storageTypes: "all",
    });

    const afterClear = await page.evaluate(async (value) => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      let missingCode = "";
      try {
        await storage.requireStoredDeviceKey();
      } catch (error) {
        missingCode = (error as { code?: string }).code ?? "";
      }
      const presentBefore = await storage.hasDeviceKey();
      const fresh = await storage.ensureDeviceKey();
      let openCode = "";
      try {
        await storage.openDeviceBound({
          key: fresh.key,
          nonce: value.nonce,
          ciphertext: value.ciphertext,
          tag: value.tag,
        });
      } catch (error) {
        openCode = (error as { code?: string }).code ?? "";
      }
      return { missingCode, presentBefore, openCode };
    }, { nonce: sealed.nonce, ciphertext: sealed.ciphertext, tag: sealed.tag });

    expect(afterClear.missingCode).toBe("STORAGE_DEVICE_KEY_MISSING");
    expect(afterClear.presentBefore).toBe(false);
    expect(afterClear.openCode).toBe("CRYPTO_AES_GCM_AUTHENTICATION_FAILED");
  });

  test("persistent storage request returns a boolean or a stable error, and never overclaims", async ({ page }) => {
    await openFixture(page);

    const persistence = await page.evaluate(async () => {
      const storage = (window as { __dpStorage: StorageApi }).__dpStorage;
      let requestOutcome: { granted: boolean } | { code: string } = { code: "" };
      try {
        const granted = await storage.requestPersistentStorage();
        requestOutcome = { granted };
      } catch (error) {
        requestOutcome = { code: (error as { code?: string }).code ?? "" };
      }
      const handle = await storage.ensureDeviceKey();
      const persistedNow = await storage.isPersisted();
      return {
        requestOutcome,
        persistedNow,
        handlePersisted: handle.persisted,
        consistent: handle.persisted === persistedNow,
      };
    });

    if ("granted" in persistence.requestOutcome) {
      expect(typeof persistence.requestOutcome.granted).toBe("boolean");
    } else {
      expect(persistence.requestOutcome.code).toBe("STORAGE_PERSISTENCE_UNAVAILABLE");
    }
    expect(typeof persistence.persistedNow).toBe("boolean");
    expect(persistence.consistent).toBe(true);
  });
});
