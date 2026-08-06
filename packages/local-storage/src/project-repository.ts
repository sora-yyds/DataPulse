import {
  readStoryArtifact,
  type StoryArtifactReadError,
  type StoryArtifactReadResult,
  type StoryArtifactValidationContext,
} from "@datapulse/story-migrations";
import {
  createInvalidArgumentError,
  createStoryInvalidError,
  isLocalStorageError,
  type LocalStorageError,
} from "./errors.js";
import type {
  ProjectObjectStore,
  RecoveryResult,
} from "./project-object-store.js";

/**
 * Fixed logical object ids of a project snapshot. The story artifact is
 * always read back through the Story Artifact Reader, and the metric fixture
 * is stored as an opaque sibling object; neither can ever be a raw file Blob
 * (FR-IMP-005 is enforced by the transaction core).
 */
export const PROJECT_REPOSITORY_OBJECT_IDS = Object.freeze({
  storyArtifact: "project-story-artifact",
  metricFixture: "project-metric-fixture",
} as const);

export type ProjectRepositoryContent = Readonly<{
  storyArtifact: Uint8Array;
  metricFixture: Uint8Array;
}>;

export type CommitProjectInput = Readonly<{
  storyArtifact: Uint8Array;
  metricFixture: Uint8Array;
  /** Optional explicit id; a fresh UUID is generated when omitted. */
  transactionId?: string;
}>;

export type ProjectRepositoryDeps = Readonly<{
  /** Device-bound key used to seal every project object. */
  key: CryptoKey;
  /** M0-052 transaction core store; callers cannot touch IDB/OPFS directly. */
  objects: ProjectObjectStore;
  /** Reader validation context applied to every story read. */
  context: StoryArtifactValidationContext;
}>;

export type ProjectRepositoryStoredReadFailure =
  | Readonly<{ kind: "storage"; error: LocalStorageError }>
  | Readonly<{ kind: "story-invalid"; error: StoryArtifactReadError }>;

export type ProjectRepositoryCommitResult =
  | Readonly<{
      ok: true;
      transactionId: string;
      objectIds: readonly string[];
      story: StoryArtifactReadResult;
    }>
  | Readonly<{
      ok: false;
      error: LocalStorageError;
      /** The previous readable project remains the repository state. */
      retained: true;
      story?: StoryArtifactReadResult;
    }>;

export type ProjectRepositoryOpenResult =
  | Readonly<{
      ok: true;
      value: ProjectRepositoryContent;
      story: StoryArtifactReadResult;
      /**
       * True when the stored story could not be read/validated and the last
       * readable copy was returned instead.
       */
      recovered: boolean;
      storedFailure?: ProjectRepositoryStoredReadFailure;
    }>
  | Readonly<{ ok: false; error: ProjectRepositoryStoredReadFailure }>;

export type ProjectRepositoryRecoverResult =
  | Readonly<{
      ok: true;
      recovery: RecoveryResult;
      project: ProjectRepositoryOpenResult;
    }>
  | Readonly<{ ok: false; error: ProjectRepositoryStoredReadFailure }>;

export type ProjectRepository = Readonly<{
  commitProject(input: CommitProjectInput): Promise<ProjectRepositoryCommitResult>;
  openProject(): Promise<ProjectRepositoryOpenResult>;
  recoverProject(): Promise<ProjectRepositoryRecoverResult>;
}>;

type RepositoryState = {
  deps: ProjectRepositoryDeps;
  lastReadable: ProjectRepositoryContent | undefined;
};

function assertContentBytes(
  value: unknown,
  label: "storyArtifact" | "metricFixture",
): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw createInvalidArgumentError("type");
  }
}

/**
 * Commits a project snapshot. The story artifact is validated through the
 * Artifact Reader BEFORE any storage allocation or OPFS write, and the
 * M0-051 double capacity estimation runs inside the transaction core, so a
 * rejected or failed commit never touches the last readable index or the
 * in-memory last readable copy.
 */
export async function commitProject(
  state: RepositoryState,
  input: CommitProjectInput,
): Promise<ProjectRepositoryCommitResult> {
  assertContentBytes(input.storyArtifact, "storyArtifact");
  assertContentBytes(input.metricFixture, "metricFixture");

  const story = readStoryArtifact(input.storyArtifact, state.deps.context);
  if (!story.ok) {
    return Object.freeze({
      ok: false,
      error: createStoryInvalidError(story.error.code),
      retained: true,
      story,
    });
  }

  try {
    const committed = await state.deps.objects.commitProjectObjects({
      ...(input.transactionId === undefined ? {} : { transactionId: input.transactionId }),
      objects: Object.freeze([
        Object.freeze({
          objectId: PROJECT_REPOSITORY_OBJECT_IDS.storyArtifact,
          plaintext: input.storyArtifact,
        }),
        Object.freeze({
          objectId: PROJECT_REPOSITORY_OBJECT_IDS.metricFixture,
          plaintext: input.metricFixture,
        }),
      ]),
    });
    state.lastReadable = snapshot(input);
    return Object.freeze({
      ok: true,
      transactionId: committed.transactionId,
      objectIds: committed.objectIds,
      story,
    });
  } catch (error) {
    if (isLocalStorageError(error)) {
      return Object.freeze({ ok: false, error, retained: true });
    }
    throw error;
  }
}

/**
 * Opens the committed project. The stored story always passes through the
 * Artifact Reader; a decryption/integrity failure or a migration/validation
 * failure falls back to the last readable copy (re-validated through the
 * Reader) so a broken upgrade never blanks the current session.
 */
export async function openProject(
  state: RepositoryState,
): Promise<ProjectRepositoryOpenResult> {
  let storedStory: Uint8Array;
  let storedMetric: Uint8Array;
  try {
    storedStory = await state.deps.objects.openProjectObject(
      PROJECT_REPOSITORY_OBJECT_IDS.storyArtifact,
    );
    storedMetric = await state.deps.objects.openProjectObject(
      PROJECT_REPOSITORY_OBJECT_IDS.metricFixture,
    );
  } catch (error) {
    if (isLocalStorageError(error)) {
      return fallbackToLastReadable(state, {
        kind: "storage",
        error,
      });
    }
    throw error;
  }

  const story = readStoryArtifact(storedStory, state.deps.context);
  if (!story.ok) {
    return fallbackToLastReadable(state, {
      kind: "story-invalid",
      error: story.error,
    });
  }

  state.lastReadable = Object.freeze({
    storyArtifact: new Uint8Array(storedStory),
    metricFixture: new Uint8Array(storedMetric),
  });
  return Object.freeze({
    ok: true,
    value: state.lastReadable,
    story,
    recovered: false,
  });
}

/** Crash recovery, then re-establishes the last readable copy. */
export async function recoverProject(
  state: RepositoryState,
): Promise<ProjectRepositoryRecoverResult> {
  let recovery: RecoveryResult;
  try {
    recovery = await state.deps.objects.recoverProjectObjects();
  } catch (error) {
    if (isLocalStorageError(error)) {
      const failure: ProjectRepositoryStoredReadFailure = {
        kind: "storage",
        error,
      };
      return Object.freeze({ ok: false, error: failure });
    }
    throw error;
  }
  const project = await openProject(state);
  if (!project.ok) {
    return Object.freeze({ ok: false, error: project.error });
  }
  return Object.freeze({ ok: true, recovery, project });
}

/**
 * Serialized repository seam. All state-machine operations run on a single
 * queue so commit/open/recover never interleave, mirroring the transaction
 * core store. Browser and Node tests share this factory with their own store
 * seams.
 */
export function createProjectRepository(
  deps: ProjectRepositoryDeps,
): ProjectRepository {
  const state: RepositoryState = { deps, lastReadable: undefined };
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
    commitProject: (input) => serialized(() => commitProject(state, input)),
    openProject: () => serialized(() => openProject(state)),
    recoverProject: () => serialized(() => recoverProject(state)),
  });
}

function snapshot(input: CommitProjectInput): ProjectRepositoryContent {
  return Object.freeze({
    storyArtifact: new Uint8Array(input.storyArtifact),
    metricFixture: new Uint8Array(input.metricFixture),
  });
}

async function fallbackToLastReadable(
  state: RepositoryState,
  storedFailure: ProjectRepositoryStoredReadFailure,
): Promise<ProjectRepositoryOpenResult> {
  if (state.lastReadable === undefined) {
    return Object.freeze({ ok: false, error: storedFailure });
  }
  const story = readStoryArtifact(
    state.lastReadable.storyArtifact,
    state.deps.context,
  );
  if (!story.ok) {
    const failure: ProjectRepositoryStoredReadFailure = {
      kind: "story-invalid",
      error: story.error,
    };
    return Object.freeze({ ok: false, error: failure });
  }
  return Object.freeze({
    ok: true,
    value: state.lastReadable,
    story,
    recovered: true,
    storedFailure,
  });
}