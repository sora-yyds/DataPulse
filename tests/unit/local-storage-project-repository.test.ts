import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import type { StoryArtifactValidationContext } from "../../packages/story-migrations/dist/index.js";
import {
  LOCAL_STORAGE_ERROR_CODES,
  PROJECT_REPOSITORY_OBJECT_IDS,
  createObjectNotFoundError,
  createProjectRepository,
  createStorageUnavailableError,
  createStorageWriteFailedError,
  type ProjectObjectStore,
} from "../../packages/local-storage/dist/index.js";

const encoder = new TextEncoder();

function encode(value: string): Uint8Array {
  return encoder.encode(value);
}

const storyFixtureBytes = readFileSync(
  resolve(process.cwd(), "apps/creator/src/fixtures/story-artifact.json"),
);

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
}) satisfies StoryArtifactValidationContext;

const METRIC_FIXTURE_BYTES = encode("metric-fixture-bytes");

function invalidStoryBytes(): Uint8Array {
  const parsed = JSON.parse(new TextDecoder().decode(storyFixtureBytes)) as {
    schemaVersion: string;
  };
  return encode(JSON.stringify({ ...parsed, schemaVersion: "0.1.0" }));
}

type FakeStore = ProjectObjectStore & {
  files: Map<string, Uint8Array>;
  failCommits: boolean;
  failRecover: boolean;
  failOpens: Set<string>;
};

function createFakeStore(): FakeStore {
  const files = new Map<string, Uint8Array>();
  const store: FakeStore = {
    files,
    failCommits: false,
    failRecover: false,
    failOpens: new Set(),
    async commitProjectObjects(input) {
      if (store.failCommits) {
        throw createStorageWriteFailedError("indexeddb-commit");
      }
      for (const object of input.objects) {
        files.set(object.objectId, new Uint8Array(object.plaintext));
      }
      const transactionId =
        input.transactionId ?? `tx-${files.size}-${crypto.randomUUID()}`;
      return Object.freeze({
        transactionId,
        objectIds: Object.freeze(
          input.objects.map((object) => object.objectId),
        ),
      });
    },
    async openProjectObject(objectId) {
      if (store.failOpens.has(objectId)) {
        throw createStorageUnavailableError("integrity-mismatch");
      }
      const value = files.get(objectId);
      if (value === undefined) {
        throw createObjectNotFoundError();
      }
      return new Uint8Array(value);
    },
    async recoverProjectObjects() {
      if (store.failRecover) {
        throw createStorageUnavailableError("read-failed");
      }
      return Object.freeze({
        rolledBackTransactionIds: Object.freeze([]),
        removedOrphanTransactionIds: Object.freeze([]),
        verifiedCommittedTransactionIds: Object.freeze([]),
      });
    },
    async listCommittedObjectIds() {
      return Object.freeze([...files.keys()]);
    },
  };
  return store;
}

function createRepository(store: FakeStore) {
  return createProjectRepository({
    key: {} as CryptoKey,
    objects: store,
    context: STORY_CONTEXT,
  });
}

function commitValid(repository: ReturnType<typeof createRepository>) {
  return repository.commitProject({
    storyArtifact: new Uint8Array(storyFixtureBytes),
    metricFixture: METRIC_FIXTURE_BYTES,
  });
}

describe("project repository state machine", () => {
  it("rejects an unreadable story before any storage write", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);

    const result = await repository.commitProject({
      storyArtifact: invalidStoryBytes(),
      metricFixture: METRIC_FIXTURE_BYTES,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected rejection");
    }
    expect(result.error).toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.storyInvalid,
    });
    expect(result.retained).toBe(true);
    expect(store.files.size).toBe(0);
  });

  it("commits a validated project and opens it back without recovery", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);

    const commit = await commitValid(repository);
    expect(commit.ok).toBe(true);
    if (!commit.ok) {
      throw new Error("expected commit");
    }
    expect(commit.story.ok).toBe(true);
    expect(commit.objectIds).toEqual(
      Object.values(PROJECT_REPOSITORY_OBJECT_IDS),
    );

    const open = await repository.openProject();
    expect(open.ok).toBe(true);
    if (!open.ok) {
      throw new Error("expected open");
    }
    expect(open.recovered).toBe(false);
    expect(open.story.ok).toBe(true);
    expect(open.value.storyArtifact).toEqual(new Uint8Array(storyFixtureBytes));
    expect(open.value.metricFixture).toEqual(METRIC_FIXTURE_BYTES);
  });

  it("keeps the last readable copy when a later commit fails", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);

    const first = await commitValid(repository);
    expect(first.ok).toBe(true);

    store.failCommits = true;
    const rejected = await commitValid(repository);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) {
      throw new Error("expected rejection");
    }
    expect(rejected.retained).toBe(true);
    expect(rejected.error).toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.writeFailed,
    });

    const open = await repository.openProject();
    expect(open.ok).toBe(true);
    if (!open.ok) {
      throw new Error("expected open");
    }
    expect(open.value.storyArtifact).toEqual(new Uint8Array(storyFixtureBytes));
    expect(open.value.metricFixture).toEqual(METRIC_FIXTURE_BYTES);
  });

  it("reports a stable not-found failure before any project exists", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);

    const open = await repository.openProject();
    expect(open.ok).toBe(false);
    if (open.ok) {
      throw new Error("expected failure");
    }
    expect(open.error.kind).toBe("storage");
    expect(open.error.error).toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.objectNotFound,
    });
  });

  it("falls back to the last readable copy on a decryption failure", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);
    await commitValid(repository);

    store.failOpens.add(PROJECT_REPOSITORY_OBJECT_IDS.storyArtifact);
    const open = await repository.openProject();
    expect(open.ok).toBe(true);
    if (!open.ok) {
      throw new Error("expected fallback");
    }
    expect(open.recovered).toBe(true);
    expect(open.storedFailure?.kind).toBe("storage");
    expect(open.value.storyArtifact).toEqual(new Uint8Array(storyFixtureBytes));
  });

  it("falls back to the last readable copy when the stored story fails the reader", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);
    await commitValid(repository);

    store.files.set(
      PROJECT_REPOSITORY_OBJECT_IDS.storyArtifact,
      invalidStoryBytes(),
    );
    const open = await repository.openProject();
    expect(open.ok).toBe(true);
    if (!open.ok) {
      throw new Error("expected fallback");
    }
    expect(open.recovered).toBe(true);
    expect(open.storedFailure?.kind).toBe("story-invalid");
    expect(open.value.storyArtifact).toEqual(new Uint8Array(storyFixtureBytes));
  });

  it("recovers and re-establishes the readable project", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);
    await commitValid(repository);

    store.files.set(
      PROJECT_REPOSITORY_OBJECT_IDS.storyArtifact,
      invalidStoryBytes(),
    );
    const recovery = await repository.recoverProject();
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) {
      throw new Error("expected recovery");
    }
    expect(recovery.recovery.verifiedCommittedTransactionIds).toEqual([]);
    expect(recovery.project.ok).toBe(true);
    if (!recovery.project.ok) {
      throw new Error("expected recovery open");
    }
    expect(recovery.project.recovered).toBe(true);
  });

  it("propagates a storage failure from recovery", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);
    store.failRecover = true;

    const recovery = await repository.recoverProject();
    expect(recovery.ok).toBe(false);
    if (recovery.ok) {
      throw new Error("expected recovery failure");
    }
    expect(recovery.error.kind).toBe("storage");
    expect(recovery.error.error).toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.unavailable,
    });
  });

  it("rejects non-byte project content", async () => {
    const store = createFakeStore();
    const repository = createRepository(store);

    await expect(
      repository.commitProject({
        storyArtifact: "not bytes" as unknown as Uint8Array,
        metricFixture: METRIC_FIXTURE_BYTES,
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
    });
    await expect(
      repository.commitProject({
        storyArtifact: new Uint8Array(storyFixtureBytes),
        metricFixture: { not: "bytes" } as unknown as Uint8Array,
      }),
    ).rejects.toMatchObject({
      code: LOCAL_STORAGE_ERROR_CODES.invalidArgument,
    });
  });
});