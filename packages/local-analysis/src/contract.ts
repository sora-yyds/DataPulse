/**
 * M0-030：Creator LocalAnalysis seam。
 *
 * `run(request, options) -> Promise<AnalysisResult>` 是创作端唯一面对的分析
 * 入口；BrowserWorkerAdapter（M0-031）与 InProcessTestAdapter 必须通过同一
 * contract suite。消息 Schema 由 `@datapulse/local-analysis/message` 受限
 * 子路径唯一拥有，本文件只冻结 seam 形状与结果类型。
 */
import type { Result } from "@datapulse/domain";
import type { LocalAnalysisError } from "./errors.js";
import type {
  AnalysisResultPayload,
  LocalAnalysisProgressMessage,
} from "./message.js";

export type { AnalysisResultPayload };

export type LocalAnalysisRunResult = Result<AnalysisResultPayload, LocalAnalysisError>;

export type LocalAnalysisRunnerOptions = Readonly<{
  signal?: AbortSignal;
  onProgress?: (progress: LocalAnalysisProgressMessage) => void;
}>;

/** M0 seam：`run(request, options) -> Promise<LocalAnalysisRunResult>`。 */
export type LocalAnalysisRunner = (
  request: unknown,
  options?: LocalAnalysisRunnerOptions,
) => Promise<LocalAnalysisRunResult>;

export interface LocalAnalysis {
  readonly run: LocalAnalysisRunner;
}