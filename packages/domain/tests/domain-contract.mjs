import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function createHarness() {
  const failures = [];
  const assertions = { executed: 0, passed: 0, failed: 0, skipped: 0 };

  function check(name, assertion) {
    assertions.executed += 1;
    try {
      assertion();
      assertions.passed += 1;
    } catch (error) {
      assertions.failed += 1;
      const message = error instanceof Error ? error.message : "unknown assertion failure";
      failures.push(`${name}: ${message}`);
    }
  }

  function finish() {
    return {
      result: assertions.failed === 0 ? "passed" : "failed",
      assertions: { ...assertions },
      failures: [...failures],
    };
  }

  return { check, finish };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isJsonSafe(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  const safe = entries.every((entry) => isJsonSafe(entry, ancestors));
  ancestors.delete(value);
  return safe;
}

function assertInvalidResult(result, expectedCode) {
  assert(result.ok === false, "expected a failure Result");
  assert(!Object.hasOwn(result, "value"), "failure Result must not expose value");
  assert(result.error.code === expectedCode, `expected ${expectedCode}`);
  assert(isJsonSafe(result.error.details), "error details must be JSON-safe");
  assert(JSON.stringify(result.error.details).length <= 128, "error details must stay bounded");
}

/**
 * Runs the built Domain package contract. Importing this module does not build,
 * execute assertions, write output, or mutate process.exitCode.
 */
export async function runDomainContract() {
  const { check, finish } = createHarness();
  let domain;
  try {
    domain = await import("../dist/index.js");
  } catch (error) {
    check("dist module import", () => {
      throw error;
    });
    return finish();
  }

  const idCases = [
    ["story", "story_", domain.parseStoryId],
    ["datasetVersion", "dataset_version_", domain.parseDatasetVersionId],
    ["field", "field_", domain.parseFieldId],
    ["storyBlock", "story_block_", domain.parseStoryBlockId],
    ["analysisCondition", "analysis_condition_", domain.parseAnalysisConditionId],
    ["metric", "metric_", domain.parseMetricId],
    ["evidence", "evidence_", domain.parseEvidenceId],
    ["judgmentRule", "judgment_rule_", domain.parseJudgmentRuleId],
    ["narrativeRule", "narrative_rule_", domain.parseNarrativeRuleId],
  ];

  check("four minimal Domain error codes", () => {
    assert(
      JSON.stringify(Object.entries(domain.DOMAIN_ERROR_CODES).sort()) ===
        JSON.stringify(
          [
            ["idInvalid", "DOMAIN_ID_INVALID"],
            ["versionDuplicate", "DOMAIN_VERSION_DUPLICATE"],
            ["versionInvalid", "DOMAIN_VERSION_INVALID"],
            ["versionUnsupported", "DOMAIN_VERSION_UNSUPPORTED"],
          ].sort(),
        ),
      "Domain error code registry changed",
    );
    assert(Object.isFrozen(domain.DOMAIN_ERROR_CODES), "error code registry must be frozen");
  });

  check("nine exact ID prefixes", () => {
    assert(idCases.length === 9, "contract case count changed");
    assert(Object.keys(domain.DOMAIN_ID_PREFIXES).length === 9, "prefix registry must stay minimal");
    for (const [kind, prefix] of idCases) {
      assert(domain.DOMAIN_ID_PREFIXES[kind] === prefix, `unexpected ${kind} prefix`);
    }
    assert(Object.isFrozen(domain.DOMAIN_ID_PREFIXES), "prefix registry must be frozen");
  });

  for (const [kind, prefix, parser] of idCases) {
    check(`${kind} parser accepts and preserves a canonical ID`, () => {
      const input = `${prefix}alpha-123`;
      const result = parser(input);
      assert(result.ok === true, "canonical ID was rejected");
      assert(result.value === input, "parser normalized the ID");
      assert(Object.isFrozen(result), "success Result must be frozen");
      assert(domain.isDomainId(kind, input), "generic ID guard disagrees");
      const generic = domain.parseDomainId(kind, input);
      assert(generic.ok && generic.value === input, "generic parser disagrees");
    });
  }

  check("ID suffix length boundaries", () => {
    assert(
      domain.DOMAIN_ID_SUFFIX_LIMITS.minLength === 1 &&
        domain.DOMAIN_ID_SUFFIX_LIMITS.maxLength === 64,
      "documented ID limits changed",
    );
    assert(Object.isFrozen(domain.DOMAIN_ID_SUFFIX_LIMITS), "ID limits must be frozen");
    const minimum = domain.parseStoryId("story_a");
    const maximum = domain.parseStoryId(`story_${"a".repeat(64)}`);
    assert(minimum.ok && maximum.ok, "documented ID boundaries were rejected");
    assert(!domain.parseStoryId("story_").ok, "empty suffix was accepted");
    assert(!domain.parseStoryId(`story_${"a".repeat(65)}`).ok, "oversized suffix was accepted");
  });

  const invalidIds = [
    undefined,
    null,
    7,
    {},
    [],
    "story_Alpha-123",
    " story_alpha-123",
    "story_alpha-123 ",
    "story_alpha--123",
    "story_-alpha",
    "story_alpha-",
    "story_alpha_123",
    "story_alpha\n123",
    "story_数据",
    "metric_alpha-123",
  ];
  for (const input of invalidIds) {
    check(`ID parser rejects malicious case ${String(input)}`, () => {
      const result = domain.parseStoryId(input);
      assertInvalidResult(result, "DOMAIN_ID_INVALID");
      assert(Object.isFrozen(result), "failure Result must be frozen");
      assert(Object.isFrozen(result.error), "error DTO must be frozen");
      assert(Object.isFrozen(result.error.details), "error details must be frozen");
    });
  }

  check("unknown ID kind fails without throwing", () => {
    const result = domain.parseDomainId("unknownKind", "story_alpha-123");
    assertInvalidResult(result, "DOMAIN_ID_INVALID");
  });

  check("ID errors do not echo raw input", () => {
    const marker = "DO-NOT-ECHO-秘密-7f4d";
    const result = domain.parseStoryId(marker);
    assert(!JSON.stringify(result).includes(marker), "raw ID input leaked into the error DTO");
  });

  check("Domain package does not generate IDs", () => {
    const generatorExports = Object.keys(domain).filter((name) =>
      /generate|random|uuid|ulid/i.test(name),
    );
    assert(generatorExports.length === 0, "ID generator leaked into Domain API");
  });

  check("core SemVer accepts exact numeric boundaries", () => {
    assert(
      domain.CORE_VERSION_LIMITS.maxNumericIdentifier === 2_147_483_647 &&
        domain.CORE_VERSION_LIMITS.maxEncodedLength === 32 &&
        domain.CORE_VERSION_LIMITS.maxRegistryEntries === 64,
      "core version limits changed",
    );
    assert(Object.isFrozen(domain.CORE_VERSION_LIMITS), "version limits must be frozen");
    for (const input of ["0.0.0", "1.2.3", "2147483647.2147483647.2147483647"]) {
      const result = domain.parseCoreVersion(input);
      assert(result.ok && result.value === input, `${input} was not preserved`);
    }
  });

  const invalidVersions = [
    undefined,
    null,
    1,
    {},
    [],
    "",
    "01.0.0",
    "0.01.0",
    "0.0.01",
    "1.2",
    "1.2.3.4",
    "1.2.3-alpha",
    "1.2.3+build",
    "v1.2.3",
    " 1.2.3",
    "1.2.3 ",
    "１.2.3",
    "2147483648.0.0",
    "999999999999999999999999999999999999.0.0",
  ];
  for (const input of invalidVersions) {
    check(`core SemVer rejects malicious case ${String(input)}`, () => {
      assertInvalidResult(domain.parseCoreVersion(input), "DOMAIN_VERSION_INVALID");
    });
  }

  const sourceVersions = ["1.10.0", "0.9.0", "1.2.1", "1.2.0"];
  const registryResult = domain.createVersionRegistry("story-blueprint", sourceVersions);
  const registry = registryResult.ok ? registryResult.value : undefined;

  check("registry is sorted, copied, and frozen", () => {
    assert(registryResult.ok, "valid registry was rejected");
    assert(registry !== undefined, "registry is unavailable");
    assert(
      JSON.stringify(registry.versions) ===
        JSON.stringify(["0.9.0", "1.2.0", "1.2.1", "1.10.0"]),
      "registry did not use numeric SemVer ordering",
    );
    assert(registry.latest === "1.10.0", "latest version is incorrect");
    assert(registry.kind === "story-blueprint", "registry kind is incorrect");
    assert(sourceVersions[0] === "1.10.0", "input array was mutated");
    assert(Object.isFrozen(registry), "registry must be frozen");
    assert(Object.isFrozen(registry.versions), "registry versions must be frozen");
    assert(
      domain.isVersionRegistry(registry, "story-blueprint"),
      "created registry was not recognized",
    );
    assert(
      !domain.isVersionRegistry(registry, "metric-accumulator"),
      "registry was accepted under another protocol kind",
    );
  });

  check("registry rejects duplicate versions", () => {
    assertInvalidResult(
      domain.createVersionRegistry("story-blueprint", ["1.0.0", "0.1.0", "1.0.0"]),
      "DOMAIN_VERSION_DUPLICATE",
    );
  });

  check("registry rejects malformed and empty inputs", () => {
    for (const input of [null, {}, [], ["1.0.0-alpha"]]) {
      assertInvalidResult(
        domain.createVersionRegistry("story-blueprint", input),
        "DOMAIN_VERSION_INVALID",
      );
    }
  });

  check("registry entry count is bounded", () => {
    const maximum = Array.from({ length: 64 }, (_, index) => `0.0.${index}`);
    assert(
      domain.createVersionRegistry("story-blueprint", maximum).ok,
      "maximum registry size was rejected",
    );
    assertInvalidResult(
      domain.createVersionRegistry("story-blueprint", [...maximum, "0.0.64"]),
      "DOMAIN_VERSION_INVALID",
    );
  });

  check("registry observes arrays through bounded indices without leaking traps", () => {
    const marker = "DO-NOT-ECHO-registry-marker";
    const throwingProxy = new Proxy(["1.0.0"], {
      get(target, property, receiver) {
        if (property === "0") {
          throw new Error(marker);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    let trappedResult;
    try {
      trappedResult = domain.createVersionRegistry("story-blueprint", throwingProxy);
    } catch {
      throw new Error("registry observation error escaped");
    }
    assertInvalidResult(trappedResult, "DOMAIN_VERSION_INVALID");
    assert(!JSON.stringify(trappedResult).includes(marker), "registry trap leaked into error DTO");

    const iteratorTrap = ["1.0.0"];
    iteratorTrap[Symbol.iterator] = function iteratorMustNotRun() {
      throw new Error(marker);
    };
    const boundedResult = domain.createVersionRegistry("story-blueprint", iteratorTrap);
    assert(boundedResult.ok, "registry invoked an untrusted array iterator");

    const { proxy, revoke } = Proxy.revocable(["1.0.0"], {});
    revoke();
    let revokedResult;
    try {
      revokedResult = domain.createVersionRegistry("story-blueprint", proxy);
    } catch {
      throw new Error("revoked registry proxy error escaped");
    }
    assertInvalidResult(revokedResult, "DOMAIN_VERSION_INVALID");
  });

  check("registry kind is canonical, bounded, and protocol-isolated", () => {
    for (const kind of [
      "",
      "123",
      "StoryBlueprint",
      "story_blueprint",
      "故事",
      "a".repeat(65),
    ]) {
      assertInvalidResult(
        domain.createVersionRegistry(kind, ["1.0.0"]),
        "DOMAIN_VERSION_INVALID",
      );
    }
    const metricRegistry = domain.createVersionRegistry("metric-accumulator", ["1.2.0"]);
    assert(metricRegistry.ok, "second protocol registry was rejected");
    const crossProtocol = domain.resolveVersion(
      registry,
      "metric-accumulator",
      "1.2.0",
    );
    assert(
      crossProtocol.ok === false &&
        crossProtocol.error.code === "DOMAIN_VERSION_INVALID" &&
        crossProtocol.error.details.reason === "registry_kind",
      "story registry resolved under the metric protocol kind",
    );
    assert(
      domain.resolveVersion(metricRegistry.value, "metric-accumulator", "1.2.0").ok,
      "metric registry did not resolve its own version",
    );
  });

  check("version resolution distinguishes malformed and unsupported", () => {
    assert(registry !== undefined, "registry is unavailable");
    const known = domain.resolveVersion(registry, "story-blueprint", "1.2.0");
    assert(known.ok && known.value === "1.2.0", "registered version was rejected");
    assertInvalidResult(
      domain.resolveVersion(registry, "story-blueprint", "2.0.0"),
      "DOMAIN_VERSION_UNSUPPORTED",
    );
    assertInvalidResult(
      domain.resolveVersion(registry, "story-blueprint", "02.0.0"),
      "DOMAIN_VERSION_INVALID",
    );
  });

  check("forged registry fails closed", () => {
    const forged = Object.freeze({
      kind: "story-blueprint",
      versions: Object.freeze(["1.0.0"]),
      latest: "1.0.0",
    });
    assertInvalidResult(
      domain.resolveVersion(forged, "story-blueprint", "1.0.0"),
      "DOMAIN_VERSION_INVALID",
    );
    assert(
      !domain.isVersionRegistry(forged, "story-blueprint"),
      "forged registry was accepted",
    );
  });

  check("version errors do not echo raw input", () => {
    const marker = "9.9.9+DO-NOT-ECHO-秘密";
    const result = domain.parseCoreVersion(marker);
    assert(!JSON.stringify(result).includes(marker), "raw version input leaked into the error DTO");
  });

  check("Result DTO uses ok as the sole discriminator", () => {
    const success = domain.parseStoryId("story_a");
    const failure = domain.parseStoryId("STORY_A");
    assert(success.ok && Object.hasOwn(success, "value") && !Object.hasOwn(success, "error"), "bad success shape");
    assert(!failure.ok && Object.hasOwn(failure, "error") && !Object.hasOwn(failure, "value"), "bad failure shape");
    assert(isJsonSafe(success) && isJsonSafe(failure), "Result DTO is not JSON-safe");
  });

  return finish();
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectInvocation) {
  runDomainContract()
    .then((summary) => {
      console.log(JSON.stringify(summary));
      if (summary.result !== "passed") {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.log(
        JSON.stringify({
          result: "failed",
          assertions: { executed: 1, passed: 0, failed: 1, skipped: 0 },
          failures: [error instanceof Error ? error.message : "unknown contract failure"],
        }),
      );
      process.exitCode = 1;
    });
}
