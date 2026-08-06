/**
 * M0-030：LocalAnalysis seam 的冻结传输限额。
 *
 * 本文件只冻结 LocalAnalysis 的传输层上限（task ID、每请求 nonce、控制面消息
 * 大小、transferable 元数据），不冻结导入准入或分析结果语义。总 transferable
 * 字节上限由 ADR-0050 的 1.5 GiB 工作内存估算加上 Arrow 列式缓冲余量推导；
 * 实际数据上限仍由 import-engine 准入（M0-029）执行。
 */
export const LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION = "1.0.0" as const;

export const LOCAL_ANALYSIS_LIMITS = Object.freeze({
  /** task ID：调用方每次 run 生成，格式与长度均有界。 */
  taskIdMinLength: 8,
  taskIdMaxLength: 128,
  taskIdPattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,

  /** 每请求 nonce：调用方每次 run 生成，用于请求/进度/结果/错误/取消配对。 */
  nonceMinLength: 16,
  nonceMaxLength: 128,
  noncePattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,

  /** 控制面消息 JSON 字节上限；数据负载走 transferable，不进消息体。 */
  messageJsonMaxBytes: 64 * 1024,

  /** 请求内联负载（分析输入信封）JSON 字节上限。 */
  inlinePayloadMaxBytes: 16 * 1024 * 1024,

  /** transferable 元数据：数量、单项字节与总字节上限。 */
  transferableMaxCount: 64,
  transferableMaxItemBytes: 1024 * 1024 * 1024,
  transferableMaxTotalBytes: 2 * 1024 * 1024 * 1024,
} as const);

export const TRANSFERABLE_KINDS = Object.freeze([
  "array-buffer",
  "uint8-array",
] as const);

export type TransferableKind = (typeof TRANSFERABLE_KINDS)[number];

export type LocalAnalysisLimits = typeof LOCAL_ANALYSIS_LIMITS;