import { createHash } from "node:crypto";
import {
  lstatSync,
  opendirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

const schemaPath = "tests/fixtures/fixture-manifest.schema.v1.json";
const manifestPath = "tests/fixtures/manifest.v1.json";
const maximumSchemaBytes = 256 * 1024;
const maximumManifestBytes = 8 * 1024 * 1024;
const maximumSubManifestBytes = 1024 * 1024;
const maximumCommittedArtifactBytes = 16 * 1024 * 1024;
const maximumGeneratedArtifactBytes = 1024 * 1024 * 1024;
const maximumGeneratorFileBytes = 1024 * 1024;
const maximumTotalVerificationBytes = 256 * 1024 * 1024;
const maximumAssertions = 100_000;
const maximumFailures = 256;
const maximumInventoryEntries = 100_000;
const maximumInventoryDepth = 32;
const maximumArtifacts = 65_536;
const maximumSchemaErrors = 64;
const fixtureRoots = [
  "tests/fixtures",
  "apps/creator/src/fixtures",
  "apps/viewer/src/fixtures",
];
const inventoryMetadataPaths = new Set([
  schemaPath,
  manifestPath,
  "tests/fixtures/story-artifacts/development/README.md",
]);
const requiredFixtureSets = new Map([
  [
    "story-development",
    {
      expectedAssertions: [
        { id: "current-version", outcome: "equals", value: "0.1.0" },
        { id: "migrated-version", outcome: "equals", value: "0.1.0" },
        {
          id: "target-invalid",
          outcome: "rejected",
          errorCode: "STORY_ARTIFACT_MIGRATED_STRUCTURE_INVALID",
        },
        {
          id: "final-invalid",
          outcome: "rejected",
          errorCode: "STORY_ARTIFACT_FINAL_VALIDATION_FAILED",
        },
        {
          id: "malicious-source",
          outcome: "rejected",
          errorCode: "STORY_ARTIFACT_SOURCE_STRUCTURE_INVALID",
        },
        {
          id: "unknown-version",
          outcome: "rejected",
          errorCode: "STORY_ARTIFACT_VERSION_UNSUPPORTED",
        },
      ],
      generation: {
        mode: "hand-authored",
        generator: { id: "story-development-fixture-authoring", version: "m0-013-v1" },
        seed: { kind: "not-applicable" },
      },
      subManifestPath: "tests/fixtures/story-artifacts/development/manifest.v1.json",
      manifestKind: "datapulse-story-artifact-development-fixture-manifest",
    },
  ],
  [
    "story-formal",
    {
      expectedAssertions: [
        { id: "schema-version", outcome: "equals", value: "1.0.0" },
        { id: "creator-viewer-readable", outcome: "equals", value: true },
      ],
      generation: {
        mode: "hand-authored",
        generator: { id: "story-formal-fixture-authoring", version: "m0-048-v1" },
        seed: { kind: "not-applicable" },
      },
      subManifestPath: "tests/fixtures/story-artifacts/formal/manifest.v1.json",
      manifestKind: "datapulse-formal-story-artifact-fixture-manifest",
    },
  ],
  [
    "metric-runtime-formal",
    {
      expectedAssertions: [
        { id: "count-rows-merge", outcome: "equals", value: 23 },
        { id: "sum-fixed-order-f64", outcome: "equals", value: "3ff0000000000000" },
        { id: "sum-rounding-f64", outcome: "equals", value: "3fd3333333333334" },
      ],
      generation: {
        mode: "hand-authored",
        generator: { id: "metric-runtime-formal-fixture-authoring", version: "m0-049-v1" },
        seed: { kind: "not-applicable" },
      },
      subManifestPath: "tests/fixtures/metric-runtime/formal/manifest.v1.json",
      manifestKind: "datapulse-formal-metric-runtime-fixture-manifest",
    },
  ],
  [
    "creator-viewer-composition",
    {
      expectedAssertions: [
        { id: "metric-value", outcome: "equals", value: 23 },
        { id: "render-mode", outcome: "equals", value: "2d" },
        { id: "creator-viewer-parity", outcome: "equals", value: true },
      ],
      generation: {
        mode: "hand-authored",
        generator: { id: "creator-viewer-composition-authoring", version: "m0-015-v1" },
        seed: { kind: "not-applicable" },
      },
      subManifestPath: "tests/fixtures/creator-viewer-composition/manifest.v1.json",
      manifestKind: "datapulse-creator-viewer-composition-fixture-manifest",
    },
  ],
  [
    "import-admission",
    {
      expectedAssertions: [
        { id: "small-rows", outcome: "equals", value: 5 },
        { id: "small-columns", outcome: "equals", value: 3 },
        { id: "small-cells", outcome: "equals", value: 15 },
        { id: "common-rows", outcome: "equals", value: 50 },
        { id: "common-columns", outcome: "equals", value: 6 },
        { id: "common-cells", outcome: "equals", value: 300 },
        { id: "xls-rejected", outcome: "rejected", errorCode: "IMPORT_UNSUPPORTED_FORMAT" },
        { id: "ods-rejected", outcome: "rejected", errorCode: "IMPORT_UNSUPPORTED_FORMAT" },
        { id: "invalid-utf8-rejected", outcome: "rejected", errorCode: "IMPORT_CSV_DECODE_FAILED" },
        { id: "oversized-columns-rejected", outcome: "rejected", errorCode: "IMPORT_COLUMN_LIMIT_EXCEEDED" },
      ],
      generation: {
        mode: "hand-authored",
        generator: { id: "import-admission-fixture-authoring", version: "m0-028-v1" },
        seed: { kind: "not-applicable" },
      },
      subManifestPath: "tests/fixtures/import-admission/manifest.v1.json",
      manifestKind: "datapulse-import-admission-fixture-manifest",
    },
  ],
  [
    "import-admission-narrow",
    {
      expectedAssertions: [
        { id: "narrow-rows", outcome: "equals", value: 200000 },
        { id: "narrow-columns", outcome: "equals", value: 3 },
        { id: "narrow-cells", outcome: "equals", value: 600000 },
      ],
      generation: {
        mode: "generated",
        generator: { id: "import-admission-narrow-generator", version: "m0-028-v1" },
        seed: { kind: "fixed", value: "000000009e3779b9" },
        generatorFile: {
          path: "tests/fixtures/import-admission/generate-narrow.mjs",
          bytes: 1119,
          sha256: "5ca6e1647752dab46b30208a50cc64d6136d7a0e5b9ed2584cddf6306ff35801",
        },
      },
      subManifestPath: "tests/fixtures/import-admission/narrow-200k.manifest.v1.json",
      manifestKind: "datapulse-import-admission-narrow-fixture-manifest",
    },
  ],
  [
    "import-admission-wide",
    {
      expectedAssertions: [
        { id: "wide-rows", outcome: "equals", value: 50000 },
        { id: "wide-columns", outcome: "equals", value: 100 },
        { id: "wide-cells", outcome: "equals", value: 5000000 },
      ],
      generation: {
        mode: "generated",
        generator: { id: "import-admission-wide-generator", version: "m0-028-v1" },
        seed: { kind: "fixed", value: "0000000085ebca6b" },
        generatorFile: {
          path: "tests/fixtures/import-admission/generate-wide.mjs",
          bytes: 1378,
          sha256: "7734382274f3e444146906030b1ef504df10ddc2c63ecb231ad1ace6537fae0e",
        },
      },
      subManifestPath: "tests/fixtures/import-admission/wide-100col.manifest.v1.json",
      manifestKind: "datapulse-import-admission-wide-fixture-manifest",
    },
  ],
]);
const windowsReservedName =
  /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|(?:com|lpt)[1-9¹²³])(?:\.|$)/iu;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createCollector() {
  let executed = 0;
  let passed = 0;
  let stopped = false;
  const failures = [];

  const stopAtLimit = (code, message, expected) => {
    if (stopped) {
      return false;
    }
    executed += 1;
    failures.push({
      code,
      subject: "fixture-manifest",
      message,
      expected,
      actual: "limit-exceeded",
    });
    stopped = true;
    return false;
  };

  return {
    assert(assertionPassed, code, subject, message, expected, actual) {
      if (stopped) {
        return false;
      }
      if (executed >= maximumAssertions - 1) {
        return stopAtLimit(
          "FIXTURE_ASSERTION_LIMIT_EXCEEDED",
          "fixture 校验断言达到硬上限后必须立即停止处理",
          { maximumAssertions },
        );
      }
      executed += 1;
      if (assertionPassed) {
        passed += 1;
        return true;
      }
      if (failures.length >= maximumFailures - 1) {
        return stopAtLimit(
          "FIXTURE_FAILURE_LIMIT_EXCEEDED",
          "fixture 校验失败明细达到硬上限后必须立即停止处理",
          { maximumFailures },
        );
      }
      failures.push({ code, subject, message, expected, actual });
      return true;
    },
    stop(code, subject, message, expected, actual) {
      if (stopped) {
        return false;
      }
      if (executed >= maximumAssertions - 1) {
        return stopAtLimit(
          "FIXTURE_ASSERTION_LIMIT_EXCEEDED",
          "fixture 校验断言达到硬上限后必须立即停止处理",
          { maximumAssertions },
        );
      }
      if (failures.length >= maximumFailures - 1) {
        return stopAtLimit(
          "FIXTURE_FAILURE_LIMIT_EXCEEDED",
          "fixture 校验失败明细达到硬上限后必须立即停止处理",
          { maximumFailures },
        );
      }
      executed += 1;
      failures.push({ code, subject, message, expected, actual });
      stopped = true;
      return false;
    },
    shouldStop() {
      return stopped;
    },
    finish() {
      failures.sort((left, right) => stableJson(left).localeCompare(stableJson(right), "en"));
      return {
        assertions: {
          executed,
          passed,
          failed: executed - passed,
          skipped: 0,
        },
        failures,
      };
    },
  };
}

function failureSummary(code, subject, message) {
  return {
    schemaVersion: "1.0.0",
    kind: "datapulse-root-check-summary",
    check: "fixture-manifest",
    gateId: process.env.DATAPULSE_GATE_ID ?? null,
    runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
    result: "failed",
    catalog: null,
    assertions: { executed: 1, passed: 0, failed: 1, skipped: 0 },
    failures: [
      {
        code,
        subject,
        message,
        expected: "safe deterministic fixture verification",
        actual: "verification rejected",
      },
    ],
  };
}

function pathSegments(relativePath) {
  return relativePath.split("/");
}

function isAllowedFixturePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("~") ||
    value.includes("\0") ||
    /[?*<>|"]/u.test(value) ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    value.startsWith("/") ||
    value.startsWith("//") ||
    /^[a-z]:/iu.test(value) ||
    isAbsolute(value)
  ) {
    return false;
  }

  const segments = pathSegments(value);
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        segment.includes(":") ||
        windowsReservedName.test(segment),
    )
  ) {
    return false;
  }

  return fixtureRoots.some(
    (root) => value === root || value.startsWith(`${root}/`),
  );
}

function canonicalPathIdentity(value) {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function canonicalRealpathIdentity(value) {
  const normalized = resolve(value).normalize("NFC");
  return process.platform === "win32"
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;
}

function toAbsolutePath(root, relativePath) {
  return resolve(root, ...pathSegments(relativePath));
}

function pathKindWithParents(root, relativePath) {
  let current = root;
  for (const segment of pathSegments(relativePath)) {
    current = join(current, segment);
    const status = lstatSync(current);
    if (status.isSymbolicLink()) {
      return "symlink";
    }
  }
  const status = lstatSync(current);
  return status.isFile() ? "regular-file" : "other";
}

function directoryKindWithParents(root, relativePath) {
  let current = root;
  for (const segment of pathSegments(relativePath)) {
    current = join(current, segment);
    const status = lstatSync(current);
    if (status.isSymbolicLink()) {
      return "symlink";
    }
  }
  return lstatSync(current).isDirectory() ? "directory" : "other";
}

function createFileSystemRepository(root) {
  const absoluteRoot = resolve(root);
  const rootRealPath = realpathSync.native(absoluteRoot);

  function* listFixtureEntries() {
    const visit = function* (relativeDirectory, depth) {
      if (depth > maximumInventoryDepth) {
        throw new RangeError("fixture inventory depth limit exceeded");
      }
      if (
        directoryKindWithParents(absoluteRoot, relativeDirectory) !== "directory" ||
        !isInsideRoot(rootRealPath, realpathSync.native(toAbsolutePath(absoluteRoot, relativeDirectory)))
      ) {
        throw new Error("fixture inventory root is unsafe");
      }
      const absoluteDirectory = toAbsolutePath(absoluteRoot, relativeDirectory);
      const directory = opendirSync(absoluteDirectory);
      try {
        for (;;) {
          const child = directory.readSync();
          if (child === null) {
            break;
          }
          const childPath = `${relativeDirectory}/${child.name}`;
          if (child.isSymbolicLink()) {
            yield { path: childPath, kind: "symlink" };
          } else if (child.isDirectory()) {
            yield { path: childPath, kind: "directory" };
            yield* visit(childPath, depth + 1);
          } else {
            yield {
              path: childPath,
              kind: child.isFile() ? "regular-file" : "other",
            };
          }
        }
      } finally {
        directory.closeSync();
      }
    };
    for (const rootPath of fixtureRoots) {
      yield* visit(rootPath, 0);
    }
  }

  return {
    rootRealPath,
    readFile(relativePath) {
      return readFileSync(toAbsolutePath(absoluteRoot, relativePath));
    },
    realpath(relativePath) {
      return realpathSync.native(toAbsolutePath(absoluteRoot, relativePath));
    },
    pathKind(relativePath) {
      return pathKindWithParents(absoluteRoot, relativePath);
    },
    fileSize(relativePath) {
      return lstatSync(toAbsolutePath(absoluteRoot, relativePath)).size;
    },
    listFixtureEntries,
  };
}

function resolveRepository(repositoryRoot) {
  if (typeof repositoryRoot === "string") {
    return createFileSystemRepository(repositoryRoot);
  }
  if (
    isRecord(repositoryRoot) &&
    typeof repositoryRoot.rootRealPath === "string" &&
    typeof repositoryRoot.readFile === "function" &&
    typeof repositoryRoot.realpath === "function" &&
    typeof repositoryRoot.pathKind === "function" &&
    typeof repositoryRoot.fileSize === "function" &&
    typeof repositoryRoot.listFixtureEntries === "function"
  ) {
    return repositoryRoot;
  }
  throw new TypeError("repositoryRoot must be a path or a read-only repository adapter");
}

function createReadBudget(maximumBytes) {
  let consumedBytes = 0;
  return {
    canReserve(bytes) {
      return (
        Number.isSafeInteger(bytes) &&
        bytes >= 0 &&
        bytes <= maximumBytes - consumedBytes
      );
    },
    reserve(bytes) {
      if (!this.canReserve(bytes)) {
        const error = new RangeError("fixture total read budget exceeded");
        error.code = "FIXTURE_TOTAL_READ_LIMIT_EXCEEDED";
        throw error;
      }
      consumedBytes += bytes;
    },
    get consumedBytes() {
      return consumedBytes;
    },
    maximumBytes,
  };
}

function declaredVerificationReadBytes(manifest) {
  let declaredBytes = 0;
  for (const fixtureSet of manifest.fixtureSets) {
    declaredBytes += fixtureSet.subManifest.bytes;
    if (fixtureSet.generation.mode === "generated") {
      declaredBytes += fixtureSet.generation.generatorFile.bytes;
    } else {
      for (const artifact of fixtureSet.artifacts) {
        declaredBytes += artifact.bytes;
      }
    }
    if (!Number.isSafeInteger(declaredBytes)) {
      return Number.POSITIVE_INFINITY;
    }
  }
  return declaredBytes;
}

function readBytes(repository, relativePath, maximumBytes, readBudget) {
  const declaredSize = repository.fileSize(relativePath);
  if (
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 0 ||
    declaredSize > maximumBytes
  ) {
    const error = new RangeError("bounded fixture read rejected");
    error.code = "FIXTURE_READ_LIMIT_EXCEEDED";
    throw error;
  }
  readBudget.reserve(declaredSize);
  const value = repository.readFile(relativePath, declaredSize);
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("repository adapter readFile must return Uint8Array");
  }
  if (value.byteLength !== declaredSize || value.byteLength > maximumBytes) {
    const error = new RangeError("bounded fixture read changed size");
    error.code = "FIXTURE_READ_SIZE_CHANGED";
    throw error;
  }
  return value;
}

function readInfrastructureBytes(repository, relativePath, maximumBytes, readBudget) {
  if (
    repository.pathKind(relativePath) !== "regular-file" ||
    !isInsideRoot(repository.rootRealPath, repository.realpath(relativePath))
  ) {
    const error = new Error("fixture infrastructure path is unsafe");
    error.code = "FIXTURE_INFRASTRUCTURE_PATH_UNSAFE";
    throw error;
  }
  return readBytes(repository, relativePath, maximumBytes, readBudget);
}

function parseJsonBytes(bytes) {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(source);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isInsideRoot(rootRealPath, targetRealPath) {
  const fromRoot = relative(resolve(rootRealPath), resolve(targetRealPath));
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

function joinSubManifestPath(subManifestPath, localPath) {
  if (
    typeof localPath !== "string" ||
    localPath.includes("\\") ||
    localPath.includes("%") ||
    localPath.startsWith("/") ||
    pathSegments(localPath).some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return `${dirname(subManifestPath).replaceAll("\\", "/")}/${localPath}`;
}

function extractSubManifestArtifacts(fixtureSet, subManifest) {
  const extracted = [];
  if (
    fixtureSet.id === "story-development" ||
    fixtureSet.id === "story-formal" ||
    fixtureSet.id === "metric-runtime-formal" ||
    fixtureSet.id === "import-admission" ||
    fixtureSet.id === "import-admission-narrow" ||
    fixtureSet.id === "import-admission-wide"
  ) {
    if (!Array.isArray(subManifest.fixtures)) {
      return null;
    }
    for (const fixture of subManifest.fixtures) {
      if (!isRecord(fixture)) {
        return null;
      }
      const path = joinSubManifestPath(fixtureSet.subManifest.path, fixture.path);
      if (
        path === null ||
        !Number.isInteger(fixture.bytes) ||
        typeof fixture.sha256 !== "string"
      ) {
        return null;
      }
      extracted.push({ path, bytes: fixture.bytes, sha256: fixture.sha256 });
    }
    return extracted;
  }

  if (fixtureSet.id === "creator-viewer-composition") {
    if (!isRecord(subManifest.copies)) {
      return null;
    }
    for (const consumer of ["creator", "viewer"]) {
      const copies = subManifest.copies[consumer];
      if (!isRecord(copies)) {
        return null;
      }
      for (const artifactName of ["storyArtifact", "metricRuntime"]) {
        const identity = copies[artifactName];
        if (
          !isRecord(identity) ||
          typeof identity.path !== "string" ||
          !Number.isInteger(identity.bytes) ||
          typeof identity.sha256 !== "string"
        ) {
          return null;
        }
        extracted.push({
          path: identity.path,
          bytes: identity.bytes,
          sha256: identity.sha256,
        });
      }
    }
    return extracted;
  }
  return null;
}

function canonicalArtifactList(artifacts) {
  return artifacts
    .map(({ path, bytes, sha256: hash }) => ({ path, bytes, sha256: hash }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
}

function verifyIdentity({
  repository,
  readBudget,
  collector,
  identity,
  subject,
  registeredPaths,
  pathSubjects,
  realpathSubjects,
  maximumBytes,
  minimumBytes = 1,
}) {
  const allowedPath = isAllowedFixturePath(identity.path);
  collector.assert(
    allowedPath,
    "FIXTURE_PATH_INVALID",
    `${subject}.path`,
    "夹具路径必须是受控目录内的仓库相对 POSIX 路径，并拒绝 Windows 歧义路径",
    "safe repository-relative fixture path",
    allowedPath ? "valid" : "rejected",
  );
  if (!allowedPath) {
    return null;
  }

  const declaredBytesAllowed =
    Number.isSafeInteger(identity.bytes) &&
    identity.bytes >= minimumBytes &&
    identity.bytes <= maximumBytes;
  collector.assert(
    declaredBytesAllowed,
    "FIXTURE_DECLARED_BYTES_LIMIT_EXCEEDED",
    `${subject}.bytes`,
    "已提交的子 manifest、fixture 与生成器源码必须处于对应的硬字节上限内",
    { minimumBytes, maximumBytes },
    declaredBytesAllowed ? "within-limit" : "rejected",
  );
  if (!declaredBytesAllowed) {
    return null;
  }

  const pathIdentity = canonicalPathIdentity(identity.path);
  const previousSubject = pathSubjects.get(pathIdentity);
  collector.assert(
    previousSubject === undefined,
    "FIXTURE_PATH_DUPLICATE",
    `${subject}.path`,
    "夹具、子 manifest 与生成器文件路径必须全局唯一且无 Windows 大小写碰撞",
    "unique path",
    previousSubject === undefined ? "unique" : "duplicate",
  );
  if (previousSubject === undefined) {
    pathSubjects.set(pathIdentity, subject);
    registeredPaths.add(pathIdentity);
  } else {
    return null;
  }

  let kind;
  let targetRealPath;
  try {
    kind = repository.pathKind(identity.path);
    targetRealPath = repository.realpath(identity.path);
  } catch {
    collector.assert(
      false,
      "FIXTURE_FILE_UNREADABLE",
      subject,
      "登记文件必须存在且可安全回读",
      "readable regular file",
      "unavailable",
    );
    return null;
  }
  collector.assert(
    kind === "regular-file",
    "FIXTURE_FILE_KIND_INVALID",
    subject,
    "登记路径及其父路径不得经过 symlink、junction 或其他非普通文件入口",
    "regular-file",
    kind,
  );
  const insideRoot = isInsideRoot(repository.rootRealPath, targetRealPath);
  collector.assert(
    insideRoot,
    "FIXTURE_REALPATH_ESCAPE",
    subject,
    "登记路径解析后必须仍位于仓库根目录内",
    "inside repository root",
    insideRoot ? "inside" : "outside",
  );
  if (kind !== "regular-file" || !insideRoot) {
    return null;
  }

  const realpathIdentity = canonicalRealpathIdentity(targetRealPath);
  const previousRealpathSubject = realpathSubjects.get(realpathIdentity);
  collector.assert(
    previousRealpathSubject === undefined,
    "FIXTURE_REALPATH_DUPLICATE",
    subject,
    "不同登记路径不得解析到同一物理 realpath identity",
    "unique registered realpath identity",
    previousRealpathSubject === undefined ? "unique" : "duplicate",
  );
  if (previousRealpathSubject === undefined) {
    realpathSubjects.set(realpathIdentity, subject);
  } else {
    return null;
  }

  let fileSize;
  try {
    fileSize = repository.fileSize(identity.path);
  } catch {
    fileSize = null;
  }
  const fileSizeAllowed =
    Number.isSafeInteger(fileSize) && fileSize >= 0 && fileSize <= maximumBytes;
  collector.assert(
    fileSizeAllowed,
    "FIXTURE_FILE_SIZE_LIMIT_EXCEEDED",
    subject,
    "文件必须在读取前通过对应的硬字节上限",
    { maximumBytes },
    fileSizeAllowed ? "within-limit" : "rejected",
  );
  if (!fileSizeAllowed) {
    return null;
  }

  let bytes;
  try {
    bytes = readBytes(repository, identity.path, maximumBytes, readBudget);
  } catch {
    collector.assert(
      false,
      "FIXTURE_FILE_UNREADABLE",
      subject,
      "登记文件必须以原始字节安全回读",
      "Uint8Array",
      "unavailable",
    );
    return null;
  }
  collector.assert(
    bytes.byteLength === identity.bytes,
    "FIXTURE_ARTIFACT_BYTES_MISMATCH",
    subject,
    "登记字节数必须匹配文件原始字节",
    identity.bytes,
    bytes.byteLength,
  );
  const actualHash = sha256(bytes);
  collector.assert(
    actualHash === identity.sha256,
    "FIXTURE_ARTIFACT_HASH_MISMATCH",
    subject,
    "登记 SHA-256 必须匹配文件原始字节",
    identity.sha256,
    actualHash,
  );
  return bytes;
}

function verifyGeneratedOutputIdentity({
  collector,
  identity,
  subject,
  generatedPaths,
  pathSubjects,
}) {
  const allowedPath = isAllowedFixturePath(identity.path);
  collector.assert(
    allowedPath,
    "FIXTURE_PATH_INVALID",
    `${subject}.path`,
    "生成输出路径必须是受控目录内的仓库相对 POSIX 路径",
    "safe repository-relative fixture path",
    allowedPath ? "valid" : "rejected",
  );
  const declaredBytesAllowed =
    Number.isSafeInteger(identity.bytes) &&
    identity.bytes >= 0 &&
    identity.bytes <= maximumGeneratedArtifactBytes;
  collector.assert(
    declaredBytesAllowed,
    "FIXTURE_GENERATED_BYTES_LIMIT_EXCEEDED",
    `${subject}.bytes`,
    "生成输出身份必须处于受控语料硬上限内，且本检查不会物化或读取输出",
    { maximumBytes: maximumGeneratedArtifactBytes },
    declaredBytesAllowed ? "within-limit" : "rejected",
  );
  if (!allowedPath || !declaredBytesAllowed) {
    return;
  }
  const identityKey = canonicalPathIdentity(identity.path);
  const previousSubject = pathSubjects.get(identityKey);
  collector.assert(
    previousSubject === undefined,
    "FIXTURE_PATH_DUPLICATE",
    `${subject}.path`,
    "已提交身份与预期生成输出路径必须全局唯一且无 Windows 大小写碰撞",
    "unique path",
    previousSubject === undefined ? "unique" : "duplicate",
  );
  if (previousSubject === undefined) {
    pathSubjects.set(identityKey, subject);
    generatedPaths.add(identityKey);
  }
}

function compileManifestSchema(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  return ajv.compile(schema);
}

function canonicalSchemaErrors(errors) {
  const canonical = (errors ?? [])
    .map(({ instancePath, keyword, schemaPath }) => ({
      instancePath,
      keyword,
      schemaPath,
    }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right), "en"));
  if (canonical.length <= maximumSchemaErrors) {
    return canonical;
  }
  return [
    ...canonical.slice(0, maximumSchemaErrors - 1),
    {
      instancePath: "",
      keyword: "errorLimit",
      schemaPath: `maximum:${maximumSchemaErrors}`,
    },
  ];
}

export function verifyFixtureManifest(repositoryRoot) {
  let repository;
  try {
    repository = resolveRepository(repositoryRoot);
  } catch {
    return failureSummary(
      "FIXTURE_REPOSITORY_INVALID",
      "repositoryRoot",
      "fixture verifier 只接受仓库路径或只读 repository adapter",
    );
  }
  const readBudget = createReadBudget(maximumTotalVerificationBytes);

  let schema;
  let manifest;
  try {
    schema = parseJsonBytes(
      readInfrastructureBytes(
        repository,
        schemaPath,
        maximumSchemaBytes,
        readBudget,
      ),
    );
    manifest = parseJsonBytes(
      readInfrastructureBytes(
        repository,
        manifestPath,
        maximumManifestBytes,
        readBudget,
      ),
    );
  } catch (error) {
    const sizeRejected = error?.code === "FIXTURE_READ_LIMIT_EXCEEDED";
    const totalReadRejected =
      error?.code === "FIXTURE_TOTAL_READ_LIMIT_EXCEEDED";
    const pathRejected = error?.code === "FIXTURE_INFRASTRUCTURE_PATH_UNSAFE";
    return failureSummary(
      pathRejected
        ? "FIXTURE_INFRASTRUCTURE_PATH_UNSAFE"
        : totalReadRejected
          ? "FIXTURE_TOTAL_READ_LIMIT_EXCEEDED"
        : sizeRejected
          ? "FIXTURE_MANIFEST_SIZE_LIMIT_EXCEEDED"
          : "FIXTURE_MANIFEST_PARSE_FAILED",
      "fixture-manifest",
      pathRejected
        ? "根 fixture Schema 与 manifest 必须是仓库内无 symlink/junction 的普通文件"
        : totalReadRejected
          ? "fixture verifier 的全部原始字节读取必须处于全局累计预算内"
        : sizeRejected
          ? "fixture Schema 与根 manifest 必须在硬字节上限内才允许读取"
          : "fixture Schema 与根 manifest 必须是有效 UTF-8 JSON",
    );
  }

  let validate;
  try {
    validate = compileManifestSchema(schema);
  } catch {
    return failureSummary(
      "FIXTURE_MANIFEST_SCHEMA_COMPILE_FAILED",
      schemaPath,
      "fixture manifest Schema 必须可由固定 Ajv 运行时编译",
    );
  }

  const schemaValid = validate(manifest);
  if (!schemaValid) {
    const schemaErrors = canonicalSchemaErrors(validate.errors);
    return {
      ...failureSummary(
        "FIXTURE_MANIFEST_SCHEMA_INVALID",
        manifestPath,
        "根 fixture manifest 必须严格符合版本化 Schema",
      ),
      failures: [
        {
          code: "FIXTURE_MANIFEST_SCHEMA_INVALID",
          subject: manifestPath,
          message: "根 fixture manifest 必须严格符合版本化 Schema",
          expected: [],
          actual: schemaErrors,
        },
      ],
    };
  }

  const collector = createCollector();
  const ids = new Map();
  const pathSubjects = new Map();
  const realpathSubjects = new Map();
  const registeredPaths = new Set();
  const generatedPaths = new Set();
  const discoveredSetIds = [];
  let artifactCount = 0;
  let generatedFixtureSets = 0;

  const declaredArtifactCount = manifest.fixtureSets.reduce(
    (count, fixtureSet) => count + fixtureSet.artifacts.length,
    0,
  );
  if (declaredArtifactCount > maximumArtifacts) {
    return failureSummary(
      "FIXTURE_ARTIFACT_LIMIT_EXCEEDED",
      "fixtureSets",
      "根 catalog 的 artifact 总数必须处于校验硬上限内",
    );
  }
  const declaredReadBytes = declaredVerificationReadBytes(manifest);
  if (!readBudget.canReserve(declaredReadBytes)) {
    return failureSummary(
      "FIXTURE_TOTAL_READ_LIMIT_EXCEEDED",
      "fixtureSets",
      "fixture Schema、manifest、子 manifest、生成器与已提交 artifact 的累计读取必须处于 256 MiB 硬上限内",
    );
  }

  fixtureSetLoop: for (
    let setIndex = 0;
    setIndex < manifest.fixtureSets.length;
    setIndex += 1
  ) {
    if (collector.shouldStop()) {
      break;
    }
    const fixtureSet = manifest.fixtureSets[setIndex];
    const setSubject = `fixtureSets[${setIndex}]`;
    const previousId = ids.get(fixtureSet.id);
    collector.assert(
      previousId === undefined,
      "FIXTURE_ID_DUPLICATE",
      `${setSubject}.id`,
      "逻辑夹具集与 artifact ID 必须全局唯一",
      "unique ID",
      previousId === undefined ? "unique" : "duplicate",
    );
    if (previousId === undefined) {
      ids.set(fixtureSet.id, setSubject);
    }
    discoveredSetIds.push(fixtureSet.id);
    if (fixtureSet.generation.mode === "generated") {
      generatedFixtureSets += 1;
    }

    const required = requiredFixtureSets.get(fixtureSet.id);
    collector.assert(
      required !== undefined,
      "FIXTURE_SET_UNREGISTERED",
      `${setSubject}.id`,
      "新增逻辑夹具集必须先在 checker policy 中登记其子 manifest、生成器与 oracle",
      "registered fixture set policy",
      required === undefined ? "unregistered" : "registered",
    );
    collector.assert(
      required !== undefined && fixtureSet.subManifestKind === required.manifestKind,
      "FIXTURE_SET_MANIFEST_KIND_INVALID",
      `${setSubject}.subManifestKind`,
      "每个逻辑夹具集必须绑定受控的既有子 manifest kind",
      required?.manifestKind ?? "registered fixture set policy",
      required !== undefined && fixtureSet.subManifestKind === required.manifestKind
        ? "matched"
        : "rejected",
    );
    collector.assert(
      required !== undefined && fixtureSet.subManifest.path === required.subManifestPath,
      "FIXTURE_SET_SUBMANIFEST_PATH_INVALID",
      `${setSubject}.subManifest.path`,
      "四个基线夹具集必须绑定 checker policy 中的 canonical 子 manifest 路径",
      required?.subManifestPath ?? "registered fixture set policy",
      required !== undefined && fixtureSet.subManifest.path === required.subManifestPath
        ? "matched"
        : "rejected",
    );
    collector.assert(
      required !== undefined &&
        stableJson(fixtureSet.expectedAssertions) === stableJson(required.expectedAssertions),
      "FIXTURE_EXPECTED_ASSERTION_INVALID",
      `${setSubject}.expectedAssertions`,
      "每个逻辑夹具集只能声明与其既有测试契约对应的受控 assertion",
      required?.expectedAssertions ?? "registered fixture set policy",
      required !== undefined &&
        stableJson(fixtureSet.expectedAssertions) === stableJson(required.expectedAssertions)
        ? "matched"
        : "rejected",
    );
    const expectedAssertionIds = fixtureSet.expectedAssertions.map(({ id }) => id);
    collector.assert(
      new Set(expectedAssertionIds).size === expectedAssertionIds.length,
      "FIXTURE_EXPECTED_ASSERTION_ID_DUPLICATE",
      `${setSubject}.expectedAssertions`,
      "同一逻辑夹具集中的机器 oracle ID 必须唯一",
      "unique expected assertion IDs",
      new Set(expectedAssertionIds).size === expectedAssertionIds.length
        ? "unique"
        : "duplicate",
    );
    const actualGenerationPolicy = fixtureSet.generation;
    collector.assert(
      required !== undefined &&
        stableJson(actualGenerationPolicy) === stableJson(required.generation),
      "FIXTURE_GENERATOR_UNREGISTERED",
      `${setSubject}.generation`,
      "生成模式、生成器 ID 与版本必须由 checker policy 显式登记",
      required?.generation ?? "registered fixture set policy",
      required !== undefined &&
        stableJson(actualGenerationPolicy) === stableJson(required.generation)
        ? "matched"
        : "rejected",
    );
    if (collector.shouldStop()) {
      break;
    }

    const subManifestBytes = verifyIdentity({
      repository,
      readBudget,
      collector,
      identity: fixtureSet.subManifest,
      subject: `${setSubject}.subManifest`,
      registeredPaths,
      pathSubjects,
      realpathSubjects,
      maximumBytes: maximumSubManifestBytes,
    });
    let subManifest = null;
    if (subManifestBytes !== null) {
      try {
        subManifest = parseJsonBytes(subManifestBytes);
      } catch {
        collector.assert(
          false,
          "FIXTURE_SUBMANIFEST_PARSE_FAILED",
          `${setSubject}.subManifest`,
          "既有子 manifest 必须保持有效 UTF-8 JSON",
          "valid JSON",
          "rejected",
        );
      }
    }
    if (subManifest !== null) {
      collector.assert(
        isRecord(subManifest) && subManifest.kind === fixtureSet.subManifestKind,
        "FIXTURE_SUBMANIFEST_KIND_MISMATCH",
        `${setSubject}.subManifestKind`,
        "根 catalog 声明的 kind 必须与子 manifest 一致",
        required?.manifestKind ?? "registered fixture set policy",
        isRecord(subManifest) && subManifest.kind === fixtureSet.subManifestKind
          ? "matched"
          : "rejected",
      );
      const extracted =
        required === undefined
          ? null
          : isRecord(subManifest)
            ? extractSubManifestArtifacts(fixtureSet, subManifest)
            : null;
      if (required !== undefined) {
        collector.assert(
          extracted !== null,
          "FIXTURE_SUBMANIFEST_STRUCTURE_INVALID",
          `${setSubject}.subManifest`,
          "四个基线夹具集必须能从受控子 manifest 结构回读 artifact 身份",
          "supported sub manifest structure",
          extracted === null ? "rejected" : "supported",
        );
      }
      if (required !== undefined && extracted !== null) {
        const expectedArtifacts = canonicalArtifactList(extracted);
        const actualArtifacts = canonicalArtifactList(fixtureSet.artifacts);
        collector.assert(
          stableJson(actualArtifacts) === stableJson(expectedArtifacts),
          "FIXTURE_SUBMANIFEST_ARTIFACT_MISMATCH",
          `${setSubject}.artifacts`,
          "根 catalog 的 artifact bytes/hash 必须逐项来自既有子 manifest",
          { matched: true, artifactCount: expectedArtifacts.length },
          {
            matched: stableJson(actualArtifacts) === stableJson(expectedArtifacts),
            artifactCount: actualArtifacts.length,
          },
        );
      }
    }
    if (collector.shouldStop()) {
      break;
    }

    for (
      let artifactIndex = 0;
      artifactIndex < fixtureSet.artifacts.length;
      artifactIndex += 1
    ) {
      const artifact = fixtureSet.artifacts[artifactIndex];
      const artifactSubject = `${setSubject}.artifacts[${artifactIndex}]`;
      artifactCount += 1;
      const previousArtifactId = ids.get(artifact.id);
      collector.assert(
        previousArtifactId === undefined,
        "FIXTURE_ID_DUPLICATE",
        `${artifactSubject}.id`,
        "逻辑夹具集与 artifact ID 必须全局唯一",
        "unique ID",
        previousArtifactId === undefined ? "unique" : "duplicate",
      );
      if (previousArtifactId === undefined) {
        ids.set(artifact.id, artifactSubject);
      }
      if (collector.shouldStop()) {
        break fixtureSetLoop;
      }
      if (fixtureSet.generation.mode === "generated") {
        verifyGeneratedOutputIdentity({
          collector,
          identity: artifact,
          subject: artifactSubject,
          generatedPaths,
          pathSubjects,
        });
      } else {
        verifyIdentity({
          repository,
          readBudget,
          collector,
          identity: artifact,
          subject: artifactSubject,
          registeredPaths,
          pathSubjects,
          realpathSubjects,
          maximumBytes: maximumCommittedArtifactBytes,
          minimumBytes: 0,
        });
      }
      if (collector.shouldStop()) {
        break fixtureSetLoop;
      }
    }

    if (fixtureSet.generation.mode === "generated") {
      verifyIdentity({
        repository,
        readBudget,
        collector,
        identity: fixtureSet.generation.generatorFile,
        subject: `${setSubject}.generation.generatorFile`,
        registeredPaths,
        pathSubjects,
        realpathSubjects,
        maximumBytes: maximumGeneratorFileBytes,
      });
      if (collector.shouldStop()) {
        break;
      }
    }
  }

  if (collector.shouldStop()) {
    const collected = collector.finish();
    return {
      schemaVersion: "1.0.0",
      kind: "datapulse-root-check-summary",
      check: "fixture-manifest",
      gateId: process.env.DATAPULSE_GATE_ID ?? null,
      runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
      result: "failed",
      catalog: null,
      assertions: collected.assertions,
      failures: collected.failures,
    };
  }

  const requiredIds = [...requiredFixtureSets.keys()].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const actualIds = [...discoveredSetIds].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  collector.assert(
    requiredIds.every((id) => actualIds.includes(id)),
    "FIXTURE_SET_CATALOG_INVALID",
    "fixtureSets",
    "可演进 catalog 必须至少保留四个 M0 基线逻辑夹具集",
    { includes: requiredIds },
    actualIds,
  );
  collector.assert(
    manifest.catalog.logicalFixtureSets === manifest.fixtureSets.length &&
      manifest.catalog.artifacts === artifactCount &&
      manifest.catalog.generatedFixtureSets === generatedFixtureSets,
    "FIXTURE_CATALOG_COUNT_MISMATCH",
    "catalog",
    "catalog 计数必须从当前 manifest 内容确定性回算",
    {
      logicalFixtureSets: manifest.fixtureSets.length,
      artifacts: artifactCount,
      generatedFixtureSets,
    },
    manifest.catalog,
  );

  let inventoryEntries = null;
  if (!collector.shouldStop()) {
    let inventoryIterable = null;
    try {
      inventoryIterable = repository.listFixtureEntries();
    } catch {
      collector.stop(
        "FIXTURE_INVENTORY_UNAVAILABLE",
        "fixture-inventory",
        "必须递归枚举受控夹具目录以拒绝未登记 fixture",
        "deterministic fixture inventory",
        "unavailable",
      );
    }
    const iterableAllowed =
      inventoryIterable !== null &&
      typeof inventoryIterable !== "string" &&
      typeof inventoryIterable?.[Symbol.iterator] === "function";
    if (!collector.shouldStop() && !iterableAllowed) {
      collector.stop(
        "FIXTURE_INVENTORY_INVALID",
        "fixture-inventory",
        "repository adapter 必须返回可增量消费的 fixture entry iterable",
        "iterable",
        "invalid",
      );
    }
    if (!collector.shouldStop() && iterableAllowed) {
      inventoryEntries = [];
      try {
        for (const entry of inventoryIterable) {
          if (inventoryEntries.length >= maximumInventoryEntries) {
            collector.stop(
              "FIXTURE_INVENTORY_LIMIT_EXCEEDED",
              "fixture-inventory",
              "fixture inventory 的全部 Dirent 达到硬数量上限后必须立即停止枚举",
              { maximumInventoryEntries },
              "limit-exceeded",
            );
            break;
          }
          inventoryEntries.push(entry);
        }
      } catch {
        if (!collector.shouldStop()) {
          collector.stop(
            "FIXTURE_INVENTORY_UNAVAILABLE",
            "fixture-inventory",
            "必须递归枚举受控夹具目录以拒绝未登记 fixture",
            "deterministic fixture inventory",
            "unavailable",
          );
        }
      }
    }
  }
  if (!collector.shouldStop() && inventoryEntries !== null) {
    const inventoryPathIdentities = new Map();
    const sortedEntries = [...inventoryEntries].sort((left, right) =>
      String(left?.path).localeCompare(String(right?.path), "en"),
    );
    for (let index = 0; index < sortedEntries.length; index += 1) {
      const entry = sortedEntries[index];
      const subject = `fixture-inventory[${index}]`;
      const validEntry =
        isRecord(entry) &&
        typeof entry.path === "string" &&
        isAllowedFixturePath(entry.path) &&
        (entry.kind === "regular-file" ||
          entry.kind === "directory" ||
          entry.kind === "symlink" ||
          entry.kind === "other");
      if (validEntry && entry.kind === "directory") {
        const identity = canonicalPathIdentity(entry.path);
        const collision = inventoryPathIdentities.has(identity);
        if (collision) {
          collector.assert(
            false,
            "FIXTURE_INVENTORY_PATH_COLLISION",
            subject,
            "fixture inventory 不得包含 Windows 大小写碰撞路径",
            "unique path",
            "duplicate",
          );
        } else {
          inventoryPathIdentities.set(identity, entry);
        }
        if (collector.shouldStop()) {
          break;
        }
        continue;
      }
      collector.assert(
        validEntry,
        "FIXTURE_INVENTORY_ENTRY_INVALID",
        subject,
        "fixture inventory 只能返回受控 POSIX 路径和稳定文件类型",
        "valid fixture entry",
        validEntry ? "valid" : "rejected",
      );
      if (!validEntry) {
        if (collector.shouldStop()) {
          break;
        }
        continue;
      }
      const identity = canonicalPathIdentity(entry.path);
      const collision = inventoryPathIdentities.has(identity);
      collector.assert(
        !collision,
        "FIXTURE_INVENTORY_PATH_COLLISION",
        subject,
        "fixture inventory 不得包含 Windows 大小写碰撞路径",
        "unique path",
        collision ? "duplicate" : "unique",
      );
      inventoryPathIdentities.set(identity, entry);
      collector.assert(
        entry.kind === "regular-file",
        "FIXTURE_INVENTORY_ENTRY_UNSAFE",
        subject,
        "fixture 目录不得包含 symlink、junction 或其他非普通文件入口",
        "regular-file",
        entry.kind,
      );
      const generatedOutputCommitted = generatedPaths.has(identity);
      collector.assert(
        !generatedOutputCommitted,
        "FIXTURE_GENERATED_ARTIFACT_COMMITTED",
        subject,
        "generated 输出不得提交到仓库；本 gate 只固定 generator、seed 与预期输出身份",
        "generated output absent from repository",
        generatedOutputCommitted ? "committed" : "absent",
      );
      const registered =
        registeredPaths.has(identity) ||
        generatedOutputCommitted ||
        inventoryMetadataPaths.has(entry.path);
      collector.assert(
        registered,
        "FIXTURE_INVENTORY_UNREGISTERED",
        subject,
        "fixture 目录中的数据文件必须由根 catalog 登记；只允许精确列出的 manifest/Schema/README 元数据",
        "registered fixture or controlled metadata",
        registered ? "registered" : "unregistered",
      );
      if (collector.shouldStop()) {
        break;
      }
    }

    if (!collector.shouldStop()) {
      const expectedInventoryIdentities = new Set([
        ...registeredPaths,
        ...[...inventoryMetadataPaths].map(canonicalPathIdentity),
      ]);
      const sortedExpectedInventoryIdentities = [...expectedInventoryIdentities].sort(
        (left, right) => left.localeCompare(right, "en"),
      );
      for (
        let index = 0;
        index < sortedExpectedInventoryIdentities.length;
        index += 1
      ) {
        const identity = sortedExpectedInventoryIdentities[index];
        const present = inventoryPathIdentities.get(identity)?.kind === "regular-file";
        collector.assert(
          present,
          "FIXTURE_INVENTORY_REGISTERED_PATH_MISSING",
          `fixture-inventory.expected[${index}]`,
          "inventory 必须双向包含全部登记路径与显式 metadata，不能隐藏可回读文件",
          "present regular file in fixture inventory",
          present ? "present" : "missing",
        );
        if (collector.shouldStop()) {
          break;
        }
      }
    }
  }

  const collected = collector.finish();
  return {
    schemaVersion: "1.0.0",
    kind: "datapulse-root-check-summary",
    check: "fixture-manifest",
    gateId: process.env.DATAPULSE_GATE_ID ?? null,
    runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
    result: collected.assertions.failed === 0 ? "passed" : "failed",
    catalog: {
      logicalFixtureSets: manifest.fixtureSets.length,
      artifacts: artifactCount,
      generatedFixtureSets,
    },
    assertions: collected.assertions,
    failures: collected.failures,
  };
}
