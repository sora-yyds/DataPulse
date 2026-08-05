import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdtempSync,
  realpathSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const evidenceIndexPath = resolve(
  repositoryRoot,
  "docs/evidence/m0/evidence-index.json",
);

const SCRIPT_KEY_PATTERN = /^[a-z0-9][a-z0-9:-]*$/;
const SUMMARY_CHECK_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_GATE_ROOT_COMMAND_PATTERN =
  /^node \.\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.mjs(?: --[a-z0-9][a-z0-9-]*)*$/u;
const FORBIDDEN_AGGREGATE_SCRIPTS = new Set(["verify:pr", "verify:m0"]);
const ATTESTATION_KEYS = [
  "schemaVersion",
  "kind",
  "gateId",
  "checkName",
  "summaryCheck",
  "rootScript",
  "runNonce",
  "startedAt",
  "completedAt",
  "result",
  "assertions",
];
const ASSERTION_KEYS = ["executed", "passed", "failed", "skipped"];

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function hasExactKeys(value, expectedKeys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    jsonEqual(sortedKeys(value), [...expectedKeys].sort())
  );
}

export function validateActivationRegistry(index, rootPackageJson) {
  const errors = [];
  const checkNameOwners = new Map();
  const summaryCheckOwners = new Map();
  const rootScriptOwners = new Map();
  let activatedGateCount = 0;

  if (!Array.isArray(index?.gateCatalog)) {
    return ["M0_ACTIVATION_CATALOG_INVALID: gateCatalog 必须是数组"];
  }

  for (const gate of index.gateCatalog) {
    const dailyGate = gate?.dailyGate;
    if (!dailyGate || typeof dailyGate !== "object") {
      errors.push(`M0_ACTIVATION_ENTRY_INVALID: ${String(gate?.id)} 缺少 dailyGate`);
      continue;
    }

    if (!dailyGate.activated) {
      continue;
    }
    activatedGateCount += 1;

    if (!dailyGate.eligible || gate.executionKind !== "automated") {
      errors.push(
        `M0_ACTIVATION_KIND_INVALID: ${gate.id} 只能激活 eligible automated gate`,
      );
    }

    if (
      typeof dailyGate.checkName !== "string" ||
      dailyGate.checkName.trim().length === 0
    ) {
      errors.push(`M0_ACTIVATION_CHECK_NAME_MISSING: ${gate.id}`);
    } else {
      const owner = checkNameOwners.get(dailyGate.checkName);
      if (owner) {
        errors.push(
          `M0_ACTIVATION_CHECK_NAME_DUPLICATE: ${dailyGate.checkName} 同时属于 ${owner} 与 ${gate.id}`,
        );
      } else {
        checkNameOwners.set(dailyGate.checkName, gate.id);
      }
    }

    if (
      typeof dailyGate.summaryCheck !== "string" ||
      !SUMMARY_CHECK_PATTERN.test(dailyGate.summaryCheck)
    ) {
      errors.push(`M0_ACTIVATION_SUMMARY_CHECK_INVALID: ${gate.id}`);
    } else {
      const owner = summaryCheckOwners.get(dailyGate.summaryCheck);
      if (owner) {
        errors.push(
          `M0_ACTIVATION_SUMMARY_CHECK_DUPLICATE: ${dailyGate.summaryCheck} ${owner} ${gate.id}`,
        );
      } else {
        summaryCheckOwners.set(dailyGate.summaryCheck, gate.id);
      }
    }

    const scriptKey = dailyGate.rootScript;
    if (typeof scriptKey !== "string" || !SCRIPT_KEY_PATTERN.test(scriptKey)) {
      errors.push(`M0_ACTIVATION_ROOT_SCRIPT_INVALID: ${gate.id}`);
      continue;
    }

    if (FORBIDDEN_AGGREGATE_SCRIPTS.has(scriptKey)) {
      errors.push(
        `M0_ACTIVATION_RECURSIVE_SCRIPT: ${gate.id} 不得引用 ${scriptKey}`,
      );
    }

    const rootScriptOwner = rootScriptOwners.get(scriptKey);
    if (rootScriptOwner) {
      errors.push(`M0_ACTIVATION_ROOT_SCRIPT_DUPLICATE: ${scriptKey} ${rootScriptOwner} ${gate.id}`);
    } else {
      rootScriptOwners.set(scriptKey, gate.id);
    }

    const rootCommand = rootPackageJson?.scripts?.[scriptKey];
    if (typeof rootCommand === "string" && !SAFE_GATE_ROOT_COMMAND_PATTERN.test(rootCommand)) {
      errors.push(`M0_ACTIVATION_ROOT_COMMAND_UNSAFE: ${gate.id}`);
    }
    if (typeof rootCommand !== "string") {
      errors.push(
        `M0_ACTIVATION_ROOT_SCRIPT_MISSING: ${gate.id} 引用不存在的根脚本 ${scriptKey}`,
      );
    } else if (dailyGate.rootScriptCommandSha256 !== sha256Text(rootCommand)) {
      errors.push(`M0_ACTIVATION_ROOT_COMMAND_HASH_MISMATCH: ${gate.id}`);
    }
  }

  if (activatedGateCount === 0) {
    errors.push("M0_ACTIVATION_EMPTY: verify:pr requires at least one activated gate");
  }

  return errors;
}

export function validateAppendOnlyHistory(currentIndex, baselineIndex) {
  const errors = [];
  const currentRecords = Array.isArray(currentIndex?.records) ? currentIndex.records : [];
  const baselineRecords = Array.isArray(baselineIndex?.records) ? baselineIndex.records : [];

  if (currentRecords.length < baselineRecords.length) {
    errors.push(
      `M0_HISTORY_RECORDS_SHRUNK: ${currentRecords.length} < ${baselineRecords.length}`,
    );
  }

  for (let index = 0; index < baselineRecords.length; index += 1) {
    const baselineRecord = baselineRecords[index];
    const currentRecord = currentRecords[index];
    if (!jsonEqual(currentRecord, baselineRecord)) {
      errors.push(
        `M0_HISTORY_RECORD_CHANGED: records[${index}] ${String(baselineRecord?.id)}`,
      );
    }
  }

  const currentGates = new Map(
    (currentIndex?.gateCatalog ?? []).map((gate) => [gate.id, gate]),
  );
  for (const baselineGate of baselineIndex?.gateCatalog ?? []) {
    const currentGate = currentGates.get(baselineGate.id);
    if (!currentGate) {
      errors.push(`M0_HISTORY_GATE_REMOVED: ${baselineGate.id}`);
      continue;
    }

    if (
      baselineGate.dailyGate?.activated === true &&
      currentGate.dailyGate?.activated !== true
    ) {
      errors.push(`M0_HISTORY_ACTIVATION_REVERTED: ${baselineGate.id}`);
    }

    if (
      typeof baselineGate.dailyGate?.checkName === "string" &&
      currentGate.dailyGate?.checkName !== baselineGate.dailyGate.checkName
    ) {
      errors.push(`M0_HISTORY_CHECK_NAME_CHANGED: ${baselineGate.id}`);
    }

    if (
      typeof baselineGate.dailyGate?.summaryCheck === "string" &&
      currentGate.dailyGate?.summaryCheck !== baselineGate.dailyGate.summaryCheck
    ) {
      errors.push(`M0_HISTORY_SUMMARY_CHECK_CHANGED: ${baselineGate.id}`);
    }

    if (
      baselineGate.dailyGate?.activated === true &&
      typeof baselineGate.dailyGate?.rootScript === "string" &&
      currentGate.dailyGate?.rootScript !== baselineGate.dailyGate.rootScript
    ) {
      errors.push(`M0_HISTORY_ROOT_SCRIPT_CHANGED: ${baselineGate.id}`);
    }
  }

  return errors;
}

function gitResult(args) {
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
  return spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    shell: false,
    windowsHide: true,
  });
}

function gitRevisionExists(reference) {
  const result = gitResult(["rev-parse", "--verify", "--quiet", reference]);
  return result.status === 0;
}

export function loadMergeBaseEvidenceIndex(explicitBaseReference) {
  const topLevel = gitResult(["rev-parse", "--show-toplevel"]);
  if (
    topLevel.status !== 0 ||
    resolve(topLevel.stdout.trim()) !== resolve(repositoryRoot)
  ) {
    throw new Error("M0_HISTORY_REPOSITORY_ROOT_INVALID");
  }

  if (
    explicitBaseReference &&
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(explicitBaseReference)
  ) {
    throw new Error("M0_HISTORY_BASE_REFERENCE_INVALID: expected a full commit SHA");
  }

  const candidates = explicitBaseReference
    ? [explicitBaseReference]
    : ["refs/remotes/origin/main", "refs/heads/main"];
  const baseReference = candidates.find(gitRevisionExists);

  if (!baseReference) {
    throw new Error(
      "M0_HISTORY_BASE_MISSING: 无法解析 merge base；请提供 DATAPULSE_MERGE_BASE",
    );
  }

  const mergeBase = gitResult(["merge-base", "HEAD", baseReference]);
  if (mergeBase.status !== 0) {
    throw new Error(
      `M0_HISTORY_MERGE_BASE_FAILED: ${(mergeBase.stderr || mergeBase.stdout).trim()}`,
    );
  }

  const revision = mergeBase.stdout.trim();
  const headRevision = readRepositoryHeadRevision();
  if (revision === headRevision) {
    throw new Error("M0_HISTORY_BASE_EQUALS_HEAD");
  }
  const relativePath = "docs/evidence/m0/evidence-index.json";
  const baseline = gitResult(["show", `${revision}:${relativePath}`]);
  if (baseline.status !== 0) {
    throw new Error(
      `M0_HISTORY_INDEX_MISSING: ${revision}:${relativePath}`,
    );
  }

  return {
    baseReference,
    revision,
    index: JSON.parse(baseline.stdout),
  };
}

export function readRepositoryHeadRevision() {
  const head = gitResult(["rev-parse", "HEAD"]);
  const revision = head.stdout.trim();
  if (
    head.status !== 0 ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision)
  ) {
    throw new Error("M0_HISTORY_HEAD_INVALID");
  }
  return revision;
}

export function extractStructuredSummary(output) {
  const normalized = String(output)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim();

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] !== "{") {
      continue;
    }
    try {
      const candidate = JSON.parse(normalized.slice(index));
      if (candidate && typeof candidate === "object") {
        return candidate;
      }
    } catch {
      // Continue until a JSON object that consumes the remaining output is found.
    }
  }

  return null;
}

export function runRootScript(scriptKey, options = {}) {
  if (!SCRIPT_KEY_PATTERN.test(scriptKey)) {
    throw new Error(`M0_ROOT_SCRIPT_KEY_INVALID: ${scriptKey}`);
  }

  const environment = { ...process.env, ...options.environment };
  const isWindows = process.platform === "win32";
  const executable = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "corepack";
  const args = isWindows
    ? ["/d", "/s", "/c", `corepack pnpm run ${scriptKey}`]
    : ["pnpm", "run", scriptKey];
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    shell: false,
    timeout: options.timeoutMilliseconds ?? 600_000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  const completedAt = new Date().toISOString();

  return {
    scriptKey,
    startedAt,
    completedAt,
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    summary: extractStructuredSummary(result.stdout ?? ""),
  };
}

export function parseActivatedRootCommand(command) {
  if (typeof command !== "string" || !SAFE_GATE_ROOT_COMMAND_PATTERN.test(command)) {
    return null;
  }
  const [, ...args] = command.split(" ");
  return args;
}

export function runActivatedGate(gate, options = {}) {
  const scriptKey = gate?.dailyGate?.rootScript;
  const startedAt = new Date().toISOString();
  if (typeof scriptKey !== "string" || !SCRIPT_KEY_PATTERN.test(scriptKey)) {
    return {
      scriptKey: String(scriptKey),
      startedAt,
      completedAt: new Date().toISOString(),
      status: null,
      signal: null,
      error: `M0_ROOT_SCRIPT_KEY_INVALID: ${String(scriptKey)}`,
      stdout: "",
      stderr: "",
      summary: null,
    };
  }

  const rootPackageJson = readJson(resolve(repositoryRoot, "package.json"));
  const command = rootPackageJson?.scripts?.[scriptKey];
  const args = parseActivatedRootCommand(command);
  const expectedCommandHash = gate?.dailyGate?.rootScriptCommandSha256;
  if (
    !args ||
    typeof expectedCommandHash !== "string" ||
    expectedCommandHash !== sha256Text(command)
  ) {
    return {
      scriptKey,
      startedAt,
      completedAt: new Date().toISOString(),
      status: null,
      signal: null,
      error: `M0_ACTIVATION_ROOT_COMMAND_UNSAFE: ${scriptKey}`,
      stdout: "",
      stderr: "",
      summary: null,
    };
  }

  let executionArgs;
  try {
    const realRepositoryRoot = realpathSync(repositoryRoot);
    const realRunnerPath = realpathSync(resolve(repositoryRoot, args[0]));
    const ownedPath = relative(realRepositoryRoot, realRunnerPath);
    if (
      !ownedPath ||
      ownedPath === ".." ||
      ownedPath.startsWith(`..${sep}`) ||
      isAbsolute(ownedPath) ||
      !statSync(realRunnerPath).isFile()
    ) {
      throw new Error("runner is outside the repository or is not a file");
    }
    executionArgs = [realRunnerPath, ...args.slice(1)];
  } catch (error) {
    return {
      scriptKey,
      startedAt,
      completedAt: new Date().toISOString(),
      status: null,
      signal: null,
      error: `M0_ACTIVATION_RUNNER_PATH_INVALID: ${error instanceof Error ? error.message : String(error)}`,
      stdout: "",
      stderr: "",
      summary: null,
    };
  }

  const result = spawnSync(process.execPath, executionArgs, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.environment },
    shell: false,
    timeout: options.timeoutMilliseconds ?? 600_000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });

  return {
    scriptKey,
    startedAt,
    completedAt: new Date().toISOString(),
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    summary: extractStructuredSummary(result.stdout ?? ""),
  };
}

export function assertionsFromRun(run) {
  const assertions = run.summary?.assertions;
  if (!hasExactKeys(assertions, ASSERTION_KEYS)) {
    return null;
  }

  if (
    ASSERTION_KEYS.some(
      (key) => !Number.isInteger(assertions[key]) || assertions[key] < 0,
    )
  ) {
    return null;
  }

  return {
    executed: assertions.executed,
    passed: assertions.passed,
    failed: assertions.failed,
    skipped: assertions.skipped,
  };
}

export function createAutomatedAttestation(gate, runNonce, run) {
  const assertions = assertionsFromRun(run) ?? {
    executed: 0,
    passed: 0,
    failed: 1,
    skipped: 0,
  };
  const runPassed =
    run.status === 0 &&
    run.summary?.schemaVersion === "1.0.0" &&
    run.summary?.kind === "datapulse-root-check-summary" &&
    run.summary?.check === gate.dailyGate.summaryCheck &&
    run.summary?.gateId === gate.id &&
    run.summary?.result === "passed" &&
    run.summary?.runNonce === runNonce &&
    assertions.executed >= 1 &&
    assertions.passed === assertions.executed &&
    assertions.failed === 0 &&
    assertions.skipped === 0;

  return {
    schemaVersion: "1.0.0",
    kind: "m0-automated-gate-attestation",
    gateId: gate.id,
    checkName: gate.dailyGate.checkName,
    summaryCheck: gate.dailyGate.summaryCheck,
    rootScript: gate.dailyGate.rootScript,
    runNonce,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    result: runPassed ? "passed" : "failed",
    assertions,
  };
}

export function validateFreshAttestation(attestation, expected) {
  const errors = [];
  if (!hasExactKeys(attestation, ATTESTATION_KEYS)) {
    errors.push("M0_ATTESTATION_SHAPE_INVALID");
    return errors;
  }

  if (attestation.schemaVersion !== "1.0.0") {
    errors.push("M0_ATTESTATION_VERSION_INVALID");
  }
  if (attestation.kind !== "m0-automated-gate-attestation") {
    errors.push("M0_ATTESTATION_KIND_INVALID");
  }
  if (attestation.gateId !== expected.gateId) {
    errors.push("M0_ATTESTATION_GATE_MISMATCH");
  }
  if (attestation.checkName !== expected.checkName) {
    errors.push("M0_ATTESTATION_CHECK_NAME_MISMATCH");
  }
  if (attestation.summaryCheck !== expected.summaryCheck) {
    errors.push("M0_ATTESTATION_SUMMARY_CHECK_MISMATCH");
  }
  if (attestation.rootScript !== expected.rootScript) {
    errors.push("M0_ATTESTATION_ROOT_SCRIPT_MISMATCH");
  }
  if (attestation.runNonce !== expected.runNonce) {
    errors.push("M0_ATTESTATION_NONCE_MISMATCH");
  }
  if (attestation.result !== "passed") {
    errors.push("M0_ATTESTATION_RESULT_FAILED");
  }

  const startedAt = Date.parse(attestation.startedAt);
  const completedAt = Date.parse(attestation.completedAt);
  const windowStartedAt = Date.parse(expected.windowStartedAt);
  const windowCompletedAt = Date.parse(expected.windowCompletedAt);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    !Number.isFinite(windowStartedAt) ||
    !Number.isFinite(windowCompletedAt) ||
    startedAt < windowStartedAt ||
    completedAt > windowCompletedAt ||
    completedAt < startedAt
  ) {
    errors.push("M0_ATTESTATION_TIME_WINDOW_INVALID");
  }

  const assertions = attestation.assertions;
  if (!hasExactKeys(assertions, ASSERTION_KEYS)) {
    errors.push("M0_ATTESTATION_ASSERTIONS_INVALID");
    return errors;
  }

  if (!Number.isInteger(assertions.executed) || assertions.executed < 1) {
    errors.push("M0_ATTESTATION_EXECUTED_EMPTY");
  }
  if (
    !Number.isInteger(assertions.passed) ||
    assertions.passed !== assertions.executed
  ) {
    errors.push("M0_ATTESTATION_PASSED_MISMATCH");
  }
  if (assertions.failed !== 0) {
    errors.push("M0_ATTESTATION_FAILURES_PRESENT");
  }
  if (assertions.skipped !== 0) {
    errors.push("M0_ATTESTATION_SKIPS_PRESENT");
  }

  return errors;
}

export function createIsolatedAttestationRun() {
  return {
    directory: mkdtempSync(join(tmpdir(), "datapulse-m0-attestations-")),
    nonce: randomBytes(32).toString("hex"),
  };
}

export function writeAttestation(directory, attestation) {
  const safeGateId = attestation.gateId.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  const path = resolve(directory, `${safeGateId}.json`);
  writeFileSync(path, `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
  return path;
}

export function evaluateM0Exit(index) {
  const records = new Map((index.records ?? []).map((record) => [record.id, record]));
  const incomplete = [];

  for (const gate of index.gateCatalog ?? []) {
    const reasons = [];
    if (gate.currentEvidenceStatus !== "passed") {
      reasons.push(`evidence=${gate.currentEvidenceStatus}`);
    }
    if (typeof gate.latestRecordId !== "string") {
      reasons.push("latestRecord=missing");
    } else {
      const record = records.get(gate.latestRecordId);
      if (!record) {
        reasons.push(`latestRecord=${gate.latestRecordId}:missing`);
      } else {
        if (record.gateIds?.length !== 1 || record.gateIds[0] !== gate.id) {
          reasons.push(`latestRecord=${gate.latestRecordId}:gate-mismatch`);
        }
        if (record.evidenceStatus !== "passed") {
          reasons.push(`latestRecord=${gate.latestRecordId}:${record.evidenceStatus}`);
        }
      }
    }

    if (reasons.length > 0) {
      incomplete.push({
        gateId: gate.id,
        title: gate.title,
        requirementStatus: gate.currentRequirementStatus,
        reasons,
      });
    }
  }

  return incomplete;
}
