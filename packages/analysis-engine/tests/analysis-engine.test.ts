/**
 * M0-033：analysis-engine DuckDB-WASM 探针单元测试。
 *
 * 使用真实 duckdb-wasm blocking 运行固定合成 Arrow IPC 数据，校验黄金
 * COUNT_ROWS / SUM 与共享 metric-runtime 逐值一致，并覆盖输入校验、限额、
 * 恶意列名、失败路径与取消的稳定错误。
 */
import { describe, expect, it } from "vitest";
import { tableFromArrays, tableToIPC } from "apache-arrow";

import {
  createMetricAccumulator,
  evaluateMetric,
  type MetricAccumulator,
} from "@datapulse/metric-runtime";
import {
  ANALYSIS_ENGINE_ERROR_CODES,
  ANALYSIS_ENGINE_LIMITS,
  ANALYSIS_ENGINE_SCHEMA_VERSION,
  isAnalysisEngineError,
  runAnalysis,
  type AnalysisInput,
} from "../dist/index.js";

function arrowTable(schema: Record<string, ArrayLike<number>>): Uint8Array {
  return tableToIPC(tableFromArrays(schema), "stream");
}

function validInput(overrides: Record<string, unknown> = {}): AnalysisInput {
  return {
    schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
    requestId: "request_analysis_001",
    arrow: arrowTable({ sales: Float64Array.from([10, 20, 30]) }),
    metrics: [{ metricId: "metric_rowcount", aggregate: "COUNT_ROWS" }],
    ...overrides,
  } as unknown as AnalysisInput;
}

function accumulatorsFor(
  metricId: string,
  accumulators: readonly MetricAccumulator[],
): MetricAccumulator[] {
  return accumulators.filter((accumulator) => accumulator.metricId === metricId);
}

function evaluateMetricValue(
  metricId: string,
  aggregate: "COUNT_ROWS" | "SUM",
  accumulators: readonly MetricAccumulator[],
): number {
  const result = evaluateMetric(
    { schemaVersion: "1.0.0", metricId, aggregate },
    accumulatorsFor(metricId, accumulators),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("unreachable");
  }
  expect(result.value.status).toBe("available");
  if (result.value.status !== "available") {
    throw new Error("unreachable");
  }
  return result.value.value;
}

describe("analysis-engine DuckDB-WASM 探针", () => {
  it(
    "对固定合成表执行 COUNT_ROWS 与 SUM，返回与 metric-runtime 一致的版本化 accumulator",
    async () => {
      const input: AnalysisInput = {
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_002",
        arrow: arrowTable({
          sales: Float64Array.from([10, 20, 30, 40, 50]),
          quantity: Int32Array.from([1, 2, 3, 4, 5]),
        }),
        metrics: [
          { metricId: "metric_rowcount", aggregate: "COUNT_ROWS" },
          { metricId: "metric_sales-total", aggregate: "SUM", column: "sales" },
          { metricId: "metric_quantity-total", aggregate: "SUM", column: "quantity" },
        ],
      };

      const result = await runAnalysis(input);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("unreachable");
      }
      expect(result.value.schemaVersion).toBe(ANALYSIS_ENGINE_SCHEMA_VERSION);
      expect(result.value.requestId).toBe("request_analysis_002");
      expect(result.value.accumulators).toHaveLength(3);

      const expectedCount = createMetricAccumulator({
        metricId: "metric_rowcount",
        aggregate: "COUNT_ROWS",
        mergeOrdinal: 0,
        count: 5,
      });
      const expectedSales = createMetricAccumulator({
        metricId: "metric_sales-total",
        aggregate: "SUM",
        mergeOrdinal: 0,
        sum: 150,
      });
      const expectedQuantity = createMetricAccumulator({
        metricId: "metric_quantity-total",
        aggregate: "SUM",
        mergeOrdinal: 0,
        sum: 15,
      });
      expect(expectedCount.ok && expectedSales.ok && expectedQuantity.ok).toBe(true);
      if (!expectedCount.ok || !expectedSales.ok || !expectedQuantity.ok) {
        throw new Error("unreachable");
      }

      // 顺序与输入一致，且每个 accumulator 与 metric-runtime 黄金创建结果完全一致。
      expect(result.value.accumulators[0]).toEqual(expectedCount.value);
      expect(result.value.accumulators[1]).toEqual(expectedSales.value);
      expect(result.value.accumulators[2]).toEqual(expectedQuantity.value);

      // 共享 metric-runtime 求值得到精确黄金值。
      expect(
        evaluateMetricValue("metric_rowcount", "COUNT_ROWS", result.value.accumulators),
      ).toBe(5);
      expect(
        evaluateMetricValue("metric_sales-total", "SUM", result.value.accumulators),
      ).toBe(150);
      expect(
        evaluateMetricValue("metric_quantity-total", "SUM", result.value.accumulators),
      ).toBe(15);
    },
    30_000,
  );

  it(
    "对小数与负值执行精确 f64 SUM，且空表 COUNT_ROWS 为 0",
    async () => {
      const fractional = await runAnalysis({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_003",
        arrow: arrowTable({ sales: Float64Array.from([1.5, 2.25, 0.125]) }),
        metrics: [{ metricId: "metric_sales-total", aggregate: "SUM", column: "sales" }],
      });
      expect(fractional.ok).toBe(true);
      if (!fractional.ok) {
        throw new Error("unreachable");
      }
      expect(
        evaluateMetricValue("metric_sales-total", "SUM", fractional.value.accumulators),
      ).toBe(3.875);

      const negative = await runAnalysis({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_004",
        arrow: arrowTable({ sales: Float64Array.from([-5, 10, -2.5]) }),
        metrics: [{ metricId: "metric_sales-total", aggregate: "SUM", column: "sales" }],
      });
      expect(negative.ok).toBe(true);
      if (!negative.ok) {
        throw new Error("unreachable");
      }
      expect(
        evaluateMetricValue("metric_sales-total", "SUM", negative.value.accumulators),
      ).toBe(2.5);

      const empty = await runAnalysis({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_005",
        arrow: arrowTable({ sales: Float64Array.from([]) }),
        metrics: [{ metricId: "metric_rowcount", aggregate: "COUNT_ROWS" }],
      });
      expect(empty.ok).toBe(true);
      if (!empty.ok) {
        throw new Error("unreachable");
      }
      expect(
        evaluateMetricValue("metric_rowcount", "COUNT_ROWS", empty.value.accumulators),
      ).toBe(0);
    },
    30_000,
  );

  it(
    "拒绝非法输入并返回封闭错误",
    async () => {
      const cases: Array<{ name: string; input: unknown; code: string; reason: string }> = [
        {
          name: "非对象",
          input: "request",
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "type",
        },
        {
          name: "错误 schema 版本",
          input: validInput({ schemaVersion: "0.1.0" }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "schema-version",
        },
        {
          name: "过短 requestId",
          input: validInput({ requestId: "short" }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "request-id",
        },
        {
          name: "arrow 不是 Uint8Array",
          input: validInput({ arrow: new ArrayBuffer(8) }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "arrow",
        },
        {
          name: "metrics 不是数组",
          input: validInput({ metrics: "COUNT_ROWS" }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "metrics",
        },
        {
          name: "空 metrics",
          input: validInput({ metrics: [] }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputLimitExceeded,
          reason: "metrics-count",
        },
        {
          name: "metrics 超限",
          input: validInput({
            metrics: Array.from(
              { length: ANALYSIS_ENGINE_LIMITS.metricsMaxCount + 1 },
              () => ({ metricId: "metric_rowcount", aggregate: "COUNT_ROWS" }),
            ),
          }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputLimitExceeded,
          reason: "metrics-count",
        },
        {
          name: "非法 metricId",
          input: validInput({
            metrics: [{ metricId: "metric_bad!id", aggregate: "COUNT_ROWS" }],
          }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "metric-id",
        },
        {
          name: "非法 aggregate",
          input: validInput({
            metrics: [{ metricId: "metric_rowcount", aggregate: "AVG" }],
          }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "aggregate",
        },
        {
          name: "SUM 缺少 column",
          input: validInput({
            metrics: [{ metricId: "metric_sales-total", aggregate: "SUM" }],
          }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "column",
        },
        {
          name: "SQL 注入列名",
          input: validInput({
            metrics: [
              { metricId: "metric_sales-total", aggregate: "SUM", column: "sales; DROP TABLE t" },
            ],
          }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "column",
        },
        {
          name: "COUNT_ROWS 携带 column",
          input: validInput({
            metrics: [{ metricId: "metric_rowcount", aggregate: "COUNT_ROWS", column: "sales" }],
          }),
          code: ANALYSIS_ENGINE_ERROR_CODES.inputInvalid,
          reason: "column",
        },
      ];

      for (const testCase of cases) {
        const result = await runAnalysis(testCase.input);
        expect(result.ok, testCase.name).toBe(false);
        if (result.ok) {
          throw new Error("unreachable");
        }
        expect(result.error.code, testCase.name).toBe(testCase.code);
        expect(result.error.details.reason, testCase.name).toBe(testCase.reason);
        expect(isAnalysisEngineError(result.error)).toBe(true);
      }
    },
    30_000,
  );

  it(
    "执行失败与取消返回封闭错误且不泄漏数据",
    async () => {
      const nonFinite = await runAnalysis({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_006",
        arrow: arrowTable({ sales: Float64Array.from([Number.NaN, 1]) }),
        metrics: [{ metricId: "metric_sales-total", aggregate: "SUM", column: "sales" }],
      });
      expect(nonFinite.ok).toBe(false);
      if (nonFinite.ok) {
        throw new Error("unreachable");
      }
      expect(nonFinite.error.code).toBe(ANALYSIS_ENGINE_ERROR_CODES.executionFailed);
      expect(nonFinite.error.details.reason).toBe("non-finite");

      const emptySum = await runAnalysis({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_007",
        arrow: arrowTable({ sales: Float64Array.from([]) }),
        metrics: [{ metricId: "metric_sales-total", aggregate: "SUM", column: "sales" }],
      });
      expect(emptySum.ok).toBe(false);
      if (emptySum.ok) {
        throw new Error("unreachable");
      }
      expect(emptySum.error.code).toBe(ANALYSIS_ENGINE_ERROR_CODES.executionFailed);
      expect(emptySum.error.details.reason).toBe("non-finite");

      const missingColumn = await runAnalysis({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_008",
        arrow: arrowTable({ sales: Float64Array.from([1, 2]) }),
        metrics: [{ metricId: "metric_missing-total", aggregate: "SUM", column: "not_there" }],
      });
      expect(missingColumn.ok).toBe(false);
      if (missingColumn.ok) {
        throw new Error("unreachable");
      }
      expect(missingColumn.error.code).toBe(ANALYSIS_ENGINE_ERROR_CODES.executionFailed);
      expect(missingColumn.error.details.reason).toBe("query");

      // DuckDB 延迟解析 Arrow IPC：恶意字节在查询期以稳定 query 错误失败；
      // insert 期异常同样映射为封闭 executionFailed，但不以确定性数据触发。
      const malformedArrow = await runAnalysis({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: "request_analysis_009",
        arrow: new Uint8Array([1, 2, 3, 4]),
        metrics: [{ metricId: "metric_rowcount", aggregate: "COUNT_ROWS" }],
      });
      expect(malformedArrow.ok).toBe(false);
      if (malformedArrow.ok) {
        throw new Error("unreachable");
      }
      expect(malformedArrow.error.code).toBe(ANALYSIS_ENGINE_ERROR_CODES.executionFailed);
      expect(malformedArrow.error.details.reason).toBe("query");

      const controller = new AbortController();
      controller.abort();
      const cancelled = await runAnalysis(validInput(), { signal: controller.signal });
      expect(cancelled.ok).toBe(false);
      if (cancelled.ok) {
        throw new Error("unreachable");
      }
      expect(cancelled.error.code).toBe(ANALYSIS_ENGINE_ERROR_CODES.cancelled);
      expect(cancelled.error.details.reason).toBe("abort-signal");
      expect(isAnalysisEngineError(cancelled.error)).toBe(true);
    },
    30_000,
  );

  it(
    "每次运行独立实例，连续多次运行结果稳定",
    async () => {
      const input = validInput({
        requestId: "request_analysis_010",
        metrics: [
          { metricId: "metric_rowcount", aggregate: "COUNT_ROWS" },
          { metricId: "metric_sales-total", aggregate: "SUM", column: "sales" },
        ],
      });
      for (let index = 0; index < 3; index += 1) {
        const result = await runAnalysis(input);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          throw new Error("unreachable");
        }
        expect(
          evaluateMetricValue("metric_rowcount", "COUNT_ROWS", result.value.accumulators),
        ).toBe(3);
        expect(
          evaluateMetricValue("metric_sales-total", "SUM", result.value.accumulators),
        ).toBe(60);
      }
    },
    30_000,
  );
});