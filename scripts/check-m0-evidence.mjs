import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

import {
  cloneJson,
  createAutomatedAttestation,
  evidenceIndexPath,
  extractStructuredSummary,
  loadMergeBaseEvidenceIndex,
  readJson,
  repositoryRoot,
  validateActivationRegistry,
  validateAppendOnlyHistory,
  validateFreshAttestation,
} from "./m0-gates.mjs";

const assertions = [];

function record(name, passed, expected, actual) {
  assertions.push({ name, passed, expected, actual });
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function isRfc3339DateTime(value) {
  if (typeof value !== "string") {
    return false;
  }
  const hasOffset = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value);
  return hasOffset && Number.isFinite(Date.parse(value));
}

function walkJsonFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path);
    }
  }
  return files;
}

function relativeRepositoryPath(path) {
  return path.slice(repositoryRoot.length).replaceAll("\\", "/").replace(/^\//, "");
}

function createAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    validateFormats: true,
  });
  ajv.addFormat("date-time", {
    type: "string",
    validate: isRfc3339DateTime,
  });
  return ajv;
}

function validateContracts() {
  const ajv = createAjv();
  const contractDefinitions = [
    {
      name: "evidence-index-v1-archive",
      schemaPath: "docs/evidence/m0/evidence-index.schema.v1.json",
      kind: null,
    },
    {
      name: "evidence-index",
      schemaPath: "docs/evidence/m0/evidence-index.schema.v2.json",
      kind: null,
    },
    {
      name: "external-subject-manifest",
      schemaPath: "docs/evidence/m0/external-subject-manifest.schema.v1.json",
      kind: true,
    },
    {
      name: "external-environment-profile",
      schemaPath: "docs/evidence/m0/external-environment-profile.schema.v1.json",
      kind: true,
    },
    {
      name: "external-attestation",
      schemaPath: "docs/evidence/m0/external-attestation.schema.v1.json",
      kind: true,
    },
    {
      name: "manual-review-attestation",
      schemaPath: "docs/evidence/m0/manual-review-attestation.schema.v1.json",
      kind: true,
    },
  ];
  const compiled = new Map();

  for (const contract of contractDefinitions) {
    const schema = readJson(resolve(repositoryRoot, contract.schemaPath));
    if (contract.kind !== null) {
      const schemaKind = schema.properties?.kind?.const;
      record(
        `${contract.name} Schema declares a routable kind`,
        typeof schemaKind === "string" && schemaKind.length > 0,
        "non-empty string",
        schemaKind,
      );
      contract.kind = schemaKind;
    }
    const schemaValid = ajv.validateSchema(schema);
    record(
      `${contract.name} Schema 自校验`,
      schemaValid,
      true,
      schemaValid ? true : ajv.errorsText(ajv.errors),
    );
    try {
      compiled.set(contract.name, ajv.compile(schema));
      record(`${contract.name} Schema 可编译`, true, true, true);
    } catch (error) {
      record(`${contract.name} Schema 可编译`, false, true, errorText(error));
    }
  }

  const evidenceValidator = compiled.get("evidence-index");
  if (evidenceValidator) {
    const index = readJson(evidenceIndexPath);
    const valid = evidenceValidator(index);
    record(
      "evidence-index 当前实例",
      valid,
      true,
      valid ? true : ajv.errorsText(evidenceValidator.errors),
    );
  }

  const evidenceDirectory = resolve(repositoryRoot, "docs/evidence/m0");
  const kindInstances = new Map(
    contractDefinitions
      .filter(({ kind }) => kind)
      .map(({ kind }) => [kind, []]),
  );
  record(
    "external subject kind is routed to its Schema",
    kindInstances.has("m0-external-subject"),
    true,
    [...kindInstances.keys()],
  );

  const externalSubjectValidator = compiled.get("external-subject-manifest");
  if (externalSubjectValidator) {
    const externalSubjectFixture = {
      $schema: "./external-subject-manifest.schema.v1.json",
      schemaVersion: "1.0.0",
      kind: "m0-external-subject",
      policyId: "m0-external-subject-policies-v1",
      gateId: "GITHUB-GOVERNANCE",
      subjectRevision: "0".repeat(40),
      artifactDigests: [
        { role: "contract", path: "docs/PRD.md", sha256: "0".repeat(64) },
      ],
      subjectDigestSha256: "0".repeat(64),
      unexpected: true,
    };
    const accepted = externalSubjectValidator(externalSubjectFixture);
    record(
      "external subject Schema rejects additional properties",
      accepted === false &&
        externalSubjectValidator.errors?.some(
          (error) => error.keyword === "additionalProperties",
        ),
      "additionalProperties rejection",
      externalSubjectValidator.errors,
    );
  }
  for (const path of walkJsonFiles(evidenceDirectory)) {
    if (statSync(path).size > 4 * 1024 * 1024) {
      record(
        `${relativeRepositoryPath(path)} 合同实例尺寸`,
        false,
        "<= 4 MiB",
        statSync(path).size,
      );
      continue;
    }
    let value;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      record(`${relativeRepositoryPath(path)} JSON 可解析`, false, true, errorText(error));
      continue;
    }
    if (kindInstances.has(value?.kind)) {
      kindInstances.get(value.kind).push({ path, value });
    }
  }

  for (const contract of contractDefinitions.filter(({ kind }) => kind)) {
    const validator = compiled.get(contract.name);
    const instances = kindInstances.get(contract.kind) ?? [];
    record(
      `${contract.name} 既有实例集合已枚举`,
      true,
      ">= 0",
      instances.length,
    );
    if (!validator) {
      continue;
    }
    for (const instance of instances) {
      const valid = validator(instance.value);
      record(
        `${contract.name} 实例 ${relativeRepositoryPath(instance.path)}`,
        valid,
        true,
        valid ? true : ajv.errorsText(validator.errors),
      );
    }
  }
}

function validateSemanticEvidence() {
  const validatorPath = resolve(
    repositoryRoot,
    "docs/evidence/m0/validate-evidence-index.mjs",
  );
  const result = spawnSync(process.execPath, [validatorPath, "--self-test"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const summary = extractStructuredSummary(result.stdout ?? "");
  record(
    "证据索引语义与定向自测",
    result.status === 0 &&
      summary?.integrityValid === true &&
      summary?.selfTestValid === true,
    "exit=0, integrityValid=true, selfTestValid=true",
    {
      exitCode: result.status,
      integrityValid: summary?.integrityValid,
      selfTestValid: summary?.selfTestValid,
      errors: summary?.errors ?? result.stderr,
    },
  );
}

function validateGitHistoryAndActivation() {
  const currentIndex = readJson(evidenceIndexPath);
  const rootPackageJson = readJson(resolve(repositoryRoot, "package.json"));
  const activationErrors = validateActivationRegistry(currentIndex, rootPackageJson);
  record(
    "activation registry 根脚本与 check 名",
    activationErrors.length === 0,
    [],
    activationErrors,
  );

  try {
    const baseline = loadMergeBaseEvidenceIndex(process.env.DATAPULSE_MERGE_BASE);
    const historyErrors = validateAppendOnlyHistory(currentIndex, baseline.index);
    record(
      `相对 merge base 不可缩减 (${baseline.revision.slice(0, 12)})`,
      historyErrors.length === 0,
      [],
      historyErrors,
    );
  } catch (error) {
    record("相对 merge base 不可缩减", false, [], [errorText(error)]);
  }
}

function validAttestationFixture() {
  return {
    schemaVersion: "1.0.0",
    kind: "m0-automated-gate-attestation",
    gateId: "CI-ACTIVATION",
    checkName: "m0 / evidence-contracts",
    summaryCheck: "m0-evidence-contracts",
    rootScript: "check:evidence",
    runNonce: "nonce-current",
    startedAt: "2026-08-05T00:00:01.000Z",
    completedAt: "2026-08-05T00:00:02.000Z",
    result: "passed",
    assertions: {
      executed: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
    },
  };
}

function attestationExpectation() {
  return {
    gateId: "CI-ACTIVATION",
    checkName: "m0 / evidence-contracts",
    summaryCheck: "m0-evidence-contracts",
    rootScript: "check:evidence",
    runNonce: "nonce-current",
    windowStartedAt: "2026-08-05T00:00:00.000Z",
    windowCompletedAt: "2026-08-05T00:00:03.000Z",
  };
}

function runSelfTests() {
  const selfTests = [];
  const expectError = (name, errors, code) => {
    selfTests.push({
      name,
      passed: errors.some((error) => error.includes(code)),
      expected: code,
      actual: errors,
    });
  };

  const baseline = {
    gateCatalog: [
      {
        id: "REPO-FOUNDATION",
        executionKind: "automated",
        dailyGate: {
          eligible: true,
          activated: true,
          checkName: "m0 / foundation",
          summaryCheck: "repository-foundation",
          rootScript: "check:foundation",
          rootScriptCommandSha256:
            "236deb3ec304da239ebe851de8cdf3ea07743e3f602eab80cfc9006c1b79fcec",
        },
      },
    ],
    records: [
      { id: "record-1", evidenceStatus: "in_progress" },
      { id: "record-2", evidenceStatus: "in_progress" },
    ],
  };

  const shrunk = cloneJson(baseline);
  shrunk.records.pop();
  expectError(
    "历史 record 缩减被拒绝",
    validateAppendOnlyHistory(shrunk, baseline),
    "M0_HISTORY_RECORDS_SHRUNK",
  );

  const modified = cloneJson(baseline);
  modified.records[0].evidenceStatus = "passed";
  expectError(
    "历史 record 修改被拒绝",
    validateAppendOnlyHistory(modified, baseline),
    "M0_HISTORY_RECORD_CHANGED",
  );

  const reordered = cloneJson(baseline);
  reordered.records.reverse();
  expectError(
    "历史 record 重排被拒绝",
    validateAppendOnlyHistory(reordered, baseline),
    "M0_HISTORY_RECORD_CHANGED",
  );

  const deactivated = cloneJson(baseline);
  deactivated.gateCatalog[0].dailyGate.activated = false;
  expectError(
    "已激活 gate 退回被拒绝",
    validateAppendOnlyHistory(deactivated, baseline),
    "M0_HISTORY_ACTIVATION_REVERTED",
  );

  const renamed = cloneJson(baseline);
  renamed.gateCatalog[0].dailyGate.checkName = "renamed";
  expectError(
    "稳定 check 名漂移被拒绝",
    validateAppendOnlyHistory(renamed, baseline),
    "M0_HISTORY_CHECK_NAME_CHANGED",
  );

  const renamedSummary = cloneJson(baseline);
  renamedSummary.gateCatalog[0].dailyGate.summaryCheck = "renamed-summary";
  expectError(
    "stable summary check drift is rejected",
    validateAppendOnlyHistory(renamedSummary, baseline),
    "M0_HISTORY_SUMMARY_CHECK_CHANGED",
  );

  const missingScript = cloneJson(baseline);
  expectError(
    "缺失根脚本被拒绝",
    validateActivationRegistry(missingScript, { scripts: {} }),
    "M0_ACTIVATION_ROOT_SCRIPT_MISSING",
  );

  const unsafeAlias = cloneJson(baseline);
  expectError(
    "activated gate rejects aggregate aliases",
    validateActivationRegistry(unsafeAlias, {
      scripts: { "check:foundation": "corepack pnpm run verify:pr" },
    }),
    "M0_ACTIVATION_ROOT_COMMAND_UNSAFE",
  );

  const emptyActivation = cloneJson(baseline);
  emptyActivation.gateCatalog[0].dailyGate.activated = false;
  expectError(
    "zero activated gates cannot report green",
    validateActivationRegistry(emptyActivation, {
      scripts: { "check:foundation": "node ./scripts/check-foundation.mjs" },
    }),
    "M0_ACTIVATION_EMPTY",
  );

  const fixedSummaryRun = {
    status: 0,
    startedAt: "2026-08-05T00:00:01.000Z",
    completedAt: "2026-08-05T00:00:02.000Z",
    summary: {
      schemaVersion: "1.0.0",
      kind: "datapulse-root-check-summary",
      check: "repository-foundation",
      gateId: "REPO-FOUNDATION",
      result: "passed",
      runNonce: "nonce-old",
      assertions: { executed: 3, passed: 3, failed: 0, skipped: 0 },
    },
  };
  const fixedSummaryAttestation = createAutomatedAttestation(
    baseline.gateCatalog[0],
    "nonce-current",
    fixedSummaryRun,
  );
  selfTests.push({
    name: "fixed child summary cannot be rewrapped with a fresh nonce",
    passed: fixedSummaryAttestation.result === "failed",
    expected: "failed",
    actual: fixedSummaryAttestation.result,
  });

  const freshSummaryRun = cloneJson(fixedSummaryRun);
  freshSummaryRun.summary.runNonce = "nonce-current";
  const freshSummaryAttestation = createAutomatedAttestation(
    baseline.gateCatalog[0],
    "nonce-current",
    freshSummaryRun,
  );
  selfTests.push({
    name: "matching child nonce creates a passing attestation",
    passed: freshSummaryAttestation.result === "passed",
    expected: "passed",
    actual: freshSummaryAttestation.result,
  });

  const oldNonce = validAttestationFixture();
  oldNonce.runNonce = "nonce-old";
  expectError(
    "旧 nonce 被拒绝",
    validateFreshAttestation(oldNonce, attestationExpectation()),
    "M0_ATTESTATION_NONCE_MISMATCH",
  );

  const gateMismatch = validAttestationFixture();
  gateMismatch.gateId = "REPO-FOUNDATION";
  expectError(
    "gate mismatch 被拒绝",
    validateFreshAttestation(gateMismatch, attestationExpectation()),
    "M0_ATTESTATION_GATE_MISMATCH",
  );

  const summaryCheckMismatch = validAttestationFixture();
  summaryCheckMismatch.summaryCheck = "wrong-check";
  expectError(
    "summary check mismatch is rejected",
    validateFreshAttestation(summaryCheckMismatch, attestationExpectation()),
    "M0_ATTESTATION_SUMMARY_CHECK_MISMATCH",
  );

  const staleTime = validAttestationFixture();
  staleTime.startedAt = "2026-08-04T23:59:58.000Z";
  expectError(
    "时间窗口外 attestation 被拒绝",
    validateFreshAttestation(staleTime, attestationExpectation()),
    "M0_ATTESTATION_TIME_WINDOW_INVALID",
  );

  const empty = validAttestationFixture();
  empty.assertions.executed = 0;
  empty.assertions.passed = 0;
  expectError(
    "零断言被拒绝",
    validateFreshAttestation(empty, attestationExpectation()),
    "M0_ATTESTATION_EXECUTED_EMPTY",
  );

  const skipped = validAttestationFixture();
  skipped.assertions.skipped = 1;
  expectError(
    "跳过断言被拒绝",
    validateFreshAttestation(skipped, attestationExpectation()),
    "M0_ATTESTATION_SKIPS_PRESENT",
  );

  const failed = validAttestationFixture();
  failed.assertions.failed = 1;
  expectError(
    "失败断言被拒绝",
    validateFreshAttestation(failed, attestationExpectation()),
    "M0_ATTESTATION_FAILURES_PRESENT",
  );

  const mismatch = validAttestationFixture();
  mismatch.assertions.passed = 2;
  expectError(
    "passed 与 executed 不一致被拒绝",
    validateFreshAttestation(mismatch, attestationExpectation()),
    "M0_ATTESTATION_PASSED_MISMATCH",
  );

  for (const selfTest of selfTests) {
    record(`自测：${selfTest.name}`, selfTest.passed, selfTest.expected, selfTest.actual);
  }
}

try {
  validateContracts();
  validateSemanticEvidence();
  validateGitHistoryAndActivation();
  if (process.argv.includes("--self-test")) {
    runSelfTests();
  }
} catch (error) {
  record("M0 证据检查未异常终止", false, true, errorText(error));
}

const failures = assertions.filter(({ passed }) => !passed);
const summary = {
  schemaVersion: "1.0.0",
  kind: "datapulse-root-check-summary",
  check: "m0-evidence-contracts",
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
