import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { build as viteBuild } from "vite";

import { evaluateCreatorMetric } from "../../apps/creator/dist/main.js";
import { evaluateViewerMetric } from "../../apps/viewer/dist/main.js";
import * as metricRuntimePublicModule from "../../packages/metric-runtime/dist/index.js";
import {
  METRIC_RUNTIME_ERROR_CODES,
  createMetricAccumulator,
  evaluateMetric,
} from "../../packages/metric-runtime/dist/index.js";

type Aggregate = "COUNT_ROWS" | "SUM";

type MetricPlan = {
  schemaVersion: "1.0.0";
  metricId: string;
  aggregate: Aggregate;
};

type CountAccumulator = {
  schemaVersion: "1.0.0";
  metricId: string;
  aggregate: "COUNT_ROWS";
  mergeKind: "count";
  interactionCapability: "exact";
  mergeOrdinal: number;
  state: { count: number };
};

type SumAccumulator = {
  schemaVersion: "1.0.0";
  metricId: string;
  aggregate: "SUM";
  mergeKind: "sum-f64-v1";
  interactionCapability: "exact";
  mergeOrdinal: number;
  state: { sumF64: string };
};

type MetricAccumulator = CountAccumulator | SumAccumulator;

type GoldenCase = {
  id: string;
  plan: MetricPlan;
  accumulators: MetricAccumulator[];
  expected: { value?: number; valueF64?: string };
};

type GoldenFixture = {
  fixtureVersion: "1.0.0";
  kind: "datapulse-metric-runtime-golden-fixture";
  cases: GoldenCase[];
};

type ContractManifestEntry = {
  schemaVersion: "1.0.0";
  schemaId: string;
  path: string;
  bytes: number;
  sha256: string;
};

type GoldenManifest = {
  schemaVersion: "1.0.0";
  kind: "datapulse-formal-metric-runtime-fixture-manifest";
  releaseStatus: "formal-contract-fixture";
  formalHistory: true;
  compatibilityPromise: true;
  hashAlgorithm: "SHA-256";
  contracts: {
    metricAccumulator: ContractManifestEntry;
    metricEvaluationPlan: ContractManifestEntry;
  };
  fixtures: Array<{
    id: string;
    schemaVersion: "1.0.0";
    path: string;
    bytes: number;
    sha256: string;
    consumers: ["creator", "viewer"];
  }>;
};

const repositoryRoot = new URL("../../", import.meta.url);
const formalFixtureDirectory = new URL(
  "../fixtures/metric-runtime/formal/",
  import.meta.url,
);

const clone = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

function float64ToHex(value: number): string {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToFloat64(value: string): number {
  const bytes = new Uint8Array(8);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return new DataView(bytes.buffer).getFloat64(0, false);
}

const createPlan = (
  aggregate: Aggregate,
  metricId = aggregate === "COUNT_ROWS" ? "metric_order-count" : "metric_revenue",
): MetricPlan => ({
  schemaVersion: "1.0.0",
  metricId,
  aggregate,
});

const createCountAccumulator = (
  mergeOrdinal = 0,
  count = 1,
  metricId = "metric_order-count",
): CountAccumulator => ({
  schemaVersion: "1.0.0",
  metricId,
  aggregate: "COUNT_ROWS",
  mergeKind: "count",
  interactionCapability: "exact",
  mergeOrdinal,
  state: { count },
});

const createSumAccumulator = (
  mergeOrdinal = 0,
  sumF64 = "3ff0000000000000",
  metricId = "metric_revenue",
): SumAccumulator => ({
  schemaVersion: "1.0.0",
  metricId,
  aggregate: "SUM",
  mergeKind: "sum-f64-v1",
  interactionCapability: "exact",
  mergeOrdinal,
  state: { sumF64 },
});

async function readManifest(): Promise<GoldenManifest> {
  return JSON.parse(
    await readFile(new URL("manifest.v1.json", formalFixtureDirectory), "utf8"),
  ) as GoldenManifest;
}

async function readGoldenFixture(): Promise<GoldenFixture> {
  return JSON.parse(
    await readFile(
      new URL("1.0.0/canonical.creator-viewer.json", formalFixtureDirectory),
      "utf8",
    ),
  ) as GoldenFixture;
}

async function compileContractSchemas() {
  const manifest = await readManifest();
  const accumulatorSchema = JSON.parse(
    await readFile(new URL(manifest.contracts.metricAccumulator.path, repositoryRoot), "utf8"),
  ) as object;
  const planSchema = JSON.parse(
    await readFile(
      new URL(manifest.contracts.metricEvaluationPlan.path, repositoryRoot),
      "utf8",
    ),
  ) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  return {
    accumulatorSchema,
    planSchema,
    validateAccumulator: ajv.compile(accumulatorSchema),
    validatePlan: ajv.compile(planSchema),
  };
}

function expectAvailableNumber(result: ReturnType<typeof evaluateMetric>): number {
  expect(result.ok).toBe(true);
  if (!result.ok) return Number.NaN;
  expect(result.value.status).toBe("available");
  if (result.value.status !== "available") return Number.NaN;
  return result.value.value;
}

function expectFailure(result: ReturnType<typeof evaluateMetric>): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(Object.hasOwn(result, "value")).toBe(false);
  expect(Object.hasOwn(result, "error")).toBe(true);
  expect(Object.values(METRIC_RUNTIME_ERROR_CODES)).toContain(result.error.code);
  expect(JSON.stringify(result.error.details).length).toBeLessThanOrEqual(128);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.error)).toBe(true);
  expect(Object.isFrozen(result.error.details)).toBe(true);
}

function allPermutations<Value>(values: readonly Value[]): Value[][] {
  if (values.length <= 1) return [Array.from(values)];
  const permutations: Value[][] = [];
  values.forEach((value, index) => {
    const remaining = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const suffix of allPermutations(remaining)) {
      permutations.push([value, ...suffix]);
    }
  });
  return permutations;
}

describe("M0-049 MetricAccumulator 正式 Schema 与黄金清单", () => {
  it("根运行时只公开两个操作和稳定错误码", () => {
    expect(Object.keys(metricRuntimePublicModule).sort()).toEqual([
      "METRIC_RUNTIME_ERROR_CODES",
      "createMetricAccumulator",
      "evaluateMetric",
    ]);
    expect(Object.isFrozen(METRIC_RUNTIME_ERROR_CODES)).toBe(true);
  });

  it("固定两个 1.0.0 Schema 与 Creator/Viewer fixture 的原始字节 hash", async () => {
    const manifest = await readManifest();
    expect(manifest).toMatchObject({
      schemaVersion: "1.0.0",
      kind: "datapulse-formal-metric-runtime-fixture-manifest",
      releaseStatus: "formal-contract-fixture",
      formalHistory: true,
      compatibilityPromise: true,
      hashAlgorithm: "SHA-256",
    });
    expect(Object.keys(manifest.contracts).sort()).toEqual([
      "metricAccumulator",
      "metricEvaluationPlan",
    ]);

    for (const contract of Object.values(manifest.contracts)) {
      const bytes = Uint8Array.from(await readFile(new URL(contract.path, repositoryRoot)));
      expect(bytes.byteLength, contract.path).toBe(contract.bytes);
      expect(sha256(bytes), contract.path).toBe(contract.sha256);
      const schema = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as {
        $id?: string;
      };
      expect(schema.$id).toBe(contract.schemaId);
    }

    expect(manifest.fixtures).toHaveLength(1);
    const fixtureEntry = manifest.fixtures[0];
    expect(fixtureEntry).toBeDefined();
    if (fixtureEntry === undefined) return;
    expect(fixtureEntry.consumers).toEqual(["creator", "viewer"]);
    const fixtureBytes = Uint8Array.from(
      await readFile(new URL(fixtureEntry.path, formalFixtureDirectory)),
    );
    expect(fixtureBytes.byteLength).toBe(fixtureEntry.bytes);
    expect(sha256(fixtureBytes)).toBe(fixtureEntry.sha256);
    expect(fixtureBytes[0]).not.toBe(0xef);
    expect(new TextDecoder().decode(fixtureBytes)).not.toContain("\r");
  });

  it("黄金 fixture 的 plan 与每个 accumulator 均通过唯一 Schema", async () => {
    const fixture = await readGoldenFixture();
    const { validateAccumulator, validatePlan } = await compileContractSchemas();
    expect(fixture).toMatchObject({
      fixtureVersion: "1.0.0",
      kind: "datapulse-metric-runtime-golden-fixture",
    });
    expect(fixture.cases).toHaveLength(3);

    for (const fixtureCase of fixture.cases) {
      expect(validatePlan(fixtureCase.plan), JSON.stringify(validatePlan.errors)).toBe(true);
      for (const accumulator of fixtureCase.accumulators) {
        expect(
          validateAccumulator(accumulator),
          `${fixtureCase.id}: ${JSON.stringify(validateAccumulator.errors)}`,
        ).toBe(true);
      }
    }
  });

  it("history source 固定版本、数值协议和不可注入资源上限", async () => {
    const history = JSON.parse(
      await readFile(
        new URL(
          "../../packages/metric-runtime/src/schema/history.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      schemaVersion: string;
      kind: string;
      currentVersion: string;
      versions: Array<{
        version: string;
        predecessor: null;
        changeKind: string;
        accumulatorSchema: { bytes: number; sha256: string };
        evaluationPlanSchema: { bytes: number; sha256: string };
        runtimeSemantics: Record<string, unknown>;
      }>;
    };
    const manifest = await readManifest();
    expect(history).toMatchObject({
      schemaVersion: "1.0.0",
      kind: "datapulse-metric-runtime-contract-history",
      currentVersion: "1.0.0",
    });
    expect(history.versions).toHaveLength(1);
    const version = history.versions[0];
    expect(version).toBeDefined();
    if (version === undefined) return;
    expect(version).toMatchObject({
      version: "1.0.0",
      predecessor: null,
      changeKind: "initial",
      accumulatorSchema: {
        bytes: manifest.contracts.metricAccumulator.bytes,
        sha256: manifest.contracts.metricAccumulator.sha256,
      },
      evaluationPlanSchema: {
        bytes: manifest.contracts.metricEvaluationPlan.bytes,
        sha256: manifest.contracts.metricEvaluationPlan.sha256,
      },
      runtimeSemantics: {
        supportedAggregates: ["COUNT_ROWS", "SUM"],
        interactionCapabilities: ["exact"],
        sumWireEncoding: "ieee754-binary64-big-endian-lowercase-hex",
        negativeZero: "canonicalize-to-positive-zero",
        mergeOrder: "mergeOrdinal-ascending",
        duplicateMergeOrdinal: "reject",
        failurePriority: [
          "accumulator-shape",
          "accumulator-version-invalid",
          "accumulator-version-unsupported",
          "metric-id-mismatch",
          "aggregate-mismatch",
          "merge-ordinal-duplicate",
        ],
        emptyCountRows: "zero",
        emptySum: "unavailable",
        invalidInput: "whole-evaluation-failure",
        finiteOverflow: "unavailable",
        maxAccumulatorsPerEvaluation: 65_536,
      },
    });
  });

  it("所有 Schema 对象 seam 都关闭额外属性", async () => {
    const { accumulatorSchema, planSchema } = await compileContractSchemas();
    const openPaths: string[] = [];
    const seen = new Set<object>();
    const visit = (value: unknown, path: string): void => {
      if (value === null || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((child, index) => visit(child, `${path}/${index}`));
        return;
      }
      const record = value as Record<string, unknown>;
      if (record["type"] === "object" && record["additionalProperties"] !== false) {
        openPaths.push(path);
      }
      Object.entries(record).forEach(([key, child]) => visit(child, `${path}/${key}`));
    };
    visit(accumulatorSchema, "accumulator#");
    visit(planSchema, "plan#");
    expect(openPaths).toEqual([]);
  });
});

describe("M0-049 Schema/runtime 同意矩阵与 binary64 特殊位型", () => {
  it.each([
    ["额外字段", { ...createPlan("COUNT_ROWS"), sql: "SELECT secret" }],
    ["错误 metric ID", { ...createPlan("COUNT_ROWS"), metricId: "story_wrong" }],
    ["未知 aggregate", { ...createPlan("COUNT_ROWS"), aggregate: "AVG" }],
    ["未知版本", { ...createPlan("COUNT_ROWS"), schemaVersion: "9.9.9" }],
  ])("plan Schema 与 runtime 同时拒绝%s", async (_name, plan) => {
    const { validatePlan } = await compileContractSchemas();
    expect(validatePlan(plan)).toBe(false);
    expectFailure(evaluateMetric(plan, []));
  });

  it.each([
    ["正零", "0000000000000000"],
    ["最小正次正规数", "0000000000000001"],
    ["最小负次正规数", "8000000000000001"],
    ["最大有限正数", "7fefffffffffffff"],
    ["最大有限负数", "ffefffffffffffff"],
  ])("Schema 与 runtime 接受%s", async (_name, sumF64) => {
    const { validateAccumulator } = await compileContractSchemas();
    const accumulator = createSumAccumulator(0, sumF64);
    expect(validateAccumulator(accumulator), JSON.stringify(validateAccumulator.errors)).toBe(true);
    const value = expectAvailableNumber(evaluateMetric(createPlan("SUM"), [accumulator]));
    expect(float64ToHex(value)).toBe(sumF64);
  });

  it.each([
    ["正无穷", "7ff0000000000000"],
    ["负无穷", "fff0000000000000"],
    ["正 quiet NaN", "7ff8000000000000"],
    ["负 quiet NaN", "fff8000000000000"],
    ["最大 NaN payload", "7fffffffffffffff"],
    ["负零", "8000000000000000"],
    ["大写 hex", "3FF0000000000000"],
    ["过短 hex", "000000000000000"],
    ["过长 hex", "00000000000000000"],
  ])("Schema 与 runtime 拒绝%s", async (_name, sumF64) => {
    const { validateAccumulator } = await compileContractSchemas();
    const accumulator = createSumAccumulator(0, sumF64);
    expect(validateAccumulator(accumulator)).toBe(false);
    expectFailure(evaluateMetric(createPlan("SUM"), [accumulator]));
  });

  it.each([
    ["未知根字段", () => ({ ...createCountAccumulator(), sql: "SELECT secret" })],
    ["错误 mergeKind", () => ({ ...createCountAccumulator(), mergeKind: "sum-f64-v1" })],
    ["状态额外字段", () => ({ ...createCountAccumulator(), state: { count: 1, rawRows: [] } })],
    ["负 count", () => createCountAccumulator(0, -1)],
    ["小数 count", () => createCountAccumulator(0, 0.5)],
    ["非安全 count", () => createCountAccumulator(0, Number.MAX_SAFE_INTEGER + 1)],
    ["非安全 ordinal", () => createCountAccumulator(Number.MAX_SAFE_INTEGER + 1, 1)],
    ["错误 metric ID", () => createCountAccumulator(0, 1, "story_wrong")],
    ["未知版本", () => ({ ...createCountAccumulator(), schemaVersion: "9.9.9" })],
  ])("Schema 与 runtime 同时拒绝%s", async (_name, createInvalid) => {
    const { validateAccumulator } = await compileContractSchemas();
    const accumulator = createInvalid();
    expect(validateAccumulator(accumulator)).toBe(false);
    expectFailure(evaluateMetric(createPlan("COUNT_ROWS"), [accumulator]));
  });

  it("create 拒绝 NaN/Infinity 与非安全整数，并把 -0 规范为 +0", () => {
    for (const sum of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = createMetricAccumulator({
        metricId: "metric_revenue",
        aggregate: "SUM",
        mergeOrdinal: 0,
        sum,
      });
      expect(result.ok).toBe(false);
    }
    for (const count of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const result = createMetricAccumulator({
        metricId: "metric_order-count",
        aggregate: "COUNT_ROWS",
        mergeOrdinal: 0,
        count,
      });
      expect(result.ok).toBe(false);
    }

    const sumZero = createMetricAccumulator({
      metricId: "metric_revenue",
      aggregate: "SUM",
      mergeOrdinal: 0,
      sum: -0,
    });
    expect(sumZero.ok).toBe(true);
    if (sumZero.ok && sumZero.value.aggregate === "SUM") {
      expect(sumZero.value.state.sumF64).toBe("0000000000000000");
    }
    const countZero = createMetricAccumulator({
      metricId: "metric_order-count",
      aggregate: "COUNT_ROWS",
      mergeOrdinal: -0,
      count: -0,
    });
    expect(countZero.ok).toBe(true);
    if (countZero.ok && countZero.value.aggregate === "COUNT_ROWS") {
      expect(Object.is(countZero.value.mergeOrdinal, -0)).toBe(false);
      expect(Object.is(countZero.value.state.count, -0)).toBe(false);
    }
  });

  it("create 返回与 draft 隔离、深冻结且符合 Schema 的 wire snapshot", async () => {
    const { validateAccumulator } = await compileContractSchemas();
    const draft = {
      metricId: "metric_revenue",
      aggregate: "SUM" as const,
      mergeOrdinal: 7,
      sum: 0.1,
    };
    const result = createMetricAccumulator(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateAccumulator(result.value), JSON.stringify(validateAccumulator.errors)).toBe(true);
    expect(result.value).not.toBe(draft);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.state)).toBe(true);
    draft.sum = 99;
    expect(result.value.aggregate).toBe("SUM");
    if (result.value.aggregate === "SUM") {
      expect(result.value.state.sumF64).toBe("3fb999999999999a");
    }
  });
});

describe("M0-049 固定 merge/finalize 语义", () => {
  it("全部输入排列都按 mergeOrdinal 左折叠非结合 SUM", async () => {
    const fixture = await readGoldenFixture();
    const fixtureCase = fixture.cases.find(
      ({ id }) => id === "sum-fixed-order-non-associative",
    );
    expect(fixtureCase).toBeDefined();
    if (fixtureCase === undefined) return;

    const original = clone(fixtureCase.accumulators);
    for (const permutation of allPermutations(fixtureCase.accumulators)) {
      const value = expectAvailableNumber(evaluateMetric(fixtureCase.plan, permutation));
      expect(float64ToHex(value)).toBe(fixtureCase.expected.valueF64);
    }
    expect(fixtureCase.accumulators).toEqual(original);
  });

  it("逐位保持 binary64 舍入而不格式化或重算", async () => {
    const fixture = await readGoldenFixture();
    const fixtureCase = fixture.cases.find(({ id }) => id === "sum-binary64-rounding");
    expect(fixtureCase).toBeDefined();
    if (fixtureCase === undefined) return;
    const value = expectAvailableNumber(
      evaluateMetric(fixtureCase.plan, fixtureCase.accumulators),
    );
    expect(value).toBe(0.30000000000000004);
    expect(float64ToHex(value)).toBe("3fd3333333333334");
  });

  it("COUNT_ROWS 空选择为 0，SUM 空选择为带原因的 unavailable", () => {
    const count = evaluateMetric(createPlan("COUNT_ROWS"), []);
    expect(expectAvailableNumber(count)).toBe(0);

    const sum = evaluateMetric(createPlan("SUM"), []);
    expect(sum.ok).toBe(true);
    if (!sum.ok) return;
    expect(sum.value).toMatchObject({
      status: "unavailable",
      metricId: "metric_revenue",
      aggregate: "SUM",
      reason: "EMPTY_SELECTION",
    });
    expect(Object.hasOwn(sum.value, "value")).toBe(false);
  });

  it("COUNT_ROWS 安全整数溢出与 SUM 有限输入溢出均不可用", () => {
    const count = evaluateMetric(createPlan("COUNT_ROWS"), [
      createCountAccumulator(0, Number.MAX_SAFE_INTEGER),
      createCountAccumulator(1, 1),
    ]);
    expect(count.ok).toBe(true);
    if (count.ok) {
      expect(count.value).toMatchObject({
        status: "unavailable",
        reason: "NUMERIC_OVERFLOW",
      });
    }

    const sum = evaluateMetric(createPlan("SUM"), [
      createSumAccumulator(0, "7fefffffffffffff"),
      createSumAccumulator(1, "7fefffffffffffff"),
    ]);
    expect(sum.ok).toBe(true);
    if (sum.ok) {
      expect(sum.value).toMatchObject({
        status: "unavailable",
        reason: "NUMERIC_OVERFLOW",
      });
    }
  });

  it("结果为零时始终规范为正零", () => {
    const result = evaluateMetric(createPlan("SUM"), [
      createSumAccumulator(0, "8000000000000001"),
      createSumAccumulator(1, "0000000000000001"),
    ]);
    const value = expectAvailableNumber(result);
    expect(value).toBe(0);
    expect(Object.is(value, -0)).toBe(false);
    expect(float64ToHex(value)).toBe("0000000000000000");
  });

  it("重复 ordinal、混合 metric 与混合 aggregate 均 whole-evaluation fail-closed", () => {
    expectFailure(
      evaluateMetric(createPlan("COUNT_ROWS"), [
        createCountAccumulator(0, 1),
        createCountAccumulator(0, 2),
      ]),
    );
    expectFailure(
      evaluateMetric(createPlan("COUNT_ROWS"), [
        createCountAccumulator(0, 1),
        createCountAccumulator(1, 2, "metric_other"),
      ]),
    );
    expectFailure(
      evaluateMetric(createPlan("COUNT_ROWS"), [
        createCountAccumulator(0, 1),
        createSumAccumulator(1),
      ]),
    );
  });
});

describe("M0-049 恶意对象与稳定错误 DTO", () => {
  it.each([
    [
      "plan shape",
      () => evaluateMetric({ ...createPlan("COUNT_ROWS"), sql: "SELECT 1" }, []),
      "METRIC_RUNTIME_PLAN_INVALID",
      "shape",
    ],
    [
      "plan invalid version",
      () => evaluateMetric({ ...createPlan("COUNT_ROWS"), schemaVersion: 1 }, []),
      "METRIC_RUNTIME_VERSION_INVALID",
      "plan_version",
    ],
    [
      "plan unsupported version",
      () => evaluateMetric({ ...createPlan("COUNT_ROWS"), schemaVersion: "9.9.9" }, []),
      "METRIC_RUNTIME_VERSION_UNSUPPORTED",
      "plan_version",
    ],
    [
      "accumulator collection type",
      () => evaluateMetric(createPlan("COUNT_ROWS"), {}),
      "METRIC_RUNTIME_ACCUMULATOR_INVALID",
      "collection_type",
    ],
    [
      "accumulator shape",
      () => evaluateMetric(createPlan("COUNT_ROWS"), [{ ...createCountAccumulator(), raw: [] }]),
      "METRIC_RUNTIME_ACCUMULATOR_INVALID",
      "shape",
    ],
    [
      "accumulator invalid version",
      () => evaluateMetric(createPlan("COUNT_ROWS"), [{ ...createCountAccumulator(), schemaVersion: 1 }]),
      "METRIC_RUNTIME_VERSION_INVALID",
      "accumulator_version",
    ],
    [
      "accumulator unsupported version",
      () =>
        evaluateMetric(createPlan("COUNT_ROWS"), [
          { ...createCountAccumulator(), schemaVersion: "9.9.9" },
        ]),
      "METRIC_RUNTIME_VERSION_UNSUPPORTED",
      "accumulator_version",
    ],
    [
      "metric mismatch",
      () => evaluateMetric(createPlan("COUNT_ROWS"), [createCountAccumulator(0, 1, "metric_other")]),
      "METRIC_RUNTIME_CONTRACT_MISMATCH",
      "metric_id",
    ],
    [
      "aggregate mismatch",
      () =>
        evaluateMetric(createPlan("COUNT_ROWS"), [
          createSumAccumulator(0, "3ff0000000000000", "metric_order-count"),
        ]),
      "METRIC_RUNTIME_CONTRACT_MISMATCH",
      "aggregate",
    ],
    [
      "duplicate ordinal",
      () =>
        evaluateMetric(createPlan("COUNT_ROWS"), [
          createCountAccumulator(0, 1),
          createCountAccumulator(0, 2),
        ]),
      "METRIC_RUNTIME_MERGE_ORDINAL_DUPLICATE",
      "merge_ordinal",
    ],
  ])("%s 返回固定 code/reason", (_name, evaluate, code, reason) => {
    const result = evaluate();
    expectFailure(result);
    if (result.ok) return;
    expect(result.error).toEqual({ code, details: { reason } });
  });

  it("create draft 返回固定错误且不回显输入", () => {
    const marker = "draft-marker-never-echo";
    const result = createMetricAccumulator({
      metricId: marker,
      aggregate: "SUM",
      mergeOrdinal: 0,
      sum: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "METRIC_RUNTIME_DRAFT_INVALID",
        details: { reason: "metric_id" },
      },
    });
    expect(JSON.stringify(result)).not.toContain(marker);
  });

  it("同一错误集合的所有排列都按固定优先级返回相同 DTO", () => {
    const candidates = [
      { ...createCountAccumulator(0), state: { count: 1, raw: [] } },
      { ...createCountAccumulator(1), schemaVersion: 1 },
      { ...createCountAccumulator(2), schemaVersion: "9.9.9" },
      createCountAccumulator(3, 1, "metric_other"),
      createSumAccumulator(4),
    ];
    for (const permutation of allPermutations(candidates)) {
      const result = evaluateMetric(createPlan("COUNT_ROWS"), permutation);
      expectFailure(result);
      if (result.ok) continue;
      expect(result.error).toEqual({
        code: "METRIC_RUNTIME_ACCUMULATOR_INVALID",
        details: { reason: "shape" },
      });
    }
  });

  it("65,536 个 accumulator 可求值，65,537 个在遍历元素前固定拒绝", () => {
    const maximum = Array.from({ length: 65_536 }, (_, mergeOrdinal) =>
      createCountAccumulator(mergeOrdinal, 0),
    );
    expect(expectAvailableNumber(evaluateMetric(createPlan("COUNT_ROWS"), maximum))).toBe(0);

    let getterCalls = 0;
    const overLimit = new Array<unknown>(65_537);
    Object.defineProperty(overLimit, "0", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("over-limit getter must not execute");
      },
    });
    const result = evaluateMetric(createPlan("COUNT_ROWS"), overLimit);
    expectFailure(result);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: "METRIC_RUNTIME_INPUT_LIMIT_EXCEEDED",
        details: { reason: "accumulator_count" },
      });
    }
    expect(getterCalls).toBe(0);
  });

  it("拒绝 getter 且不执行 getter、不回显攻击者文本", () => {
    const marker = "secret-metric-marker-never-echo";
    const accumulator = createCountAccumulator() as CountAccumulator & {
      hostile?: string;
    };
    let getterCalls = 0;
    Object.defineProperty(accumulator, "hostile", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error(marker);
      },
    });
    const result = evaluateMetric(createPlan("COUNT_ROWS"), [accumulator]);
    expectFailure(result);
    expect(getterCalls).toBe(0);
    expect(JSON.stringify(result)).not.toContain(marker);
  });

  it("revoked Proxy、稀疏数组、symbol、循环与别名均不让异常逃逸", () => {
    const { proxy, revoke } = Proxy.revocable(createCountAccumulator(), {});
    revoke();
    const sparse = new Array<unknown>(1);
    const withSymbol = createCountAccumulator() as CountAccumulator & {
      [key: symbol]: string;
    };
    withSymbol[Symbol("secret")] = "hidden";
    const cyclic = createCountAccumulator() as CountAccumulator & { self?: unknown };
    cyclic.self = cyclic;
    const alias = createCountAccumulator();

    for (const input of [[proxy], sparse, [withSymbol], [cyclic], [alias, alias]]) {
      let result: ReturnType<typeof evaluateMetric> | undefined;
      expect(() => {
        result = evaluateMetric(createPlan("COUNT_ROWS"), input);
      }).not.toThrow();
      expect(result).toBeDefined();
      if (result !== undefined) expectFailure(result);
    }
  });

  it("失败无 value，成功无 error，错误不回显恶意输入", () => {
    const success = evaluateMetric(createPlan("COUNT_ROWS"), [createCountAccumulator()]);
    expect(success.ok).toBe(true);
    expect(Object.hasOwn(success, "value")).toBe(true);
    expect(Object.hasOwn(success, "error")).toBe(false);

    const marker = "metric_marker_do_not_echo";
    const failure = evaluateMetric(createPlan("COUNT_ROWS"), [
      { ...createCountAccumulator(), [marker]: marker },
    ]);
    expectFailure(failure);
    expect(JSON.stringify(failure)).not.toContain(marker);
  });
});

describe("M0-049 Creator/Viewer 黄金一致与 Windows 包级探针", () => {
  it("Creator 与 Viewer 对独立 fixture 副本逐值一致", async () => {
    const creatorFixture = await readGoldenFixture();
    const viewerFixture = await readGoldenFixture();
    expect(creatorFixture).not.toBe(viewerFixture);
    expect(creatorFixture.cases).not.toBe(viewerFixture.cases);

    for (let index = 0; index < creatorFixture.cases.length; index += 1) {
      const creatorCase = creatorFixture.cases[index];
      const viewerCase = viewerFixture.cases[index];
      expect(creatorCase).toBeDefined();
      expect(viewerCase).toBeDefined();
      if (creatorCase === undefined || viewerCase === undefined) continue;
      viewerCase.accumulators.reverse();

      const creatorResult = evaluateCreatorMetric(
        creatorCase.plan,
        creatorCase.accumulators,
      );
      const viewerResult = evaluateViewerMetric(
        viewerCase.plan,
        viewerCase.accumulators,
      );
      expect(creatorResult).toEqual(viewerResult);
      expect(creatorResult).not.toBe(viewerResult);
      const value = expectAvailableNumber(creatorResult);
      if (creatorCase.expected.value !== undefined) {
        expect(value).toBe(creatorCase.expected.value);
      }
      if (creatorCase.expected.valueF64 !== undefined) {
        expect(float64ToHex(value)).toBe(creatorCase.expected.valueF64);
      }
    }

    for (const [plan, accumulators] of [
      [createPlan("SUM"), []],
      [
        createPlan("COUNT_ROWS"),
        [
          createCountAccumulator(0, Number.MAX_SAFE_INTEGER),
          createCountAccumulator(1, 1),
        ],
      ],
      [createPlan("COUNT_ROWS"), [createSumAccumulator()]],
    ] as const) {
      expect(evaluateCreatorMetric(plan, clone(accumulators))).toEqual(
        evaluateViewerMetric(plan, clone(accumulators)),
      );
    }
  });

  it("生成器从外部 cwd 核对生成类型/standalone 且拒绝错误参数", () => {
    const generatorPath = fileURLToPath(
      new URL("../../packages/metric-runtime/scripts/generate-artifacts.mjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [generatorPath, "--check"], {
      cwd: tmpdir(),
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"check": "metric-runtime-generated-artifacts"');
    expect(result.stdout).toContain('"result": "passed"');

    const invalid = spawnSync(process.execPath, [generatorPath, "--bad"], {
      cwd: tmpdir(),
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain("METRIC_RUNTIME_GENERATION_FAILED");
    expect(invalid.stderr).not.toContain(process.cwd());
    expect(invalid.stderr).not.toMatch(/(?:file:\/\/\/|\n\s+at\s)/u);
  });

  it("standalone validators 不加载 Ajv helper 或动态代码", async () => {
    for (const path of [
      "../../packages/metric-runtime/src/generated/metric-accumulator-v1_0_0.validator.generated.ts",
      "../../packages/metric-runtime/src/generated/metric-evaluation-plan-v1_0_0.validator.generated.ts",
    ]) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source.charCodeAt(0)).not.toBe(0xfeff);
      expect(source).not.toContain("\r");
      expect(source).not.toMatch(/\bfrom\s+["']ajv/u);
      expect(source).not.toMatch(/\brequire\s*\(/u);
      expect(source).not.toMatch(/\beval\s*\(/u);
      expect(source).not.toMatch(/\bnew\s+Function\b/u);
      expect(source).not.toMatch(/\bimport\s*\(/u);
      expect(source).not.toContain(process.cwd());
    }
  });

  it("Node 原生 ESM 从外部 cwd 加载含空格路径并执行 -0 规范化", () => {
    const moduleUrl = new URL(
      "../../packages/metric-runtime/dist/index.js",
      import.meta.url,
    ).href;
    const probe = [
      `import { createMetricAccumulator, evaluateMetric } from ${JSON.stringify(moduleUrl)};`,
      'const created = createMetricAccumulator({ metricId: "metric_probe", aggregate: "SUM", mergeOrdinal: 0, sum: -0 });',
      'if (!created.ok || created.value.state.sumF64 !== "0000000000000000") throw new Error("create probe failed");',
      'const result = evaluateMetric({ schemaVersion: "1.0.0", metricId: "metric_probe", aggregate: "SUM" }, [created.value]);',
      'if (!result.ok || result.value.status !== "available" || Object.is(result.value.value, -0)) throw new Error("evaluate probe failed");',
      'process.stdout.write("metric-runtime-native-esm=passed");',
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
      cwd: tmpdir(),
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("metric-runtime-native-esm=passed");
    expect(result.stderr).toBe("");
  });

  it("通过 Vite 8 write:false ESM 探针且不引入禁用依赖", async () => {
    const result = await viteBuild({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(
            new URL("../../packages/metric-runtime/dist/index.js", import.meta.url),
          ),
          formats: ["es"],
          name: "DataPulseMetricRuntimeProbe",
        },
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((output) => output.output)
      : result.output;
    const chunks = outputs.filter((output) => output.type === "chunk");
    const code = chunks
      .map((chunk) => ("code" in chunk ? chunk.code : ""))
      .join("\n");
    expect(chunks).toHaveLength(1);
    expect(code).toContain("createMetricAccumulator");
    expect(code).toContain("evaluateMetric");
    expect(code).not.toMatch(/\b(?:react|duckdb|indexeddb|localstorage)\b/iu);
    expect(code).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket)\b/u);
    expect(code).not.toMatch(/\bnew\s+Function\b/u);
    expect(code).not.toMatch(/\bimport\s*\(/u);
  });
});

// Keep a direct decoder assertion close to the fixture helpers so an endian
// regression cannot make the expected bit strings self-consistent but wrong.
describe("M0-049 binary64 fixture helper", () => {
  it("uses fixed big-endian IEEE-754 bytes", () => {
    expect(hexToFloat64("3ff0000000000000")).toBe(1);
    expect(hexToFloat64("4341c37937e08000")).toBe(10_000_000_000_000_000);
    expect(float64ToHex(hexToFloat64("8000000000000001"))).toBe(
      "8000000000000001",
    );
  });
});
