/**
 * M0-030：LocalAnalysis 运行的进度/取消状态机。
 *
 * 状态机只允许显式合法迁移；终态（completed/rejected/cancelled）不可再迁移。
 * 取消通过 AbortSignal 表达，最终落到稳定的 LOCAL_ANALYSIS_CANCELLED 错误。
 */
import type { Result } from "@datapulse/domain";
import {
  createStateTransitionInvalidError,
  type StateTransitionInvalidError,
} from "./errors.js";
import type { LocalAnalysisProgressPhase } from "./message.js";

export const LOCAL_ANALYSIS_RUN_STATES = Object.freeze({
  notStarted: "not-started",
  preparing: "preparing",
  evaluating: "evaluating",
  finalizing: "finalizing",
  completed: "completed",
  rejected: "rejected",
  cancelled: "cancelled",
} as const);

export type LocalAnalysisRunState =
  (typeof LOCAL_ANALYSIS_RUN_STATES)[keyof typeof LOCAL_ANALYSIS_RUN_STATES];

/** 上报给调用方的进度阶段，排除仅内部使用的 not-started。 */
export type LocalAnalysisRunPhase = Exclude<LocalAnalysisRunState, "not-started">;

const LEGAL_TRANSITIONS: Readonly<Record<LocalAnalysisRunState, readonly LocalAnalysisRunState[]>> =
  Object.freeze({
    "not-started": Object.freeze(["preparing", "cancelled"] as const),
    preparing: Object.freeze([
      "evaluating",
      "rejected",
      "cancelled",
    ] as const),
    evaluating: Object.freeze(["finalizing", "rejected", "cancelled"] as const),
    finalizing: Object.freeze(["completed", "rejected", "cancelled"] as const),
    completed: Object.freeze([]),
    rejected: Object.freeze([]),
    cancelled: Object.freeze([]),
  });

export function canTransitionLocalAnalysisRunState(
  from: LocalAnalysisRunState,
  to: LocalAnalysisRunState,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export type LocalAnalysisStateTransitionResult = Result<
  LocalAnalysisRunState,
  StateTransitionInvalidError
>;

/**
 * 执行一次状态迁移。非法迁移返回封闭错误而不是抛出或静默忽略，
 * 便于上层把状态机错误当作可观测结果处理。
 */
export function transitionLocalAnalysisRunState(
  from: LocalAnalysisRunState,
  to: LocalAnalysisRunState,
): LocalAnalysisStateTransitionResult {
  if (canTransitionLocalAnalysisRunState(from, to)) {
    return Object.freeze({ ok: true, value: to });
  }
  return Object.freeze({
    ok: false,
    error: createStateTransitionInvalidError(from, to),
  });
}

export function isTerminalLocalAnalysisRunState(state: LocalAnalysisRunState): boolean {
  return state === "completed" || state === "rejected" || state === "cancelled";
}

/** 进度消息上报阶段必须是运行期阶段，不能是内部 not-started。 */
export function toProgressPhase(state: LocalAnalysisRunState): LocalAnalysisProgressPhase | null {
  if (state === "preparing" || state === "evaluating" || state === "finalizing") {
    return state;
  }
  return null;
}