
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DRY_RUN_VERSION,
  STAGING_ROOT,
  generateReleaseDryRun,
  loadDependencies,
  readJsonFile,
  repositoryRoot,
  runPnpm,
  sha256File,
  sha256Text,
  spdxDocument,
  workspaceDirectories,
} from "./release-dry-run.mjs";

const EXPECTED_WORKSPACE_COUNT = 12;
const EXPECTED_NOASSERTION_DEPENDENCIES = new Set([
  "@google/design.md@0.4.0",
  "spawndamnit@3.0.1",
]);
const CONTROL_FILES = new Set(["manifest.json", "SHA256SUMS.txt", "sbom.spdx.json"]);
const FORBIDDEN_ENTRY_NAMES = new Set(["node_modules", ".turbo", "package-lock.json"]);
const EXCLUDED_FILE_SUFFIXES = [".tsbuildinfo"];

const assertions = [];
function record(name, passed, expected, actual) {
  assertions.push({ name, passed, expected, actual });
}

function runBuild() {
  const execution = runPnpm(repositoryRoot, ["run", "build"]);
  if (execution.status !== 0) {
    throw new Error(
      `RELEASE_BUILD_FAILED: ${execution.status} ${(execution.stderr ?? "").slice(-2000)}`,
    );
  }
}

function walkFiles(directory, relativePrefix = "", includeForbidden = false) {
  const files = [];
  for (const entry of readdirSync(directory).sort()) {
    if (!includeForbidden && FORBIDDEN_ENTRY_NAMES.has(entry)) continue;
    const absolute = join(directory, entry);
    const relativePath = relativePrefix === "" ? entry : `${relativePrefix}/${entry}`;
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (includeForbidden) files.push({ path: relativePath, absolute, directory: true });
      files.push(...walkFiles(absolute, relativePath, includeForbidden));
    } else if (stat.isFile()) {
      files.push({ path: relativePath, absolute });
    }
  }
  return files;
}

function parseChecksums(content) {
  const lines = content.trim().split(/\r?\n/u).filter((line) => line.length > 0);
  const sums = new Map();
  const invalid = [];
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/u.exec(line);
    if (match === null) {
      invalid.push(line);
      continue;
    }
    sums.set(match[2], match[1]);
  }
  return { sums, invalid };
}

function inspectRelease(targetRoot) {
  const manifest = readJsonFile(join(targetRoot, "manifest.json"));
  const stagedFiles = walkFiles(targetRoot)
    .filter((file) => !CONTROL_FILES.has(file.path))
    .map((file) => ({ path: file.path, sha256: sha256File(file.absolute) }));
  let checksumsMissing = false;
  let checksumContent = "";
  try {
    checksumContent = readFileSync(join(targetRoot, "SHA256SUMS.txt"), "utf8");
  } catch {
    checksumsMissing = true;
  }
  const { sums, invalid } = parseChecksums(checksumContent);
  const sbom = readJsonFile(join(targetRoot, "sbom.spdx.json"));
  const dependencies = loadDependencies(repositoryRoot);
  return { targetRoot, manifest, stagedFiles, sums, invalid, checksumsMissing, sbom, dependencies };
}

function verifyInspection(inspection) {
  const failures = [];
  const { targetRoot, manifest, stagedFiles, sums, invalid, checksumsMissing, sbom, dependencies } = inspection;

  if (manifest.workspaces.length !== EXPECTED_WORKSPACE_COUNT) {
    failures.push({
      code: "RELEASE_WORKSPACE_COUNT_MISMATCH",
      expected: EXPECTED_WORKSPACE_COUNT,
      actual: manifest.workspaces.length,
    });
  }

  const stagedWorkspacePaths = new Set();
  for (const workspace of manifest.workspaces) {
    const stagedDir = join(targetRoot, ...workspace.relativePath.split("/"));
    if (!existsSync(stagedDir)) {
      failures.push({
        code: "RELEASE_STAGED_WORKSPACE_MISSING",
        workspace: workspace.relativePath,
      });
      continue;
    }
    const files = walkFiles(stagedDir);
    if (files.length === 0) {
      failures.push({
        code: "RELEASE_STAGED_WORKSPACE_EMPTY",
        workspace: workspace.relativePath,
      });
    }
    stagedWorkspacePaths.add(workspace.relativePath);
  }

  const allFiles = walkFiles(targetRoot, "", true);
  const forbidden = allFiles.filter(
    (file) =>
      file.path.split("/").some((segment) => FORBIDDEN_ENTRY_NAMES.has(segment)) ||
      EXCLUDED_FILE_SUFFIXES.some((suffix) => file.path.endsWith(suffix)),
  );
  if (forbidden.length > 0) {
    failures.push({
      code: "RELEASE_FORBIDDEN_ENTRY",
      entries: forbidden.map((file) => file.path),
    });
  }

  if (checksumsMissing === true) {
    failures.push({ code: "RELEASE_CHECKSUM_FILE_MISSING", path: "SHA256SUMS.txt" });
  }
  if (invalid.length > 0) {
    failures.push({ code: "RELEASE_CHECKSUM_LINE_INVALID", lines: invalid });
  }

  const expectedChecksumPaths = new Set([
    ...stagedFiles.map((file) => file.path),
    "manifest.json",
    "sbom.spdx.json",
  ]);
  const actualStagedPaths = new Set(stagedFiles.map((file) => file.path));

  for (const path of sums.keys()) {
    if (!existsSync(join(targetRoot, ...path.split("/")))) {
      failures.push({ code: "RELEASE_CHECKSUM_FILE_MISSING", path });
    }
  }
  const listedPaths = new Set(sums.keys());
  for (const path of expectedChecksumPaths) {
    if (!listedPaths.has(path)) {
      failures.push({ code: "RELEASE_CHECKSUM_EXTRA_FILE", path });
    }
  }
  for (const path of listedPaths) {
    if (expectedChecksumPaths.has(path) && !actualStagedPaths.has(path) && !CONTROL_FILES.has(path)) {
      failures.push({ code: "RELEASE_CHECKSUM_EXTRA_FILE", path });
    }
  }
  for (const file of stagedFiles) {
    if (sums.get(file.path) !== file.sha256) {
      failures.push({
        code: "RELEASE_CHECKSUM_MISMATCH",
        path: file.path,
        expected: sums.get(file.path) ?? null,
        actual: file.sha256,
      });
    }
  }
  for (const control of ["manifest.json", "sbom.spdx.json"]) {
    const expected = sums.get(control);
    if (typeof expected === "string") {
      const actual = sha256File(join(targetRoot, control));
      if (actual !== expected) {
        failures.push({ code: "RELEASE_CHECKSUM_MISMATCH", path: control, expected, actual });
      }
    }
  }

  if (
    sbom?.spdxVersion !== "SPDX-2.3" ||
    sbom?.dataLicense !== "CC0-1.0" ||
    sbom?.SPDXID !== "SPDXRef-DOCUMENT" ||
    typeof sbom?.documentNamespace !== "string" ||
    sbom?.documentNamespace.length === 0 ||
    !Array.isArray(sbom?.packages) ||
    !Array.isArray(sbom?.files) ||
    !Array.isArray(sbom?.relationships)
  ) {
    failures.push({ code: "RELEASE_SBOM_SHAPE_INVALID" });
  }

  const workspacePackages = (sbom?.packages ?? []).filter(
    (pkg) => Array.isArray(pkg?.attributionTexts) && pkg.attributionTexts.length === 1,
  );
  const sbomWorkspacePaths = new Set(
    workspacePackages.map((pkg) => pkg.attributionTexts[0]),
  );
  for (const workspace of manifest.workspaces) {
    if (!sbomWorkspacePaths.has(workspace.relativePath)) {
      failures.push({
        code: "RELEASE_SBOM_WORKSPACE_COVERAGE",
        workspace: workspace.relativePath,
      });
    }
  }

  const dependencyPackages = (sbom?.packages ?? []).filter((pkg) =>
    pkg?.SPDXID?.startsWith("SPDXRef-Package-DEP-"),
  );
  if (dependencyPackages.length !== dependencies.length) {
    failures.push({
      code: "RELEASE_SBOM_DEPENDENCY_COVERAGE",
      expected: dependencies.length,
      actual: dependencyPackages.length,
    });
  }
  const noAssertionSet = new Set();
  for (const pkg of dependencyPackages) {
    if (typeof pkg?.licenseConcluded !== "string" || pkg.licenseConcluded.length === 0) {
      failures.push({ code: "RELEASE_SBOM_LICENSE_BASELINE", package: pkg?.SPDXID });
    }
    if (pkg?.licenseConcluded === "NOASSERTION") {
      noAssertionSet.add(`${pkg.name}@${pkg.versionInfo}`);
    }
  }
  if (
    noAssertionSet.size !== EXPECTED_NOASSERTION_DEPENDENCIES.size ||
    [...noAssertionSet].some((value) => !EXPECTED_NOASSERTION_DEPENDENCIES.has(value))
  ) {
    failures.push({
      code: "RELEASE_SBOM_LICENSE_BASELINE",
      noAssertion: [...noAssertionSet].sort(),
      expectedNoAssertion: [...EXPECTED_NOASSERTION_DEPENDENCIES].sort(),
    });
  }

  const fileChecksums = new Map(
    (sbom?.files ?? []).map((file) => {
      const sha256 = (file?.checksums ?? []).find(
        (checksum) => checksum?.algorithm === "SHA256",
      );
      return [file?.fileName, sha256?.checksumValue ?? null];
    }),
  );
  for (const file of stagedFiles) {
    if (fileChecksums.get(file.path) !== file.sha256) {
      failures.push({
        code: "RELEASE_SBOM_FILE_CHECKSUM_MISMATCH",
        path: file.path,
      });
    }
  }

  return failures;
}

function snapshotHashes(targetRoot) {
  const values = ["manifest.json", "SHA256SUMS.txt", "sbom.spdx.json"].map((name) =>
    sha256File(join(targetRoot, name)),
  );
  return values.join("|");
}

function copyDirectory(source, target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function runSelfTests(targetRoot) {
  const selfTests = [];
  const runCase = (name, mutate, expectedCode, expectedAbsent = null) => {
    const copy = join(STAGING_ROOT, "__self-test-copy__");
    copyDirectory(targetRoot, copy);
    try {
      if (mutate) mutate(copy);
      const failures = verifyInspection(inspectRelease(copy));
      const hasExpected = expectedCode === null || failures.some((failure) => failure.code === expectedCode);
      const passed =
        hasExpected &&
        (expectedAbsent === null || !failures.some((failure) => failure.code === expectedAbsent));
      selfTests.push({
        name,
        passed,
        failures: failures.map((failure) => failure.code).slice(0, 20),
      });
    } catch (error) {
      selfTests.push({
        name,
        passed: false,
        failures: [error instanceof Error ? error.message : String(error)].slice(0, 20),
      });
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  };

  const manifest = readJsonFile(join(targetRoot, "manifest.json"));
  const firstWorkspace = manifest.workspaces[0];
  const firstFile = walkFiles(join(targetRoot, ...firstWorkspace.relativePath.split("/")))[0];

  runCase(
    "tampered staged file is detected",
    (copy) => {
      const target = join(
        copy,
        ...firstWorkspace.relativePath.split("/"),
        ...firstFile.path.split("/"),
      );
      writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from("x")]));
    },
    "RELEASE_CHECKSUM_MISMATCH",
  );
  runCase(
    "missing checksum file is detected",
    (copy) => rmSync(join(copy, "SHA256SUMS.txt"), { force: true }),
    "RELEASE_CHECKSUM_FILE_MISSING",
  );
  runCase(
    "forbidden entry is detected",
    (copy) => {
      mkdirSync(join(copy, "node_modules", "leak"), { recursive: true });
      writeFileSync(join(copy, "node_modules", "leak", "file.js"), "x");
    },
    "RELEASE_FORBIDDEN_ENTRY",
  );
  runCase(
    "missing dependency license is detected",
    (copy) => {
      const sbomPath = join(copy, "sbom.spdx.json");
      const sbom = readJsonFile(sbomPath);
      const dep = sbom.packages.find((pkg) => pkg.SPDXID.startsWith("SPDXRef-Package-DEP-"));
      dep.licenseConcluded = "";
      writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
    },
    "RELEASE_SBOM_LICENSE_BASELINE",
  );
  runCase(
    "regeneration is deterministic",
    null,
    null,
    "RELEASE_DETERMINISM",
  );

  return {
    result: selfTests.every((test) => test.passed) ? "passed" : "failed",
    assertions: selfTests.length,
    tests: selfTests,
  };
}

function emergencySummary(code, message) {
  return {
    schemaVersion: "1.0.0",
    kind: "datapulse-root-check-summary",
    check: "release-dry-run",
    gateId: process.env.DATAPULSE_GATE_ID ?? null,
    runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
    result: "failed",
    assertions: { executed: 1, passed: 0, failed: 1, skipped: 0 },
    failures: [{ code, subject: "check-release-dry-run", message }],
  };
}

try {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--self-test");
  if (unknownArguments.length > 0) {
    throw new Error("RELEASE_CHECK_ARGUMENT_INVALID");
  }
  runBuild();
  const generated = generateReleaseDryRun(repositoryRoot, DRY_RUN_VERSION);
  const before = snapshotHashes(generated.targetRoot);
  const regenerated = generateReleaseDryRun(repositoryRoot, DRY_RUN_VERSION);
  const after = snapshotHashes(regenerated.targetRoot);

  const inspection = inspectRelease(regenerated.targetRoot);
  const failures = verifyInspection(inspection);

  record(
    "release staging covers exactly 12 workspaces",
    inspection.manifest.workspaces.length === EXPECTED_WORKSPACE_COUNT,
    EXPECTED_WORKSPACE_COUNT,
    inspection.manifest.workspaces.length,
  );
  record(
    "staged file count matches manifest",
    inspection.stagedFiles.length === inspection.manifest.workspaces.reduce(
      (sum, workspace) => sum + workspace.files,
      0,
    ),
    inspection.manifest.workspaces.reduce((sum, workspace) => sum + workspace.files, 0),
    inspection.stagedFiles.length,
  );
  record(
    "checksum and SBOM regeneration is deterministic",
    before === after,
    "identical byte hashes across regeneration",
    { before, after },
  );
  record(
    "release verification has no failures",
    failures.length === 0,
    "no failures",
    failures,
  );

  const selfTest = process.argv.includes("--self-test") ? runSelfTests(regenerated.targetRoot) : null;
  if (selfTest !== null) {
    record(
      "self-tests detect all release tampering",
      selfTest.result === "passed",
      "all self-tests passed",
      selfTest.tests,
    );
  }

  const summary = {
    schemaVersion: "1.0.0",
    kind: "datapulse-root-check-summary",
    check: "release-dry-run",
    gateId: process.env.DATAPULSE_GATE_ID ?? null,
    runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
    result: failures.length === 0 && (selfTest === null || selfTest.result === "passed")
      ? "passed"
      : "failed",
    generated,
    assertions: {
      executed: assertions.length,
      passed: assertions.filter((item) => item.passed).length,
      failed: assertions.filter((item) => !item.passed).length,
      skipped: 0,
    },
    selfTest,
    failures,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.result !== "passed") process.exitCode = 1;
} catch (error) {
  const code = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(emergencySummary(code.split(":")[0], code), null, 2));
  process.exitCode = 1;
}
