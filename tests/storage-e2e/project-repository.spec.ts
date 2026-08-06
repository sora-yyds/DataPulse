import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "playwright/test";
import { createServer, type ViteDevServer } from "vite";

const fixtureRoot = fileURLToPath(new URL("../storage-fixture/", import.meta.url));
const localStorageSource = fileURLToPath(
  new URL("../../packages/local-storage/src/index.ts", import.meta.url),
);
const cryptoSources = fileURLToPath(
  new URL("../../packages/crypto/src/index.ts", import.meta.url),
);
const storyArtifactBase64 = readFileSync(
  fileURLToPath(
    new URL("../../apps/creator/src/fixtures/story-artifact.json", import.meta.url),
  ),
).toString("base64");
const metricFixtureText = "metric-fixture-bytes";

const STORY_CONTEXT = Object.freeze({
  expectedStoryId: "story_m0-015-renderer",
  expectedDatasetVersionId: "dataset_version_m0-015-renderer",
  references: Object.freeze({
    fieldIds: Object.freeze([]),
    metricIds: Object.freeze(["metric_order-count"]),
    evidenceIds: Object.freeze(["evidence_order-count"]),
    judgmentRuleIds: Object.freeze([]),
    narrativeRuleIds: Object.freeze([]),
  }),
  expectedGlobalConditions: Object.freeze([]),
  kpiApplicableMetricIds: Object.freeze(["metric_order-count"]),
});

type ProjectObjectStoreApi = {
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
};

type RepositoryApi = {
  ensureDeviceKey: () => Promise<{ key: CryptoKey; persisted: boolean }>;
  openProjectObjectStore: (input: {
    key: CryptoKey;
  }) => Promise<ProjectObjectStoreApi>;
  createProjectRepository: (deps: {
    key: CryptoKey;
    objects: ProjectObjectStoreApi;
    context: Record<string, unknown>;
  }) => {
    commitProject: (input: {
      transactionId?: string;
      storyArtifact: Uint8Array;
      metricFixture: Uint8Array;
    }) => Promise<{ ok: boolean; transactionId?: string }>;
    openProject: () => Promise<{
      ok: boolean;
      recovered?: boolean;
      story?: { ok: boolean };
      value?: { storyArtifact: Uint8Array; metricFixture: Uint8Array };
      storedFailure?: { kind: string };
      error?: { kind: string };
    }>;
  };
  openOpfsObjectStore: () => Promise<{
    readObjectFile: (
      transactionId: string,
      objectId: string,
    ) => Promise<Uint8Array | undefined>;
    writeObjectFile: (
      transactionId: string,
      objectId: string,
      bytes: Uint8Array,
    ) => Promise<void>;
  }>;
  PROJECT_REPOSITORY_OBJECT_IDS: {
    storyArtifact: string;
    metricFixture: string;
  };
};



type RoundtripResult = {
  commitOk: boolean;
  storyOk: boolean;
  recovered: boolean | null;
  storyRoundtrip: boolean;
  metricRoundtrip: boolean;
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

test.describe("project repository in real Chromium", () => {
  test("commits a validated project and opens it back", async ({ page }) => {
    await openFixture(page);

    const result = await page.evaluate(
      async ({ storyArtifactBase64, metricFixtureText, context }): Promise<RoundtripResult> => {
        const base64ToBytes = (value: string): Uint8Array => {
          const binary = atob(value);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes;
        };
        const bytesToBase64 = (bytes: Uint8Array): string => {
          let binary = "";
          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }
          return btoa(binary);
        };
        const storage = (window as { __dpStorage: RepositoryApi }).__dpStorage;
        const storyArtifact = base64ToBytes(storyArtifactBase64);
        const metricFixture = new TextEncoder().encode(metricFixtureText);
        const handle = await storage.ensureDeviceKey();
        const store = await storage.openProjectObjectStore({ key: handle.key });
        const repository = storage.createProjectRepository({
          key: handle.key,
          objects: store,
          context,
        });
        const commit = await repository.commitProject({
          transactionId: "repo-tx-roundtrip",
          storyArtifact,
          metricFixture,
        });
        const open = await repository.openProject();
        return {
          commitOk: commit.ok,
          storyOk: open.ok ? open.story?.ok === true : false,
          recovered: open.ok ? open.recovered ?? null : null,
          storyRoundtrip: open.ok
            ? bytesToBase64(open.value.storyArtifact) === storyArtifactBase64
            : false,
          metricRoundtrip: open.ok
            ? new TextDecoder().decode(open.value.metricFixture) === metricFixtureText
            : false,
        };
      },
      { storyArtifactBase64, metricFixtureText, context: STORY_CONTEXT },
    );

    expect(result.commitOk).toBe(true);
    expect(result.storyOk).toBe(true);
    expect(result.recovered).toBe(false);
    expect(result.storyRoundtrip).toBe(true);
    expect(result.metricRoundtrip).toBe(true);
  });

  test("restores the committed project after a reload", async ({ page }) => {
    await openFixture(page);

    await page.evaluate(
      async ({ storyArtifactBase64, metricFixtureText, context }): Promise<void> => {
        const base64ToBytes = (value: string): Uint8Array => {
          const binary = atob(value);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes;
        };
        const bytesToBase64 = (bytes: Uint8Array): string => {
          let binary = "";
          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }
          return btoa(binary);
        };
        const storage = (window as { __dpStorage: RepositoryApi }).__dpStorage;
        const storyArtifact = base64ToBytes(storyArtifactBase64);
        const metricFixture = new TextEncoder().encode(metricFixtureText);
        const handle = await storage.ensureDeviceKey();
        const store = await storage.openProjectObjectStore({ key: handle.key });
        const repository = storage.createProjectRepository({
          key: handle.key,
          objects: store,
          context,
        });
        await repository.commitProject({
          transactionId: "repo-tx-reload",
          storyArtifact,
          metricFixture,
        });
      },
      { storyArtifactBase64, metricFixtureText, context: STORY_CONTEXT },
    );

    await page.reload();
    await openFixture(page);

    const result = await page.evaluate(
      async ({ storyArtifactBase64, context }): Promise<{
        ok: boolean;
        recovered: boolean | null;
        storyOk: boolean;
        storyRoundtrip: boolean;
      }> => {
        const base64ToBytes = (value: string): Uint8Array => {
          const binary = atob(value);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes;
        };
        const bytesToBase64 = (bytes: Uint8Array): string => {
          let binary = "";
          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }
          return btoa(binary);
        };
        const storage = (window as { __dpStorage: RepositoryApi }).__dpStorage;
        const handle = await storage.ensureDeviceKey();
        const store = await storage.openProjectObjectStore({ key: handle.key });
        const repository = storage.createProjectRepository({
          key: handle.key,
          objects: store,
          context,
        });
        const open = await repository.openProject();
        return {
          ok: open.ok,
          recovered: open.ok ? open.recovered ?? null : null,
          storyOk: open.ok ? open.story?.ok === true : false,
          storyRoundtrip: open.ok
            ? bytesToBase64(open.value.storyArtifact) === storyArtifactBase64
            : false,
        };
      },
      { storyArtifactBase64, context: STORY_CONTEXT },
    );

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(false);
    expect(result.storyOk).toBe(true);
    expect(result.storyRoundtrip).toBe(true);
  });

  test("falls back to the last readable copy when the stored story is tampered", async ({
    page,
  }) => {
    await openFixture(page);

    const result = await page.evaluate(
      async ({ storyArtifactBase64, metricFixtureText, context }): Promise<{
        ok: boolean;
        recovered: boolean;
        failureKind: string | null;
        storyRoundtrip: boolean;
      }> => {
        const base64ToBytes = (value: string): Uint8Array => {
          const binary = atob(value);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes;
        };
        const bytesToBase64 = (bytes: Uint8Array): string => {
          let binary = "";
          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }
          return btoa(binary);
        };
        const storage = (window as { __dpStorage: RepositoryApi }).__dpStorage;
        const storyArtifact = base64ToBytes(storyArtifactBase64);
        const metricFixture = new TextEncoder().encode(metricFixtureText);
        const handle = await storage.ensureDeviceKey();
        const store = await storage.openProjectObjectStore({ key: handle.key });
        const repository = storage.createProjectRepository({
          key: handle.key,
          objects: store,
          context,
        });
        await repository.commitProject({
          transactionId: "repo-tx-tamper",
          storyArtifact,
          metricFixture,
        });
        const opfs = await storage.openOpfsObjectStore();
        const objectId = storage.PROJECT_REPOSITORY_OBJECT_IDS.storyArtifact;
        const original = await opfs.readObjectFile("repo-tx-tamper", objectId);
        const tampered = new Uint8Array(original ?? []);
        tampered[0] = tampered[0] ^ 0xff;
        await opfs.writeObjectFile("repo-tx-tamper", objectId, tampered);
        const open = await repository.openProject();
        return {
          ok: open.ok,
          recovered: open.ok ? open.recovered ?? false : false,
          failureKind: open.ok
            ? open.storedFailure?.kind ?? null
            : open.error?.kind ?? null,
          storyRoundtrip: open.ok
            ? bytesToBase64(open.value.storyArtifact) === storyArtifactBase64
            : false,
        };
      },
      { storyArtifactBase64, metricFixtureText, context: STORY_CONTEXT },
    );

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.failureKind).toBe("storage");
    expect(result.storyRoundtrip).toBe(true);
  });

  test("stores only sealed ciphertext for the story object", async ({ page }) => {
    await openFixture(page);

    const result = await page.evaluate(
      async ({ storyArtifactBase64, metricFixtureText, context }): Promise<{
        storedIsCiphertext: boolean;
        storedLength: number;
      }> => {
        const base64ToBytes = (value: string): Uint8Array => {
          const binary = atob(value);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes;
        };
        const bytesToBase64 = (bytes: Uint8Array): string => {
          let binary = "";
          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }
          return btoa(binary);
        };
        const storage = (window as { __dpStorage: RepositoryApi }).__dpStorage;
        const storyArtifact = base64ToBytes(storyArtifactBase64);
        const metricFixture = new TextEncoder().encode(metricFixtureText);
        const handle = await storage.ensureDeviceKey();
        const store = await storage.openProjectObjectStore({ key: handle.key });
        const repository = storage.createProjectRepository({
          key: handle.key,
          objects: store,
          context,
        });
        await repository.commitProject({
          transactionId: "repo-tx-sealed",
          storyArtifact,
          metricFixture,
        });
        const opfs = await storage.openOpfsObjectStore();
        const stored = await opfs.readObjectFile(
          "repo-tx-sealed",
          storage.PROJECT_REPOSITORY_OBJECT_IDS.storyArtifact,
        );
        return {
          storedIsCiphertext: stored
            ? bytesToBase64(stored) !== storyArtifactBase64
            : false,
          storedLength: stored?.byteLength ?? 0,
        };
      },
      { storyArtifactBase64, metricFixtureText, context: STORY_CONTEXT },
    );

    expect(result.storedIsCiphertext).toBe(true);
    expect(result.storedLength).toBeGreaterThan(0);
  });
});