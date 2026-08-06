/**
 * M0-030：InProcessTestAdapter。
 *
 * 在进程内执行 LocalAnalysis seam：校验请求 → 按冻结状态机上报进度 → 返回
 * 有界确定性传输摘要结果；AbortSignal 任意时刻取消都落到稳定
 * LOCAL_ANALYSIS_CANCELLED。本阶段只冻结消息/状态/限额契约，不实现分析计算
 * （真实分析由 M0-033 analysis-engine 提供、M0-056 在 Worker 内组合）。
 */
import type { LocalAnalysis, LocalAnalysisRunResult, LocalAnalysisRunnerOptions } from "./contract.js";
import { createCancelledError } from "./errors.js";
import {
  LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
  createLocalAnalysisProgressMessage,
  utf8ByteLength,
  validateLocalAnalysisRequest,
  type LocalAnalysisObservedProgress,
  type LocalAnalysisProgressMessage,
  type ValidatedLocalAnalysisRequest,
} from "./message.js";
import {
  transitionLocalAnalysisRunState,
  type LocalAnalysisRunState,
} from "./state.js";

export function createInProcessTestAdapter(): LocalAnalysis {
  return Object.freeze({ run: runInProcessTest });
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function emitProgress(
  onProgress: ((progress: LocalAnalysisProgressMessage) => void) | undefined,
  request: ValidatedLocalAnalysisRequest,
  state: LocalAnalysisRunState,
  observed: LocalAnalysisObservedProgress,
): void {
  if (onProgress === undefined) {
    return;
  }
  const phase =
    state === "preparing" ? "preparing" : state === "evaluating" ? "evaluating" : "finalizing";
  onProgress(
    createLocalAnalysisProgressMessage(request.taskId, request.nonce, phase, observed),
  );
}

async function runInProcessTest(
  request: unknown,
  options?: LocalAnalysisRunnerOptions,
): Promise<LocalAnalysisRunResult> {
  const signal = options?.signal;
  const onProgress = options?.onProgress;

  const validated = validateLocalAnalysisRequest(request);
  if (!validated.ok) {
    return Object.freeze({ ok: false, error: validated.error });
  }
  const req = validated.value;

  let state: LocalAnalysisRunState = "not-started";
  if (isAborted(signal)) {
    return Object.freeze({ ok: false, error: createCancelledError() });
  }

  const transferableCount = req.transferables.length;
  const transferableBytes = req.transferables.reduce(
    (sum, descriptor) => sum + descriptor.byteLength,
    0,
  );
  const payloadBytes =
    req.payload === undefined ? 0 : utf8ByteLength(JSON.stringify(req.payload));
  const observed: LocalAnalysisObservedProgress = Object.freeze({
    transferableCount,
    transferableBytes,
    payloadBytes,
  });

  for (const next of ["preparing", "evaluating", "finalizing"] as const) {
    const transition = transitionLocalAnalysisRunState(state, next);
    if (!transition.ok) {
      return Object.freeze({ ok: false, error: transition.error });
    }
    state = transition.value;
    emitProgress(onProgress, req, state, observed);
    if (isAborted(signal)) {
      const cancel = transitionLocalAnalysisRunState(state, "cancelled");
      state = cancel.ok ? cancel.value : state;
      return Object.freeze({ ok: false, error: createCancelledError() });
    }
  }

  const complete = transitionLocalAnalysisRunState(state, "completed");
  if (!complete.ok) {
    return Object.freeze({ ok: false, error: complete.error });
  }
  state = complete.value;

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
      kind: "transport-summary",
      transferableCount,
      transferableBytes,
      payloadBytes,
    }),
  });
}