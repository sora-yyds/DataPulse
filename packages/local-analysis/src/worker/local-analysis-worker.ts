/**
 * M0-031：LocalAnalysis 单文件模块 Worker 外壳。
 *
 * 源码复用包内共享校验与状态机；构建产物为无运行时 import 的单文件模块
 * （见 vite.config.mts）。本 Worker 不自行 fetch、动态 import、importScripts
 * 或嵌套 Worker；固定 WASM 由主线程预取并校验内容哈希后经 bootstrap 消息
 * 结构化克隆传入，本 Worker 仅重验字节长度与 SHA-256 后按状态机上报警。
 * 通信只走版本化消息 Schema 的传输信封（LocalAnalysisTransportEnvelope）。
 */
import { LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION } from "../limits.js";
import { LOCAL_ANALYSIS_ERROR_CODES } from "../errors.js";
import {
  createLocalAnalysisProgressMessage,
  createLocalAnalysisResultMessage,
  validateLocalAnalysisMessage,
  utf8ByteLength,
  type AnalysisNonce,
  type AnalysisTaskId,
  type LocalAnalysisCancelMessage,
  type LocalAnalysisErrorMessage,
  type LocalAnalysisMessage,
  type LocalAnalysisObservedProgress,
  type LocalAnalysisRequestMessage,
  type LocalAnalysisTransportEnvelope,
  type ValidatedLocalAnalysisBootstrap,
  type ValidatedLocalAnalysisRequest,
} from "../message.js";
import {
  transitionLocalAnalysisRunState,
  type LocalAnalysisRunState,
} from "../state.js";

type WorkerScope = Readonly<{
  postMessage(value: unknown, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
}>;

const workerScope = globalThis as unknown as WorkerScope;

const bootstrapState: LocalAnalysisRunState = "preparing";

let runState: LocalAnalysisRunState = "not-started";
let runTaskId: AnalysisTaskId | null = null;
let runNonce: AnalysisNonce | null = null;

function postEnvelope(message: LocalAnalysisMessage): void {
  const envelope: LocalAnalysisTransportEnvelope = Object.freeze({
    message,
    buffers: Object.freeze([]),
  });
  workerScope.postMessage(envelope);
}

function postErrorMessage(
  taskId: AnalysisTaskId,
  nonce: AnalysisNonce,
  code: string,
  details: Readonly<Record<string, unknown>>,
): void {
  const errorMessage: LocalAnalysisErrorMessage = Object.freeze({
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "error",
    taskId,
    nonce,
    error: Object.freeze({ code, details: Object.freeze(details) }),
  });
  postEnvelope(errorMessage);
}

function isEnvelope(value: unknown): value is LocalAnalysisTransportEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record["message"] !== undefined && Array.isArray(record["buffers"]);
}

function isBoundedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function observedFromDescriptors(
  transferables: readonly Readonly<{ kind: string; byteLength: number }>[],
  payload: unknown,
): LocalAnalysisObservedProgress {
  const transferableBytes = transferables.reduce(
    (sum, descriptor) => sum + descriptor.byteLength,
    0,
  );
  const payloadBytes =
    payload === undefined ? 0 : utf8ByteLength(JSON.stringify(payload));
  return Object.freeze({
    transferableCount: transferables.length,
    transferableBytes,
    payloadBytes,
  });
}

async function verifyWasmReceipt(
  buffers: readonly ArrayBuffer[],
  message: ValidatedLocalAnalysisBootstrap,
): Promise<boolean> {
  const buffer = buffers[0];
  if (
    buffer === undefined ||
    buffer.byteLength !== message.wasm.byteLength ||
    message.transferables.length !== 1 ||
    message.transferables[0]?.kind !== "array-buffer" ||
    message.transferables[0]?.byteLength !== message.wasm.byteLength
  ) {
    return false;
  }
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return hex === message.wasm.sha256;
}

async function handleBootstrapAsync(
  message: ValidatedLocalAnalysisBootstrap,
  buffers: readonly ArrayBuffer[],
): Promise<void> {
  if (runState !== "not-started" || runTaskId !== null || runNonce !== null) {
    postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid, {
      reason: "invalid-transition",
      from: runState,
      to: "bootstrap",
    });
    return;
  }
  const ok = await verifyWasmReceipt(buffers, message);
  if (!ok) {
    postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.workerFailed, {
      reason: "wasm-hash-mismatch",
    });
    return;
  }
  const transition = transitionLocalAnalysisRunState(runState, bootstrapState);
  if (!transition.ok) {
    postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid, {
      reason: "invalid-transition",
      from: runState,
      to: bootstrapState,
    });
    return;
  }
  runState = transition.value;
  runTaskId = message.taskId;
  runNonce = message.nonce;
  postEnvelope(
    createLocalAnalysisProgressMessage(message.taskId, message.nonce, "preparing", {
      transferableCount: 1,
      transferableBytes: message.wasm.byteLength,
      payloadBytes: 0,
    }),
  );
}

function handleRequest(message: ValidatedLocalAnalysisRequest): void {
  if (runTaskId === null || runNonce === null) {
    postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid, {
      reason: "invalid-transition",
      from: runState,
      to: "evaluating",
    });
    return;
  }
  const observed = observedFromDescriptors(message.transferables, message.payload);
  const evaluating = transitionLocalAnalysisRunState(runState, "evaluating");
  if (!evaluating.ok) {
    postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid, {
      reason: "invalid-transition",
      from: runState,
      to: "evaluating",
    });
    return;
  }
  runState = evaluating.value;
  postEnvelope(createLocalAnalysisProgressMessage(message.taskId, message.nonce, "evaluating", observed));

  const finalizing = transitionLocalAnalysisRunState(runState, "finalizing");
  if (!finalizing.ok) {
    postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid, {
      reason: "invalid-transition",
      from: runState,
      to: "finalizing",
    });
    return;
  }
  runState = finalizing.value;
  postEnvelope(createLocalAnalysisProgressMessage(message.taskId, message.nonce, "finalizing", observed));

  const completed = transitionLocalAnalysisRunState(runState, "completed");
  if (!completed.ok) {
    postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid, {
      reason: "invalid-transition",
      from: runState,
      to: "completed",
    });
    return;
  }
  runState = completed.value;
  postEnvelope(
    createLocalAnalysisResultMessage(message.taskId, message.nonce, {
      schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
      kind: "transport-summary",
      transferableCount: observed.transferableCount,
      transferableBytes: observed.transferableBytes,
      payloadBytes: observed.payloadBytes,
    }),
  );
}

function handleCancel(message: LocalAnalysisCancelMessage): void {
  if (runState === "completed" || runState === "rejected" || runState === "cancelled") {
    return;
  }
  runState = "cancelled";
  postErrorMessage(message.taskId, message.nonce, LOCAL_ANALYSIS_ERROR_CODES.cancelled, {
    reason: "abort-signal",
  });
}

async function handleEnvelope(envelope: unknown): Promise<void> {
  if (!isEnvelope(envelope)) {
    return;
  }
  const validated = validateLocalAnalysisMessage(envelope.message);
  if (!validated.ok) {
    const raw = envelope.message as Record<string, unknown>;
    const taskId = raw["taskId"];
    const nonce = raw["nonce"];
    if (
      typeof taskId === "string" &&
      typeof nonce === "string" &&
      validated.error.details.reason !== undefined
    ) {
      postErrorMessage(taskId as AnalysisTaskId, nonce as AnalysisNonce, LOCAL_ANALYSIS_ERROR_CODES.invalidRequest, {
        reason: validated.error.details.reason,
      });
    }
    return;
  }
  const message = validated.value;
  if (message.kind === "bootstrap") {
    await handleBootstrapAsync(message, envelope.buffers);
    return;
  }
  if (message.kind === "request") {
    handleRequest(message);
    return;
  }
  if (message.kind === "cancel") {
    handleCancel(message);
  }
}

let processing: Promise<void> = Promise.resolve();

workerScope.addEventListener("message", (event: { data: unknown }) => {
  const envelope = event.data;
  processing = processing.then(() => handleEnvelope(envelope));
});