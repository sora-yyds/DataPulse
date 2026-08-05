import { resolve } from "node:path";

import {
  cloneJson,
  createAutomatedAttestation,
  evaluateM0Exit,
  evidenceIndexPath,
  loadMergeBaseEvidenceIndex,
  parseActivatedRootCommand,
  readJson,
  readRepositoryHeadRevision,
  repositoryRoot,
  runActivatedGate,
  sha256Text,
  validateActivationRegistry,
  validateFreshAttestation,
} from "./m0-gates.mjs";

const assertions = [];

function record(name, passed, expected, actual) {
  assertions.push({ name, passed, expected, actual });
}

function hasError(errors, code) {
  return errors.some((error) => error.includes(code));
}

function gateFixture(overrides = {}) {
  return {
    id: "CI-ACTIVATION",
    executionKind: "automated",
    dailyGate: {
      eligible: true,
      activated: true,
      checkName: "m0 / quality-aggregators",
      summaryCheck: "m0-quality-aggregators",
      rootScript: "check:aggregators",
      rootScriptCommandSha256: sha256Text(
        "node ./scripts/check-aggregators.mjs --self-test",
      ),
    },
    ...overrides,
  };
}

function runFixture(overrides = {}) {
  return {
    status: 0,
    startedAt: "2026-08-05T00:00:01.000Z",
    completedAt: "2026-08-05T00:00:02.000Z",
    summary: {
      schemaVersion: "1.0.0",
      kind: "datapulse-root-check-summary",
      check: "m0-quality-aggregators",
      gateId: "CI-ACTIVATION",
      runNonce: "nonce-current",
      result: "passed",
      assertions: { executed: 3, passed: 3, failed: 0, skipped: 0 },
    },
    ...overrides,
  };
}

function runSelfTests() {
  const rootScripts = {
    "check:aggregators": "node ./scripts/check-aggregators.mjs --self-test",
  };
  const baseline = { gateCatalog: [gateFixture()], records: [] };

  const unsafeAliasErrors = validateActivationRegistry(baseline, {
    scripts: { "check:aggregators": "corepack pnpm run verify:pr" },
  });
  record(
    "self-test rejects aggregate aliases",
    hasError(unsafeAliasErrors, "M0_ACTIVATION_ROOT_COMMAND_UNSAFE"),
    "M0_ACTIVATION_ROOT_COMMAND_UNSAFE",
    unsafeAliasErrors,
  );

  const inlineSummaryErrors = validateActivationRegistry(baseline, {
    scripts: { "check:aggregators": "node -e process.stdout.write('{}')" },
  });
  record(
    "self-test rejects inline summaries",
    hasError(inlineSummaryErrors, "M0_ACTIVATION_ROOT_COMMAND_UNSAFE"),
    "M0_ACTIVATION_ROOT_COMMAND_UNSAFE",
    inlineSummaryErrors,
  );

  const emptyRegistry = cloneJson(baseline);
  emptyRegistry.gateCatalog[0].dailyGate.activated = false;
  const emptyErrors = validateActivationRegistry(emptyRegistry, { scripts: rootScripts });
  record(
    "self-test rejects zero activated gates",
    hasError(emptyErrors, "M0_ACTIVATION_EMPTY"),
    "M0_ACTIVATION_EMPTY",
    emptyErrors,
  );

  const duplicateRoot = cloneJson(baseline);
  duplicateRoot.gateCatalog.push(
    gateFixture({
      id: "REPO-FOUNDATION",
      dailyGate: {
        ...gateFixture().dailyGate,
        checkName: "m0 / duplicate-root",
        summaryCheck: "duplicate-root",
      },
    }),
  );
  const duplicateRootErrors = validateActivationRegistry(duplicateRoot, {
    scripts: rootScripts,
  });
  record(
    "self-test rejects duplicate root scripts",
    hasError(duplicateRootErrors, "M0_ACTIVATION_ROOT_SCRIPT_DUPLICATE"),
    "M0_ACTIVATION_ROOT_SCRIPT_DUPLICATE",
    duplicateRootErrors,
  );

  const duplicateSummary = cloneJson(baseline);
  duplicateSummary.gateCatalog.push(
    gateFixture({
      id: "REPO-FOUNDATION",
      dailyGate: {
        ...gateFixture().dailyGate,
        checkName: "m0 / duplicate-summary",
        rootScript: "check:foundation",
        rootScriptCommandSha256: sha256Text("node ./scripts/check-foundation.mjs"),
      },
    }),
  );
  const duplicateSummaryErrors = validateActivationRegistry(duplicateSummary, {
    scripts: {
      ...rootScripts,
      "check:foundation": "node ./scripts/check-foundation.mjs",
    },
  });
  record(
    "self-test rejects duplicate summary checks",
    hasError(duplicateSummaryErrors, "M0_ACTIVATION_SUMMARY_CHECK_DUPLICATE"),
    "M0_ACTIVATION_SUMMARY_CHECK_DUPLICATE",
    duplicateSummaryErrors,
  );

  record(
    "self-test accepts a single local mjs runner",
    JSON.stringify(parseActivatedRootCommand(rootScripts["check:aggregators"])) ===
      JSON.stringify(["./scripts/check-aggregators.mjs", "--self-test"]),
    ["./scripts/check-aggregators.mjs", "--self-test"],
    parseActivatedRootCommand(rootScripts["check:aggregators"]),
  );

  record(
    "self-test rejects runner path traversal",
    parseActivatedRootCommand("node ./scripts/../outside.mjs") === null,
    null,
    parseActivatedRootCommand("node ./scripts/../outside.mjs"),
  );

  const commandHashDrift = cloneJson(baseline);
  commandHashDrift.gateCatalog[0].dailyGate.rootScriptCommandSha256 = "0".repeat(64);
  const commandHashErrors = validateActivationRegistry(commandHashDrift, {
    scripts: rootScripts,
  });
  record(
    "self-test rejects activated command hash drift",
    hasError(commandHashErrors, "M0_ACTIVATION_ROOT_COMMAND_HASH_MISMATCH"),
    "M0_ACTIVATION_ROOT_COMMAND_HASH_MISMATCH",
    commandHashErrors,
  );

  const missingCommandHash = cloneJson(baseline.gateCatalog[0]);
  delete missingCommandHash.dailyGate.rootScriptCommandSha256;
  const missingCommandHashRun = runActivatedGate(missingCommandHash);
  record(
    "self-test rejects a runner without a command hash",
    missingCommandHashRun.error?.includes("M0_ACTIVATION_ROOT_COMMAND_UNSAFE") === true,
    "M0_ACTIVATION_ROOT_COMMAND_UNSAFE",
    missingCommandHashRun.error,
  );

  const wrongCommandHash = cloneJson(baseline.gateCatalog[0]);
  wrongCommandHash.dailyGate.rootScriptCommandSha256 = "0".repeat(64);
  const wrongCommandHashRun = runActivatedGate(wrongCommandHash);
  record(
    "self-test rejects a runner with the wrong command hash",
    wrongCommandHashRun.error?.includes("M0_ACTIVATION_ROOT_COMMAND_UNSAFE") === true,
    "M0_ACTIVATION_ROOT_COMMAND_UNSAFE",
    wrongCommandHashRun.error,
  );

  const staleNonceRun = runFixture();
  staleNonceRun.summary.runNonce = "nonce-old";
  const staleNonceAttestation = createAutomatedAttestation(
    gateFixture(),
    "nonce-current",
    staleNonceRun,
  );
  record(
    "self-test rejects a fixed child nonce",
    staleNonceAttestation.result === "failed",
    "failed",
    staleNonceAttestation.result,
  );

  const wrongCheckRun = runFixture();
  wrongCheckRun.summary.check = "dependency-boundaries";
  record(
    "self-test rejects a wrong summary check",
    createAutomatedAttestation(gateFixture(), "nonce-current", wrongCheckRun).result ===
      "failed",
    "failed",
    wrongCheckRun.summary.check,
  );

  const wrongGateRun = runFixture();
  wrongGateRun.summary.gateId = "REPO-FOUNDATION";
  record(
    "self-test rejects a wrong gate id",
    createAutomatedAttestation(gateFixture(), "nonce-current", wrongGateRun).result ===
      "failed",
    "failed",
    wrongGateRun.summary.gateId,
  );

  const stringCountRun = runFixture();
  stringCountRun.summary.assertions = {
    executed: "1",
    passed: "1",
    failed: 0,
    skipped: 0,
  };
  record(
    "self-test rejects string assertion counts",
    createAutomatedAttestation(gateFixture(), "nonce-current", stringCountRun).result ===
      "failed",
    "failed",
    stringCountRun.summary.assertions,
  );

  const freshAttestation = createAutomatedAttestation(
    gateFixture(),
    "nonce-current",
    runFixture(),
  );
  const freshnessErrors = validateFreshAttestation(freshAttestation, {
    gateId: "CI-ACTIVATION",
    checkName: "m0 / quality-aggregators",
    summaryCheck: "m0-quality-aggregators",
    rootScript: "check:aggregators",
    runNonce: "nonce-current",
    windowStartedAt: "2026-08-05T00:00:00.000Z",
    windowCompletedAt: "2026-08-05T00:00:03.000Z",
  });
  record(
    "self-test accepts a fully bound fresh attestation",
    freshnessErrors.length === 0,
    [],
    freshnessErrors,
  );

  let headOverrideError = null;
  try {
    loadMergeBaseEvidenceIndex("HEAD");
  } catch (error) {
    headOverrideError = error instanceof Error ? error.message : String(error);
  }
  record(
    "self-test rejects HEAD as merge-base override",
    headOverrideError?.includes("M0_HISTORY_BASE_REFERENCE_INVALID") === true,
    "M0_HISTORY_BASE_REFERENCE_INVALID",
    headOverrideError,
  );

  let fullHeadOverrideError = null;
  try {
    loadMergeBaseEvidenceIndex(readRepositoryHeadRevision());
  } catch (error) {
    fullHeadOverrideError = error instanceof Error ? error.message : String(error);
  }
  record(
    "self-test rejects the full HEAD SHA as merge-base override",
    fullHeadOverrideError?.includes("M0_HISTORY_BASE_EQUALS_HEAD") === true,
    "M0_HISTORY_BASE_EQUALS_HEAD",
    fullHeadOverrideError,
  );
}

const index = readJson(evidenceIndexPath);
const rootPackageJson = readJson(resolve(repositoryRoot, "package.json"));
const activationErrors = validateActivationRegistry(index, rootPackageJson);
record("current activation registry is executable", activationErrors.length === 0, [], activationErrors);

const activeGates = index.gateCatalog.filter((gate) => gate.dailyGate?.activated === true);
record("current activation registry is non-empty", activeGates.length >= 1, ">= 1", activeGates.length);

const ciGate = index.gateCatalog.find((gate) => gate.id === "CI-ACTIVATION");
record(
  "CI activation uses an independent aggregator check",
  ciGate?.dailyGate?.rootScript === "check:aggregators" &&
    ciGate?.dailyGate?.summaryCheck === "m0-quality-aggregators",
  { rootScript: "check:aggregators", summaryCheck: "m0-quality-aggregators" },
  ciGate?.dailyGate ?? null,
);

const incompleteGates = evaluateM0Exit(index);
record(
  "M0 exit remains fail-closed while gates are incomplete",
  incompleteGates.length >= 1,
  ">= 1 incomplete gate",
  incompleteGates.length,
);

if (process.argv.includes("--self-test")) {
  runSelfTests();
}

const failures = assertions.filter(({ passed }) => !passed);
const summary = {
  schemaVersion: "1.0.0",
  kind: "datapulse-root-check-summary",
  check: "m0-quality-aggregators",
  gateId: process.env.DATAPULSE_GATE_ID ?? null,
  runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
  result: failures.length === 0 ? "passed" : "failed",
  assertions: {
    executed: assertions.length,
    passed: assertions.length - failures.length,
    failed: failures.length,
    skipped: 0,
  },
  failures: failures.map(({ name, expected, actual }) => ({ name, expected, actual })),
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
