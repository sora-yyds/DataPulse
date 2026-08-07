import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LOCAL_ANALYSIS_ERROR_CODES,
  LOCAL_ANALYSIS_LIMITS,
  LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
  canTransitionLocalAnalysisRunState,
  createInProcessTestAdapter,
  isLocalAnalysisError,
  isTerminalLocalAnalysisRunState,
  transitionLocalAnalysisRunState,
  type LocalAnalysisRunnerOptions,
} from "../../packages/local-analysis/dist/index.js";
import {
  validateLocalAnalysisMessage,
  validateLocalAnalysisRequest,
  createLocalAnalysisProgressMessage,
  createLocalAnalysisResultMessage,
  isAnalysisNonce,
  isAnalysisTaskId,
  type AnalysisNonce,
  type AnalysisTaskId,
} from "../../packages/local-analysis/dist/message.js";

const schemaPath = fileURLToPath(
  new URL("../../packages/local-analysis/src/schema/local-analysis-message-v1.schema.json", import.meta.url),
);

function taskId(value = "task_analysis_001"): AnalysisTaskId {
  return value as AnalysisTaskId;
}

function nonce(value = "nonce_20260807_0001"): AnalysisNonce {
  return value as AnalysisNonce;
}

function requestFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "request",
    taskId: taskId(),
    nonce: nonce(),
    transferables: [
      { kind: "array-buffer", byteLength: 1024 },
      { kind: "uint8-array", byteLength: 4096 },
    ],
    payload: { dataset: "synthetic" },
    ...overrides,
  };
}

function progressFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "progress",
    taskId: taskId(),
    nonce: nonce(),
    phase: "evaluating",
    observed: { transferableCount: 2, transferableBytes: 5120, payloadBytes: 22 },
    ...overrides,
  };
}

function resultFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "result",
    taskId: taskId(),
    nonce: nonce(),
    result: {
      schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
      kind: "transport-summary",
      transferableCount: 2,
      transferableBytes: 5120,
      payloadBytes: 22,
    },
    ...overrides,
  };
}

function errorFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "error",
    taskId: taskId(),
    nonce: nonce(),
    error: { code: "LOCAL_ANALYSIS_CANCELLED", details: { reason: "abort-signal" } },
    ...overrides,
  };
}

function cancelFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
    kind: "cancel",
    taskId: taskId(),
    nonce: nonce(),
    ...overrides,
  };
}

describe("M0-030 LocalAnalysis 消息 Schema 与运行时校验", () => {
  it("接受合法的 request 消息并冻结对象", () => {
    const result = validateLocalAnalysisMessage(requestFixture());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("request");
      expect(result.value.schemaVersion).toBe(LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION);
      expect(result.value.transferables).toHaveLength(2);
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it("接受合法的 progress/result/error/cancel 消息", () => {
    expect(validateLocalAnalysisMessage(progressFixture()).ok).toBe(true);
    expect(validateLocalAnalysisMessage(resultFixture()).ok).toBe(true);
    expect(validateLocalAnalysisMessage(errorFixture()).ok).toBe(true);
    expect(validateLocalAnalysisMessage(cancelFixture()).ok).toBe(true);
  });

  it("拒绝非对象、错误 schemaVersion 与未知 kind", () => {
    for (const value of [null, 42, "text", [], true]) {
      const result = validateLocalAnalysisMessage(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details.reason).toBe("type");
    }
    const version = validateLocalAnalysisMessage(requestFixture({ schemaVersion: "0.1.0" }));
    expect(version.ok).toBe(false);
    if (!version.ok) expect(version.error.details.reason).toBe("schema-version");
    const kind = validateLocalAnalysisMessage(requestFixture({ kind: "ping" }));
    expect(kind.ok).toBe(false);
    if (!kind.ok) expect(kind.error.details.reason).toBe("kind");
  });

  it("校验 task ID 与每请求 nonce", () => {
    expect(isAnalysisTaskId("task_analysis_001")).toBe(true);
    expect(isAnalysisTaskId("short")).toBe(false);
    expect(isAnalysisTaskId("bad space")).toBe(false);
    expect(isAnalysisTaskId("x".repeat(129))).toBe(false);
    expect(isAnalysisNonce("nonce_20260807_0001")).toBe(true);
    expect(isAnalysisNonce("short")).toBe(false);
    expect(isAnalysisNonce("bad\x00nonce")).toBe(false);

    const shortTask = validateLocalAnalysisMessage(requestFixture({ taskId: "short" }));
    expect(shortTask.ok).toBe(false);
    if (!shortTask.ok) expect(shortTask.error.details.reason).toBe("task-id");

    const badNonce = validateLocalAnalysisMessage(requestFixture({ nonce: "n" }));
    expect(badNonce.ok).toBe(false);
    if (!badNonce.ok) expect(badNonce.error.details.reason).toBe("nonce");
  });

  it("校验 transferable 类型、长度与总字节上限", () => {
    const badKind = validateLocalAnalysisMessage(
      requestFixture({ transferables: [{ kind: "blob", byteLength: 10 }] }),
    );
    expect(badKind.ok).toBe(false);
    if (!badKind.ok) expect(badKind.error.details.reason).toBe("transferable");

    const negative = validateLocalAnalysisMessage(
      requestFixture({ transferables: [{ kind: "array-buffer", byteLength: -1 }] }),
    );
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.error.details.reason).toBe("transferable");

    const overItem = validateLocalAnalysisMessage(
      requestFixture({
        transferables: [
          { kind: "array-buffer", byteLength: LOCAL_ANALYSIS_LIMITS.transferableMaxItemBytes + 1 },
        ],
      }),
    );
    expect(overItem.ok).toBe(false);
    if (!overItem.ok) expect(overItem.error.details.reason).toBe("transferable");

    const overCount = validateLocalAnalysisMessage(
      requestFixture({
        transferables: Array.from({ length: LOCAL_ANALYSIS_LIMITS.transferableMaxCount + 1 }, () => ({
          kind: "array-buffer",
          byteLength: 1,
        })),
      }),
    );
    expect(overCount.ok).toBe(false);
    if (!overCount.ok) expect(overCount.error.details.reason).toBe("transferable-count");

    const overTotal = validateLocalAnalysisMessage(
      requestFixture({
        transferables: [
          { kind: "array-buffer", byteLength: LOCAL_ANALYSIS_LIMITS.transferableMaxItemBytes },
          { kind: "uint8-array", byteLength: LOCAL_ANALYSIS_LIMITS.transferableMaxItemBytes },
          { kind: "uint8-array", byteLength: 1 },
        ],
      }),
    );
    expect(overTotal.ok).toBe(false);
    if (!overTotal.ok) expect(overTotal.error.details.reason).toBe("transferable-bytes");
  });

  it("校验消息体与内联负载字节上限", () => {
    const oversizedMessage = validateLocalAnalysisMessage(
      requestFixture({
        taskId: "t".repeat(LOCAL_ANALYSIS_LIMITS.taskIdMaxLength),
        payload: "x".repeat(LOCAL_ANALYSIS_LIMITS.messageJsonMaxBytes + 1),
      }),
    );
    expect(oversizedMessage.ok).toBe(false);
    if (!oversizedMessage.ok) {
      expect(["message-size", "payload-size"]).toContain(oversizedMessage.error.details.reason);
    }

    // 内联负载由外层消息体上限（message-size）先约束，16 MiB 级负载必然先触发 message-size。
    const oversizedPayload = validateLocalAnalysisMessage(
      requestFixture({ payload: "y".repeat(LOCAL_ANALYSIS_LIMITS.messageJsonMaxBytes + 1) }),
    );
    expect(oversizedPayload.ok).toBe(false);
    if (!oversizedPayload.ok) expect(oversizedPayload.error.details.reason).toBe("message-size");
  });

  it("校验 progress 阶段、result 与 error 信封", () => {
    const badPhase = validateLocalAnalysisMessage(progressFixture({ phase: "running" }));
    expect(badPhase.ok).toBe(false);
    if (!badPhase.ok) expect(badPhase.error.details.reason).toBe("phase");

    const badObserved = validateLocalAnalysisMessage(
      progressFixture({ observed: { transferableCount: -1 } }),
    );
    expect(badObserved.ok).toBe(false);
    if (!badObserved.ok) expect(badObserved.error.details.reason).toBe("shape");

    const badResult = validateLocalAnalysisMessage(
      resultFixture({ result: { kind: "analysis", value: 1 } }),
    );
    expect(badResult.ok).toBe(false);
    if (!badResult.ok) expect(badResult.error.details.reason).toBe("result");

    const badError = validateLocalAnalysisMessage(errorFixture({ error: { code: "" } }));
    expect(badError.ok).toBe(false);
    if (!badError.ok) expect(badError.error.details.reason).toBe("error");
  });

  it("validateLocalAnalysisRequest 只接受 request 消息", () => {
    expect(validateLocalAnalysisRequest(requestFixture()).ok).toBe(true);
    const progress = validateLocalAnalysisRequest(progressFixture());
    expect(progress.ok).toBe(false);
    if (!progress.ok) expect(progress.error.details.reason).toBe("kind");
  });

  it("与唯一版本化 JSON Schema 机器规范保持一致", () => {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      properties: Record<string, unknown>;
      required: string[];
      allOf: Array<{ if: { properties: { kind: { const?: string } } } }>;
    };
    expect(schema.properties["schemaVersion"]).toBeDefined();
    expect(schema.properties["kind"]).toBeDefined();
    expect(schema.properties["transferables"]).toBeDefined();
    expect(schema.required).toContain("schemaVersion");
    expect(schema.required).toContain("kind");
    expect(schema.required).toContain("taskId");
    expect(schema.required).toContain("nonce");
    const kinds = schema.allOf.map((entry) => entry.if.properties.kind.const);
    expect(kinds).toEqual(["request", "progress", "result", "error", "bootstrap"]);

    // 与校验器使用同一组 fixture 语义：request 必须携带 transferables。
    expect(validateLocalAnalysisMessage(requestFixture()).ok).toBe(true);
    const missingTransferables = validateLocalAnalysisMessage(
      requestFixture({ transferables: undefined }),
    );
    expect(missingTransferables.ok).toBe(false);
  });
});

describe("M0-030 LocalAnalysis 运行状态机", () => {
  it("只允许显式合法迁移", () => {
    expect(canTransitionLocalAnalysisRunState("not-started", "preparing")).toBe(true);
    expect(canTransitionLocalAnalysisRunState("preparing", "evaluating")).toBe(true);
    expect(canTransitionLocalAnalysisRunState("evaluating", "finalizing")).toBe(true);
    expect(canTransitionLocalAnalysisRunState("finalizing", "completed")).toBe(true);
    expect(canTransitionLocalAnalysisRunState("preparing", "cancelled")).toBe(true);
    expect(canTransitionLocalAnalysisRunState("evaluating", "rejected")).toBe(true);

    expect(canTransitionLocalAnalysisRunState("not-started", "evaluating")).toBe(false);
    expect(canTransitionLocalAnalysisRunState("preparing", "completed")).toBe(false);
    expect(canTransitionLocalAnalysisRunState("completed", "preparing")).toBe(false);
    expect(canTransitionLocalAnalysisRunState("cancelled", "finalizing")).toBe(false);
  });

  it("非法迁移返回封闭错误且终态吸收", () => {
    const result = transitionLocalAnalysisRunState("preparing", "completed");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.stateTransitionInvalid);
      expect(result.error.details.reason).toBe("invalid-transition");
      expect(result.error.details.from).toBe("preparing");
      expect(result.error.details.to).toBe("completed");
    }
    expect(isTerminalLocalAnalysisRunState("completed")).toBe(true);
    expect(isTerminalLocalAnalysisRunState("cancelled")).toBe(true);
    expect(isTerminalLocalAnalysisRunState("preparing")).toBe(false);
  });
});

describe("M0-030 InProcessTestAdapter 契约", () => {
  function collectProgress(request: unknown, options: LocalAnalysisRunnerOptions) {
    const phases: string[] = [];
    const adapter = createInProcessTestAdapter();
    return adapter.run(request, {
      ...options,
      onProgress: (progress) => {
        phases.push(progress.phase);
      },
    }).then((result) => ({ result, phases }));
  }

  it("合法请求返回有界确定性传输摘要并按序上报进度", async () => {
    const { result, phases } = await collectProgress(requestFixture(), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("transport-summary");
      expect(result.value.transferableCount).toBe(2);
      expect(result.value.transferableBytes).toBe(5120);
      expect(result.value.payloadBytes).toBeGreaterThan(0);
    }
    expect(phases).toEqual(["preparing", "evaluating", "finalizing"]);
  });

  it("进度消息携带 task ID 与 nonce 且可通过校验器", async () => {
    const messages: Array<unknown> = [];
    const adapter = createInProcessTestAdapter();
    const result = await adapter.run(requestFixture(), {
      onProgress: (progress) => messages.push(progress),
    });
    expect(result.ok).toBe(true);
    expect(messages).toHaveLength(3);
    for (const message of messages) {
      const validated = validateLocalAnalysisMessage(message);
      expect(validated.ok).toBe(true);
      if (validated.ok) {
        expect(validated.value.taskId).toBe(taskId());
        expect(validated.value.nonce).toBe(nonce());
      }
    }
  });

  it("非法请求返回封闭 INVALID_REQUEST 错误", async () => {
    const adapter = createInProcessTestAdapter();
    const result = await adapter.run({ not: "a request" }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.invalidRequest);
      expect(isLocalAnalysisError(result.error)).toBe(true);
    }
  });

  it("AbortSignal 已触发时直接取消", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = createInProcessTestAdapter();
    const result = await adapter.run(requestFixture(), { signal: controller.signal });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.cancelled);
      expect(result.error.details.reason).toBe("abort-signal");
    }
  });

  it("进度回调中取消后停止并返回稳定取消错误", async () => {
    const controller = new AbortController();
    let seenPhases = 0;
    const adapter = createInProcessTestAdapter();
    const result = await adapter.run(requestFixture(), {
      signal: controller.signal,
      onProgress: () => {
        seenPhases += 1;
        if (seenPhases === 1) {
          controller.abort();
        }
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.cancelled);
    }
    expect(seenPhases).toBeLessThanOrEqual(2);
  });

  it("构造进度/结果消息的辅助函数输出可通过校验", () => {
    const progress = createLocalAnalysisProgressMessage(taskId(), nonce(), "preparing", {
      transferableCount: 1,
      transferableBytes: 10,
      payloadBytes: 3,
    });
    expect(validateLocalAnalysisMessage(progress).ok).toBe(true);

    const resultMessage = createLocalAnalysisResultMessage(taskId(), nonce(), {
      schemaVersion: LOCAL_ANALYSIS_MESSAGE_SCHEMA_VERSION,
      kind: "transport-summary",
      transferableCount: 1,
      transferableBytes: 10,
      payloadBytes: 3,
    });
    expect(validateLocalAnalysisMessage(resultMessage).ok).toBe(true);
  });
});