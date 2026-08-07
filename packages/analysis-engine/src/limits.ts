/**
 * M0-033：analysis-engine 探针的冻结输入限额。
 *
 * 本文件只冻结 AnalysisInput 的边界（request ID、Arrow IPC 流字节、指标请求
 * 数量、SUM 列名），不冻结导入准入或分析结果语义。Arrow IPC 单项字节上限与
 * @datapulse/local-analysis 的 transferable 单项上限（1 GiB）对齐；真实数据
 * 总量仍由 import-engine 准入（M0-029 / ADR-0050）执行。
 */
export const ANALYSIS_ENGINE_SCHEMA_VERSION = "1.0.0" as const;

export const ANALYSIS_ENGINE_LIMITS = Object.freeze({
  /** request ID：调用方每次 run 生成，格式与长度均有界。 */
  requestIdMinLength: 8,
  requestIdMaxLength: 128,
  requestIdPattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,

  /** 单个 AnalysisInput 携带的 Arrow IPC 流字节上限（与 transferable 单项上限对齐）。 */
  arrowIpcMaxBytes: 1024 * 1024 * 1024,

  /** 单次 run 的指标请求数量上限。 */
  metricsMinCount: 1,
  metricsMaxCount: 64,

  /** SUM 列名：严格标识符，禁止任何 SQL 注入字符；长度有界。 */
  columnNameMinLength: 1,
  columnNameMaxLength: 64,
  columnNamePattern: /^[A-Za-z_][A-Za-z0-9_]*$/u,
} as const);

export type AnalysisEngineLimits = typeof ANALYSIS_ENGINE_LIMITS;