/**
 * M0-031：LocalAnalysis BrowserWorkerAdapter。
 *
 * 主线程侧 seam：在交付任何原始数据前，从固定 Creator 资源路径预取固定 WASM、
 * 校验内容哈希，并以结构化克隆经 bootstrap 消息传入 Worker；Worker 自身绝不拉取
 * 资源。每次 run 独立派生并最终终止单文件模块 Worker，取消/失败/完成均释放
 * transferable 与 Worker 引用。通信只走版本化消息 Schema 的传输信封。
 */
import type { LocalAnalysis, LocalAnalysisRunResult, LocalAnalysisRunnerOptions } from "./contract.js";
import {
  LOCAL_ANALYSIS_ERROR_CODES,
  createCancelledError,
  createInvalidRequestError,
  createStateTransitionInvalidError,
  createWorkerFailedError,
  type InvalidRequestReason,
  type LocalAnalysisError,
  type WorkerFailedReason,
} from "./errors.js";
import {
  createLocalAnalysisBootstrapMessage,
  createLocalAnalysisCancelMessage,
  validateLocalAnalysisMessage,
  validateLocalAnalysisRequest,
  type AnalysisNonce,
  type AnalysisTaskId,
  type LocalAnalysisMessage,
  type LocalAnalysisProgressMessage,
  type LocalAnalysisTransportEnvelope,
  type ValidatedLocalAnalysisRequest,
} from "./message.js";
import { LOCAL_ANALYSIS_LIMITS } from "./limits.js";

const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 10_000;

export type BrowserWorkerLike = Readonly<{
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  terminate(): void;
  addEventListener(
    type: "message" | "error",
    listener: (event: { data?: unknown; error?: unknown }) => void,
  ): void;
}>;

export type BrowserWorkerConstructor = new (
  scriptUrl: string | URL,
  options?: Readonly<{ type: "module" }>,
) => BrowserWorkerLike;

export type BrowserWorkerAdapterConfig = Readonly<{
  /** 固定静态 Worker 脚本 URL（无查询参数）。 */
  workerScriptUrl: string | URL;
  /** 固定 WASM 资源：主线程在交付原始数据前预取并校验 SHA-256。 */
  wasm: Readonly<{
    resourceUrl: string | URL;
    sha256: string;
  }>;
  /** 浏览器 Worker 构造器；缺省用 globalThis.Worker，测试注入 node:worker_threads 包装。 */
  workerCtor?: BrowserWorkerConstructor;
  bootstrapTimeoutMs?: number;
}>;

const wasmCache = new Map<string, ArrayBuffer>();

function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

type WasmObtainResult =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; error: LocalAnalysisError };

async function obtainValidatedWasm(
  config: BrowserWorkerAdapterConfig,
): Promise<WasmObtainResult> {
  const cached = wasmCache.get(config.wasm.sha256);
  if (cached !== undefined) {
    return { ok: true, bytes: cached };
  }
  let response: Response;
  try {
    response = await fetch(config.wasm.resourceUrl);
  } catch {
    return { ok: false, error: createWorkerFailedError("wasm-fetch-failed") };
  }
  if (!response.ok) {
    return { ok: false, error: createWorkerFailedError("wasm-fetch-failed") };
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch {
    return { ok: false, error: createWorkerFailedError("wasm-fetch-failed") };
  }
  if (
    bytes.byteLength <= 0 ||
    bytes.byteLength > LOCAL_ANALYSIS_LIMITS.bootstrapWasmMaxBytes
  ) {
    return { ok: false, error: createWorkerFailedError("wasm-hash-mismatch") };
  }
  const digest = await sha256Hex(bytes);
  if (digest !== config.wasm.sha256) {
    return { ok: false, error: createWorkerFailedError("wasm-hash-mismatch") };
  }
  wasmCache.set(config.wasm.sha256, bytes);
  return { ok: true, bytes };
}

function spawnWorker(config: BrowserWorkerAdapterConfig): BrowserWorkerLike | null {
  const ctor = config.workerCtor ?? (globalThis as { Worker?: BrowserWorkerConstructor }).Worker;
  if (ctor === undefined) {
    return null;
  }
  try {
    return new ctor(config.workerScriptUrl, { type: "module" });
  } catch {
    return null;
  }
}

function cancelledResult(): LocalAnalysisRunResult {
  return Object.freeze({ ok: false, error: createCancelledError() });
}

function isInvalidRequestReason(value: unknown): value is InvalidRequestReason {
  const reasons = new Set<InvalidRequestReason>([
    "type",
    "shape",
    "schema-version",
    "kind",
    "task-id",
    "nonce",
    "message-size",
    "transferable",
    "transferable-count",
    "transferable-bytes",
    "payload-size",
    "wasm",
    "phase",
    "result",
    "error",
  ]);
  return typeof value === "string" && reasons.has(value as InvalidRequestReason);
}

function isWorkerFailedReason(value: unknown): value is WorkerFailedReason {
  const reasons = new Set<WorkerFailedReason>([
    "wasm-fetch-failed",
    "wasm-hash-mismatch",
    "worker-unreachable",
    "worker-terminated",
    "worker-invalid-message",
  ]);
  return typeof value === "string" && reasons.has(value as WorkerFailedReason);
}

function mapWorkerError(
  error: Readonly<{ code: string; details: Readonly<Record<string, unknown>> }>,
): LocalAnalysisError | null {
  const reason = error.details["reason"];
  switch (error.code) {
    case LOCAL_ANALYSIS_ERROR_CODES.invalidRequest:
      return isInvalidRequestReason(reason)
        ? createInvalidRequestError(reason)
        : null;
    case LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid: {
      const from = error.details["from"];
      const to = error.details["to"];
      if (typeof from !== "string" || typeof to !== "string") {
        return null;
      }
      return createStateTransitionInvalidError(from, to);
    }
    case LOCAL_ANALYSIS_ERROR_CODES.cancelled:
      return createCancelledError();
    case LOCAL_ANALYSIS_ERROR_CODES.workerFailed:
      return isWorkerFailedReason(reason) ? createWorkerFailedError(reason) : null;
    default:
      return null;
  }
}

function createTransportEnvelope(
  message: LocalAnalysisMessage,
  buffers: readonly ArrayBuffer[],
): LocalAnalysisTransportEnvelope {
  return Object.freeze({ message, buffers: Object.freeze(buffers) });
}

export function createBrowserWorkerAdapter(
  config: BrowserWorkerAdapterConfig,
): LocalAnalysis {
  if (!isSha256Hex(config.wasm.sha256)) {
    throw new RangeError("local-analysis wasm sha256 must be 64 lowercase hex chars");
  }
  return Object.freeze({
    run: (request: unknown, options?: LocalAnalysisRunnerOptions) =>
      runBrowserWorkerAdapter(config, request, options),
  });
}

async function runBrowserWorkerAdapter(
  config: BrowserWorkerAdapterConfig,
  request: unknown,
  options?: LocalAnalysisRunnerOptions,
): Promise<LocalAnalysisRunResult> {
  const signal = options?.signal;
  const onProgress = options?.onProgress;
  if (signal?.aborted === true) {
    return cancelledResult();
  }

  const validated = validateLocalAnalysisRequest(request);
  if (!validated.ok) {
    return Object.freeze({ ok: false, error: validated.error });
  }
  const req = validated.value;

  const wasm = await obtainValidatedWasm(config);
  if (!wasm.ok) {
    return Object.freeze({ ok: false, error: wasm.error });
  }

  const worker = spawnWorker(config);
  if (worker === null) {
    return Object.freeze({
      ok: false,
      error: createWorkerFailedError("worker-unreachable"),
    });
  }

  let settled = false;
  let bootstrapAcknowledged = false;
  let resolveRun!: (result: LocalAnalysisRunResult) => void;
  const runPromise = new Promise<LocalAnalysisRunResult>((resolve) => {
    resolveRun = resolve;
  });

  let resolveBootstrapAck!: () => void;
  const bootstrapAck = new Promise<void>((resolve) => {
    resolveBootstrapAck = resolve;
  });

  let resolveWorkerError!: () => void;
  const workerErrorOccurred = new Promise<void>((resolve) => {
    resolveWorkerError = resolve;
  });

  let resolveAbort!: () => void;
  const abortOccurred = new Promise<void>((resolve) => {
    resolveAbort = resolve;
  });

  const finish = (result: LocalAnalysisRunResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    worker.terminate();
    signal?.removeEventListener("abort", onAbort);
    resolveRun(result);
  };

  const onAbort = (): void => {
    if (!settled) {
      const cancelMessage = createLocalAnalysisCancelMessage(req.taskId, req.nonce);
      try {
        worker.postMessage(createTransportEnvelope(cancelMessage, []));
      } catch {
        // worker 已失效；terminate 是权威释放
      }
      resolveAbort();
      finish(cancelledResult());
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const handleMessage = (event: { data?: unknown }): void => {
    if (settled) {
      return;
    }
    const envelope = event.data as unknown;
    if (typeof envelope !== "object" || envelope === null) {
      finish(
        Object.freeze({
          ok: false,
          error: createWorkerFailedError("worker-invalid-message"),
        }),
      );
      return;
    }
    const record = envelope as Record<string, unknown>;
    if (
      typeof record["message"] !== "object" ||
      record["message"] === null ||
      !Array.isArray(record["buffers"])
    ) {
      finish(
        Object.freeze({
          ok: false,
          error: createWorkerFailedError("worker-invalid-message"),
        }),
      );
      return;
    }
    const messageResult = validateLocalAnalysisMessage(record["message"]);
    if (!messageResult.ok) {
      finish(
        Object.freeze({
          ok: false,
          error: createWorkerFailedError("worker-invalid-message"),
        }),
      );
      return;
    }
    const message = messageResult.value;
    if (message.kind === "bootstrap" || message.kind === "request" || message.kind === "cancel") {
      finish(
        Object.freeze({
          ok: false,
          error: createWorkerFailedError("worker-invalid-message"),
        }),
      );
      return;
    }
    if (
      message.taskId !== req.taskId ||
      message.nonce !== req.nonce
    ) {
      return;
    }
    if (message.kind === "progress") {
      if (message.phase === "preparing") {
        bootstrapAcknowledged = true;
        resolveBootstrapAck();
      }
      onProgress?.(message);
      return;
    }
    if (message.kind === "result") {
      finish(Object.freeze({ ok: true, value: message.result }));
      return;
    }
    const mapped = mapWorkerError(message.error);
    if (mapped === null) {
      finish(
        Object.freeze({
          ok: false,
          error: createWorkerFailedError("worker-invalid-message"),
        }),
      );
      return;
    }
    finish(Object.freeze({ ok: false, error: mapped }));
  };

  const handleWorkerError = (): void => {
    resolveWorkerError();
    finish(
      Object.freeze({
        ok: false,
        error: createWorkerFailedError("worker-terminated"),
      }),
    );
  };

  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", handleWorkerError);

  // 1) Bootstrap：交付任何原始数据前，把预取并校验过的固定 WASM 克隆给 Worker。
  const wasmBuffer = wasm.bytes.slice(0);
  const bootstrapMessage = createLocalAnalysisBootstrapMessage(
    req.taskId,
    req.nonce,
    wasm.bytes.byteLength,
    config.wasm.sha256,
  );
  try {
    worker.postMessage(createTransportEnvelope(bootstrapMessage, [wasmBuffer]), [wasmBuffer]);
  } catch {
  
    finish(
      Object.freeze({
        ok: false,
        error: createWorkerFailedError("worker-unreachable"),
      }),
    );
  }

  const bootstrapTimeoutMs = config.bootstrapTimeoutMs ?? DEFAULT_BOOTSTRAP_TIMEOUT_MS;
  let bootstrapTimer: ReturnType<typeof setTimeout> | undefined;
  const bootstrapTimeout = new Promise<void>((resolve) => {
    bootstrapTimer = setTimeout(resolve, bootstrapTimeoutMs);
  });
  await Promise.race([bootstrapAck, workerErrorOccurred, abortOccurred, bootstrapTimeout]);
  if (bootstrapTimer !== undefined) {
    clearTimeout(bootstrapTimer);
  }
  if (settled) {
    return runPromise;
  }
  if (!bootstrapAcknowledged) {
    // bootstrap ACK missing (timeout or unassociated): treat as unreachable worker.
    finish(
      Object.freeze({
        ok: false,
        error: createWorkerFailedError("worker-unreachable"),
      }),
    );
    return runPromise;
  }

  // 2) Request: after bootstrap ACK, deliver the analysis request (raw data descriptors).
  try {
    worker.postMessage(createTransportEnvelope(req, []));
  } catch {
    finish(
      Object.freeze({
        ok: false,
        error: createWorkerFailedError("worker-unreachable"),
      }),
    );
  }

  return runPromise;
}