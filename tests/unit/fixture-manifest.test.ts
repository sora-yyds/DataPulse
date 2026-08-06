import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The repository checker is intentionally public ESM JavaScript rather than a workspace package.
// @ts-expect-error -- the public checker has no separately generated declaration file.
import { verifyFixtureManifest } from "../../scripts/fixture-manifest.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = "tests/fixtures/manifest.v1.json";
const fixtureRoots = [
  "tests/fixtures",
  "apps/creator/src/fixtures",
  "apps/viewer/src/fixtures",
] as const;
const maximumSnapshotEntries = 100_000;
const maximumSnapshotDepth = 32;
const maximumSnapshotFileBytes = 16 * 1024 * 1024;
const maximumSnapshotTotalBytes = 256 * 1024 * 1024;
const repositoryRealRoot = realpathSync.native(repositoryRoot);

function assertSnapshotDirectorySafe(relativeDirectory: string): void {
  let current = repositoryRoot;
  for (const segment of relativeDirectory.split("/")) {
    current = resolve(current, segment);
    const status = lstatSync(current);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new Error("fixture unit snapshot rejects unsafe directories");
    }
  }
  const fromRoot = relative(repositoryRealRoot, realpathSync.native(current));
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("fixture unit snapshot directory escaped repository root");
  }
}

interface MemoryOverrides {
  readonly fileSizes?: ReadonlyMap<string, number>;
  readonly kinds?: ReadonlyMap<string, string>;
  readonly realpaths?: ReadonlyMap<string, string>;
  readonly inventory?: readonly { readonly path: string; readonly kind: string }[];
}

interface MemoryRepository {
  readonly rootRealPath: string;
  readonly files: Map<string, Uint8Array>;
  readonly readCounts: Map<string, number>;
  readFile(path: string): Uint8Array;
  fileSize(path: string): number;
  pathKind(path: string): string;
  realpath(path: string): string;
  listFixtureEntries(): readonly { readonly path: string; readonly kind: string }[];
}

function snapshotFiles(): ReadonlyMap<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let entryCount = 0;
  let totalBytes = 0;
  const visit = (relativeDirectory: string, depth: number): void => {
    if (depth > maximumSnapshotDepth) {
      throw new RangeError("fixture unit snapshot depth limit exceeded");
    }
    assertSnapshotDirectorySafe(relativeDirectory);
    const absoluteDirectory = resolve(repositoryRoot, ...relativeDirectory.split("/"));
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      entryCount += 1;
      if (entryCount > maximumSnapshotEntries) {
        throw new RangeError("fixture unit snapshot entry limit exceeded");
      }
      const path = `${relativeDirectory}/${entry.name}`;
      const absolutePath = resolve(repositoryRoot, ...path.split("/"));
      if (entry.isSymbolicLink()) {
        throw new Error("fixture unit snapshot rejects symbolic links");
      }
      if (entry.isDirectory()) {
        visit(path, depth + 1);
      } else if (entry.isFile()) {
        const fileBytes = lstatSync(absolutePath).size;
        if (
          !Number.isSafeInteger(fileBytes) ||
          fileBytes < 0 ||
          fileBytes > maximumSnapshotFileBytes ||
          totalBytes + fileBytes > maximumSnapshotTotalBytes
        ) {
          throw new RangeError("fixture unit snapshot byte limit exceeded");
        }
        const bytes = readFileSync(absolutePath);
        if (bytes.byteLength !== fileBytes) {
          throw new Error("fixture unit snapshot size changed while reading");
        }
        totalBytes += fileBytes;
        files.set(path, new Uint8Array(bytes));
      } else {
        throw new Error("fixture unit snapshot rejects non-regular entries");
      }
    }
  };
  for (const root of fixtureRoots) visit(root, 0);
  return files;
}

function memoryRepository(
  source = snapshotFiles(),
  overrides: MemoryOverrides = {},
): MemoryRepository {
  const files = new Map(
    [...source].map(([path, bytes]) => [path, new Uint8Array(bytes)]),
  );
  const rootRealPath = resolve(repositoryRoot, ".fixture-manifest-vitest-root");
  const readCounts = new Map<string, number>();
  return {
    rootRealPath,
    files,
    readCounts,
    readFile(path) {
      readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error("missing synthetic memory file");
      return new Uint8Array(bytes);
    },
    fileSize(path) {
      const overridden = overrides.fileSizes?.get(path);
      if (overridden !== undefined) return overridden;
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error("missing synthetic memory file");
      return bytes.byteLength;
    },
    pathKind(path) {
      return overrides.kinds?.get(path) ?? (files.has(path) ? "regular-file" : "missing");
    },
    realpath(path) {
      return overrides.realpaths?.get(path) ?? resolve(rootRealPath, ...path.split("/"));
    },
    listFixtureEntries() {
      if (overrides.inventory !== undefined) return overrides.inventory;
      return [...files.keys()].map((path) => ({ path, kind: "regular-file" }));
    },
  };
}

function readManifest(repository: MemoryRepository): Record<string, unknown> {
  const bytes = repository.files.get(manifestPath);
  if (bytes === undefined) throw new Error("root manifest missing from memory adapter");
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function writeManifest(repository: MemoryRepository, manifest: Record<string, unknown>): void {
  repository.files.set(
    manifestPath,
    new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  );
}

function fixtureSets(manifest: Record<string, unknown>): Record<string, unknown>[] {
  return manifest.fixtureSets as Record<string, unknown>[];
}

function artifacts(fixtureSet: Record<string, unknown>): Record<string, unknown>[] {
  return fixtureSet.artifacts as Record<string, unknown>[];
}

function failureCodes(result: { failures: readonly { code: string }[] }): string[] {
  return result.failures.map(({ code }) => code);
}

describe("M0-017 public fixture manifest verifier", () => {
  it("verifies the four-set synthetic catalog from a repository path", () => {
    const result = verifyFixtureManifest(repositoryRoot);
    expect(result).toMatchObject({
      check: "fixture-manifest",
      result: "passed",
      catalog: {
        logicalFixtureSets: 4,
        artifacts: 12,
        generatedFixtureSets: 0,
      },
      failures: [],
    });
    expect(result.assertions.executed).toBeGreaterThan(0);
    expect(result.assertions.failed).toBe(0);
  });

  it("uses the same public interface to reject malicious in-memory catalogs", () => {
    const cases: readonly {
      readonly expectedCode: string;
      readonly mutate: (repository: MemoryRepository, manifest: Record<string, unknown>) => void;
    }[] = [
      {
        expectedCode: "FIXTURE_PATH_INVALID",
        mutate(_repository, manifest) {
          artifacts(fixtureSets(manifest)[0]!)[0]!.path = "tests/fixtures/%2e%2e/escape.json";
        },
      },
      {
        expectedCode: "FIXTURE_PATH_INVALID",
        mutate(_repository, manifest) {
          artifacts(fixtureSets(manifest)[0]!)[0]!.path =
            "tests/fixtures/SHORTN~1/case.json";
        },
      },
      {
        expectedCode: "FIXTURE_PATH_INVALID",
        mutate(_repository, manifest) {
          artifacts(fixtureSets(manifest)[0]!)[0]!.path = "tests/fixtures/COM¹.json";
        },
      },
      {
        expectedCode: "FIXTURE_PATH_INVALID",
        mutate(_repository, manifest) {
          artifacts(fixtureSets(manifest)[0]!)[0]!.path = "tests/fixtures/CONIN$.json";
        },
      },
      {
        expectedCode: "FIXTURE_PATH_INVALID",
        mutate(_repository, manifest) {
          artifacts(fixtureSets(manifest)[0]!)[0]!.path =
            "tests/fixtures/LPT³.fixture.json";
        },
      },
      {
        expectedCode: "FIXTURE_ID_DUPLICATE",
        mutate(_repository, manifest) {
          const setArtifacts = artifacts(fixtureSets(manifest)[0]!);
          setArtifacts[1]!.id = setArtifacts[0]!.id;
        },
      },
      {
        expectedCode: "FIXTURE_SET_UNREGISTERED",
        mutate(_repository, manifest) {
          fixtureSets(manifest)[0]!.id = "future-unregistered-set";
        },
      },
      {
        expectedCode: "FIXTURE_GENERATOR_UNREGISTERED",
        mutate(_repository, manifest) {
          const generation = fixtureSets(manifest)[0]!.generation as Record<string, unknown>;
          const generator = generation.generator as Record<string, unknown>;
          generator.version = "unregistered-v2";
        },
      },
      {
        expectedCode: "FIXTURE_EXPECTED_ASSERTION_INVALID",
        mutate(_repository, manifest) {
          const expected = fixtureSets(manifest)[2]!.expectedAssertions as Record<string, unknown>[];
          expected[0]!.value = 24;
        },
      },
      {
        expectedCode: "FIXTURE_EXPECTED_ASSERTION_ID_DUPLICATE",
        mutate(_repository, manifest) {
          const expected = fixtureSets(manifest)[0]!.expectedAssertions as Record<string, unknown>[];
          expected[2]!.id = expected[0]!.id;
        },
      },
      {
        expectedCode: "FIXTURE_MANIFEST_SCHEMA_INVALID",
        mutate(_repository, manifest) {
          const generation = fixtureSets(manifest)[0]!.generation as Record<string, unknown>;
          generation.mode = "generated";
          generation.generatorFile = fixtureSets(manifest)[0]!.subManifest;
        },
      },
      {
        expectedCode: "FIXTURE_INVENTORY_UNREGISTERED",
        mutate(repository) {
          repository.files.set(
            "tests/fixtures/unregistered.json",
            new TextEncoder().encode("{}\n"),
          );
        },
      },
      {
        expectedCode: "FIXTURE_ARTIFACT_HASH_MISMATCH",
        mutate(repository) {
          const path = "apps/viewer/src/fixtures/metric-runtime.json";
          const bytes = new Uint8Array(repository.files.get(path)!);
          bytes[0] ^= 1;
          repository.files.set(path, bytes);
        },
      },
    ];

    for (const { expectedCode, mutate } of cases) {
      const repository = memoryRepository();
      const manifest = readManifest(repository);
      mutate(repository, manifest);
      writeManifest(repository, manifest);
      const first = verifyFixtureManifest(repository);
      const second = verifyFixtureManifest(repository);
      expect(failureCodes(first), expectedCode).toContain(expectedCode);
      expect(first.result).toBe("failed");
      expect(second.failures).toEqual(first.failures);
    }
  });

  it("rejects oversized metadata and realpath escapes before reading artifact bytes", () => {
    const oversized = memoryRepository(snapshotFiles(), {
      fileSizes: new Map([[manifestPath, 8 * 1024 * 1024 + 1]]),
    });
    const oversizedResult = verifyFixtureManifest(oversized);
    expect(failureCodes(oversizedResult)).toContain("FIXTURE_MANIFEST_SIZE_LIMIT_EXCEEDED");
    expect(oversized.readCounts.get(manifestPath) ?? 0).toBe(0);

    const unsafeManifest = memoryRepository(snapshotFiles(), {
      kinds: new Map([[manifestPath, "symlink"]]),
      realpaths: new Map([[manifestPath, resolve(repositoryRoot, "outside-manifest.json")]]),
    });
    const unsafeManifestResult = verifyFixtureManifest(unsafeManifest);
    expect(failureCodes(unsafeManifestResult)).toContain(
      "FIXTURE_INFRASTRUCTURE_PATH_UNSAFE",
    );
    expect(unsafeManifest.readCounts.get(manifestPath) ?? 0).toBe(0);

    const artifactPath = "apps/creator/src/fixtures/story-artifact.json";
    const escaped = memoryRepository(snapshotFiles(), {
      kinds: new Map([[artifactPath, "symlink"]]),
      realpaths: new Map([[artifactPath, resolve(repositoryRoot, "outside.json")]]),
    });
    const escapedResult = verifyFixtureManifest(escaped);
    expect(failureCodes(escapedResult)).toEqual(
      expect.arrayContaining(["FIXTURE_FILE_KIND_INVALID", "FIXTURE_REALPATH_ESCAPE"]),
    );
    expect(escaped.readCounts.get(artifactPath) ?? 0).toBe(0);
  });

  it("rejects hidden inventory entries and duplicate registered realpaths", () => {
    const files = snapshotFiles();
    const ghostPath = "apps/viewer/src/fixtures/story-artifact.json";
    const ghost = memoryRepository(files, {
      inventory: [...files.keys()]
        .filter((path) => path !== ghostPath)
        .map((path) => ({ path, kind: "regular-file" })),
    });
    const ghostResult = verifyFixtureManifest(ghost);
    expect(failureCodes(ghostResult)).toContain(
      "FIXTURE_INVENTORY_REGISTERED_PATH_MISSING",
    );

    const canonicalPath = "apps/creator/src/fixtures/story-artifact.json";
    const aliasPath = "apps/viewer/src/fixtures/story-artifact.json";
    const realpaths = new Map<string, string>();
    const alias = memoryRepository(files, { realpaths });
    realpaths.set(
      aliasPath,
      resolve(alias.rootRealPath, ...canonicalPath.split("/")),
    );
    const aliasResult = verifyFixtureManifest(alias);
    expect(failureCodes(aliasResult)).toContain("FIXTURE_REALPATH_DUPLICATE");
  });
});
