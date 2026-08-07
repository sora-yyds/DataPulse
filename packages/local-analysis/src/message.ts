/**
 * M0-030：LocalAnalysis 唯一版本化消息 Schema 与运行时校验。
 *
 * 本文件由受限 export 子路径 `@datapulse/local-analysis/message` 唯一拥有；
 * 包根不导出这些类型与校验器，防止主线程与 Worker 各自发明 DTO。校验是
 * 确定性、无网络、无随机源的手写规则，与
 * `src/schema/local-analysis-message-v1.schema.json` 的机器规范保持一致。
 */
import type { Result } from "@datapulse/domain";
import {
  createInvalidRequestError,
  type InvalidRequestError,
  type InvalidRequestReason,
} from "./errors.js";
import {
  LOCAL_ANALYSIS_LIMITS,
  LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
  TRANSFERABLE_KINDS,
  type TransferableKind,
} from "./limits.js";

export { LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION };

declare const analysisTaskIdBrand: unique symbol;

export type AnalysisTaskId = string & {
  readonly [analysisTaskIdBrand]: true;
};

declare const analysisNonceBrand: unique symbol;

export type AnalysisNonce = string & {
  readonly [analysisNonceBrand]: true;
};

export function isAnalysisTaskId(value: unknown): value is AnalysisTaskId {
  return (
    typeof value === "string" &&
    value.length >= LOCAL_ANALYSIS_LIMITS.taskIdMinLength &&
    value.length <= LOCAL_ANALYSIS_LIMITS.taskIdMaxLength &&
    LOCAL_ANALYSIS_LIMITS.taskIdPattern.test(value)
  );
}

export function isAnalysisNonce(value: unknown): value is AnalysisNonce {
  return (
    typeof value === "string" &&
    value.length >= LOCAL_ANALYSIS_LIMITS.nonceMinLength &&
    value.length <= LOCAL_ANALYSIS_LIMITS.nonceMaxLength &&
    LOCAL_ANALYSIS_LIMITS.noncePattern.test(value)
  );
}

export type TransferableDescriptor = Readonly<{
  kind: TransferableKind;
  byteLength: number;
}>;

export type LocalAnalysisProgressPhase =
  | "preparing"
  | "evaluating"
  | "finalizing";

export type LocalAnalysisObservedProgress = Readonly<{
  transferableCount: number;
  transferableBytes: number;
  payloadBytes: number;
}>;

export type LocalAnalysisRequestMessage = Readonly<{
  schemaVersion: typeof LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION;
  kind: "request";
  taskId: AnalysisTaskId;
  nonce: AnalysisNonce;
  transferables: readonly TransferableDescriptor[];
  payload?: unknown;
}>;

export type LocalAnalysisProgressMessage = Readonly<{
  schemaVersion: typeof LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION;
  kind: "progress";
  taskId: AnalysisTaskId;
  nonce: AnalysisNonce;
  phase: LocalAnalysisProgressPhase;
  observed: LocalAnalysisObservedProgress;
}>;

export type AnalysisResultPayload = Readonly<{
  schemaVersion: typeof LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION;
  kind: "transport-summary";
  transferableCount: number;
  transferableBytes: number;
  payloadBytes: number;
}>;

export type LocalAnalysisResultMessage = Readonly<{
  schemaVersion: typeof LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION;
  kind: "result";
  taskId: AnalysisTaskId;
  nonce: AnalysisNonce;
  result: AnalysisResultPayload;
}>;

export type LocalAnalysisErrorMessage = Readonly<{
  schemaVersion: typeof LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION;
  kind: "error";
  taskId: AnalysisTaskId;
  nonce: AnalysisNonce;
  error: Readonly<{ code: string; details: Readonly<Record<string, unknown>> }>;
}>;

export type LocalAnalysisCancelMessage = Readonly<{
  schemaVersion: typeof LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION;
  kind: "cancel";
  taskId: AnalysisTaskId;
  nonce: AnalysisNonce;
}>;

export type LocalAnalysisBootstrapMessage = Readonly<{
  schemaVersion: typeof LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION;
  kind: "bootstrap";
  taskId: AnalysisTaskId;
  nonce: AnalysisNonce;
  transferables: readonly TransferableDescriptor[];
  wasm: Readonly<{ byteLength: number; sha256: string }>;
}>;

/** postMessage ?????message ???????buffers ?????????/????? */
export type LocalAnalysisTransportEnvelope = Readonly<{
  message: LocalAnalysisMessage;
  buffers: readonly ArrayBuffer[];
}>;

export type LocalAnalysisMessage =
  | LocalAnalysisBootstrapMessage
  | LocalAnalysisRequestMessage
  | LocalAnalysisProgressMessage
  | LocalAnalysisResultMessage
  | LocalAnalysisErrorMessage
  | LocalAnalysisCancelMessage;

declare const validatedLocalAnalysisMessageBrand: unique symbol;

export type ValidatedLocalAnalysisMessage = Readonly<LocalAnalysisMessage> & {
  readonly [validatedLocalAnalysisMessageBrand]: true;
};

export type ValidatedLocalAnalysisRequest = Readonly<LocalAnalysisRequestMessage> & {
  readonly [validatedLocalAnalysisMessageBrand]: true;
};

export type ValidatedLocalAnalysisBootstrap = Readonly<LocalAnalysisBootstrapMessage> & {
  readonly [validatedLocalAnalysisMessageBrand]: true;
};

export type LocalAnalysisMessageValidationResult = Result<
  ValidatedLocalAnalysisMessage,
  InvalidRequestError
>;

export type LocalAnalysisRequestValidationResult = Result<
  ValidatedLocalAnalysisRequest,
  InvalidRequestError
>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 确定性 UTF-8 字节长度，用于控制面消息与内联负载的有界校验。 */
export function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) as number;
    if (codePoint <= 0x7f) {
      length += 1;
    } else if (codePoint <= 0x7ff) {
      length += 2;
    } else if (codePoint <= 0xffff) {
      length += 3;
    } else {
      length += 4;
    }
  }
  return length;
}

function serializedUtf8ByteLength(value: unknown): number | null {
  try {
    return utf8ByteLength(JSON.stringify(value));
  } catch {
    return null;
  }
}

function isBoundedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTransferableDescriptor(value: unknown): value is TransferableDescriptor {
  if (!isRecord(value)) {
    return false;
  }
  const kind = value["kind"];
  const byteLength = value["byteLength"];
  return (
    (kind === "array-buffer" || kind === "uint8-array") &&
    isBoundedCount(byteLength) &&
    byteLength <= LOCAL_ANALYSIS_LIMITS.transferableMaxItemBytes
  );
}

function validateTransferables(value: unknown): {
  ok: boolean;
  reason: "transferable" | "transferable-count" | "transferable-bytes" | null;
  descriptors: readonly TransferableDescriptor[];
  totalBytes: number;
} {
  if (!Array.isArray(value) || value.some((entry) => !isTransferableDescriptor(entry))) {
    return { ok: false, reason: "transferable", descriptors: Object.freeze([]), totalBytes: 0 };
  }
  if (value.length > LOCAL_ANALYSIS_LIMITS.transferableMaxCount) {
    return {
      ok: false,
      reason: "transferable-count",
      descriptors: Object.freeze([]),
      totalBytes: 0,
    };
  }
  let totalBytes = 0;
  for (const entry of value as TransferableDescriptor[]) {
    totalBytes += entry.byteLength;
  }
  if (totalBytes > LOCAL_ANALYSIS_LIMITS.transferableMaxTotalBytes) {
    return {
      ok: false,
      reason: "transferable-bytes",
      descriptors: Object.freeze([]),
      totalBytes,
    };
  }
  return {
    ok: true,
    reason: null,
    descriptors: Object.freeze(value.map((entry) => Object.freeze(entry))),
    totalBytes,
  };
}

function isObservedProgress(value: unknown): value is LocalAnalysisObservedProgress {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isBoundedCount(value["transferableCount"]) &&
    isBoundedCount(value["transferableBytes"]) &&
    isBoundedCount(value["payloadBytes"])
  );
}

function isErrorEnvelope(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const code = value["code"];
  const details = value["details"];
  if (typeof code !== "string" || code.length === 0 || code.length > 128) {
    return false;
  }
  return isRecord(details);
}

function isAnalysisResultPayload(value: unknown): value is AnalysisResultPayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value["schemaVersion"] === LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION &&
    value["kind"] === "transport-summary" &&
    isBoundedCount(value["transferableCount"]) &&
    isBoundedCount(value["transferableBytes"]) &&
    isBoundedCount(value["payloadBytes"])
  );
}

type RequestKindValidation =
  | { ok: true; message: LocalAnalysisRequestMessage }
  | { ok: false; reason: InvalidRequestReason };

function validateRequestKind(value: Record<string, unknown>): RequestKindValidation {
  const taskId = value["taskId"];
  const nonce = value["nonce"];
  if (!isAnalysisTaskId(taskId)) {
    return { ok: false, reason: "task-id" };
  }
  if (!isAnalysisNonce(nonce)) {
    return { ok: false, reason: "nonce" };
  }
  const transferables = validateTransferables(value["transferables"]);
  if (!transferables.ok) {
    return { ok: false, reason: transferables.reason as InvalidRequestReason };
  }
  const payload = value["payload"];
  if (payload !== undefined && serializedUtf8ByteLength(payload) === null) {
    return { ok: false, reason: "shape" };
  }
  const message: LocalAnalysisRequestMessage = Object.freeze({
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "request",
    taskId,
    nonce,
    transferables: transferables.descriptors,
    ...(payload === undefined ? {} : { payload }),
  });
  return { ok: true, message };
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

type BootstrapKindValidation =
  | { ok: true; message: LocalAnalysisBootstrapMessage }
  | { ok: false; reason: InvalidRequestReason };

function validateBootstrapKind(value: Record<string, unknown>): BootstrapKindValidation {
  const taskId = value["taskId"];
  const nonce = value["nonce"];
  if (!isAnalysisTaskId(taskId)) {
    return { ok: false, reason: "task-id" };
  }
  if (!isAnalysisNonce(nonce)) {
    return { ok: false, reason: "nonce" };
  }
  const transferables = validateTransferables(value["transferables"]);
  if (!transferables.ok) {
    return { ok: false, reason: transferables.reason as InvalidRequestReason };
  }
  if (transferables.descriptors.length !== 1) {
    return { ok: false, reason: "transferable-count" };
  }
  const wasm = value["wasm"];
  if (!isRecord(wasm)) {
    return { ok: false, reason: "wasm" };
  }
  const byteLength = wasm["byteLength"];
  const sha256 = wasm["sha256"];
  if (
    !isBoundedCount(byteLength) ||
    byteLength <= 0 ||
    byteLength > LOCAL_ANALYSIS_LIMITS.bootstrapWasmMaxBytes ||
    !isSha256Hex(sha256)
  ) {
    return { ok: false, reason: "wasm" };
  }
  const descriptor = transferables.descriptors[0] as TransferableDescriptor;
  if (descriptor.kind !== "array-buffer" || descriptor.byteLength !== byteLength) {
    return { ok: false, reason: "transferable" };
  }
  return {
    ok: true,
    message: Object.freeze({
      schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
      kind: "bootstrap",
      taskId,
      nonce,
      transferables: transferables.descriptors,
      wasm: Object.freeze({ byteLength, sha256 }),
    }),
  };
}

type NonRequestKindValidation =
  | { ok: true; message: LocalAnalysisMessage }
  | { ok: false; reason: InvalidRequestReason };

function validateNonRequestKind(
  value: Record<string, unknown>,
  kind: "progress" | "result" | "error" | "cancel",
): NonRequestKindValidation {
  const taskId = value["taskId"];
  const nonce = value["nonce"];
  if (!isAnalysisTaskId(taskId)) {
    return { ok: false, reason: "task-id" };
  }
  if (!isAnalysisNonce(nonce)) {
    return { ok: false, reason: "nonce" };
  }
  if (kind === "progress") {
    const phase = value["phase"];
    if (phase !== "preparing" && phase !== "evaluating" && phase !== "finalizing") {
      return { ok: false, reason: "phase" };
    }
    const observed = value["observed"];
    if (!isObservedProgress(observed)) {
      return { ok: false, reason: "shape" };
    }
    return {
      ok: true,
      message: Object.freeze({
        schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
        kind: "progress",
        taskId,
        nonce,
        phase,
        observed,
      }),
    };
  }
  if (kind === "result") {
    const result = value["result"];
    if (!isAnalysisResultPayload(result)) {
      return { ok: false, reason: "result" };
    }
    return {
      ok: true,
      message: Object.freeze({
        schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
        kind: "result",
        taskId,
        nonce,
        result,
      }),
    };
  }
  if (kind === "error") {
    const error = value["error"];
    if (!isErrorEnvelope(error)) {
      return { ok: false, reason: "error" };
    }
    return {
      ok: true,
      message: Object.freeze({
        schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
        kind: "error",
        taskId,
        nonce,
        error: Object.freeze({
          code: (error as { code: string }).code,
          details: Object.freeze({ ...(error as { details: Record<string, unknown> }).details }),
        }),
      }),
    };
  }
  return {
    ok: true,
    message: Object.freeze({
      schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
      kind: "cancel",
      taskId,
      nonce,
    }),
  };
}

/**
 * 运行时校验任意 LocalAnalysis 消息。失败返回封闭的 INVALID_REQUEST 错误；
 * 成功返回冻结的消息对象，保证后续消费者只能读取。
 */
export function validateLocalAnalysisMessage(
  value: unknown,
): LocalAnalysisMessageValidationResult {
  if (!isRecord(value)) {
    return invalidRequestFailure("type");
  }
  if (value["schemaVersion"] !== LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION) {
    return invalidRequestFailure("schema-version");
  }
  const serializedBytes = serializedUtf8ByteLength(value);
  if (serializedBytes === null || serializedBytes > LOCAL_ANALYSIS_LIMITS.messageJsonMaxBytes) {
    return invalidRequestFailure("message-size");
  }
  const kind = value["kind"];
  if (
    kind !== "request" &&
    kind !== "progress" &&
    kind !== "result" &&
    kind !== "error" &&
    kind !== "cancel" &&
    kind !== "bootstrap"
  ) {
    return invalidRequestFailure("kind");
  }
  const result =
    kind === "request"
      ? validateRequestKind(value)
      : kind === "bootstrap"
        ? validateBootstrapKind(value)
        : validateNonRequestKind(value, kind);
  if (!result.ok) {
    return invalidRequestFailure(result.reason);
  }
  return Object.freeze({ ok: true, value: Object.freeze({ ...result.message }) as ValidatedLocalAnalysisMessage });
}

/** 仅接受 kind=request 的已校验请求，供 run seam 使用。 */
export function validateLocalAnalysisRequest(
  value: unknown,
): LocalAnalysisRequestValidationResult {
  const result = validateLocalAnalysisMessage(value);
  if (!result.ok) {
    return Object.freeze({ ok: false, error: result.error });
  }
  if (result.value.kind !== "request") {
    return invalidRequestFailure("kind");
  }
  return Object.freeze({
    ok: true,
    value: result.value as ValidatedLocalAnalysisRequest,
  });
}

export function createLocalAnalysisProgressMessage(
  taskId: AnalysisTaskId,
  nonce: AnalysisNonce,
  phase: LocalAnalysisProgressPhase,
  observed: LocalAnalysisObservedProgress,
): LocalAnalysisProgressMessage {
  if (!isAnalysisTaskId(taskId) || !isAnalysisNonce(nonce)) {
    throw new RangeError("local-analysis taskId/nonce must be valid");
  }
  if (!isObservedProgress(observed)) {
    throw new RangeError("local-analysis observed progress must be bounded");
  }
  return Object.freeze({
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "progress",
    taskId,
    nonce,
    phase,
    observed: Object.freeze(observed),
  });
}

export function createLocalAnalysisResultMessage(
  taskId: AnalysisTaskId,
  nonce: AnalysisNonce,
  result: AnalysisResultPayload,
): LocalAnalysisResultMessage {
  if (!isAnalysisTaskId(taskId) || !isAnalysisNonce(nonce)) {
    throw new RangeError("local-analysis taskId/nonce must be valid");
  }
  if (!isAnalysisResultPayload(result)) {
    throw new RangeError("local-analysis result payload must be bounded");
  }
  return Object.freeze({
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "result",
    taskId,
    nonce,
    result: Object.freeze(result),
  });
}

export function createLocalAnalysisCancelMessage(
  taskId: AnalysisTaskId,
  nonce: AnalysisNonce,
): LocalAnalysisCancelMessage {
  if (!isAnalysisTaskId(taskId) || !isAnalysisNonce(nonce)) {
    throw new RangeError("local-analysis taskId/nonce must be valid");
  }
  return Object.freeze({
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "cancel",
    taskId,
    nonce,
  });
}

export function createLocalAnalysisBootstrapMessage(
  taskId: AnalysisTaskId,
  nonce: AnalysisNonce,
  wasmByteLength: number,
  wasmSha256: string,
): LocalAnalysisBootstrapMessage {
  if (!isAnalysisTaskId(taskId) || !isAnalysisNonce(nonce)) {
    throw new RangeError("local-analysis taskId/nonce must be valid");
  }
  if (
    !isBoundedCount(wasmByteLength) ||
    wasmByteLength <= 0 ||
    wasmByteLength > LOCAL_ANALYSIS_LIMITS.bootstrapWasmMaxBytes ||
    !isSha256Hex(wasmSha256)
  ) {
    throw new RangeError("local-analysis wasm bootstrap must be bounded");
  }
  return Object.freeze({
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "bootstrap",
    taskId,
    nonce,
    transferables: Object.freeze([
      Object.freeze({ kind: "array-buffer", byteLength: wasmByteLength }),
    ]),
    wasm: Object.freeze({ byteLength: wasmByteLength, sha256: wasmSha256 }),
  });
}

export type LocalAnalysisMessageFailure = Readonly<{
  ok: false;
  error: InvalidRequestError;
  value?: never;
}>;

function invalidRequestFailure(
  reason: InvalidRequestReason,
): LocalAnalysisMessageFailure {
  return Object.freeze({ ok: false, error: createInvalidRequestError(reason) });
}

export function isTransferableKind(value: unknown): value is TransferableKind {
  return TRANSFERABLE_KINDS.includes(value as TransferableKind);
}