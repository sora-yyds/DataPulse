/**
 * M0-033：analysis-engine 公共 seam。
 *
 * 只导出冻结的契约、限额、稳定错误与 runAnalysis 探针；AnalysisResult 只
 * 携带版本化 MetricAccumulator，不暴露任何原始数据读取能力。
 */
export {
  ANALYSIS_ENGINE_ERROR_CODES,
  createAnalysisCancelledError,
  createEngineUnavailableError,
  createExecutionFailedError,
  createInputLimitExceededError,
  createInvalidInputError,
  isAnalysisEngineError,
  type AnalysisEngineError,
  type AnalysisEngineErrorCode,
  type CancelledError,
  type EngineUnavailableError,
  type EngineUnavailableReason,
  type ExecutionFailedError,
  type ExecutionFailedReason,
  type InputLimitExceededError,
  type InputLimitReason,
  type InvalidInputError,
  type InvalidInputReason,
} from "./errors.js";

export {
  ANALYSIS_ENGINE_LIMITS,
  ANALYSIS_ENGINE_SCHEMA_VERSION,
  type AnalysisEngineLimits,
} from "./limits.js";

export {
  isAnalysisRequestId,
  validateAnalysisInput,
  type AnalysisAggregate,
  type AnalysisEngineRunResult,
  type AnalysisInput,
  type AnalysisInputValidationResult,
  type AnalysisMetricRequest,
  type AnalysisRequestId,
  type AnalysisResult,
  type AnalysisRunner,
  type AnalysisRunnerOptions,
} from "./contract.js";

export { runAnalysis } from "./engine.js";