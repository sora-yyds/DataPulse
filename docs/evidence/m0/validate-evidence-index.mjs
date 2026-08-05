import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../../..");
const INDEX_PATH = join(SCRIPT_DIR, "evidence-index.json");
const SCHEMA_PATH = join(SCRIPT_DIR, "evidence-index.schema.v2.json");
const EXIT_MANIFEST_PATH = join(SCRIPT_DIR, "m0-exit-manifest.v1.json");
const EXTERNAL_SUBJECT_POLICY_PATH = join(
  SCRIPT_DIR,
  "m0-external-subject-policies.v1.json",
);
const EXIT_MANIFEST_REPOSITORY_PATH =
  "docs/evidence/m0/m0-exit-manifest.v1.json";
const EXIT_MANIFEST_SHA256 =
  "cdf959c523c97c59ff5b7ea7dc7e851394231d2f9d30c42d65da55ae10650c0e";
const EXTERNAL_SUBJECT_POLICY_REPOSITORY_PATH =
  "docs/evidence/m0/m0-external-subject-policies.v1.json";
const EXTERNAL_SUBJECT_POLICY_SHA256 =
  "14f771af8e2f64ac0e6a1f6bb80cd9d2477ef9d2c1bee36e04be9ced458dbbdc";
const EXIT_POLICY =
  "Every gate in the immutable M0 exit manifest must be passed with a matching passed latest record, and every automated gate must be freshly rerun before the independent M0 exit aggregate can pass.";
const EXTERNAL_ENVIRONMENTS = new Set([
  "github-remote",
  "reference-device",
  "representative-mobile-device",
  "official-alicloud",
]);
const EXTERNAL_METHOD_BY_GATE = new Map([
  ["GITHUB-GOVERNANCE", "github_ruleset_test_pr"],
  ["KDF-DEVICE-MATRIX", "physical_device_matrix"],
  ["PERFORMANCE-ABSOLUTE", "reference_device_benchmark"],
  ["ALIYUN-IAC", "alicloud_iac_apply"],
  ["ALIYUN-TTL", "alicloud_ttl_probe"],
]);

function parseJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function staticGateDefinition(gate) {
  return {
    id: gate.id,
    title: gate.title,
    epicIds: gate.epicIds,
    taskIds: gate.taskIds,
    requirementIds: gate.requirementIds,
    governingAdrIds: gate.governingAdrIds,
    coverageKind: gate.coverageKind,
    scopeStatement: gate.scopeStatement,
    environmentKind: gate.environmentKind,
    executionKind: gate.executionKind,
    dailyGateEligible: gate.dailyGate?.eligible,
    m0ExitRequired: gate.m0ExitRequired,
  };
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function sameSet(left, right) {
  return JSON.stringify(sorted(new Set(left))) === JSON.stringify(sorted(new Set(right)));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return sorted(repeated);
}

function repositoryFile(referencePath) {
  const withoutAnchor = referencePath.split("#", 1)[0];
  return resolve(REPOSITORY_ROOT, ...withoutAnchor.split("/"));
}

function addUnknownReferences(errors, owner, values, validValues, label) {
  for (const value of values ?? []) {
    if (!validValues.has(value)) {
      errors.push(`${owner}: unknown ${label} ${value}`);
    }
  }
}

function validateRepositoryReference(errors, owner, referencePath, label) {
  const target = repositoryFile(referencePath);
  const relativeTarget = relative(REPOSITORY_ROOT, target);
  if (
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    resolve(target) === resolve(REPOSITORY_ROOT)
  ) {
    errors.push(`${owner}: ${label} escapes the repository: ${referencePath}`);
    return;
  }
  if (!existsSync(target)) {
    errors.push(`${owner}: missing ${label} ${referencePath}`);
  }
}

function parseHashedJsonReference(errors, owner, fileRef, label) {
  if (!fileRef?.path || !fileRef?.sha256) {
    errors.push(`${owner}: ${label} reference is incomplete`);
    return undefined;
  }
  validateRepositoryReference(errors, owner, fileRef.path, label);
  const filePath = repositoryFile(fileRef.path);
  if (!existsSync(filePath)) return undefined;
  if (sha256(filePath) !== fileRef.sha256) {
    errors.push(`${owner}: ${label} hash mismatch ${fileRef.path}`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${owner}: ${label} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function validateExternalEvidenceBundle(
  errors,
  record,
  provenance,
  expectedMethod,
  subjectPolicies,
) {
  const owner = record.id;
  const gateId = record.gateIds[0];
  const subject = parseHashedJsonReference(
    errors,
    owner,
    provenance.subjectManifestRef,
    "subject manifest",
  );
  const profile = parseHashedJsonReference(
    errors,
    owner,
    provenance.environmentProfileRef,
    "environment profile",
  );
  const attestation = parseHashedJsonReference(
    errors,
    owner,
    provenance.attestationRef,
    "attestation",
  );

  const matchingSubjectRef = (record.subjectRefs ?? []).some(
    (subjectRef) =>
      subjectRef.manifestPath === provenance.subjectManifestRef?.path &&
      subjectRef.sha256 === provenance.subjectManifestRef?.sha256,
  );
  if (!matchingSubjectRef) {
    errors.push(`${owner}: provenance subject manifest is not present in subjectRefs`);
  }

  if (subject) {
    if (
      subject.$schema !== "./external-subject-manifest.schema.v1.json" ||
      subject.schemaVersion !== "1.0.0" ||
      subject.kind !== "m0-external-subject" ||
      subject.policyId !== "m0-external-subject-policies-v1"
    ) {
      errors.push(`${owner}: subject manifest has an unknown contract version`);
    }
    if (subject.gateId !== gateId || subject.subjectRevision !== provenance.subjectRevision) {
      errors.push(`${owner}: subject manifest is not bound to the gate and revision`);
    }
    if (!Array.isArray(subject.artifactDigests) || subject.artifactDigests.length === 0) {
      errors.push(`${owner}: subject manifest has no artifact digests`);
    } else {
      if (sha256Json(subject.artifactDigests) !== subject.subjectDigestSha256) {
        errors.push(`${owner}: subjectDigestSha256 does not match artifactDigests`);
      }
      for (const artifact of subject.artifactDigests) {
        if (!artifact?.role || !artifact?.path || !artifact?.sha256) {
          errors.push(`${owner}: subject artifact digest is incomplete`);
          continue;
        }
        validateRepositoryReference(errors, owner, artifact.path, "subject artifact");
        const artifactPath = repositoryFile(artifact.path);
        if (existsSync(artifactPath) && sha256(artifactPath) !== artifact.sha256) {
          errors.push(`${owner}: subject artifact hash mismatch ${artifact.path}`);
        }
        const revisionFile = spawnSync(
          "git",
          ["show", `${provenance.subjectRevision}:${artifact.path}`],
          {
            cwd: REPOSITORY_ROOT,
            encoding: null,
            maxBuffer: 32 * 1024 * 1024,
          },
        );
        if (revisionFile.status !== 0 || !revisionFile.stdout) {
          errors.push(`${owner}: subject artifact is absent from subjectRevision ${artifact.path}`);
        } else {
          const revisionHash = createHash("sha256").update(revisionFile.stdout).digest("hex");
          if (revisionHash !== artifact.sha256) {
            errors.push(`${owner}: subject artifact differs from subjectRevision ${artifact.path}`);
          }
        }
      }
      const gatePolicy = subjectPolicies.gatePolicies?.[gateId];
      if (!gatePolicy?.requiredRoles?.length) {
        errors.push(`${owner}: no frozen subject policy exists for ${gateId}`);
      } else {
        const artifactPaths = subject.artifactDigests.map((artifact) => artifact.path);
        if (duplicates(artifactPaths).length > 0) {
          errors.push(`${owner}: subject policy uses duplicate artifact paths`);
        }
        const requirementsByRole = new Map(
          gatePolicy.requiredRoles.map((requirement) => [requirement.role, requirement]),
        );
        for (const artifact of subject.artifactDigests) {
          const requirement = requirementsByRole.get(artifact.role);
          if (!requirement) {
            errors.push(`${owner}: subject artifact has an unrecognized role ${artifact.role}`);
            continue;
          }
          const allowed =
            requirement.allowedExactPaths.includes(artifact.path) ||
            requirement.allowedPrefixes.some((prefix) => artifact.path.startsWith(prefix));
          if (!allowed) {
            errors.push(`${owner}: ${artifact.role} artifact is outside the frozen subject policy`);
          }
        }
        for (const requirement of gatePolicy.requiredRoles) {
          const count = subject.artifactDigests.filter(
            (artifact) => artifact.role === requirement.role,
          ).length;
          if (count < requirement.minItems) {
            errors.push(`${owner}: subject policy lacks required role ${requirement.role}`);
          }
        }
      }
    }
  }

  if (profile) {
    if (
      profile.$schema !== "./external-environment-profile.schema.v1.json" ||
      profile.schemaVersion !== "1.0.0" ||
      profile.kind !== "m0-external-environment-profile"
    ) {
      errors.push(`${owner}: environment profile has an unknown contract version`);
    }
    if (profile.gateId !== gateId || profile.environmentKind !== record.environmentKind) {
      errors.push(`${owner}: environment profile is not bound to the gate and environment`);
    }
    if (
      !profile.attributes ||
      typeof profile.attributes !== "object" ||
      Array.isArray(profile.attributes) ||
      Object.keys(profile.attributes).length === 0
    ) {
      errors.push(`${owner}: environment profile has no public attributes`);
    } else {
      const forbiddenName = /(?:secret|token|password|cookie|authorization|access.?key|device.?id|imei|serial)/i;
      for (const [name, value] of Object.entries(profile.attributes)) {
        if (!/^[a-z0-9][a-z0-9_.-]*$/.test(name) || forbiddenName.test(name)) {
          errors.push(`${owner}: environment profile contains forbidden attribute ${name}`);
        }
        if (!["string", "number", "boolean"].includes(typeof value)) {
          errors.push(`${owner}: environment profile attribute ${name} is not a scalar`);
        }
      }
    }
    if (
      profile.redactionStatement !==
      "No credentials, stable device identifiers, user content, or personal data are included."
    ) {
      errors.push(`${owner}: environment profile lacks the required redaction statement`);
    }
  }

  if (attestation) {
    if (
      attestation.$schema !== "./external-attestation.schema.v1.json" ||
      attestation.schemaVersion !== "1.0.0" ||
      attestation.kind !== "m0-external-attestation"
    ) {
      errors.push(`${owner}: attestation has an unknown contract version`);
    }
    for (const [label, actual, expected] of [
      ["gateId", attestation.gateId, gateId],
      ["environmentKind", attestation.environmentKind, record.environmentKind],
      ["verificationMethod", attestation.verificationMethod, expectedMethod],
      ["subjectRevision", attestation.subjectRevision, provenance.subjectRevision],
      [
        "subjectPolicySha256",
        attestation.subjectPolicySha256,
        EXTERNAL_SUBJECT_POLICY_SHA256,
      ],
      ["subjectManifestSha256", attestation.subjectManifestSha256, provenance.subjectManifestRef?.sha256],
      [
        "environmentProfileSha256",
        attestation.environmentProfileSha256,
        provenance.environmentProfileRef?.sha256,
      ],
      ["executedAt", attestation.executedAt, record.observedAt],
      ["executorRef", attestation.executorRef, provenance.executorRef],
      ["runId", attestation.runId, provenance.runId],
    ]) {
      if (actual !== expected) errors.push(`${owner}: attestation ${label} is not bound to provenance`);
    }
    const assertions = attestation.assertions;
    if (
      attestation.result !== "passed" ||
      attestation.simulation !== false ||
      !assertions ||
      !Number.isInteger(assertions.executed) ||
      assertions.executed < 1 ||
      assertions.passed !== assertions.executed ||
      assertions.failed !== 0 ||
      assertions.skipped !== 0
    ) {
      errors.push(`${owner}: attestation does not prove a real, non-skipped passing run`);
    }
  }

  const gitObject = spawnSync(
    "git",
    ["cat-file", "-e", `${provenance.subjectRevision}^{commit}`],
    { cwd: REPOSITORY_ROOT, stdio: "ignore" },
  );
  if (gitObject.status !== 0) {
    errors.push(`${owner}: subjectRevision is not an existing Git commit`);
  } else {
    const ancestor = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", provenance.subjectRevision, "HEAD"],
      { cwd: REPOSITORY_ROOT, stdio: "ignore" },
    );
    if (ancestor.status !== 0) {
      errors.push(`${owner}: subjectRevision is not an ancestor of current HEAD`);
    }
  }
}

function validateManualReviewAttestation(errors, record, gate) {
  const reviewArtifacts = (record.artifactRefs ?? []).filter(
    (artifact) => artifact.kind === "manual-review" && artifact.immutable === true,
  );
  if (reviewArtifacts.length !== 1) {
    errors.push(`${record.id}: passed manual record requires exactly one immutable review attestation`);
    return;
  }
  const reviewArtifact = reviewArtifacts[0];
  const attestation = parseHashedJsonReference(
    errors,
    record.id,
    reviewArtifact,
    "manual review attestation",
  );
  if (!attestation) return;
  if (
    attestation.$schema !== "./manual-review-attestation.schema.v1.json" ||
    attestation.schemaVersion !== "1.0.0" ||
    attestation.kind !== "m0-manual-review-attestation"
  ) {
    errors.push(`${record.id}: manual review attestation has an unknown contract version`);
  }
  if (
    attestation.gateId !== gate.id ||
    attestation.recordId !== record.id ||
    attestation.reviewedAt !== record.observedAt ||
    attestation.result !== "passed" ||
    attestation.repositoryState !== "working_tree_hashes" ||
    !Array.isArray(attestation.reviewerRefs) ||
    attestation.reviewerRefs.length === 0
  ) {
    errors.push(`${record.id}: manual review attestation is not bound to the record`);
  }
  const subjectArtifacts = Array.isArray(attestation.subjectArtifacts)
    ? attestation.subjectArtifacts
    : [];
  const expectedArtifacts = (record.artifactRefs ?? []).filter(
    (artifact) => artifact.kind !== "manual-review",
  );
  if (duplicates(subjectArtifacts.map((artifact) => artifact.path)).length > 0) {
    errors.push(`${record.id}: manual review subject paths are duplicated`);
  }
  if (!sameSet(subjectArtifacts.map((artifact) => artifact.path), expectedArtifacts.map((artifact) => artifact.path))) {
    errors.push(`${record.id}: manual review subject set differs from record artifacts`);
  }
  if (
    attestation.assertions?.reviewed !== subjectArtifacts.length ||
    attestation.assertions?.failed !== 0 ||
    attestation.assertions?.unresolvedHighSeverity !== 0
  ) {
    errors.push(`${record.id}: manual review attestation assertions are incomplete`);
  }
  const isLatest = gate.latestRecordId === record.id;
  for (const subject of subjectArtifacts) {
    if (!subject?.path || !subject?.sha256) {
      errors.push(`${record.id}: manual review subject reference is incomplete`);
      continue;
    }
    const recordArtifact = expectedArtifacts.find((artifact) => artifact.path === subject.path);
    if (recordArtifact?.immutable === true && recordArtifact.sha256 !== subject.sha256) {
      errors.push(`${record.id}: manual review subject hash differs from immutable artifact`);
    }
    if (!isLatest) continue;
    validateRepositoryReference(errors, record.id, subject.path, "manual review subject");
    const subjectPath = repositoryFile(subject.path);
    if (existsSync(subjectPath) && sha256(subjectPath) !== subject.sha256) {
      errors.push(`${record.id}: latest manual review is stale for ${subject.path}`);
    }
  }
}

function validateIndex(index, schema, manifest, subjectPolicies) {
  const errors = [];
  const requiredGateIds = manifest.requiredGateIds ?? [];
  const requiredTaskIds = manifest.requiredTaskIds ?? [];
  const gateIds = (index.gateCatalog ?? []).map((gate) => gate.id);
  const recordIds = (index.records ?? []).map((record) => record.id);
  const epicIds = (index.epics ?? []).map((epic) => epic.id);

  if (index.exitGatePolicy !== EXIT_POLICY) {
    errors.push("index: exitGatePolicy does not describe gate-based, fresh-run exit semantics");
  }
  if (index.exitGateManifest?.path !== EXIT_MANIFEST_REPOSITORY_PATH) {
    errors.push("index: exit gate manifest path is not the frozen v1 path");
  }
  if (index.exitGateManifest?.sha256 !== EXIT_MANIFEST_SHA256) {
    errors.push("index: exit gate manifest hash differs from the frozen v1 hash");
  }
  if (index.externalSubjectPolicy?.path !== EXTERNAL_SUBJECT_POLICY_REPOSITORY_PATH) {
    errors.push("index: external subject policy path is not the frozen v1 path");
  }
  if (index.externalSubjectPolicy?.sha256 !== EXTERNAL_SUBJECT_POLICY_SHA256) {
    errors.push("index: external subject policy hash differs from the frozen v1 hash");
  }
  if (sha256(EXIT_MANIFEST_PATH) !== EXIT_MANIFEST_SHA256) {
    errors.push("manifest: file hash differs from the frozen v1 hash");
  }
  if (sha256(EXTERNAL_SUBJECT_POLICY_PATH) !== EXTERNAL_SUBJECT_POLICY_SHA256) {
    errors.push("external subject policy: file hash differs from the frozen v1 hash");
  }
  if (schema.properties?.exitGatePolicy?.const !== EXIT_POLICY) {
    errors.push("schema: exitGatePolicy const differs from the frozen policy");
  }
  if (
    schema.properties?.exitGateManifest?.properties?.sha256?.const !==
    EXIT_MANIFEST_SHA256
  ) {
    errors.push("schema: exit manifest hash const differs from the frozen v1 hash");
  }
  if (
    schema.properties?.externalSubjectPolicy?.properties?.sha256?.const !==
    EXTERNAL_SUBJECT_POLICY_SHA256
  ) {
    errors.push("schema: external subject policy hash const differs from the frozen v1 hash");
  }
  if (
    subjectPolicies.schemaVersion !== "1.0.0" ||
    subjectPolicies.policyId !== "m0-external-subject-policies-v1" ||
    !sameSet(Object.keys(subjectPolicies.gatePolicies ?? {}), EXTERNAL_METHOD_BY_GATE.keys())
  ) {
    errors.push("external subject policy: gate set or contract version is invalid");
  }
  if (!sameSet(schema.$defs?.gateId?.enum ?? [], requiredGateIds)) {
    errors.push("schema: gateId enum differs from the exit manifest");
  }
  const schemaGateOrder = (schema.properties?.gateCatalog?.prefixItems ?? []).map(
    (item) => item.properties?.id?.const,
  );
  if (JSON.stringify(schemaGateOrder) !== JSON.stringify(requiredGateIds)) {
    errors.push("schema: gateCatalog prefix order differs from the exit manifest");
  }
  if (
    schema.properties?.gateCatalog?.minItems !== requiredGateIds.length ||
    schema.properties?.gateCatalog?.maxItems !== requiredGateIds.length
  ) {
    errors.push("schema: gateCatalog cardinality does not equal the exit manifest");
  }
  if (schema.$defs?.gateDefinition?.properties?.m0ExitRequired?.const !== true) {
    errors.push("schema: M0 gate definitions do not require m0ExitRequired=true");
  }
  if (schema.$defs?.evidenceRecord?.properties?.gateIds?.maxItems !== 1) {
    errors.push("schema: evidence records are not constrained to one gate");
  }
  if (!sameSet(Object.keys(manifest.gateDefinitionSha256 ?? {}), requiredGateIds)) {
    errors.push("manifest: static gate hash set differs from requiredGateIds");
  }

  for (const [label, values] of [
    ["manifest gate", requiredGateIds],
    ["manifest task", requiredTaskIds],
    ["catalog gate", gateIds],
    ["record", recordIds],
    ["epic", epicIds],
  ]) {
    for (const value of duplicates(values)) errors.push(`duplicate ${label}: ${value}`);
  }
  if (!sameSet(gateIds, requiredGateIds)) {
    errors.push("catalog: gate ID set differs from the frozen M0 exit manifest");
  }
  if (
    !sameSet(epicIds, ["M0-E1", "M0-E2", "M0-E3", "M0-E4", "M0-E5", "M0-E6"])
  ) {
    errors.push("epics: expected exactly M0-E1 through M0-E6");
  }

  const implementationPlan = readFileSync(
    join(REPOSITORY_ROOT, "docs", "IMPLEMENTATION_PLAN.md"),
    "utf8",
  );
  const planTaskIds = [
    ...implementationPlan.matchAll(/^\|\s*(M0-\d{3})\s*\|/gm),
  ].map((match) => match[1]);
  if (!sameSet(planTaskIds, requiredTaskIds)) {
    errors.push("manifest: required tasks differ from IMPLEMENTATION_PLAN.md task rows");
  }

  const prd = readFileSync(join(REPOSITORY_ROOT, "docs", "PRD.md"), "utf8");
  const requirementIds = new Set(
    [...prd.matchAll(/\b(?:(?:FR|NFR)-[A-Z]+-\d{3}|SEC-\d{3})\b/g)].map(
      (match) => match[0],
    ),
  );
  const adrDirectory = join(REPOSITORY_ROOT, "docs", "adr");
  const adrFiles = readdirSync(adrDirectory).filter((name) => /^\d{4}-.*\.md$/.test(name));
  const adrIds = new Set(adrFiles.map((name) => `ADR-${name.slice(0, 4)}`));
  const supersededAdrIds = new Set(
    adrFiles
      .filter((name) =>
        /^status:\s*superseded\b/m.test(readFileSync(join(adrDirectory, name), "utf8")),
      )
      .map((name) => `ADR-${name.slice(0, 4)}`),
  );
  const epicIdSet = new Set(epicIds);
  const gateIdSet = new Set(gateIds);
  const recordIdSet = new Set(recordIds);
  const requiredTaskIdSet = new Set(requiredTaskIds);

  for (const epic of index.epics ?? []) {
    addUnknownReferences(errors, epic.id, epic.taskIds, requiredTaskIdSet, "task");
    addUnknownReferences(errors, epic.id, epic.requirementIds, requirementIds, "requirement");
    addUnknownReferences(errors, epic.id, epic.adrIds, adrIds, "ADR");
    for (const adrId of epic.adrIds ?? []) {
      if (supersededAdrIds.has(adrId)) errors.push(`${epic.id}: superseded ADR ${adrId}`);
    }
    if (epic.m0ExitRequired !== true) errors.push(`${epic.id}: m0ExitRequired must be true`);
  }

  const coveredTaskIds = new Set();
  const gatesById = new Map();
  for (const gate of index.gateCatalog ?? []) {
    gatesById.set(gate.id, gate);
    addUnknownReferences(errors, gate.id, gate.epicIds, epicIdSet, "epic");
    addUnknownReferences(errors, gate.id, gate.taskIds, requiredTaskIdSet, "task");
    addUnknownReferences(errors, gate.id, gate.requirementIds, requirementIds, "requirement");
    addUnknownReferences(errors, gate.id, gate.governingAdrIds, adrIds, "ADR");
    for (const taskId of gate.taskIds ?? []) coveredTaskIds.add(taskId);
    for (const adrId of gate.governingAdrIds ?? []) {
      if (supersededAdrIds.has(adrId)) errors.push(`${gate.id}: superseded ADR ${adrId}`);
    }
    if (gate.m0ExitRequired !== true) errors.push(`${gate.id}: m0ExitRequired must be true`);
    const expectedDefinitionHash = manifest.gateDefinitionSha256?.[gate.id];
    if (sha256Json(staticGateDefinition(gate)) !== expectedDefinitionHash) {
      errors.push(`${gate.id}: static definition differs from the frozen exit manifest`);
    }
    if (gate.currentEvidenceStatus === "external_blocked" && !gate.blockerRefs?.length) {
      errors.push(`${gate.id}: external_blocked gate lacks blockerRefs`);
    }
    for (const blockerRef of gate.blockerRefs ?? []) {
      validateRepositoryReference(errors, gate.id, blockerRef, "blocker reference");
    }
    if (gate.currentEvidenceStatus === "passed" && !gate.latestRecordId) {
      errors.push(`${gate.id}: passed gate lacks latestRecordId`);
    }
    if (gate.latestRecordId && !recordIdSet.has(gate.latestRecordId)) {
      errors.push(`${gate.id}: unknown latestRecordId ${gate.latestRecordId}`);
    }
    if (gate.executionKind === "automated" && gate.currentEvidenceStatus === "passed") {
      if (
        gate.dailyGate?.eligible !== true ||
        gate.dailyGate?.activated !== true ||
        !gate.dailyGate?.checkName ||
        !gate.dailyGate?.summaryCheck ||
        !gate.dailyGate?.rootScript ||
        !gate.dailyGate?.rootScriptCommandSha256 ||
        ["verify:pr", "verify:m0"].includes(gate.dailyGate.rootScript)
      ) {
        errors.push(`${gate.id}: passed automated gate is not activated with a safe rootScript`);
      }
    }
    if (gate.dailyGate?.activated === true) {
      if (
        gate.executionKind !== "automated" ||
        !gate.dailyGate.checkName ||
        !gate.dailyGate.summaryCheck ||
        !gate.dailyGate.rootScript ||
        !gate.dailyGate.rootScriptCommandSha256 ||
        ["verify:pr", "verify:m0"].includes(gate.dailyGate.rootScript)
      ) {
        errors.push(`${gate.id}: activated gate lacks a safe automated rootScript contract`);
      }
      const packageJsonPath = join(REPOSITORY_ROOT, "package.json");
      if (!existsSync(packageJsonPath)) {
        errors.push(
          `${gate.id}: activated gate has no root package.json script registry for ${gate.dailyGate.rootScript}`,
        );
      } else {
        const packageJson = parseJson(packageJsonPath);
        if (typeof packageJson.scripts?.[gate.dailyGate.rootScript] !== "string") {
          errors.push(`${gate.id}: missing root script ${gate.dailyGate.rootScript}`);
        }
      }
    }
  }
  if (!sameSet(coveredTaskIds, requiredTaskIds)) {
    errors.push("catalog: gate task coverage differs from all 67 frozen M0 tasks");
  }

  const recordsById = new Map();
  for (const record of index.records ?? []) {
    recordsById.set(record.id, record);
    if (record.gateIds?.length !== 1) {
      errors.push(`${record.id}: an evidence record must prove exactly one gate`);
      continue;
    }
    const gateId = record.gateIds[0];
    addUnknownReferences(errors, record.id, record.gateIds, gateIdSet, "gate");
    addUnknownReferences(errors, record.id, record.epicIds, epicIdSet, "epic");
    addUnknownReferences(errors, record.id, record.taskIds, requiredTaskIdSet, "task");
    addUnknownReferences(errors, record.id, record.requirementIds, requirementIds, "requirement");
    addUnknownReferences(errors, record.id, record.adrIds, adrIds, "ADR");
    for (const adrId of record.adrIds ?? []) {
      if (supersededAdrIds.has(adrId)) errors.push(`${record.id}: superseded ADR ${adrId}`);
    }
    const gate = gatesById.get(gateId);
    if (gate) {
      for (const [label, recordValues, gateValues] of [
        ["epicIds", record.epicIds, gate.epicIds],
        ["taskIds", record.taskIds, gate.taskIds],
        ["requirementIds", record.requirementIds, gate.requirementIds],
        ["adrIds", record.adrIds, gate.governingAdrIds],
      ]) {
        if (!sameSet(recordValues ?? [], gateValues ?? [])) {
          errors.push(`${record.id}: ${label} differs from ${gateId}`);
        }
      }
      for (const [label, recordValue, gateValue] of [
        ["environmentKind", record.environmentKind, gate.environmentKind],
        ["executionKind", record.executionKind, gate.executionKind],
        ["m0ExitRequired", record.m0ExitRequired, gate.m0ExitRequired],
      ]) {
        if (recordValue !== gateValue) {
          errors.push(`${record.id}: ${label} differs from ${gateId}`);
        }
      }
      if (record.dailyGate?.eligible !== gate.dailyGate?.eligible) {
        errors.push(`${record.id}: dailyGate eligibility differs from ${gateId}`);
      }
    }
    if (record.evidenceStatus === "passed" && !record.artifactRefs?.length) {
      errors.push(`${record.id}: passed record lacks artifactRefs`);
    }
    if (
      record.evidenceStatus === "passed" &&
      !["partially_evidenced", "satisfied"].includes(record.requirementStatus)
    ) {
      errors.push(`${record.id}: passed record has an unstarted or not-due requirement status`);
    }
    if (record.executionKind === "automated" && record.evidenceStatus === "passed") {
      const immutableTestResult = (record.artifactRefs ?? []).some(
        (artifact) =>
          artifact.kind === "test-result" &&
          artifact.immutable === true &&
          typeof artifact.sha256 === "string",
      );
      if (!immutableTestResult) {
        errors.push(`${record.id}: passed automated record lacks an immutable test-result`);
      }
      if (
        record.dailyGate?.eligible !== true ||
        record.dailyGate?.activated !== true ||
        !record.dailyGate?.checkName ||
        !record.dailyGate?.summaryCheck ||
        !record.dailyGate?.rootScript ||
        !record.dailyGate?.rootScriptCommandSha256 ||
        ["verify:pr", "verify:m0"].includes(record.dailyGate.rootScript)
      ) {
        errors.push(`${record.id}: passed automated record is not activated with a safe rootScript`);
      }
    }
    if (record.executionKind === "manual_review" && record.evidenceStatus === "passed") {
      const gate = gatesById.get(gateId);
      if (gate) validateManualReviewAttestation(errors, record, gate);
    }
    if (record.executionKind === "external_environment" && record.evidenceStatus === "passed") {
      errors.push(
        `${record.id}: external trust verification is not implemented; keep the gate external_blocked`,
      );
      if (!EXTERNAL_ENVIRONMENTS.has(record.environmentKind)) {
        errors.push(`${record.id}: external evidence uses a non-external environment`);
      }
      if (!record.subjectRefs?.length) {
        errors.push(`${record.id}: passed external record lacks hashed subjectRefs`);
      }
      const immutableExternalRecord = (record.artifactRefs ?? []).some(
        (artifact) =>
          artifact.kind === "external-record" &&
          artifact.immutable === true &&
          typeof artifact.sha256 === "string",
      );
      if (!immutableExternalRecord) {
        errors.push(`${record.id}: passed external record lacks an immutable external-record`);
      }
      const provenance = record.externalProvenance;
      const expectedMethod = EXTERNAL_METHOD_BY_GATE.get(gateId);
      if (!provenance || provenance.kind !== "external_environment") {
        errors.push(`${record.id}: passed external record lacks structured provenance`);
      } else {
        if (provenance.environmentKind !== record.environmentKind) {
          errors.push(`${record.id}: provenance environment differs from the record`);
        }
        if (provenance.verificationMethod !== expectedMethod) {
          errors.push(`${record.id}: provenance method differs from the frozen gate method`);
        }
        if (provenance.executedAt !== record.observedAt) {
          errors.push(`${record.id}: provenance executedAt differs from observedAt`);
        }
        const attestationArtifact = (record.artifactRefs ?? []).some(
          (artifact) =>
            artifact.kind === "external-record" &&
            artifact.path === provenance.attestationRef?.path &&
            artifact.sha256 === provenance.attestationRef?.sha256,
        );
        if (!attestationArtifact) {
          errors.push(`${record.id}: provenance attestation is not the external-record artifact`);
        }
        validateExternalEvidenceBundle(
          errors,
          record,
          provenance,
          expectedMethod,
          subjectPolicies,
        );
      }
    } else if (record.externalProvenance !== null) {
      errors.push(`${record.id}: record without passed external evidence must not carry provenance`);
    }
    for (const artifact of record.artifactRefs ?? []) {
      validateRepositoryReference(errors, record.id, artifact.path, "artifact");
      const artifactPath = repositoryFile(artifact.path);
      if (artifact.immutable === true && existsSync(artifactPath) && sha256(artifactPath) !== artifact.sha256) {
        errors.push(`${record.id}: artifact hash mismatch ${artifact.path}`);
      }
    }
    for (const fixture of record.fixtureRefs ?? []) {
      validateRepositoryReference(errors, record.id, fixture.path, "fixture");
      validateRepositoryReference(errors, record.id, fixture.manifestPath, "fixture manifest");
      const fixturePath = repositoryFile(fixture.path);
      const fixtureManifestPath = repositoryFile(fixture.manifestPath);
      if (existsSync(fixturePath) && sha256(fixturePath) !== fixture.sha256) {
        errors.push(`${record.id}: fixture hash mismatch ${fixture.path}`);
      }
      if (
        existsSync(fixtureManifestPath) &&
        sha256(fixtureManifestPath) !== fixture.manifestSha256
      ) {
        errors.push(`${record.id}: fixture manifest hash mismatch ${fixture.manifestPath}`);
      }
    }
    for (const subject of record.subjectRefs ?? []) {
      validateRepositoryReference(errors, record.id, subject.manifestPath, "subject manifest");
      const subjectPath = repositoryFile(subject.manifestPath);
      if (existsSync(subjectPath) && sha256(subjectPath) !== subject.sha256) {
        errors.push(`${record.id}: subject hash mismatch ${subject.manifestPath}`);
      }
    }
    for (const blockerRef of record.blockerRefs ?? []) {
      validateRepositoryReference(errors, record.id, blockerRef, "blocker reference");
    }
  }

  const successorByRecordId = new Map();
  for (const record of index.records ?? []) {
    if (!record.supersedesRecordId) continue;
    const previous = recordsById.get(record.supersedesRecordId);
    if (!previous) {
      errors.push(`${record.id}: unknown supersedesRecordId ${record.supersedesRecordId}`);
      continue;
    }
    if (previous.gateIds?.[0] !== record.gateIds?.[0]) {
      errors.push(`${record.id}: supersedes a record from another gate`);
    }
    if (previous.dailyGate?.activated === true && record.dailyGate?.activated !== true) {
      errors.push(`${record.id}: evidence history deactivates an already activated gate`);
    }
    if (Date.parse(record.observedAt) < Date.parse(previous.observedAt)) {
      errors.push(`${record.id}: observedAt precedes the superseded record`);
    }
    if (Date.parse(record.recordedAt) < Date.parse(previous.recordedAt)) {
      errors.push(`${record.id}: recordedAt precedes the superseded record`);
    }
    if (successorByRecordId.has(previous.id)) {
      errors.push(`${previous.id}: evidence history forks into multiple successors`);
    }
    successorByRecordId.set(previous.id, record.id);
    const visited = new Set([record.id]);
    let cursor = previous;
    while (cursor) {
      if (visited.has(cursor.id)) {
        errors.push(`${record.id}: evidence history contains a cycle`);
        break;
      }
      visited.add(cursor.id);
      cursor = cursor.supersedesRecordId
        ? recordsById.get(cursor.supersedesRecordId)
        : undefined;
    }
  }

  for (const gate of index.gateCatalog ?? []) {
    const gateRecords = (index.records ?? []).filter(
      (candidate) => candidate.gateIds?.[0] === gate.id,
    );
    if (gateRecords.length > 0 && !gate.latestRecordId) {
      errors.push(`${gate.id}: records exist but latestRecordId is missing`);
    }
    if (!gate.latestRecordId) continue;
    const record = recordsById.get(gate.latestRecordId);
    if (!record) continue;
    if (record.gateIds?.[0] !== gate.id) {
      errors.push(`${gate.id}: latest record does not point back to the gate`);
    }
    if (record.evidenceStatus !== gate.currentEvidenceStatus) {
      errors.push(`${gate.id}: latest record evidenceStatus differs from the gate`);
    }
    if (record.requirementStatus !== gate.currentRequirementStatus) {
      errors.push(`${gate.id}: latest record requirementStatus differs from the gate`);
    }
    for (const field of [
      "eligible",
      "activated",
      "checkName",
      "summaryCheck",
      "rootScript",
      "rootScriptCommandSha256",
    ]) {
      if ((record.dailyGate?.[field] ?? null) !== (gate.dailyGate?.[field] ?? null)) {
        errors.push(`${gate.id}: latest record dailyGate.${field} differs from the gate`);
      }
    }
    if (gate.currentEvidenceStatus === "passed" && record.evidenceStatus !== "passed") {
      errors.push(`${gate.id}: passed gate lacks a passed latest record`);
    }
    if (
      gate.currentEvidenceStatus === "passed" &&
      !["partially_evidenced", "satisfied"].includes(gate.currentRequirementStatus)
    ) {
      errors.push(`${gate.id}: passed gate has an unstarted or not-due requirement status`);
    }
    const tails = gateRecords.filter((candidate) => !successorByRecordId.has(candidate.id));
    if (tails.length !== 1 || tails[0]?.id !== gate.latestRecordId) {
      errors.push(`${gate.id}: latestRecordId is not the unique evidence-history tail`);
    }
  }

  const passedGateCount = (index.gateCatalog ?? []).filter(
    (gate) => gate.currentEvidenceStatus === "passed",
  ).length;
  const activeDailyGateCount = (index.gateCatalog ?? []).filter(
    (gate) => gate.dailyGate?.activated === true,
  ).length;
  const historicalGateRecordsPassed = requiredGateIds.every((gateId) => {
    const gate = gatesById.get(gateId);
    const record = gate?.latestRecordId ? recordsById.get(gate.latestRecordId) : undefined;
    return gate?.currentEvidenceStatus === "passed" && record?.evidenceStatus === "passed";
  });

  return {
    errors,
    summary: {
      epicCount: epicIds.length,
      gateCount: gateIds.length,
      recordCount: recordIds.length,
      requiredTaskCount: requiredTaskIds.length,
      coveredTaskCount: coveredTaskIds.size,
      passedGateCount,
      activeDailyGateCount,
      historicalGateRecordsPassed,
      freshAutomatedRerunRequired: true,
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runSelfTest(index, schema, manifest, subjectPolicies) {
  const mutations = [
    [
      "removed required gate",
      "catalog: gate ID set differs from the frozen M0 exit manifest",
      (candidate) => candidate.gateCatalog.pop(),
    ],
    [
      "disabled required exit gate",
      "m0ExitRequired must be true",
      (candidate) => {
        candidate.gateCatalog[0].m0ExitRequired = false;
      },
    ],
    [
      "multi-gate evidence record",
      "an evidence record must prove exactly one gate",
      (candidate) => {
        candidate.records[0].gateIds.push("REPO-FOUNDATION");
      },
    ],
    [
      "unactivated passed automated gate",
      "passed automated gate is not activated with a safe rootScript",
      (candidate) => {
        const gate = candidate.gateCatalog.find((item) => item.id === "REPO-FOUNDATION");
        gate.currentEvidenceStatus = "passed";
        gate.dailyGate = {
          eligible: true,
          activated: false,
        };
      },
    ],
    [
      "activated gate with a missing root script",
      "test:missing",
      (candidate) => {
        const gate = candidate.gateCatalog.find((item) => item.id === "REPO-FOUNDATION");
        gate.dailyGate = {
          eligible: true,
          activated: true,
          checkName: "m0/repo-foundation",
          rootScript: "test:missing",
        };
      },
    ],
    [
      "record-to-gate requirement drift",
      "requirementIds differs from WAVE0-EVIDENCE-CONTRACT",
      (candidate) => {
        candidate.records[0].requirementIds = [];
      },
    ],
    [
      "manual review attestation reused for another record",
      "manual review attestation is not bound to the record",
      (candidate) => {
        const gate = candidate.gateCatalog[0];
        const record = candidate.records[0];
        record.id = "m0-wave0-evidence-contract-rebound";
        gate.latestRecordId = record.id;
      },
    ],
    [
      "passed gate with an unstarted requirement",
      "passed gate has an unstarted or not-due requirement status",
      (candidate) => {
        const gate = candidate.gateCatalog[0];
        const record = candidate.records[0];
        gate.currentRequirementStatus = "not_started";
        record.requirementStatus = "not_started";
      },
    ],
    [
      "external attestation with locally forged content",
      "external trust verification is not implemented",
      (candidate) => {
        const gate = candidate.gateCatalog.find((item) => item.id === "GITHUB-GOVERNANCE");
        const fileHash = sha256(INDEX_PATH);
        const fileRef = {
          path: "docs/evidence/m0/evidence-index.json",
          sha256: fileHash,
        };
        gate.currentEvidenceStatus = "passed";
        gate.currentRequirementStatus = "partially_evidenced";
        gate.latestRecordId = "self-test-forged-external-record";
        candidate.records.push({
          id: "self-test-forged-external-record",
          title: "Self-test forged external record",
          gateIds: [gate.id],
          epicIds: gate.epicIds,
          taskIds: gate.taskIds,
          requirementIds: gate.requirementIds,
          adrIds: gate.governingAdrIds,
          evidenceStatus: "passed",
          requirementStatus: "partially_evidenced",
          milestoneScope: "M0",
          environmentKind: gate.environmentKind,
          ownerRef: "self-test",
          recordedAt: "2026-08-04T00:00:00+08:00",
          observedAt: "2026-08-04T00:00:00+08:00",
          supersedesRecordId: null,
          executionKind: gate.executionKind,
          externalProvenance: {
            kind: "external_environment",
            environmentKind: gate.environmentKind,
            verificationMethod: "github_ruleset_test_pr",
            subjectRevision: "0000000000000000000000000000000000000000",
            subjectPolicySha256: EXTERNAL_SUBJECT_POLICY_SHA256,
            subjectManifestRef: fileRef,
            executedAt: "2026-08-04T00:00:00+08:00",
            executorRef: "self-test",
            runId: "self-test",
            environmentProfileRef: fileRef,
            attestationRef: fileRef,
          },
          dailyGate: gate.dailyGate,
          m0ExitRequired: true,
          fixtureRefs: [],
          subjectRefs: [
            {
              id: "self-test-subject",
              manifestPath: fileRef.path,
              sha256: fileRef.sha256,
            },
          ],
          artifactRefs: [
            {
              kind: "external-record",
              path: fileRef.path,
              immutable: true,
              sha256: fileRef.sha256,
            },
          ],
          blockerRefs: [],
          notes: "Intentional invalid self-test input.",
        });
      },
    ],
  ];
  const failures = [];
  for (const [name, expectedError, mutate] of mutations) {
    const candidate = clone(index);
    mutate(candidate);
    const candidateErrors = validateIndex(candidate, schema, manifest, subjectPolicies).errors;
    if (!candidateErrors.some((error) => error.includes(expectedError))) failures.push(name);
  }
  return failures;
}

const index = parseJson(INDEX_PATH);
const schema = parseJson(SCHEMA_PATH);
const manifest = parseJson(EXIT_MANIFEST_PATH);
const subjectPolicies = parseJson(EXTERNAL_SUBJECT_POLICY_PATH);
const result = validateIndex(index, schema, manifest, subjectPolicies);
const selfTestFailures = process.argv.includes("--self-test")
  ? runSelfTest(index, schema, manifest, subjectPolicies)
  : [];

console.log(
  JSON.stringify(
    {
      ...result.summary,
      integrityValid: result.errors.length === 0,
      selfTestValid: selfTestFailures.length === 0,
      errors: result.errors,
      selfTestFailures,
    },
    null,
    2,
  ),
);

if (result.errors.length > 0 || selfTestFailures.length > 0) process.exitCode = 1;
