/**
 * M0-030：LocalAnalysis seam 的包根导出。
 *
 * 消息 Schema 与校验器由受限 export 子路径 `@datapulse/local-analysis/message`
 * 唯一拥有，包根不重新导出，防止主线程与 Worker 各自发明 DTO。
 */
export {
  LOCAL_ANALYSIS_LIMITS,
  LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
  TRANSFERABLE_KINDS,
  type LocalAnalysisLimits,
  type TransferableKind,
} from "./limits.js";

export {
  LOCAL_ANALYSIS_ERROR_CODES,
  createCancelledError,
  createInvalidRequestError,
  createStateTransitionInvalidError,
  createTransferLimitExceededError,
  createWorkerFailedError,
  isLocalAnalysisError,
  type CancelledError,
  type InvalidRequestError,
  type InvalidRequestReason,
  type LocalAnalysisError,
  type LocalAnalysisErrorCode,
  type StateTransitionInvalidError,
  type TransferLimitExceededError,
  type TransferLimitReason,
  type WorkerFailedError,
  type WorkerFailedReason,
} from "./errors.js";

export {
  LOCAL_ANALYSIS_RUN_STATES,
  canTransitionLocalAnalysisRunState,
  isTerminalLocalAnalysisRunState,
  toProgressPhase,
  transitionLocalAnalysisRunState,
  type LocalAnalysisRunPhase,
  type LocalAnalysisRunState,
  type LocalAnalysisStateTransitionResult,
} from "./state.js";

export {
  type AnalysisResultPayload,
  type LocalAnalysis,
  type LocalAnalysisRunResult,
  type LocalAnalysisRunner,
  type LocalAnalysisRunnerOptions,
} from "./contract.js";

export { createInProcessTestAdapter } from "./in-process-adapter.js";

export {
  createBrowserWorkerAdapter,
  type BrowserWorkerAdapterConfig,
  type BrowserWorkerConstructor,
  type BrowserWorkerLike,
} from "./browser-worker-adapter.js";