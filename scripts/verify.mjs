import { rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  createAutomatedAttestation,
  createIsolatedAttestationRun,
  evidenceIndexPath,
  evaluateM0Exit,
  readJson,
  runActivatedGate,
  validateFreshAttestation,
  writeAttestation,
} from "./m0-gates.mjs";

const mode = process.argv[2];
if (!new Set(["pr", "m0"]).has(mode)) {
  console.error("用法：node scripts/verify.mjs <pr|m0>");
  process.exit(2);
}

const keepAttestations = process.env.DATAPULSE_KEEP_ATTESTATIONS === "1";
const runContext = createIsolatedAttestationRun();
const runWindowStartedAt = new Date().toISOString();
const baseVerificationEnvironment = {
  ...(process.env.DATAPULSE_MERGE_BASE
    ? { DATAPULSE_MERGE_BASE: process.env.DATAPULSE_MERGE_BASE }
    : {}),
};
const gateResults = [];
const failures = [];
let incompleteGates = [];

function environmentForGate(gateId) {
  return {
    ...baseVerificationEnvironment,
    DATAPULSE_RUN_NONCE: runContext.nonce,
    DATAPULSE_GATE_ID: gateId,
  };
}

function runDetails(run) {
  return {
    exitCode: run.status,
    signal: run.signal,
    error: run.error,
    result: run.summary?.result,
    runNonce: run.summary?.runNonce,
    assertions: run.summary?.assertions,
    stderr: run.status === 0 ? "" : run.stderr.slice(-4000),
    stdoutTail: run.status === 0 ? "" : run.stdout.slice(-4000),
  };
}

try {
  const bootstrapGate = {
    id: "CI-ACTIVATION",
    dailyGate: {
      checkName: "m0 / evidence-bootstrap",
      summaryCheck: "m0-evidence-contracts",
      rootScript: "check:evidence",
      rootScriptCommandSha256:
        "23f45f016fd42ad1d91c931ccc43e49957bf4250b3b571f2ff4ddf6be16cdb42",
    },
  };
  const bootstrapRun = runActivatedGate(bootstrapGate, {
    environment: environmentForGate(bootstrapGate.id),
  });
  const bootstrapAttestation = createAutomatedAttestation(
    bootstrapGate,
    runContext.nonce,
    bootstrapRun,
  );
  const bootstrapValidationErrors = validateFreshAttestation(bootstrapAttestation, {
    gateId: bootstrapGate.id,
    checkName: bootstrapGate.dailyGate.checkName,
    summaryCheck: bootstrapGate.dailyGate.summaryCheck,
    rootScript: bootstrapGate.dailyGate.rootScript,
    runNonce: runContext.nonce,
    windowStartedAt: runWindowStartedAt,
    windowCompletedAt: new Date(Date.now() + 1_000).toISOString(),
  });
  if (bootstrapRun.status !== 0 || bootstrapValidationErrors.length > 0) {
    failures.push({
      gateId: "CI-ACTIVATION",
      code: "M0_BOOTSTRAP_EVIDENCE_FAILED",
      validationErrors: bootstrapValidationErrors,
      details: runDetails(bootstrapRun),
    });
  } else {
    const index = readJson(evidenceIndexPath);
    const activatedGates = index.gateCatalog.filter(
      (gate) => gate.dailyGate?.activated === true,
    );

    for (const gate of activatedGates) {
      const run = runActivatedGate(gate, {
        environment: environmentForGate(gate.id),
      });
      const attestation = createAutomatedAttestation(gate, runContext.nonce, run);
      const attestationPath = writeAttestation(runContext.directory, attestation);
      const persistedAttestation = readJson(attestationPath);
      const validationErrors = validateFreshAttestation(persistedAttestation, {
        gateId: gate.id,
        checkName: gate.dailyGate.checkName,
        summaryCheck: gate.dailyGate.summaryCheck,
        rootScript: gate.dailyGate.rootScript,
        runNonce: runContext.nonce,
        windowStartedAt: runWindowStartedAt,
        windowCompletedAt: new Date(Date.now() + 1_000).toISOString(),
      });
      const passed = run.status === 0 && validationErrors.length === 0;

      gateResults.push({
        gateId: gate.id,
        checkName: gate.dailyGate.checkName,
        summaryCheck: gate.dailyGate.summaryCheck,
        rootScript: gate.dailyGate.rootScript,
        result: passed ? "passed" : "failed",
        assertions: attestation.assertions,
        attestationFile: attestationPath.slice(runContext.directory.length + 1),
      });

      if (!passed) {
        failures.push({
          gateId: gate.id,
          code: "M0_FRESH_GATE_ATTESTATION_FAILED",
          validationErrors,
          details: runDetails(run),
        });
      }
    }

    if (mode === "m0") {
      incompleteGates = evaluateM0Exit(index);
      if (incompleteGates.length > 0) {
        failures.push({
          code: "M0_EXIT_GATES_INCOMPLETE",
          count: incompleteGates.length,
        });
      }
    }
  }
} catch (error) {
  failures.push({
    code: "M0_VERIFY_UNEXPECTED_ERROR",
    message: error instanceof Error ? error.stack ?? error.message : String(error),
  });
} finally {
  if (!keepAttestations) {
    rmSync(runContext.directory, { recursive: true, force: true });
  }
}

const runWindowCompletedAt = new Date().toISOString();
const verificationAssertionCount = Math.max(
  1,
  1 + gateResults.length + (mode === "m0" ? 1 : 0),
);
const summary = {
  check: mode === "pr" ? "verify-pr" : "verify-m0",
  result: failures.length === 0 ? "passed" : "failed",
  run: {
    nonce: runContext.nonce,
    startedAt: runWindowStartedAt,
    completedAt: runWindowCompletedAt,
    attestationDirectory: keepAttestations
      ? resolve(runContext.directory)
      : "isolated temporary directory removed after validation",
  },
  activatedGates: gateResults,
  incompleteGates,
  assertions: {
    executed: verificationAssertionCount,
    passed: Math.max(0, verificationAssertionCount - failures.length),
    failed: Math.min(verificationAssertionCount, failures.length),
    skipped: 0,
  },
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
