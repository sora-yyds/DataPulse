/**
 * M0-033：analysis-engine 的 DuckDB-WASM blocking 探针。
 *
 * 只接收已校验的 AnalysisInput：在 Node 内以 DuckDB-WASM blocking API 对
 * Arrow IPC 流执行 COUNT_ROWS / SUM，只返回版本化 MetricAccumulator。
 * 引擎不读取原始行、不产出 Evidence / 文案 / Story 区块，也不把数据外传。
 */
import { fileURLToPath } from "node:url";

import {
  createDuckDB,
  NODE_RUNTIME,
  VoidLogger,
  type DuckDBBundles,
} from "@duckdb/duckdb-wasm/blocking";
import {
  createMetricAccumulator,
  type MetricAccumulator,
} from "@datapulse/metric-runtime";

import {
  createAnalysisCancelledError,
  createEngineUnavailableError,
  createExecutionFailedError,
} from "./errors.js";
import type {
  AnalysisEngineRunResult,
  AnalysisInput,
  AnalysisMetricRequest,
  AnalysisResult,
} from "./contract.js";
import { validateAnalysisInput } from "./contract.js";
import { ANALYSIS_ENGINE_SCHEMA_VERSION } from "./limits.js";

/** 引擎内部固定表名，不接受调用方输入，避免 SQL 注入面。 */
const ANALYSIS_TABLE_NAME = "analysis_input";

type QueryResultTable = {
  getChild(name: string): { get(index: number): unknown } | null;
};

/**
 * 从本包 dist 的 pnpm 布局解析固定 WASM 文件路径：不引入 node:module
 * resolver，仅依赖 pnpm 在包内创建的 @duckdb/duckdb-wasm 符号链接。
 */
function resolveWasmPath(fileName: "duckdb-mvp.wasm" | "duckdb-eh.wasm"): string {
  return fileURLToPath(
    new URL(`../node_modules/@duckdb/duckdb-wasm/dist/${fileName}`, import.meta.url),
  );
}

/**
 * Node blocking 构建需要 EH 能力（`_setThrew` 仅在 EH wasm 提供）；固定
 * Node 24.19.0 工具链检测 wasmExceptions=true，createDuckDB 会选择 eh。
 * mvp 同时提供以满足 DuckDBBundles 类型并要求单文件确定性。
 */
const DUCKDB_WASM_BUNDLES: DuckDBBundles = Object.freeze({
  mvp: Object.freeze({
    mainModule: resolveWasmPath("duckdb-mvp.wasm"),
    mainWorker: "",
  }),
  eh: Object.freeze({
    mainModule: resolveWasmPath("duckdb-eh.wasm"),
    mainWorker: "",
  }),
});

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function success(value: AnalysisResult): AnalysisEngineRunResult {
  return Object.freeze({ ok: true, value });
}

function querySql(metric: AnalysisMetricRequest): string {
  if (metric.aggregate === "COUNT_ROWS") {
    return `SELECT COUNT(*) AS result_value FROM main.${ANALYSIS_TABLE_NAME}`;
  }
  if (metric.column === undefined) {
    // validateAnalysisInput 已保证 SUM 必须携带 column；此处仅为类型收窄。
    throw new Error("analysis-engine internal invariant: SUM metric requires column");
  }
  return `SELECT SUM(CAST("${metric.column}" AS DOUBLE)) AS result_value FROM main.${ANALYSIS_TABLE_NAME}`;
}

function readScalar(table: QueryResultTable): unknown {
  return table.getChild("result_value")?.get(0);
}

function toAccumulator(
  metric: AnalysisMetricRequest,
  raw: unknown,
): { ok: true; value: MetricAccumulator } | { ok: false } {
  if (metric.aggregate === "COUNT_ROWS") {
    const count =
      typeof raw === "bigint" ? Number(raw) : typeof raw === "number" ? raw : Number.NaN;
    if (!Number.isSafeInteger(count) || count < 0) {
      return { ok: false };
    }
    const created = createMetricAccumulator({
      metricId: metric.metricId,
      aggregate: "COUNT_ROWS",
      mergeOrdinal: 0,
      count,
    });
    if (!created.ok) {
      return { ok: false };
    }
    return { ok: true, value: created.value };
  }

  const sum = typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(sum)) {
    return { ok: false };
  }
  const created = createMetricAccumulator({
    metricId: metric.metricId,
    aggregate: "SUM",
    mergeOrdinal: 0,
    sum,
  });
  if (!created.ok) {
    return { ok: false };
  }
  return { ok: true, value: created.value };
}

/**
 * 执行分析探针。先校验输入，再按顺序执行每个指标，最后返回与输入顺序一致
 * 的版本化 accumulator 列表；任何失败路径都保留封闭错误并释放 DuckDB 连接。
 */
export async function runAnalysis(
  input: unknown,
  options?: Readonly<{ signal?: AbortSignal }>,
): Promise<AnalysisEngineRunResult> {
  const validation = validateAnalysisInput(input);
  if (!validation.ok) {
    return validation;
  }
  const validated: AnalysisInput = validation.value;

  if (isAborted(options?.signal)) {
    return Object.freeze({ ok: false, error: createAnalysisCancelledError() });
  }

  let db: Awaited<ReturnType<typeof createDuckDB>>;
  try {
    db = await createDuckDB(DUCKDB_WASM_BUNDLES, new VoidLogger(), NODE_RUNTIME);
  } catch {
    return Object.freeze({ ok: false, error: createEngineUnavailableError("wasm-load") });
  }

  let conn: {
    close(): void;
    insertArrowFromIPCStream(
      buffer: Uint8Array,
      options: { name: string; schema: string },
    ): void;
    query(text: string): QueryResultTable;
  } | null = null;

  try {
    try {
      await db.instantiate();
    } catch {
      return Object.freeze({
        ok: false,
        error: createEngineUnavailableError("wasm-instantiate"),
      });
    }
    try {
      db.open({ path: ":memory:" });
    } catch {
      return Object.freeze({ ok: false, error: createEngineUnavailableError("db-open") });
    }
    if (isAborted(options?.signal)) {
      return Object.freeze({ ok: false, error: createAnalysisCancelledError() });
    }
    try {
      conn = db.connect();
    } catch {
      return Object.freeze({ ok: false, error: createEngineUnavailableError("connect") });
    }

    try {
      conn.insertArrowFromIPCStream(validated.arrow, {
        name: ANALYSIS_TABLE_NAME,
        schema: "main",
      });
    } catch {
      return Object.freeze({ ok: false, error: createExecutionFailedError("insert") });
    }

    const accumulators: MetricAccumulator[] = [];
    for (const metric of validated.metrics) {
      if (isAborted(options?.signal)) {
        return Object.freeze({ ok: false, error: createAnalysisCancelledError() });
      }
      let table: QueryResultTable;
      try {
        table = conn.query(querySql(metric));
      } catch {
        return Object.freeze({ ok: false, error: createExecutionFailedError("query") });
      }
      const converted = toAccumulator(metric, readScalar(table));
      if (!converted.ok) {
        return Object.freeze({
          ok: false,
          error: createExecutionFailedError(
            metric.aggregate === "SUM" ? "non-finite" : "parse",
          ),
        });
      }
      accumulators.push(converted.value);
    }

    return success(
      Object.freeze({
        schemaVersion: ANALYSIS_ENGINE_SCHEMA_VERSION,
        requestId: validated.requestId,
        accumulators: Object.freeze(accumulators),
      }),
    );
  } finally {
    if (conn !== null) {
      try {
        conn.close();
      } catch {
        // 关闭失败不掩盖已确定的返回结果；DuckDB reset 仍会释放实例。
      }
    }
    try {
      db.reset();
    } catch {
      // 同上的释放兜底。
    }
  }
}