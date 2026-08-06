import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";
import { build as viteBuild, type Rollup } from "vite";

import {
  STORY_ARTIFACT_READ_ERROR_CODES,
  readStoryArtifact,
  type StoryArtifactReadErrorCode,
  type StoryArtifactReadResult,
  type StoryArtifactValidationContext,
} from "../../packages/story-migrations/dist/index.js";
import * as storyMigrationsPublicModule from "../../packages/story-migrations/dist/index.js";
import { readDevelopmentStoryArtifact } from "../../packages/story-migrations/dist/internal/development-reader.js";
import { currentStoryContract } from "../../packages/story-schema/dist/index.js";

const developmentFixtureDirectory = new URL(
  "../fixtures/story-artifacts/development/",
  import.meta.url,
);
const formalFixtureDirectory = new URL(
  "../fixtures/story-artifacts/formal/",
  import.meta.url,
);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const formalFixtureRepositoryPath = "tests/fixtures/story-artifacts/formal";
const formalManifestRepositoryPath =
  "tests/fixtures/story-artifacts/formal/manifest.v1.json";
const encoder = new TextEncoder();
const FORMAL_READER_MAX_INPUT_BYTES = 16_777_216;
const GIT_OBJECT_ID_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu;

const gitEnvironment = (): NodeJS.ProcessEnv => {
  const environment = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_CEILING_DIRECTORIES",
    "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  ]) {
    delete environment[key];
  }
  return environment;
};

function runGitText(args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: gitEnvironment(),
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `STORY_FIXTURE_GIT_FAILED: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout;
}

function runGitBytes(args: readonly string[]): Uint8Array {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "buffer",
    env: gitEnvironment(),
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `STORY_FIXTURE_GIT_FAILED: ${Buffer.concat([
        result.stderr,
        result.stdout,
      ]).toString("utf8")}`,
    );
  }
  return Uint8Array.from(result.stdout);
}

function normalizeRepositoryPath(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function assertCompleteGitHistory(value: string): void {
  if (value.trim() !== "false") {
    throw new Error("STORY_FIXTURE_SHALLOW_HISTORY");
  }
}

function collectTrustedBaselineRevisions(
  mergeBase: string,
  protectedRevisionOutput: string,
): readonly string[] {
  const protectedRevisions = protectedRevisionOutput
    .split(/\r?\n/u)
    .filter(Boolean);
  if (
    !GIT_OBJECT_ID_PATTERN.test(mergeBase) ||
    protectedRevisions.some((revision) => !GIT_OBJECT_ID_PATTERN.test(revision))
  ) {
    throw new Error("STORY_FIXTURE_PROTECTED_REVISION_INVALID");
  }
  return Object.freeze([...new Set([mergeBase, ...protectedRevisions])]);
}

function resolveTrustedBaselineRevisions(
  explicitReference?: string,
): readonly string[] {
  const requestedReference = explicitReference;
  const topLevel = runGitText(["rev-parse", "--show-toplevel"]).trim();
  if (normalizeRepositoryPath(topLevel) !== normalizeRepositoryPath(repositoryRoot)) {
    throw new Error("STORY_FIXTURE_REPOSITORY_ROOT_INVALID");
  }
  assertCompleteGitHistory(runGitText(["rev-parse", "--is-shallow-repository"]));

  if (requestedReference !== undefined && !GIT_OBJECT_ID_PATTERN.test(requestedReference)) {
    throw new Error("STORY_FIXTURE_BASE_REFERENCE_INVALID");
  }

  const candidates = requestedReference
    ? [requestedReference]
    : ["refs/remotes/origin/main", "refs/heads/main"];
  const baseReference = candidates.find((candidate) => {
    const result = spawnSync(
      "git",
      ["rev-parse", "--verify", "--quiet", candidate],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: gitEnvironment(),
        shell: false,
        timeout: 10_000,
        windowsHide: true,
      },
    );
    return result.status === 0;
  });
  if (baseReference === undefined) {
    throw new Error("STORY_FIXTURE_BASE_MISSING");
  }

  const revision = runGitText(["merge-base", "HEAD", baseReference]).trim();
  const headRevision = runGitText(["rev-parse", "HEAD"]).trim();
  if (!GIT_OBJECT_ID_PATTERN.test(revision)) {
    throw new Error("STORY_FIXTURE_MERGE_BASE_INVALID");
  }
  if (!GIT_OBJECT_ID_PATTERN.test(headRevision)) {
    throw new Error("STORY_FIXTURE_HEAD_INVALID");
  }
  if (requestedReference !== undefined && revision === headRevision) {
    throw new Error("STORY_FIXTURE_BASE_EQUALS_HEAD");
  }

  const protectedRevisionOutput = runGitText([
    "rev-list",
    "--full-history",
    "--topo-order",
    "--reverse",
    "HEAD",
    "--",
    formalFixtureRepositoryPath,
  ]);
  return collectTrustedBaselineRevisions(revision, protectedRevisionOutput);
}

const createFormalTrustedContext = (): StoryArtifactValidationContext =>
  Object.freeze({
    expectedStoryId: "story_formal-contract",
    expectedDatasetVersionId: "dataset_version_formal-contract",
    references: Object.freeze({
      fieldIds: Object.freeze([]),
      metricIds: Object.freeze([]),
      evidenceIds: Object.freeze([]),
      judgmentRuleIds: Object.freeze([]),
      narrativeRuleIds: Object.freeze([]),
    }),
    expectedGlobalConditions: Object.freeze([]),
    kpiApplicableMetricIds: Object.freeze([]),
  });

const developmentTrustedContext = Object.freeze({
  expectedStoryId: "story_reader-fixture",
  expectedDatasetVersionId: "dataset_version_reader-fixture",
  references: Object.freeze({
    fieldIds: Object.freeze([]),
    metricIds: Object.freeze([]),
    evidenceIds: Object.freeze([]),
    judgmentRuleIds: Object.freeze([]),
    narrativeRuleIds: Object.freeze([]),
  }),
  expectedGlobalConditions: Object.freeze([]),
  kpiApplicableMetricIds: Object.freeze([]),
});

type FormalFixtureManifest = Readonly<{
  schemaVersion: string;
  kind: string;
  releaseStatus: string;
  formalHistory: boolean;
  compatibilityPromise: boolean;
  hashAlgorithm: string;
  storySchema: Readonly<{
    schemaVersion: string;
    schemaId: string;
    path: string;
    bytes: number;
    sha256: string;
  }>;
  fixtures: readonly Readonly<{
    id: string;
    schemaVersion: string;
    path: string;
    bytes: number;
    sha256: string;
    consumers: readonly string[];
  }>[];
}>;

type FormalFixtureEntry = FormalFixtureManifest["fixtures"][number];
type FixtureBytes = ReadonlyMap<string, Uint8Array>;

function formalFixtureEntrySignature(fixture: FormalFixtureEntry): string {
  return JSON.stringify({
    id: fixture.id,
    schemaVersion: fixture.schemaVersion,
    path: fixture.path,
    bytes: fixture.bytes,
    sha256: fixture.sha256,
    consumers: fixture.consumers,
  });
}

function formalFixtureManifestIdentitySignature(
  manifest: FormalFixtureManifest,
): string {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    releaseStatus: manifest.releaseStatus,
    formalHistory: manifest.formalHistory,
    compatibilityPromise: manifest.compatibilityPromise,
    hashAlgorithm: manifest.hashAlgorithm,
    storySchema: manifest.storySchema,
  });
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function validateImmutableFormalFixtures(
  current: FormalFixtureManifest,
  baseline: FormalFixtureManifest,
  currentBytes: FixtureBytes,
  baselineBytes: FixtureBytes,
): readonly string[] {
  const errors: string[] = [];

  if (
    formalFixtureManifestIdentitySignature(current) !==
    formalFixtureManifestIdentitySignature(baseline)
  ) {
    errors.push("FORMAL_FIXTURE_MANIFEST_CHANGED");
  }

  if (current.fixtures.length !== baseline.fixtures.length) {
    errors.push("FORMAL_FIXTURE_ENTRY_COUNT_CHANGED");
  }

  baseline.fixtures.forEach((baselineFixture, index) => {
    const currentFixture = current.fixtures[index];
    if (
      currentFixture === undefined ||
      formalFixtureEntrySignature(currentFixture) !==
        formalFixtureEntrySignature(baselineFixture)
    ) {
      errors.push(`FORMAL_FIXTURE_ENTRY_CHANGED:${index}:${baselineFixture.id}`);
    }

    const baselineFixtureBytes = baselineBytes.get(baselineFixture.path);
    const currentFixtureBytes = currentBytes.get(baselineFixture.path);
    if (
      baselineFixtureBytes === undefined ||
      currentFixtureBytes === undefined ||
      !equalBytes(currentFixtureBytes, baselineFixtureBytes)
    ) {
      errors.push(`FORMAL_FIXTURE_BYTES_CHANGED:${baselineFixture.path}`);
    }
  });

  return Object.freeze(errors);
}

function assertSafeFormalFixturePath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "..")
  ) {
    throw new Error(`FORMAL_FIXTURE_PATH_INVALID:${path}`);
  }
}

function hasFormalFixtureBaselineManifest(
  listedManifestPaths: readonly string[],
  listedFormalPaths: readonly string[],
): boolean {
  if (listedManifestPaths.length === 0) {
    if (listedFormalPaths.length > 0) {
      throw new Error("FORMAL_FIXTURE_BASELINE_MANIFEST_MISSING");
    }
    return false;
  }
  if (
    listedManifestPaths.length !== 1 ||
    listedManifestPaths[0] !== formalManifestRepositoryPath
  ) {
    throw new Error("FORMAL_FIXTURE_BASELINE_MANIFEST_AMBIGUOUS");
  }
  return true;
}

async function readCurrentFormalFixtureBytes(
  manifest: FormalFixtureManifest,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const fixtures = new Map<string, Uint8Array>();
  for (const fixture of manifest.fixtures) {
    assertSafeFormalFixturePath(fixture.path);
    fixtures.set(
      fixture.path,
      Uint8Array.from(await readFile(new URL(fixture.path, formalFixtureDirectory))),
    );
  }
  return fixtures;
}

function readBaselineFormalFixtureHistory(
  revision: string,
): Readonly<{
  manifest: FormalFixtureManifest;
  bytes: ReadonlyMap<string, Uint8Array>;
}> | null {
  const listedPaths = runGitText([
    "ls-tree",
    "-r",
    "--name-only",
    revision,
    "--",
    formalManifestRepositoryPath,
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  const listedFormalPaths = runGitText([
    "ls-tree",
    "-r",
    "--name-only",
    revision,
    "--",
    formalFixtureRepositoryPath,
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  if (!hasFormalFixtureBaselineManifest(listedPaths, listedFormalPaths)) return null;

  const manifest = JSON.parse(
    runGitText(["show", `${revision}:${formalManifestRepositoryPath}`]),
  ) as FormalFixtureManifest;
  const bytes = new Map<string, Uint8Array>();
  for (const fixture of manifest.fixtures) {
    assertSafeFormalFixturePath(fixture.path);
    const repositoryPath =
      `tests/fixtures/story-artifacts/formal/${fixture.path}`;
    bytes.set(
      fixture.path,
      runGitBytes(["show", `${revision}:${repositoryPath}`]),
    );
  }
  return Object.freeze({ manifest, bytes });
}

async function readDevelopmentFixtureBytes(name: string): Promise<Uint8Array> {
  return Uint8Array.from(await readFile(new URL(name, developmentFixtureDirectory)));
}

async function readDevelopmentFixtureText(name: string): Promise<string> {
  return readFile(new URL(name, developmentFixtureDirectory), "utf8");
}

async function readFormalManifest(): Promise<FormalFixtureManifest> {
  return JSON.parse(
    await readFile(new URL("manifest.v1.json", formalFixtureDirectory), "utf8"),
  ) as FormalFixtureManifest;
}

async function readCanonicalFormalFixture(): Promise<Uint8Array> {
  return Uint8Array.from(
    await readFile(
      new URL("1.0.0/canonical.creator-viewer.json", formalFixtureDirectory),
    ),
  );
}

function expectFailure(
  result: StoryArtifactReadResult,
  code: StoryArtifactReadErrorCode,
): Extract<StoryArtifactReadResult, { readonly ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Reader unexpectedly succeeded");
  expect(result).not.toHaveProperty("value");
  expect(result.error.code).toBe(code);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.error)).toBe(true);
  if ("details" in result.error) expect(Object.isFrozen(result.error.details)).toBe(true);
  return result;
}

type DevelopmentReadResult = ReturnType<typeof readDevelopmentStoryArtifact>;
type DevelopmentReadFailure = Extract<DevelopmentReadResult, { readonly ok: false }>;

function expectDevelopmentFailure(
  result: DevelopmentReadResult,
  code: StoryArtifactReadErrorCode,
): DevelopmentReadFailure {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Development Reader unexpectedly succeeded");
  expect(result).not.toHaveProperty("value");
  expect(result.error.code).toBe(code);
  return result;
}

describe("M0-048 正式 fixture 永久历史", () => {
  it("merge-base override 与长分支受保护提交集合均 fail-closed", () => {
    expect(() => resolveTrustedBaselineRevisions("HEAD")).toThrow(
      "STORY_FIXTURE_BASE_REFERENCE_INVALID",
    );
    expect(() => resolveTrustedBaselineRevisions("")).toThrow(
      "STORY_FIXTURE_BASE_REFERENCE_INVALID",
    );

    const headRevision = runGitText(["rev-parse", "HEAD"]).trim();
    expect(() => resolveTrustedBaselineRevisions(headRevision)).toThrow(
      "STORY_FIXTURE_BASE_EQUALS_HEAD",
    );

    const mergeBase = "1".repeat(40);
    const firstFreeze = "2".repeat(40);
    const laterAppend = "3".repeat(40);
    const laterRewrite = "4".repeat(40);
    expect(
      collectTrustedBaselineRevisions(
        mergeBase,
        `${firstFreeze}\n${laterAppend}\n${laterRewrite}\n`,
      ),
    ).toEqual([mergeBase, firstFreeze, laterAppend, laterRewrite]);
    expect(
      collectTrustedBaselineRevisions(firstFreeze, `${firstFreeze}\n${laterAppend}\n`),
    ).toEqual([firstFreeze, laterAppend]);
    expect(() => collectTrustedBaselineRevisions(mergeBase, "not-a-revision\n")).toThrow(
      "STORY_FIXTURE_PROTECTED_REVISION_INVALID",
    );
    expect(() => assertCompleteGitHistory("true\n")).toThrow(
      "STORY_FIXTURE_SHALLOW_HISTORY",
    );
    expect(hasFormalFixtureBaselineManifest([], [])).toBe(false);
    expect(() =>
      hasFormalFixtureBaselineManifest(
        [],
        [`${formalFixtureRepositoryPath}/1.0.0/orphaned.json`],
      ),
    ).toThrow("FORMAL_FIXTURE_BASELINE_MANIFEST_MISSING");
  });

  it("相对可信 baseline 只允许首次冻结或保持正式 manifest 与 fixture 不变", async () => {
    const currentManifest = await readFormalManifest();
    const currentBytes = await readCurrentFormalFixtureBytes(currentManifest);
    const revisions = resolveTrustedBaselineRevisions(
      process.env.DATAPULSE_MERGE_BASE,
    );
    let comparedBaselineCount = 0;

    for (const revision of revisions) {
      const baseline = readBaselineFormalFixtureHistory(revision);
      if (baseline === null) continue;
      comparedBaselineCount += 1;
      expect(
        validateImmutableFormalFixtures(
          currentManifest,
          baseline.manifest,
          currentBytes,
          baseline.bytes,
        ),
        `formal fixture history changed relative to ${revision}`,
      ).toEqual([]);
    }

    if (comparedBaselineCount === 0) {
      expect(currentManifest.formalHistory).toBe(true);
      expect(currentManifest.fixtures.length).toBeGreaterThan(0);
    }
  });

  it("否定自测拒绝删改重排，包含同时更新 fixture bytes 与 manifest hash", async () => {
    const baseline = await readFormalManifest();
    const baselineBytes = await readCurrentFormalFixtureBytes(baseline);
    const firstFixture = baseline.fixtures[0];
    expect(firstFixture).toBeDefined();
    if (firstFixture === undefined) return;

    const changedFixtureBytes = Uint8Array.from(
      baselineBytes.get(firstFixture.path) ?? [],
    );
    expect(changedFixtureBytes.byteLength).toBeGreaterThan(0);
    changedFixtureBytes[changedFixtureBytes.byteLength - 1] = 0x20;
    const changedBytes = new Map(baselineBytes);
    changedBytes.set(firstFixture.path, changedFixtureBytes);
    const changedManifest: FormalFixtureManifest = {
      ...baseline,
      fixtures: [
        {
          ...firstFixture,
          sha256: createHash("sha256")
            .update(changedFixtureBytes)
            .digest("hex"),
        },
        ...baseline.fixtures.slice(1),
      ],
    };
    expect(
      validateImmutableFormalFixtures(
        changedManifest,
        baseline,
        changedBytes,
        baselineBytes,
      ),
    ).toEqual([
      `FORMAL_FIXTURE_ENTRY_CHANGED:0:${firstFixture.id}`,
      `FORMAL_FIXTURE_BYTES_CHANGED:${firstFixture.path}`,
    ]);

    const truncatedManifest: FormalFixtureManifest = {
      ...baseline,
      fixtures: [],
    };
    expect(
      validateImmutableFormalFixtures(
        truncatedManifest,
        baseline,
        new Map(),
        baselineBytes,
      ),
    ).toContain("FORMAL_FIXTURE_ENTRY_COUNT_CHANGED");

    const appendedFixture: FormalFixtureEntry = {
      ...firstFixture,
      id: `${firstFixture.id}-appended`,
      path: "1.0.0/appended.contract.json",
    };
    const twoFixtureBaseline: FormalFixtureManifest = {
      ...baseline,
      fixtures: [firstFixture, appendedFixture],
    };
    const twoFixtureBytes = new Map(baselineBytes);
    twoFixtureBytes.set(appendedFixture.path, changedFixtureBytes);
    const reorderedManifest: FormalFixtureManifest = {
      ...twoFixtureBaseline,
      fixtures: [appendedFixture, firstFixture],
    };
    expect(
      validateImmutableFormalFixtures(
        reorderedManifest,
        twoFixtureBaseline,
        twoFixtureBytes,
        twoFixtureBytes,
      ),
    ).toEqual([
      `FORMAL_FIXTURE_ENTRY_CHANGED:0:${firstFixture.id}`,
      `FORMAL_FIXTURE_ENTRY_CHANGED:1:${appendedFixture.id}`,
    ]);

    const appendedManifest: FormalFixtureManifest = {
      ...baseline,
      fixtures: [...baseline.fixtures, appendedFixture],
    };
    expect(
      validateImmutableFormalFixtures(
        appendedManifest,
        baseline,
        twoFixtureBytes,
        baselineBytes,
      ),
    ).toContain("FORMAL_FIXTURE_ENTRY_COUNT_CHANGED");

    const changedManifestIdentity: FormalFixtureManifest = {
      ...baseline,
      compatibilityPromise: false,
      storySchema: {
        ...baseline.storySchema,
        sha256: "0".repeat(64),
      },
    };
    expect(
      validateImmutableFormalFixtures(
        changedManifestIdentity,
        baseline,
        baselineBytes,
        baselineBytes,
      ),
    ).toContain("FORMAL_FIXTURE_MANIFEST_CHANGED");
  });
});

describe("M0-048 正式 Story Artifact Reader", () => {
  it("根模块只公开单一读取操作和稳定错误码", () => {
    expect(Object.keys(storyMigrationsPublicModule).sort()).toEqual([
      "STORY_ARTIFACT_READ_ERROR_CODES",
      "readStoryArtifact",
    ]);
  });

  it("从原始 bytes 返回当前正式、隔离且深冻结的故事蓝图", async () => {
    const input = await readCanonicalFormalFixture();
    const originalBytes = input.slice();
    const result = readStoryArtifact(input, createFormalTrustedContext());

    expect(input).toEqual(originalBytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result).sort()).toEqual(["ok", "value"]);
    expect(result.value.schemaVersion).toBe("1.0.0");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.blocks)).toBe(true);
    expect(Object.isFrozen(result.value.blocks[0])).toBe(true);

    const originalGoal = result.value.reportGoal;
    input.fill(0);
    expect(result.value.reportGoal).toBe(originalGoal);
  });

  it("以一份 canonical fixture 对齐 Creator 与 Viewer 的 version、Schema hash 和 fixture hash", async () => {
    const manifest = await readFormalManifest();
    const fixture = manifest.fixtures[0];
    expect(manifest).toMatchObject({
      schemaVersion: "1.0.0",
      kind: "datapulse-formal-story-artifact-fixture-manifest",
      releaseStatus: "formal-contract-fixture",
      formalHistory: true,
      compatibilityPromise: true,
      hashAlgorithm: "SHA-256",
    });
    expect(Object.keys(manifest).sort()).toEqual([
      "compatibilityPromise",
      "fixtures",
      "formalHistory",
      "hashAlgorithm",
      "kind",
      "releaseStatus",
      "schemaVersion",
      "storySchema",
    ]);
    expect(Object.keys(manifest.storySchema).sort()).toEqual([
      "bytes",
      "path",
      "schemaId",
      "schemaVersion",
      "sha256",
    ]);
    expect(manifest.fixtures).toHaveLength(1);
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    expect(fixture.consumers).toEqual(["creator", "viewer"]);
    expect(fixture.schemaVersion).toBe("1.0.0");
    expect(Object.keys(fixture).sort()).toEqual([
      "bytes",
      "consumers",
      "id",
      "path",
      "schemaVersion",
      "sha256",
    ]);

    const schemaBytes = await readFile(
      new URL(`../../${manifest.storySchema.path}`, import.meta.url),
    );
    expect(manifest.storySchema).toMatchObject({
      schemaVersion: currentStoryContract.schemaVersion,
      schemaId: currentStoryContract.schemaId,
      bytes: currentStoryContract.schemaBytes,
      sha256: currentStoryContract.schemaSha256,
    });
    expect(schemaBytes.byteLength).toBe(manifest.storySchema.bytes);
    expect(createHash("sha256").update(schemaBytes).digest("hex")).toBe(
      manifest.storySchema.sha256,
    );

    const canonicalBytes = Uint8Array.from(
      await readFile(new URL(fixture.path, formalFixtureDirectory)),
    );
    expect(canonicalBytes.byteLength).toBe(fixture.bytes);
    expect(createHash("sha256").update(canonicalBytes).digest("hex")).toBe(
      fixture.sha256,
    );

    const creatorBytes = Uint8Array.from(canonicalBytes);
    const viewerBytes = Uint8Array.from(canonicalBytes);
    const creatorResult = readStoryArtifact(
      creatorBytes,
      createFormalTrustedContext(),
    );
    const viewerResult = readStoryArtifact(
      viewerBytes,
      createFormalTrustedContext(),
    );

    expect(creatorBytes).not.toBe(viewerBytes);
    expect(creatorResult.ok).toBe(true);
    expect(viewerResult.ok).toBe(true);
    if (!creatorResult.ok || !viewerResult.ok) return;
    expect(creatorResult.value).not.toBe(viewerResult.value);
    expect(creatorResult.value).toEqual(viewerResult.value);
    expect(creatorResult.value.schemaVersion).toBe(manifest.storySchema.schemaVersion);
    expect(viewerResult.value.schemaVersion).toBe(manifest.storySchema.schemaVersion);
  });

  it.each(["0.0.1.valid.json", "0.1.0.valid.json"])(
    "公共 Reader 对未发布开发样本 %s fail-closed",
    async (name) => {
      const failure = expectFailure(
        readStoryArtifact(
          await readDevelopmentFixtureBytes(name),
          createFormalTrustedContext(),
        ),
        STORY_ARTIFACT_READ_ERROR_CODES.versionUnsupported,
      );
      expect(failure.error.phase).toBe("version");
      expect(JSON.stringify(failure)).not.toContain(name.slice(0, 5));
    },
  );

  it("接受 Node Buffer 与跨 realm 的真实 Uint8Array", async () => {
    const fixture = await readCanonicalFormalFixture();
    expect(readStoryArtifact(Buffer.from(fixture), createFormalTrustedContext()).ok).toBe(
      true,
    );

    const crossRealm = runInNewContext("Uint8Array.from(bytes)", {
      bytes: [...fixture],
    }) as Uint8Array;
    expect(Object.getPrototypeOf(crossRealm)).not.toBe(Uint8Array.prototype);
    expect(readStoryArtifact(crossRealm, createFormalTrustedContext()).ok).toBe(true);
  });
});

describe("M0-048 正式 Reader 原始字节准入", () => {
  it.each([
    ["字符串", "not-a-byte-array" as unknown as Uint8Array],
    ["Uint8Array Proxy", new Proxy(new Uint8Array([0x7b, 0x7d]), {})],
    ["其他 typed array", new Uint16Array([1]) as unknown as Uint8Array],
    ["SharedArrayBuffer view", new Uint8Array(new SharedArrayBuffer(8))],
  ])("拒绝%s", (_name, input) => {
    expectFailure(
      readStoryArtifact(input, createFormalTrustedContext()),
      STORY_ARTIFACT_READ_ERROR_CODES.inputInvalid,
    );
  });

  it("拒绝 detached ArrayBuffer view", () => {
    const buffer = new ArrayBuffer(8);
    const input = new Uint8Array(buffer);
    structuredClone(buffer, { transfer: [buffer] });

    expectFailure(
      readStoryArtifact(input, createFormalTrustedContext()),
      STORY_ARTIFACT_READ_ERROR_CODES.inputInvalid,
    );
  });

  it("在 UTF-8 解码前按原始字节拒绝超过 16 MiB 的恶意输入", () => {
    const input = new Uint8Array(FORMAL_READER_MAX_INPUT_BYTES + 1);
    input.fill(0xff);
    const failure = expectFailure(
      readStoryArtifact(input, createFormalTrustedContext()),
      STORY_ARTIFACT_READ_ERROR_CODES.byteLimitExceeded,
    );

    expect(failure.error.phase).toBe("size");
    if (failure.error.code === STORY_ARTIFACT_READ_ERROR_CODES.byteLimitExceeded) {
      expect(failure.error.details).toEqual({
        observedBytes: FORMAL_READER_MAX_INPUT_BYTES + 1,
        maxBytes: FORMAL_READER_MAX_INPUT_BYTES,
      });
    }
  });

  it("接受以前置 JSON 空白补齐到恰好 16 MiB 的正式输入", async () => {
    const fixture = await readCanonicalFormalFixture();
    const input = new Uint8Array(FORMAL_READER_MAX_INPUT_BYTES);
    const prefixLength = input.length - fixture.length;
    input.fill(0x20, 0, prefixLength);
    input.set(fixture, prefixLength);

    expect(readStoryArtifact(input, createFormalTrustedContext()).ok).toBe(true);
  });
});

describe("M0-048 正式 Reader 解码、版本与校验失败", () => {
  it("fatal UTF-8 拒绝畸形字节，单个 UTF-8 BOM 明确接受且第二个 BOM 拒绝", async () => {
    expectFailure(
      readStoryArtifact(
        new Uint8Array([0xc3, 0x28]),
        createFormalTrustedContext(),
      ),
      STORY_ARTIFACT_READ_ERROR_CODES.utf8Invalid,
    );

    const fixture = await readCanonicalFormalFixture();
    const withBom = new Uint8Array(fixture.length + 3);
    withBom.set([0xef, 0xbb, 0xbf]);
    withBom.set(fixture, 3);
    expect(readStoryArtifact(withBom, createFormalTrustedContext()).ok).toBe(true);

    const withTwoBoms = new Uint8Array(fixture.length + 6);
    withTwoBoms.set([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]);
    withTwoBoms.set(fixture, 6);
    expectFailure(
      readStoryArtifact(withTwoBoms, createFormalTrustedContext()),
      STORY_ARTIFACT_READ_ERROR_CODES.jsonInvalid,
    );
  });

  it("区分 JSON、根值和版本标记错误", () => {
    expectFailure(
      readStoryArtifact(encoder.encode("{"), createFormalTrustedContext()),
      STORY_ARTIFACT_READ_ERROR_CODES.jsonInvalid,
    );

    for (const root of ["null", "[]", '"story"']) {
      expectFailure(
        readStoryArtifact(encoder.encode(root), createFormalTrustedContext()),
        STORY_ARTIFACT_READ_ERROR_CODES.rootInvalid,
      );
    }

    for (const versionRoot of ["{}", '{"schemaVersion":1}', '{"schemaVersion":"01.0.0"}']) {
      expectFailure(
        readStoryArtifact(
          encoder.encode(versionRoot),
          createFormalTrustedContext(),
        ),
        STORY_ARTIFACT_READ_ERROR_CODES.versionInvalid,
      );
    }
  });

  it("拒绝合法 SemVer 但未登记的正式版本且不回显版本文本", () => {
    const failure = expectFailure(
      readStoryArtifact(
        encoder.encode('{"schemaVersion":"9.9.9"}'),
        createFormalTrustedContext(),
      ),
      STORY_ARTIFACT_READ_ERROR_CODES.versionUnsupported,
    );
    expect(failure.error.phase).toBe("version");
    expect(Object.keys(failure.error).sort()).toEqual(["code", "phase"]);
    expect(JSON.stringify(failure)).not.toContain("9.9.9");
  });

  it("恶意正式 source 在结构 seam 拒绝且不执行任意内容", async () => {
    delete (globalThis as { compromised?: boolean }).compromised;
    const malicious = JSON.parse(
      new TextDecoder().decode(await readCanonicalFormalFixture()),
    ) as Record<string, unknown>;
    malicious["html"] =
      '<script>globalThis.compromised = true</script>';
    const result = readStoryArtifact(
      encoder.encode(JSON.stringify(malicious)),
      createFormalTrustedContext(),
    );

    expectFailure(result, STORY_ARTIFACT_READ_ERROR_CODES.sourceStructureInvalid);
    expect((globalThis as { compromised?: boolean }).compromised).toBeUndefined();
  });

  it("结构合法但 trustedContext 不匹配时最终语义拒绝", async () => {
    const context = {
      ...createFormalTrustedContext(),
      expectedStoryId: "story_other",
    };
    expectFailure(
      readStoryArtifact(await readCanonicalFormalFixture(), context),
      STORY_ARTIFACT_READ_ERROR_CODES.finalValidationFailed,
    );
  });

  it("失败不回显 payload、没有 value 且不替换最后可读故事蓝图", async () => {
    const current = readStoryArtifact(
      await readCanonicalFormalFixture(),
      createFormalTrustedContext(),
    );
    expect(current.ok).toBe(true);
    if (!current.ok) return;

    const marker = "secret-payload-marker-never-echo";
    const malicious = JSON.parse(
      new TextDecoder().decode(await readCanonicalFormalFixture()),
    ) as Record<string, unknown>;
    malicious[marker] = `<script>${marker}</script>`;
    const failed = expectFailure(
      readStoryArtifact(
        encoder.encode(JSON.stringify(malicious)),
        createFormalTrustedContext(),
      ),
      STORY_ARTIFACT_READ_ERROR_CODES.sourceStructureInvalid,
    );

    expect(JSON.stringify(failed)).not.toContain(marker);
    const retained = failed.ok ? failed.value : current.value;
    expect(retained).toBe(current.value);
  });
});

describe("M0-013 未发布开发迁移的内部回归", () => {
  it("读取当前 0.1.0 开发样本且不执行迁移", async () => {
    const result = readDevelopmentStoryArtifact(
      await readDevelopmentFixtureBytes("0.1.0.valid.json"),
      developmentTrustedContext,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceVersion).toBe("0.1.0");
    expect(result.currentVersion).toBe("0.1.0");
    expect(result.migrated).toBe(false);
    expect(result.value.schemaVersion).toBe("0.1.0");
  });

  it("只在开发 seam 从 0.0.1 复制迁移到 0.1.0", async () => {
    const result = readDevelopmentStoryArtifact(
      await readDevelopmentFixtureBytes("0.0.1.valid.json"),
      developmentTrustedContext,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceVersion).toBe("0.0.1");
    expect(result.currentVersion).toBe("0.1.0");
    expect(result.migrated).toBe(true);
    expect(result.value.schemaVersion).toBe("0.1.0");
    expect(result.value.storyTimezone).toBe("Asia/Shanghai");
    expect(Object.hasOwn(result.value, "storyTimeZone")).toBe(false);
  });

  it("保留开发迁移逐步结构与最终语义失败覆盖", async () => {
    expectDevelopmentFailure(
      readDevelopmentStoryArtifact(
        await readDevelopmentFixtureBytes("0.0.1.target-invalid.json"),
        developmentTrustedContext,
      ),
      STORY_ARTIFACT_READ_ERROR_CODES.migratedStructureInvalid,
    );
    expectDevelopmentFailure(
      readDevelopmentStoryArtifact(
        await readDevelopmentFixtureBytes("0.1.0.final-invalid.json"),
        developmentTrustedContext,
      ),
      STORY_ARTIFACT_READ_ERROR_CODES.finalValidationFailed,
    );
  });

  it("开发恶意 source 在迁移前结构拒绝且不执行任意内容", async () => {
    delete (globalThis as { compromised?: boolean }).compromised;
    const result = readDevelopmentStoryArtifact(
      await readDevelopmentFixtureBytes("malicious-source.json"),
      developmentTrustedContext,
    );
    expectDevelopmentFailure(
      result,
      STORY_ARTIFACT_READ_ERROR_CODES.sourceStructureInvalid,
    );
    expect((globalThis as { compromised?: boolean }).compromised).toBeUndefined();
  });

  it("开发 manifest 继续固定未发布 fixture，且不构成正式迁移历史", async () => {
    const manifest = JSON.parse(
      await readDevelopmentFixtureText("manifest.v1.json"),
    ) as {
      releaseStatus: string;
      formalHistory: boolean;
      compatibilityPromise: boolean;
      fixtures: readonly { path: string; bytes: number; sha256: string }[];
    };
    expect(manifest).toMatchObject({
      releaseStatus: "unpublished-development-sample",
      formalHistory: false,
      compatibilityPromise: false,
    });
    expect(manifest.fixtures).toHaveLength(6);

    for (const fixture of manifest.fixtures) {
      const bytes = await readFile(new URL(fixture.path, developmentFixtureDirectory));
      expect(bytes.byteLength, fixture.path).toBe(fixture.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), fixture.path).toBe(
        fixture.sha256,
      );
    }
  });
});

describe("M0-048 正式 Reader Windows ESM 包级探针", () => {
  it("Node 原生 ESM 从外部 cwd 加载含空格绝对 URL 且不用 shell", async () => {
    const moduleUrl = new URL(
      "../../packages/story-migrations/dist/index.js",
      import.meta.url,
    ).href;
    const fixtureText = await readFile(
      new URL("1.0.0/canonical.creator-viewer.json", formalFixtureDirectory),
      "utf8",
    );
    const trustedContext = createFormalTrustedContext();
    const probe = [
      `import { readStoryArtifact } from ${JSON.stringify(moduleUrl)};`,
      `const input = new TextEncoder().encode(${JSON.stringify(fixtureText)});`,
      `const context = ${JSON.stringify(trustedContext)};`,
      "const result = readStoryArtifact(input, context);",
      'if (!result.ok || result.value.schemaVersion !== "1.0.0" || Object.hasOwn(result, "migrated")) throw new Error("native ESM Reader probe failed");',
      'process.stdout.write("story-artifact-reader-native-esm=passed");',
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
      cwd: tmpdir(),
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("story-artifact-reader-native-esm=passed");
    expect(result.stderr).toBe("");
  });

  it("通过 Vite 8 write:false ESM 探针且不冒充产品应用构建", async () => {
    const result = await viteBuild({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(
            new URL("../../packages/story-migrations/dist/index.js", import.meta.url),
          ),
          formats: ["es"],
          name: "DataPulseStoryArtifactReaderProbe",
        },
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((output) => output.output)
      : result.output;
    const code = outputs
      .filter((output): output is Rollup.OutputChunk => output.type === "chunk")
      .map((output) => output.code)
      .join("\n");
    expect(code).toContain("readStoryArtifact");
  });
});
