import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyFixtureManifest } from "./fixture-manifest.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoots = [
  "tests/fixtures",
  "apps/creator/src/fixtures",
  "apps/viewer/src/fixtures",
];
const maximumSnapshotEntries = 100_000;
const maximumSnapshotDepth = 32;
const maximumSnapshotFileBytes = 16 * 1024 * 1024;
const maximumSnapshotTotalBytes = 256 * 1024 * 1024;
const repositoryRealRoot = realpathSync.native(repositoryRoot);

function assertSnapshotDirectorySafe(relativeDirectory) {
  let current = repositoryRoot;
  for (const segment of relativeDirectory.split("/")) {
    current = resolve(current, segment);
    const status = lstatSync(current);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new Error("fixture self-test snapshot rejects unsafe directories");
    }
  }
  const fromRoot = relative(repositoryRealRoot, realpathSync.native(current));
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("fixture self-test snapshot directory escaped repository root");
  }
}

function cloneBytes(bytes) {
  return new Uint8Array(bytes);
}

function snapshotFixtureFiles() {
  const files = new Map();
  let entryCount = 0;
  let totalBytes = 0;
  const visit = (relativeDirectory, depth) => {
    if (depth > maximumSnapshotDepth) {
      throw new RangeError("fixture self-test snapshot depth limit exceeded");
    }
    assertSnapshotDirectorySafe(relativeDirectory);
    const absoluteDirectory = resolve(repositoryRoot, ...relativeDirectory.split("/"));
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      entryCount += 1;
      if (entryCount > maximumSnapshotEntries) {
        throw new RangeError("fixture self-test snapshot entry limit exceeded");
      }
      const relativePath = `${relativeDirectory}/${entry.name}`;
      const absolutePath = resolve(repositoryRoot, ...relativePath.split("/"));
      if (entry.isSymbolicLink()) {
        throw new Error("fixture self-test snapshot rejects symbolic links");
      }
      if (entry.isDirectory()) {
        visit(relativePath, depth + 1);
      } else if (entry.isFile()) {
        const fileBytes = lstatSync(absolutePath).size;
        if (
          !Number.isSafeInteger(fileBytes) ||
          fileBytes < 0 ||
          fileBytes > maximumSnapshotFileBytes ||
          totalBytes + fileBytes > maximumSnapshotTotalBytes
        ) {
          throw new RangeError("fixture self-test snapshot byte limit exceeded");
        }
        const bytes = readFileSync(absolutePath);
        if (bytes.byteLength !== fileBytes) {
          throw new Error("fixture self-test snapshot size changed while reading");
        }
        totalBytes += fileBytes;
        files.set(
          relativePath,
          cloneBytes(bytes),
        );
      } else {
        throw new Error("fixture self-test snapshot rejects non-regular entries");
      }
    }
  };
  for (const root of fixtureRoots) {
    visit(root, 0);
  }
  return files;
}

function createMemoryRepository(sourceFiles, overrides = {}) {
  const files = new Map(
    [...sourceFiles].map(([path, bytes]) => [path, cloneBytes(bytes)]),
  );
  const rootRealPath = resolve(repositoryRoot, ".fixture-manifest-memory-root");
  const readCounts = new Map();
  return {
    rootRealPath,
    readCounts,
    files,
    readFile(path) {
      readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error("missing memory file");
      return cloneBytes(bytes);
    },
    fileSize(path) {
      if (overrides.fileSizes?.has(path)) return overrides.fileSizes.get(path);
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error("missing memory file");
      return bytes.byteLength;
    },
    pathKind(path) {
      if (overrides.kinds?.has(path)) return overrides.kinds.get(path);
      return files.has(path) ? "regular-file" : "missing";
    },
    realpath(path) {
      if (overrides.realpaths?.has(path)) return overrides.realpaths.get(path);
      return resolve(rootRealPath, ...path.split("/"));
    },
    listFixtureEntries() {
      if (overrides.inventory !== undefined) return overrides.inventory;
      return [...files.keys()].map((path) => ({ path, kind: "regular-file" }));
    },
  };
}

function readMemoryJson(repository, path) {
  return JSON.parse(new TextDecoder().decode(repository.files.get(path)));
}

function writeMemoryJson(repository, path, value) {
  repository.files.set(
    path,
    new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`),
  );
}

function hasFailure(summary, code) {
  return summary.failures.some((failure) => failure.code === code);
}

function runSelfTests() {
  const assertions = [];
  const baseFiles = snapshotFixtureFiles();
  const assert = (passed, name, expected, actual) => {
    assertions.push({ passed, name, expected, actual });
  };

  const current = verifyFixtureManifest(createMemoryRepository(baseFiles));
  assert(current.result === "passed", "memory adapter accepts current catalog", "passed", current.result);

  const schemaAdditional = createMemoryRepository(baseFiles);
  const schemaAdditionalManifest = readMemoryJson(
    schemaAdditional,
    "tests/fixtures/manifest.v1.json",
  );
  schemaAdditionalManifest.untrusted = true;
  writeMemoryJson(schemaAdditional, "tests/fixtures/manifest.v1.json", schemaAdditionalManifest);
  const schemaAdditionalResult = verifyFixtureManifest(schemaAdditional);
  assert(
    hasFailure(schemaAdditionalResult, "FIXTURE_MANIFEST_SCHEMA_INVALID"),
    "schema rejects additional properties",
    "FIXTURE_MANIFEST_SCHEMA_INVALID",
    schemaAdditionalResult.failures[0]?.code,
  );

  for (const hostilePath of [
    "../escape.json",
    "tests\\fixtures\\escape.json",
    "C:relative.json",
    "C:/absolute.json",
    "tests/fixtures/%2e%2e/escape.json",
    "tests/fixtures/NUL.json",
    "tests/fixtures/SHORTN~1/case.json",
    "tests/fixtures/COM¹.json",
    "tests/fixtures/LPT².fixture.json",
    "tests/fixtures/CONIN$.json",
    "tests/fixtures/CONOUT$.json",
    "tests/fixtures/CLOCK$.json",
    "tests/fixtures/trailing. /escape.json",
    "tests/fixtures/data.json:stream",
  ]) {
    const pathRepository = createMemoryRepository(baseFiles);
    const pathManifest = readMemoryJson(pathRepository, "tests/fixtures/manifest.v1.json");
    pathManifest.fixtureSets[0].artifacts[0].path = hostilePath;
    writeMemoryJson(pathRepository, "tests/fixtures/manifest.v1.json", pathManifest);
    const result = verifyFixtureManifest(pathRepository);
    assert(
      hasFailure(result, "FIXTURE_PATH_INVALID"),
      `path rejects ${hostilePath}`,
      "FIXTURE_PATH_INVALID",
      result.failures.map(({ code }) => code),
    );
  }

  const hashRepository = createMemoryRepository(baseFiles);
  const hashPath = "apps/viewer/src/fixtures/metric-runtime.json";
  const corrupted = cloneBytes(hashRepository.files.get(hashPath));
  corrupted[0] ^= 1;
  hashRepository.files.set(hashPath, corrupted);
  const hashResult = verifyFixtureManifest(hashRepository);
  assert(
    hasFailure(hashResult, "FIXTURE_ARTIFACT_HASH_MISMATCH"),
    "raw-byte hash mismatch is rejected",
    "FIXTURE_ARTIFACT_HASH_MISMATCH",
    hashResult.failures.map(({ code }) => code),
  );

  const duplicateRepository = createMemoryRepository(baseFiles);
  const duplicateManifest = readMemoryJson(duplicateRepository, "tests/fixtures/manifest.v1.json");
  duplicateManifest.fixtureSets[0].artifacts[1].id =
    duplicateManifest.fixtureSets[0].artifacts[0].id;
  writeMemoryJson(duplicateRepository, "tests/fixtures/manifest.v1.json", duplicateManifest);
  const duplicateResult = verifyFixtureManifest(duplicateRepository);
  assert(
    hasFailure(duplicateResult, "FIXTURE_ID_DUPLICATE"),
    "duplicate IDs are rejected",
    "FIXTURE_ID_DUPLICATE",
    duplicateResult.failures.map(({ code }) => code),
  );

  const duplicatePathRepository = createMemoryRepository(baseFiles);
  const duplicatePathManifest = readMemoryJson(
    duplicatePathRepository,
    "tests/fixtures/manifest.v1.json",
  );
  const duplicatePathArtifact = {
    ...duplicatePathManifest.fixtureSets[0].artifacts[0],
    id: "story-development-duplicate-path",
  };
  duplicatePathManifest.fixtureSets[0].artifacts.push(duplicatePathArtifact);
  duplicatePathManifest.catalog.artifacts += 1;
  writeMemoryJson(
    duplicatePathRepository,
    "tests/fixtures/manifest.v1.json",
    duplicatePathManifest,
  );
  const duplicatePathResult = verifyFixtureManifest(duplicatePathRepository);
  assert(
    hasFailure(duplicatePathResult, "FIXTURE_PATH_DUPLICATE") &&
      duplicatePathRepository.readCounts.get(duplicatePathArtifact.path) === 1,
    "duplicate artifact paths stop before a second byte read",
    { code: "FIXTURE_PATH_DUPLICATE", reads: 1 },
    {
      codes: duplicatePathResult.failures.map(({ code }) => code),
      reads: duplicatePathRepository.readCounts.get(duplicatePathArtifact.path) ?? 0,
    },
  );

  const oversizedCatalogFileSizes = new Map();
  const oversizedCatalogRepository = createMemoryRepository(baseFiles, {
    fileSizes: oversizedCatalogFileSizes,
  });
  const oversizedCatalogManifest = readMemoryJson(
    oversizedCatalogRepository,
    "tests/fixtures/manifest.v1.json",
  );
  const oversizedCatalogPaths = [];
  for (let index = 0; index < 17; index += 1) {
    const path = `tests/fixtures/story-artifacts/development/budget-${index}.json`;
    oversizedCatalogPaths.push(path);
    oversizedCatalogManifest.fixtureSets[0].artifacts.push({
      id: `story-development-budget-${index}`,
      path,
      bytes: 16 * 1024 * 1024,
      sha256: "0".repeat(64),
    });
    oversizedCatalogRepository.files.set(path, new Uint8Array([index]));
    oversizedCatalogFileSizes.set(path, 16 * 1024 * 1024);
  }
  oversizedCatalogManifest.catalog.artifacts += oversizedCatalogPaths.length;
  writeMemoryJson(
    oversizedCatalogRepository,
    "tests/fixtures/manifest.v1.json",
    oversizedCatalogManifest,
  );
  const oversizedCatalogResult = verifyFixtureManifest(oversizedCatalogRepository);
  const oversizedCatalogReads = oversizedCatalogPaths.reduce(
    (count, path) => count + (oversizedCatalogRepository.readCounts.get(path) ?? 0),
    0,
  );
  assert(
    hasFailure(oversizedCatalogResult, "FIXTURE_TOTAL_READ_LIMIT_EXCEEDED") &&
      oversizedCatalogReads === 0,
    "aggregate fixture bytes are rejected before artifact reads",
    { code: "FIXTURE_TOTAL_READ_LIMIT_EXCEEDED", reads: 0 },
    {
      codes: oversizedCatalogResult.failures.map(({ code }) => code),
      reads: oversizedCatalogReads,
    },
  );

  const failureFloodRepository = createMemoryRepository(baseFiles);
  const failureFloodManifest = readMemoryJson(
    failureFloodRepository,
    "tests/fixtures/manifest.v1.json",
  );
  const repeatedArtifact = failureFloodManifest.fixtureSets[0].artifacts[0];
  for (let index = 0; index < 300; index += 1) {
    failureFloodManifest.fixtureSets[0].artifacts.push({
      ...repeatedArtifact,
      id: `story-development-failure-flood-${index}`,
    });
  }
  const failureFloodTailPath =
    "tests/fixtures/story-artifacts/development/failure-limit-tail.json";
  failureFloodManifest.fixtureSets[0].artifacts.push({
    id: "story-development-failure-limit-tail",
    path: failureFloodTailPath,
    bytes: 1,
    sha256: "0".repeat(64),
  });
  failureFloodRepository.files.set(failureFloodTailPath, new Uint8Array([1]));
  failureFloodManifest.catalog.artifacts += 301;
  writeMemoryJson(
    failureFloodRepository,
    "tests/fixtures/manifest.v1.json",
    failureFloodManifest,
  );
  const failureFloodResult = verifyFixtureManifest(failureFloodRepository);
  assert(
    hasFailure(failureFloodResult, "FIXTURE_FAILURE_LIMIT_EXCEEDED") &&
      (failureFloodRepository.readCounts.get(failureFloodTailPath) ?? 0) === 0,
    "failure detail exhaustion stops before later artifact reads",
    { code: "FIXTURE_FAILURE_LIMIT_EXCEEDED", tailReads: 0 },
    {
      codes: failureFloodResult.failures.map(({ code }) => code),
      tailReads: failureFloodRepository.readCounts.get(failureFloodTailPath) ?? 0,
    },
  );

  let directoryEntriesYielded = 0;
  let directoryFloodTailReached = false;
  const directoryFloodRepository = createMemoryRepository(baseFiles, {
    inventory: {
      *[Symbol.iterator]() {
        for (let index = 0; index <= 100_000; index += 1) {
          directoryEntriesYielded += 1;
          yield {
            path: `tests/fixtures/directory-flood/entry-${index}`,
            kind: "directory",
          };
        }
        directoryFloodTailReached = true;
        yield {
          path: "tests/fixtures/directory-flood/unreachable-tail",
          kind: "directory",
        };
      },
    },
  });
  const directoryFloodResult = verifyFixtureManifest(directoryFloodRepository);
  assert(
    hasFailure(directoryFloodResult, "FIXTURE_INVENTORY_LIMIT_EXCEEDED") &&
      directoryEntriesYielded === 100_001 &&
      !directoryFloodTailReached,
    "incremental inventory counts directories and stops before the iterator tail",
    {
      code: "FIXTURE_INVENTORY_LIMIT_EXCEEDED",
      entriesYielded: 100_001,
      tailReached: false,
    },
    {
      codes: directoryFloodResult.failures.map(({ code }) => code),
      entriesYielded: directoryEntriesYielded,
      tailReached: directoryFloodTailReached,
    },
  );

  const generatedSeedRepository = createMemoryRepository(baseFiles);
  const generatedSeedManifest = readMemoryJson(
    generatedSeedRepository,
    "tests/fixtures/manifest.v1.json",
  );
  generatedSeedManifest.fixtureSets[0].generation.mode = "generated";
  generatedSeedManifest.fixtureSets[0].generation.generatorFile =
    generatedSeedManifest.fixtureSets[0].subManifest;
  writeMemoryJson(
    generatedSeedRepository,
    "tests/fixtures/manifest.v1.json",
    generatedSeedManifest,
  );
  const generatedSeedResult = verifyFixtureManifest(generatedSeedRepository);
  assert(
    hasFailure(generatedSeedResult, "FIXTURE_MANIFEST_SCHEMA_INVALID"),
    "generated declarations require a fixed seed",
    "FIXTURE_MANIFEST_SCHEMA_INVALID",
    generatedSeedResult.failures[0]?.code,
  );

  const oversizedPath = "tests/fixtures/manifest.v1.json";
  const oversizedRepository = createMemoryRepository(baseFiles, {
    fileSizes: new Map([[oversizedPath, 8 * 1024 * 1024 + 1]]),
  });
  const oversizedResult = verifyFixtureManifest(oversizedRepository);
  assert(
    hasFailure(oversizedResult, "FIXTURE_MANIFEST_SIZE_LIMIT_EXCEEDED") &&
      (oversizedRepository.readCounts.get(oversizedPath) ?? 0) === 0,
    "oversized root manifest is rejected before read",
    { code: "FIXTURE_MANIFEST_SIZE_LIMIT_EXCEEDED", reads: 0 },
    {
      codes: oversizedResult.failures.map(({ code }) => code),
      reads: oversizedRepository.readCounts.get(oversizedPath) ?? 0,
    },
  );

  const symlinkPath = "apps/viewer/src/fixtures/story-artifact.json";
  const symlinkRepository = createMemoryRepository(baseFiles, {
    kinds: new Map([[symlinkPath, "symlink"]]),
    realpaths: new Map([[symlinkPath, resolve(repositoryRoot, "outside.json")]]),
  });
  const symlinkResult = verifyFixtureManifest(symlinkRepository);
  assert(
    hasFailure(symlinkResult, "FIXTURE_FILE_KIND_INVALID") &&
      hasFailure(symlinkResult, "FIXTURE_REALPATH_ESCAPE"),
    "symlink escape is rejected",
    ["FIXTURE_FILE_KIND_INVALID", "FIXTURE_REALPATH_ESCAPE"],
    symlinkResult.failures.map(({ code }) => code),
  );

  const unregisteredRepository = createMemoryRepository(baseFiles);
  unregisteredRepository.files.set(
    "tests/fixtures/unregistered.csv",
    new TextEncoder().encode("synthetic-marker\n"),
  );
  const unregisteredResult = verifyFixtureManifest(unregisteredRepository);
  assert(
    hasFailure(unregisteredResult, "FIXTURE_INVENTORY_UNREGISTERED"),
    "unregistered fixture files are rejected",
    "FIXTURE_INVENTORY_UNREGISTERED",
    unregisteredResult.failures.map(({ code }) => code),
  );

  const ghostPath = "apps/viewer/src/fixtures/story-artifact.json";
  const ghostRepository = createMemoryRepository(baseFiles, {
    inventory: [...baseFiles.keys()]
      .filter((path) => path !== ghostPath)
      .map((path) => ({ path, kind: "regular-file" })),
  });
  const ghostResult = verifyFixtureManifest(ghostRepository);
  assert(
    hasFailure(ghostResult, "FIXTURE_INVENTORY_REGISTERED_PATH_MISSING"),
    "inventory cannot hide a readable registered path",
    "FIXTURE_INVENTORY_REGISTERED_PATH_MISSING",
    ghostResult.failures.map(({ code }) => code),
  );

  const canonicalPath = "apps/creator/src/fixtures/story-artifact.json";
  const aliasPath = "apps/viewer/src/fixtures/story-artifact.json";
  const aliasRealpaths = new Map();
  const aliasRepository = createMemoryRepository(baseFiles, {
    realpaths: aliasRealpaths,
  });
  aliasRealpaths.set(
    aliasPath,
    resolve(aliasRepository.rootRealPath, ...canonicalPath.split("/")),
  );
  const aliasResult = verifyFixtureManifest(aliasRepository);
  assert(
    hasFailure(aliasResult, "FIXTURE_REALPATH_DUPLICATE"),
    "different registered paths cannot alias one realpath identity",
    "FIXTURE_REALPATH_DUPLICATE",
    aliasResult.failures.map(({ code }) => code),
  );

  const firstStable = verifyFixtureManifest(duplicateRepository);
  const secondStable = verifyFixtureManifest(duplicateRepository);
  assert(
    JSON.stringify(firstStable.failures) === JSON.stringify(secondStable.failures),
    "failure projection and ordering are stable",
    firstStable.failures,
    secondStable.failures,
  );

  const checkerSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const verifierSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "fixture-manifest.mjs"),
    "utf8",
  );
  const combinedSource = `${checkerSource}\n${verifierSource}`;
  const forbiddenRuntime =
    /from\s+["']node:(?:http|https|net|tls|dgram|child_process)["']|\b(?:fetch|writeFile|appendFile|truncate|createWriteStream)\s*\(/u;
  assert(
    !forbiddenRuntime.test(combinedSource),
    "checker has no network, child process, generator execution, or repository write path",
    "read-only local runtime",
    forbiddenRuntime.test(combinedSource) ? "forbidden runtime found" : "read-only",
  );

  const failures = assertions.filter(({ passed }) => !passed);
  return {
    result: failures.length === 0 ? "passed" : "failed",
    assertions: {
      executed: assertions.length,
      passed: assertions.length - failures.length,
      failed: failures.length,
      skipped: 0,
    },
    failures: failures.map(({ passed: _passed, ...failure }) => failure),
  };
}

function emergencySummary(code) {
  return {
    schemaVersion: "1.0.0",
    kind: "datapulse-root-check-summary",
    check: "fixture-manifest",
    gateId: process.env.DATAPULSE_GATE_ID ?? null,
    runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
    result: "failed",
    catalog: null,
    assertions: { executed: 1, passed: 0, failed: 1, skipped: 0 },
    selfTest: null,
    failures: [
      {
        code,
        subject: "check-fixtures",
        message: "fixture manifest check 必须 fail-closed",
        expected: "completed local read-only verification",
        actual: "rejected",
      },
    ],
  };
}

try {
  const unknownArguments = process.argv
    .slice(2)
    .filter((argument) => argument !== "--self-test");
  if (unknownArguments.length > 0) {
    throw new Error("FIXTURE_CHECK_ARGUMENT_INVALID");
  }
  const verification = verifyFixtureManifest(repositoryRoot);
  const selfTest =
    process.argv.includes("--self-test") && verification.result === "passed"
      ? runSelfTests()
      : null;
  const passed =
    verification.result === "passed" &&
    (selfTest === null || selfTest.result === "passed");
  const output = {
    ...verification,
    result: passed ? "passed" : "failed",
    selfTest,
  };
  console.log(JSON.stringify(output));
  if (!passed) process.exitCode = 1;
} catch (error) {
  const code =
    error instanceof Error && error.message === "FIXTURE_CHECK_ARGUMENT_INVALID"
      ? "FIXTURE_CHECK_ARGUMENT_INVALID"
      : "FIXTURE_CHECK_EXCEPTION";
  console.log(JSON.stringify(emergencySummary(code)));
  process.exitCode = 1;
}
