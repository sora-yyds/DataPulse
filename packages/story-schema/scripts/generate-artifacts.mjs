import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder, TextEncoder } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageDirectory, "..", "..");
const formalHistoryRepositoryPath = "packages/story-schema/src/formal";
const formalHistoryManifestPath = resolve(
  packageDirectory,
  "src",
  "formal",
  "history.v1.json",
);
const formalSchemaPath = resolve(
  packageDirectory,
  "src",
  "formal",
  "1.0.0",
  "story-blueprint.schema.json",
);
const schemaPath = resolve(
  packageDirectory,
  "src",
  "experimental",
  "story-blueprint.schema.json",
);
const legacyDevelopmentSchemaPath = resolve(
  packageDirectory,
  "src",
  "experimental",
  "story-blueprint-v0_0_1.schema.json",
);
const generatedDirectory = resolve(packageDirectory, "src", "generated");
const formalGeneratedTypesPath = resolve(
  generatedDirectory,
  "formal-story-blueprint-v1_0_0.generated.ts",
);
const formalGeneratedValidatorPath = resolve(
  generatedDirectory,
  "formal-story-blueprint-v1_0_0.validator.generated.ts",
);
const formalHistoryMetadataPath = resolve(
  generatedDirectory,
  "formal-story-history.generated.ts",
);
const formalValidatorRegistryPath = resolve(
  generatedDirectory,
  "formal-story-validator-registry.generated.ts",
);
const generatedTypesPath = resolve(
  generatedDirectory,
  "experimental-story-blueprint.generated.ts",
);
const generatedValidatorPath = resolve(
  generatedDirectory,
  "experimental-story-blueprint.validator.generated.ts",
);
const legacyDevelopmentGeneratedTypesPath = resolve(
  generatedDirectory,
  "experimental-story-blueprint-v0_0_1.generated.ts",
);
const legacyDevelopmentGeneratedValidatorPath = resolve(
  generatedDirectory,
  "experimental-story-blueprint-v0_0_1.validator.generated.ts",
);

const SCHEMA_DEFINITIONS = Object.freeze([
  Object.freeze({
    releaseStatus: "formal",
    version: "1.0.0",
    schemaPath: formalSchemaPath,
    schemaRelativePath: "src/formal/1.0.0/story-blueprint.schema.json",
    generatedTypeName: "StoryBlueprint",
    generatedTypesPath: formalGeneratedTypesPath,
    generatedTypesRelativePath:
      "src/generated/formal-story-blueprint-v1_0_0.generated.ts",
    generatedValidatorPath: formalGeneratedValidatorPath,
    generatedValidatorRelativePath:
      "src/generated/formal-story-blueprint-v1_0_0.validator.generated.ts",
  }),
  Object.freeze({
    releaseStatus: "development",
    version: "0.1.0",
    schemaPath,
    schemaRelativePath: "src/experimental/story-blueprint.schema.json",
    generatedTypeName: "ExperimentalStoryBlueprint",
    generatedTypesPath,
    generatedTypesRelativePath: "src/generated/experimental-story-blueprint.generated.ts",
    generatedValidatorPath,
    generatedValidatorRelativePath:
      "src/generated/experimental-story-blueprint.validator.generated.ts",
  }),
  Object.freeze({
    releaseStatus: "development",
    version: "0.0.1",
    schemaPath: legacyDevelopmentSchemaPath,
    schemaRelativePath: "src/experimental/story-blueprint-v0_0_1.schema.json",
    generatedTypeName: "ExperimentalStoryBlueprintV0_0_1",
    generatedTypesPath: legacyDevelopmentGeneratedTypesPath,
    generatedTypesRelativePath:
      "src/generated/experimental-story-blueprint-v0_0_1.generated.ts",
    generatedValidatorPath: legacyDevelopmentGeneratedValidatorPath,
    generatedValidatorRelativePath:
      "src/generated/experimental-story-blueprint-v0_0_1.validator.generated.ts",
  }),
]);

const GENERATED_HEADER =
  "/* 由 scripts/generate-artifacts.mjs 确定性生成；请勿手工修改。 */";
const ALLOWED_AJV_RUNTIME_HELPERS = new Set([
  "ajv/dist/runtime/equal",
  "ajv/dist/runtime/ucs2length",
]);

function normalizeGeneratedText(value) {
  return `${value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd()}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const CORE_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_OBJECT_ID_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu;

function isPlainRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) {
    throw new Error(`Formal history ${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`Formal history ${label} has unexpected or missing keys`);
  }
}

function parseVersionParts(value, label) {
  if (typeof value !== "string") {
    throw new Error(`Formal history ${label} version must be a string`);
  }
  const match = CORE_VERSION_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`Formal history ${label} version must be core SemVer`);
  }
  const parts = match.slice(1).map(Number);
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isSafeInteger(part) || part > 2_147_483_647)
  ) {
    throw new Error(`Formal history ${label} version is outside the supported range`);
  }
  return parts;
}

function compareVersionParts(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function assertFormalVersionPolicy(entry, predecessor, index) {
  const parts = parseVersionParts(entry.version, `entry ${index}`);
  if (parts[0] === 0) {
    throw new Error("Formal history forbids 0.x Story Schemas");
  }
  if (entry.schemaId !== `urn:datapulse:story-blueprint:formal:${entry.version}`) {
    throw new Error(`Formal history entry ${entry.version} has an invalid Schema ID`);
  }
  const expectedPath = `src/formal/${entry.version}/story-blueprint.schema.json`;
  if (entry.schemaPath !== expectedPath) {
    throw new Error(`Formal history entry ${entry.version} has an invalid Schema path`);
  }
  if (
    !Number.isSafeInteger(entry.schemaBytes) ||
    entry.schemaBytes <= 0 ||
    !SHA256_PATTERN.test(entry.schemaSha256)
  ) {
    throw new Error(`Formal history entry ${entry.version} has invalid hash metadata`);
  }

  if (predecessor === undefined) {
    if (
      entry.version !== "1.0.0" ||
      entry.predecessor !== null ||
      entry.changeKind !== "initial"
    ) {
      throw new Error("Formal history must begin with immutable 1.0.0 initial entry");
    }
    return parts;
  }

  if (entry.predecessor !== predecessor.version) {
    throw new Error(`Formal history entry ${entry.version} must name its adjacent predecessor`);
  }
  const predecessorParts = parseVersionParts(predecessor.version, `entry ${index - 1}`);
  if (compareVersionParts(parts, predecessorParts) <= 0) {
    throw new Error("Formal history versions must be strictly increasing");
  }
  if (parts[0] === predecessorParts[0]) {
    if (parts[1] === predecessorParts[1]) {
      if (
        entry.changeKind !== "correction" ||
        parts[2] <= predecessorParts[2]
      ) {
        throw new Error("Pure Story Schema corrections require a higher patch version");
      }
    } else if (
      entry.changeKind !== "compatible-addition" ||
      parts[1] <= predecessorParts[1] ||
      parts[2] !== 0
    ) {
      throw new Error("Compatible Story Schema additions require a higher minor version");
    }
  } else if (
    entry.changeKind !== "breaking" ||
    parts[0] !== predecessorParts[0] + 1 ||
    parts[1] !== 0 ||
    parts[2] !== 0
  ) {
    throw new Error("Breaking Story Schema changes require the next major version");
  }
  return parts;
}

async function readAndValidateFormalHistory() {
  const manifestBytes = await readFile(formalHistoryManifestPath);
  const manifest = JSON.parse(decodeSchemaSource(manifestBytes));
  assertExactKeys(
    manifest,
    ["schemaVersion", "kind", "currentVersion", "hashAlgorithm", "versions"],
    "manifest",
  );
  if (
    manifest.schemaVersion !== "1.0.0" ||
    manifest.kind !== "datapulse-formal-story-schema-history" ||
    manifest.hashAlgorithm !== "SHA-256" ||
    !Array.isArray(manifest.versions) ||
    manifest.versions.length === 0 ||
    manifest.versions.length > 64
  ) {
    throw new Error("Formal history manifest identity or version list is invalid");
  }

  const seen = new Set();
  let predecessor;
  for (let index = 0; index < manifest.versions.length; index += 1) {
    const entry = manifest.versions[index];
    assertExactKeys(
      entry,
      [
        "version",
        "predecessor",
        "changeKind",
        "schemaId",
        "schemaPath",
        "schemaBytes",
        "schemaSha256",
      ],
      `entry ${index}`,
    );
    assertFormalVersionPolicy(entry, predecessor, index);
    if (seen.has(entry.version)) {
      throw new Error(`Formal history contains duplicate version ${entry.version}`);
    }
    seen.add(entry.version);

    const sourceBytes = await readFile(resolve(packageDirectory, entry.schemaPath));
    if (
      sourceBytes.byteLength !== entry.schemaBytes ||
      sha256(sourceBytes) !== entry.schemaSha256
    ) {
      throw new Error(`Formal history hash mismatch for ${entry.version}`);
    }
    const schema = JSON.parse(decodeSchemaSource(sourceBytes));
    assertOnlyLocalSchemaReferences(schema);
    if (
      schema.$id !== entry.schemaId ||
      schema?.properties?.schemaVersion?.const !== entry.version
    ) {
      throw new Error(`Formal history Schema identity mismatch for ${entry.version}`);
    }
    predecessor = entry;
  }

  const current = manifest.versions[manifest.versions.length - 1];
  if (current === undefined || manifest.currentVersion !== current.version) {
    throw new Error("Formal history currentVersion must be the final registered version");
  }
  return { current, manifest };
}

function gitEnvironment() {
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
}

function gitResult(args, encoding = "utf8") {
  return spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding,
    env: gitEnvironment(),
    shell: false,
    windowsHide: true,
  });
}

function gitRevisionExists(reference, runGit = gitResult) {
  return runGit(["rev-parse", "--verify", "--quiet", reference]).status === 0;
}

function normalizeRepositoryPath(path) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function assertCompleteGitHistory(value) {
  if (value.trim() !== "false") {
    throw new Error("Formal history requires a complete Git history");
  }
}

function parseProtectedRevisionList(output) {
  const revisions = output.split(/\r?\n/u).filter(Boolean);
  if (revisions.some((revision) => !GIT_OBJECT_ID_PATTERN.test(revision))) {
    throw new Error("Formal history protected revision list is invalid");
  }
  return revisions;
}

function resolveTrustedBaselineRevisions({
  explicit = process.env.DATAPULSE_MERGE_BASE,
  runGit = gitResult,
} = {}) {
  const topLevel = runGit(["rev-parse", "--show-toplevel"]);
  if (
    topLevel.status !== 0 ||
    normalizeRepositoryPath(topLevel.stdout.trim()) !==
      normalizeRepositoryPath(repositoryRoot)
  ) {
    throw new Error("Formal history repository root is unavailable");
  }
  const shallow = runGit(["rev-parse", "--is-shallow-repository"]);
  if (shallow.status !== 0) {
    throw new Error("Formal history repository depth is unavailable");
  }
  assertCompleteGitHistory(shallow.stdout);

  if (explicit !== undefined && !GIT_OBJECT_ID_PATTERN.test(explicit)) {
    throw new Error("Formal history merge-base override must be a full commit SHA");
  }
  const candidates = explicit
    ? [explicit]
    : ["refs/remotes/origin/main", "refs/heads/main"];
  const baseReference = candidates.find((candidate) => gitRevisionExists(candidate, runGit));
  if (baseReference === undefined) {
    throw new Error("Formal history trusted merge-base reference is unavailable");
  }
  const mergeBase = runGit(["merge-base", "HEAD", baseReference]);
  if (mergeBase.status !== 0) {
    throw new Error("Formal history merge-base resolution failed");
  }
  const revision = mergeBase.stdout.trim();
  if (!GIT_OBJECT_ID_PATTERN.test(revision)) {
    throw new Error("Formal history merge-base revision is invalid");
  }

  const head = runGit(["rev-parse", "HEAD"]);
  if (head.status !== 0) {
    throw new Error("Formal history HEAD revision is unavailable");
  }
  const headRevision = head.stdout.trim();
  if (!GIT_OBJECT_ID_PATTERN.test(headRevision)) {
    throw new Error("Formal history HEAD revision is invalid");
  }
  if (explicit !== undefined && revision === headRevision) {
    throw new Error("Formal history merge-base override must not equal HEAD");
  }

  const protectedHistory = runGit([
    "rev-list",
    "--full-history",
    "--topo-order",
    "--reverse",
    "HEAD",
    "--",
    formalHistoryRepositoryPath,
  ]);
  if (protectedHistory.status !== 0) {
    throw new Error("Formal history protected revision discovery failed");
  }
  const protectedRevisions = parseProtectedRevisionList(protectedHistory.stdout);

  // merge-base 保护已经落地主线的历史；HEAD 可达且触碰正式目录的每个提交，
  // 保护长分支内首次冻结或后续追加的版本，避免同一分支后续提交覆写旧版本。
  return [...new Set([revision, ...protectedRevisions])];
}

function formalHistoryEntriesEqual(left, right) {
  const keys = [
    "version",
    "predecessor",
    "changeKind",
    "schemaId",
    "schemaPath",
    "schemaBytes",
    "schemaSha256",
  ];
  return keys.every((key) => left?.[key] === right?.[key]);
}

async function assertFormalHistoryAppendOnly(currentHistory) {
  const revisions = resolveTrustedBaselineRevisions();
  for (const revision of revisions) {
    await assertFormalHistoryBaseline(currentHistory, revision);
  }
}

async function assertFormalHistoryBaseline(currentHistory, revision) {
  const manifestRelativePath = "packages/story-schema/src/formal/history.v1.json";
  const baselineManifest = gitResult(["show", `${revision}:${manifestRelativePath}`]);
  if (baselineManifest.status !== 0) {
    const baselineFormalFiles = gitResult([
      "ls-tree",
      "-r",
      "--name-only",
      revision,
      "--",
      formalHistoryRepositoryPath,
    ]);
    if (baselineFormalFiles.status !== 0 || baselineFormalFiles.stdout.trim() !== "") {
      throw new Error("Formal history baseline is missing its manifest");
    }
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(baselineManifest.stdout);
  } catch {
    throw new Error("Formal history baseline manifest is invalid JSON");
  }
  if (
    !isPlainRecord(baseline) ||
    baseline.schemaVersion !== currentHistory.schemaVersion ||
    baseline.kind !== currentHistory.kind ||
    baseline.hashAlgorithm !== currentHistory.hashAlgorithm ||
    !Array.isArray(baseline.versions) ||
    baseline.versions.length > currentHistory.versions.length
  ) {
    throw new Error("Formal history baseline cannot be removed or replaced");
  }

  for (let index = 0; index < baseline.versions.length; index += 1) {
    const baselineEntry = baseline.versions[index];
    const currentEntry = currentHistory.versions[index];
    if (!formalHistoryEntriesEqual(baselineEntry, currentEntry)) {
      throw new Error("Formal history existing entries are immutable and ordered");
    }
    const baselineSchemaPath = `packages/story-schema/${baselineEntry.schemaPath}`;
    const baselineSchema = gitResult(
      ["show", `${revision}:${baselineSchemaPath}`],
      null,
    );
    if (baselineSchema.status !== 0) {
      throw new Error(`Formal history baseline Schema is missing for ${baselineEntry.version}`);
    }
    const currentDefinition = SCHEMA_DEFINITIONS.find(
      (definition) =>
        definition.releaseStatus === "formal" &&
        definition.version === baselineEntry.version,
    );
    if (currentDefinition === undefined) {
      throw new Error(`Formal history generated definition is missing for ${baselineEntry.version}`);
    }
    const currentSchema = await readFile(currentDefinition.schemaPath);
    if (
      baselineSchema.status !== 0 ||
      !Buffer.isBuffer(baselineSchema.stdout) ||
      !baselineSchema.stdout.equals(currentSchema)
    ) {
      throw new Error(`Formal history Schema bytes are immutable for ${baselineEntry.version}`);
    }
  }
}

function assertPortableGeneratedText(label, value) {
  if (value.charCodeAt(0) === 0xfeff) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  if (value.includes("\r")) {
    throw new Error(`${label} must use LF line endings`);
  }

  const rawPackagePath = packageDirectory;
  const slashPackagePath = packageDirectory.replaceAll("\\", "/");
  if (value.includes(rawPackagePath) || value.includes(slashPackagePath)) {
    throw new Error(`${label} must not contain an absolute workspace path`);
  }
}

function rewriteAjvRuntimeHelpers(source) {
  const importedHelpers = [];
  const rewritten = source.replace(
    /^const (func\d+) = require\("([^"]+)"\)\.default;$/gm,
    (_match, localName, specifier) => {
      if (!ALLOWED_AJV_RUNTIME_HELPERS.has(specifier)) {
        throw new Error(`Unsupported Ajv standalone runtime helper: ${specifier}`);
      }
      importedHelpers.push(specifier);
      return [
        `import ${localName}Module from "${specifier}.js";`,
        `const ${localName} = ${localName}Module.default ?? ${localName}Module;`,
      ].join("\n");
    },
  );

  if (/\brequire\s*\(/u.test(rewritten)) {
    throw new Error("Generated validator still contains CommonJS require()");
  }
  if (/\beval\s*\(/u.test(rewritten) || /\bnew\s+Function\b/u.test(rewritten)) {
    throw new Error("Generated validator contains dynamic code execution");
  }
  if (/\bimport\s*\(/u.test(rewritten)) {
    throw new Error("Generated validator contains dynamic import()");
  }

  return {
    importedHelpers: [...new Set(importedHelpers)].sort(),
    source: rewritten,
  };
}

function assertOnlyLocalSchemaReferences(value, path = "#") {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertOnlyLocalSchemaReferences(item, `${path}/${index}`));
    return;
  }
  if (Object.hasOwn(value, "$ref")) {
    if (typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) {
      throw new Error(`External or invalid JSON Schema reference is forbidden at ${path}`);
    }
  }
  for (const [key, nested] of Object.entries(value)) {
    assertOnlyLocalSchemaReferences(nested, `${path}/${key}`);
  }
}

function decodeSchemaSource(schemaBytes) {
  if (
    schemaBytes.length >= 3 &&
    schemaBytes[0] === 0xef &&
    schemaBytes[1] === 0xbb &&
    schemaBytes[2] === 0xbf
  ) {
    throw new Error("Story Schema source must not contain a UTF-8 BOM");
  }
  const schemaText = new TextDecoder("utf-8", { fatal: true }).decode(schemaBytes);
  if (schemaText.includes("\r") || !schemaText.endsWith("\n")) {
    throw new Error("Story Schema source must use LF and end with exactly encoded UTF-8 text");
  }
  return schemaText;
}

function rejects(action) {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

function runGeneratorSelfTest() {
  const validSource = new TextEncoder().encode('{"$ref":"#/$defs/local"}\n');
  const bomSource = new Uint8Array([0xef, 0xbb, 0xbf, ...validSource]);
  const invalidUtf8 = new Uint8Array([0xc3, 0x28, 0x0a]);
  const crlfSource = new TextEncoder().encode("{}\r\n");
  const initialFormalEntry = {
    version: "1.0.0",
    predecessor: null,
    changeKind: "initial",
    schemaId: "urn:datapulse:story-blueprint:formal:1.0.0",
    schemaPath: "src/formal/1.0.0/story-blueprint.schema.json",
    schemaBytes: 1,
    schemaSha256: "0".repeat(64),
  };
  const mergeBaseRevision = "1".repeat(40);
  const firstFreezeRevision = "2".repeat(40);
  const appendedVersionRevision = "3".repeat(40);
  const laterRewriteRevision = "4".repeat(40);
  const fakeGitResult = (args) => {
    const command = args.join("\0");
    const outputs = new Map([
      ["rev-parse\0--show-toplevel", repositoryRoot],
      ["rev-parse\0--is-shallow-repository", "false\n"],
      [`rev-parse\0--verify\0--quiet\0${mergeBaseRevision}`, mergeBaseRevision],
      [`merge-base\0HEAD\0${mergeBaseRevision}`, mergeBaseRevision],
      ["rev-parse\0HEAD", laterRewriteRevision],
      [
        `rev-list\0--full-history\0--topo-order\0--reverse\0HEAD\0--\0${formalHistoryRepositoryPath}`,
        `${firstFreezeRevision}\n${appendedVersionRevision}\n${laterRewriteRevision}\n`,
      ],
    ]);
    const stdout = outputs.get(command);
    return { status: stdout === undefined ? 1 : 0, stdout: stdout ?? "", stderr: "" };
  };
  const protectedRevisions = resolveTrustedBaselineRevisions({
    explicit: mergeBaseRevision,
    runGit: fakeGitResult,
  });
  const assertions = [
    decodeSchemaSource(validSource).endsWith("\n"),
    rejects(() => decodeSchemaSource(bomSource)),
    rejects(() => decodeSchemaSource(invalidUtf8)),
    rejects(() => decodeSchemaSource(crlfSource)),
    rejects(() => assertOnlyLocalSchemaReferences({ $ref: "https://example.invalid/schema" })),
    stableGeneratorFailureCode(
      new Error("External or invalid JSON Schema reference is forbidden"),
    ) === "STORY_SCHEMA_EXTERNAL_REFERENCE_FORBIDDEN",
    rejects(() =>
      assertFormalVersionPolicy(
        {
          ...initialFormalEntry,
          version: "0.1.0",
          schemaId: "urn:datapulse:story-blueprint:formal:0.1.0",
          schemaPath: "src/formal/0.1.0/story-blueprint.schema.json",
        },
        undefined,
        0,
      ),
    ),
    JSON.stringify(protectedRevisions) ===
      JSON.stringify([
        mergeBaseRevision,
        firstFreezeRevision,
        appendedVersionRevision,
        laterRewriteRevision,
      ]),
    rejects(() =>
      parseProtectedRevisionList(`${firstFreezeRevision}\nnot-a-revision\n`),
    ),
    rejects(() => assertCompleteGitHistory("true\n")),
  ];
  assertOnlyLocalSchemaReferences({ $ref: "#/$defs/local" });
  assertFormalVersionPolicy(initialFormalEntry, undefined, 0);
  if (assertions.some((passed) => !passed)) {
    throw new Error("Story Schema generator self-test failed");
  }
  return Object.freeze({ executed: assertions.length, passed: assertions.length });
}

function stableGeneratorFailureCode(error) {
  if (
    error &&
    typeof error === "object" &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]+$/u.test(error.code)
  ) {
    return `STORY_SCHEMA_IO_${error.code}`;
  }
  if (error instanceof SyntaxError) return "STORY_SCHEMA_JSON_INVALID";
  if (error instanceof TypeError) return "STORY_SCHEMA_UTF8_INVALID";
  const normalizedMessage = error instanceof Error ? error.message.toLowerCase() : "";
  if (normalizedMessage.includes("formal history hash mismatch")) {
    return "STORY_SCHEMA_FORMAL_HISTORY_HASH_MISMATCH";
  }
  if (normalizedMessage.includes("formal history")) {
    return "STORY_SCHEMA_FORMAL_HISTORY_INVALID";
  }
  if (normalizedMessage.includes("missing or stale")) {
    return "STORY_SCHEMA_GENERATED_ARTIFACT_STALE";
  }
  if (normalizedMessage.includes("external")) {
    return "STORY_SCHEMA_EXTERNAL_REFERENCE_FORBIDDEN";
  }
  return "STORY_SCHEMA_GENERATION_FAILED";
}

async function generateSchemaArtifacts(definition) {
  const schemaBytes = await readFile(definition.schemaPath);
  const schemaText = decodeSchemaSource(schemaBytes);
  const schema = JSON.parse(schemaText);
  assertOnlyLocalSchemaReferences(schema);

  const generatedTypes = await compile(
    { ...schema, title: definition.generatedTypeName },
    definition.generatedTypeName,
    {
      $refOptions: { resolve: { external: false } },
      additionalProperties: false,
      bannerComment: GENERATED_HEADER,
      cwd: packageDirectory,
      declareExternallyReferenced: true,
      format: true,
      ignoreMinAndMaxItems: false,
      strictIndexSignatures: true,
      style: {
        endOfLine: "lf",
        printWidth: 100,
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        trailingComma: "all",
      },
      unknownAny: true,
    },
  );

  const ajv = new Ajv2020({
    allErrors: false,
    code: {
      esm: true,
      lines: true,
      source: true,
    },
    strict: true,
    validateFormats: false,
  });
  const validate = ajv.compile(schema);
  const standalone = rewriteAjvRuntimeHelpers(standaloneCode(ajv, validate));
  const generatedValidator = [
    "// @ts-nocheck -- Ajv standalone output is generated JavaScript compiled by tsc.",
    GENERATED_HEADER,
    standalone.source,
  ].join("\n");

  const artifacts = [
    {
      label: "generated types",
      path: definition.generatedTypesPath,
      relativePath: definition.generatedTypesRelativePath,
      value: normalizeGeneratedText(generatedTypes),
    },
    {
      label: "standalone validator",
      path: definition.generatedValidatorPath,
      relativePath: definition.generatedValidatorRelativePath,
      value: normalizeGeneratedText(generatedValidator),
    },
  ];

  for (const artifact of artifacts) {
    assertPortableGeneratedText(artifact.label, artifact.value);
  }

  return {
    artifacts,
    importedHelpers: standalone.importedHelpers,
    schema: {
      version: definition.version,
      source: definition.schemaRelativePath,
      sha256: sha256(schemaBytes),
    },
  };
}

function generateFormalHistoryMetadata(formalHistory) {
  const entries = formalHistory.versions.map((entry) => ({
    changeKind: entry.changeKind,
    predecessor: entry.predecessor,
    schemaBytes: entry.schemaBytes,
    schemaId: entry.schemaId,
    schemaPath: entry.schemaPath,
    schemaSha256: entry.schemaSha256,
    version: entry.version,
  }));
  const current = entries[entries.length - 1];
  if (current === undefined) {
    throw new Error("Formal history current metadata is unavailable");
  }
  const frozenEntries = entries
    .map((entry) => `  Object.freeze(${JSON.stringify(entry)} as const)`)
    .join(",\n");
  const value = normalizeGeneratedText(
    [
      GENERATED_HEADER,
      "export const FORMAL_STORY_SCHEMA_HISTORY = Object.freeze([",
      frozenEntries,
      "] as const);",
      "",
      `export const CURRENT_FORMAL_STORY_SCHEMA_METADATA = Object.freeze(${JSON.stringify(current, null, 2)} as const);`,
      "",
      `export const FORMAL_STORY_SCHEMA_CURRENT_VERSION = ${JSON.stringify(current.version)} as const;`,
    ].join("\n"),
  );
  assertPortableGeneratedText("formal history metadata", value);
  return {
    label: "formal history metadata",
    path: formalHistoryMetadataPath,
    relativePath: "src/generated/formal-story-history.generated.ts",
    value,
  };
}

function generateFormalValidatorRegistry(formalHistory, formalDefinitions) {
  const registrations = formalHistory.versions.map((entry, index) => {
    const definition = formalDefinitions.find(
      (candidate) => candidate.version === entry.version,
    );
    if (definition === undefined) {
      throw new Error(`Formal validator definition is missing for ${entry.version}`);
    }
    const localName = `validateFormalStoryStructureV${entry.version.replaceAll(".", "_")}_${index}`;
    const specifier = definition.generatedValidatorRelativePath
      .replace(/^src\/generated\//u, "./")
      .replace(/\.ts$/u, ".js");
    return Object.freeze({ localName, specifier, version: entry.version });
  });

  const imports = registrations
    .map(
      ({ localName, specifier }) =>
        `import ${localName} from ${JSON.stringify(specifier)};`,
    )
    .join("\n");
  const validators = registrations
    .map(
      ({ localName, version }) =>
        `  ${JSON.stringify(version)}: ${localName} as FormalStorySchemaStructureValidator,`,
    )
    .join("\n");
  const versions = registrations.map(({ version }) => version);
  const value = normalizeGeneratedText(
    [
      GENERATED_HEADER,
      imports,
      "",
      `export const FORMAL_STORY_SCHEMA_VERSIONS = Object.freeze(${JSON.stringify(versions)} as const);`,
      "",
      "export type FormalStorySchemaVersion =",
      "  (typeof FORMAL_STORY_SCHEMA_VERSIONS)[number];",
      "",
      "export type FormalStorySchemaStructureValidator = ((value: unknown) => boolean) & {",
      "  errors?: readonly Readonly<{ instancePath?: unknown }>[] | null;",
      "};",
      "",
      "export const FORMAL_STORY_SCHEMA_VALIDATORS = Object.freeze({",
      validators,
      "} satisfies Record<FormalStorySchemaVersion, FormalStorySchemaStructureValidator>);",
    ].join("\n"),
  );
  assertPortableGeneratedText("formal validator registry", value);
  return {
    label: "formal validator registry",
    path: formalValidatorRegistryPath,
    relativePath: "src/generated/formal-story-validator-registry.generated.ts",
    value,
  };
}

async function generateArtifacts(mode) {
  const selfTest = runGeneratorSelfTest();
  const { current: currentFormalHistoryEntry, manifest: formalHistory } =
    await readAndValidateFormalHistory();
  if (mode === "--check") {
    await assertFormalHistoryAppendOnly(formalHistory);
  }
  const generatedSchemas = [];
  for (const definition of SCHEMA_DEFINITIONS) {
    generatedSchemas.push(await generateSchemaArtifacts(definition));
  }

  const registeredFormalDefinitions = SCHEMA_DEFINITIONS.filter(
    (definition) => definition.releaseStatus === "formal",
  );
  if (
    registeredFormalDefinitions.length !== formalHistory.versions.length ||
    formalHistory.versions.some(
      (entry) =>
        !registeredFormalDefinitions.some(
          (definition) =>
            definition.version === entry.version &&
            definition.schemaRelativePath === entry.schemaPath,
        ),
    )
  ) {
    throw new Error("Formal history and generated Schema definitions are inconsistent");
  }

  const currentSchema = generatedSchemas.find(
    (generated) =>
      generated.schema.version === currentFormalHistoryEntry.version &&
      generated.schema.source === currentFormalHistoryEntry.schemaPath,
  );
  if (currentSchema === undefined) {
    throw new Error("Current formal Story Schema definition is missing");
  }
  const formalHistoryMetadata = generateFormalHistoryMetadata(formalHistory);
  const formalValidatorRegistry = generateFormalValidatorRegistry(
    formalHistory,
    registeredFormalDefinitions,
  );

  return {
    artifacts: [
      ...generatedSchemas.flatMap((generated) => generated.artifacts),
      formalHistoryMetadata,
      formalValidatorRegistry,
    ],
    currentFormalSchema: currentSchema.schema,
    developmentSchemas: generatedSchemas
      .filter((generated) => generated.schema.source.startsWith("src/experimental/"))
      .map((generated) => generated.schema),
    formalHistory,
    importedHelpers: [
      ...new Set(generatedSchemas.flatMap((generated) => generated.importedHelpers)),
    ].sort(),
    selfTest,
  };
}

async function main() {
  const [mode, ...extraArguments] = process.argv.slice(2);
  if (!new Set(["--check", "--write"]).has(mode) || extraArguments.length > 0) {
    throw new Error("Usage: node ./scripts/generate-artifacts.mjs --check|--write");
  }

  const generated = await generateArtifacts(mode);
  const mismatches = [];

  if (mode === "--write") {
    await mkdir(generatedDirectory, { recursive: true });
  }

  for (const artifact of generated.artifacts) {
    if (mode === "--write") {
      await writeFile(artifact.path, artifact.value, { encoding: "utf8" });
      continue;
    }

    let existing;
    try {
      existing = await readFile(artifact.path, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        mismatches.push({ path: artifact.relativePath, reason: "missing" });
        continue;
      }
      throw error;
    }

    if (existing !== artifact.value) {
      mismatches.push({ path: artifact.relativePath, reason: "stale" });
    }
  }

  const summary = {
    schemaVersion: "1.0.0",
    kind: "datapulse-generation-summary",
    check: "story-schema-generated-artifacts",
    mode: mode.slice(2),
    result: mismatches.length === 0 ? "passed" : "failed",
    platform: process.platform,
    architecture: process.arch,
    schema: {
      source: generated.currentFormalSchema.source,
      sha256: generated.currentFormalSchema.sha256,
    },
    formalHistory: {
      source: "src/formal/history.v1.json",
      currentVersion: generated.formalHistory.currentVersion,
      versions: generated.formalHistory.versions,
    },
    developmentSchemas: generated.developmentSchemas,
    artifacts: generated.artifacts.map((artifact) => ({
      path: artifact.relativePath,
      sha256: sha256(artifact.value),
    })),
    ajvRuntimeHelpers: generated.importedHelpers,
    selfTest: generated.selfTest,
    mismatches,
  };
  if (mismatches.length > 0) {
    console.error(
      JSON.stringify(
        {
          ...summary,
          error: "STORY_SCHEMA_GENERATED_ARTIFACT_STALE",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (error) {
  const failureCode = stableGeneratorFailureCode(error);
  console.error(
    JSON.stringify(
      {
        schemaVersion: "1.0.0",
        kind: "datapulse-generation-summary",
        check: "story-schema-generated-artifacts",
        result: "failed",
        platform: process.platform,
        architecture: process.arch,
        error: failureCode,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
