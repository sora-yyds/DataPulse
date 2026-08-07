import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LOCAL_ANALYSIS_ERROR_CODES,
  createBrowserWorkerAdapter,
  createInProcessTestAdapter,
  isLocalAnalysisError,
  type BrowserWorkerConstructor,
  type LocalAnalysis,
  type LocalAnalysisRunnerOptions,
} from "../../packages/local-analysis/dist/index.js";
import {
  createLocalAnalysisBootstrapMessage,
  validateLocalAnalysisMessage,
  type AnalysisNonce,
  type AnalysisTaskId,
} from "../../packages/local-analysis/dist/message.js";

/** 固定最小 WASM（空模块）：字节与 SHA-256 均冻结，主线程预取校验用。 */
const FIXED_WASM_BYTES = Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const FIXED_WASM_SHA256 = "93a44bbb96c751218e4c00d479e4c14358122a389acca16205b1e4d0dc5f9476";

const workerBundlePath = fileURLToPath(
  new URL("../../packages/local-analysis/dist/worker/local-analysis-worker.js", import.meta.url),
);

function taskId(value = "task_analysis_002"): AnalysisTaskId {
  return value as AnalysisTaskId;
}

function nonce(value = "nonce_20260807_0002"): AnalysisNonce {
  return value as AnalysisNonce;
}

function requestFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: "1.0.0",
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

/** 在 Node worker 内提供浏览器式全局，再加载单文件 Worker 产物。 */
function createNodeWorkerCtor(): BrowserWorkerConstructor {
  return function nodeWorkerCtor(scriptUrl: string | URL): BrowserWorkerLike {
    const bundleUrl = typeof scriptUrl === "string" ? new URL(scriptUrl).href : scriptUrl.href;
    const bridge = `
import { parentPort } from "node:worker_threads";
const scope = globalThis;
scope.self = scope;
scope.postMessage = (value, transferList) => { parentPort.postMessage(value, transferList); };
scope.addEventListener = (type, listener) => {
  if (type === "message") parentPort.on("message", (data) => listener({ data }));
  if (type === "error") parentPort.on("error", (error) => listener({ error }));
};
import(${JSON.stringify(bundleUrl)});
`;
    const nodeWorker = new NodeWorker(bridge, { eval: true, type: "module" });
    return {
      postMessage: (message, transfer) => {
        nodeWorker.postMessage(message, transfer === undefined ? [] : Array.from(transfer));
      },
      terminate: () => {
        nodeWorker.terminate();
      },
      addEventListener: (type, listener) => {
        if (type === "message") {
          nodeWorker.on("message", (data) => listener({ data }));
        } else if (type === "error") {
          nodeWorker.on("error", (error) => listener({ error: error as Error }));
        }
      },
    };
  };
}

const nodeWorkerCtor = createNodeWorkerCtor();

let server: Server;
let wasmUrl: string;
let missingUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/wasm") {
      response.writeHead(200, { "content-type": "application/wasm" });
      response.end(Buffer.from(FIXED_WASM_BYTES));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  wasmUrl = `http://127.0.0.1:${port}/wasm`;
  missingUrl = `http://127.0.0.1:${port}/missing`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
});

function browserWorkerAdapter(overrides: Record<string, unknown> = {}): LocalAnalysis {
  return createBrowserWorkerAdapter({
    workerScriptUrl: pathToFileURL(workerBundlePath).href,
    wasm: { resourceUrl: wasmUrl, sha256: FIXED_WASM_SHA256 },
    workerCtor: nodeWorkerCtor,
    ...overrides,
  } as Parameters<typeof createBrowserWorkerAdapter>[0]);
}

/** 与 InProcessTestAdapter 共享的 run contract 断言集。 */
function runAdapterContractSuite(label: string, createAdapter: () => LocalAnalysis): void {
  describe(`${label} 共享 run 契约`, () => {
    function collectProgress(request: unknown, options: LocalAnalysisRunnerOptions) {
      const phases: string[] = [];
      const adapter = createAdapter();
      return adapter
        .run(request, {
          ...options,
          onProgress: (progress) => {
            phases.push(progress.phase);
          },
        })
        .then((result) => ({ result, phases }));
    }

    it("合法请求返回有界传输摘要并按序上报 preparing/evaluating/finalizing", async () => {
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
      const adapter = createAdapter();
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
      const adapter = createAdapter();
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
      const adapter = createAdapter();
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
      const adapter = createAdapter();
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
  });
}

runAdapterContractSuite("InProcessTestAdapter", createInProcessTestAdapter);
runAdapterContractSuite("BrowserWorkerAdapter", browserWorkerAdapter);

describe("M0-031 单文件 Worker 产物静态检查", () => {
  it("构建产物是单文件模块且无运行时 import", () => {
    const text = readFileSync(workerBundlePath, "utf8");
    expect(/\bimport\s*[`"'(]/.test(text)).toBe(false);
    expect(/\bexport\s*[{*]/.test(text)).toBe(false);
    expect(text.includes("import.meta")).toBe(false);
    expect(text.length).toBeGreaterThan(0);
  });

  it("构建产物不调用网络或嵌套 Worker 通道", () => {
    const text = readFileSync(workerBundlePath, "utf8");
    for (const channel of [
      "fetch(",
      "WebSocket(",
      "EventSource(",
      "sendBeacon(",
      "importScripts(",
      "XMLHttpRequest(",
      "new Worker(",
      "import(",
    ]) {
      expect(text.includes(channel)).toBe(false);
    }
  });
});

describe("M0-031 bootstrap 消息与 WASM 校验", () => {
  it("bootstrap 消息可通过唯一版本化校验器且冻结", () => {
    const message = createLocalAnalysisBootstrapMessage(
      taskId(),
      nonce(),
      FIXED_WASM_BYTES.byteLength,
      FIXED_WASM_SHA256,
    );
    expect(Object.isFrozen(message)).toBe(true);
    const result = validateLocalAnalysisMessage(message);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("bootstrap");
      expect(result.value.transferables).toEqual([
        { kind: "array-buffer", byteLength: 8 },
      ]);
      expect(result.value.wasm.sha256).toBe(FIXED_WASM_SHA256);
    }
  });

  it("拒绝错误 sha256、非 array-buffer 描述或字节不一致的 bootstrap", () => {
    const badSha = validateLocalAnalysisMessage({
      schemaVersion: "1.0.0",
      kind: "bootstrap",
      taskId: taskId(),
      nonce: nonce(),
      transferables: [{ kind: "array-buffer", byteLength: 8 }],
      wasm: { byteLength: 8, sha256: "not-a-hex-digest" },
    });
    expect(badSha.ok).toBe(false);
    if (!badSha.ok) expect(badSha.error.details.reason).toBe("wasm");

    const bad = validateLocalAnalysisMessage({
      schemaVersion: "1.0.0",
      kind: "bootstrap",
      taskId: taskId(),
      nonce: nonce(),
      transferables: [{ kind: "uint8-array", byteLength: 8 }],
      wasm: { byteLength: 8, sha256: FIXED_WASM_SHA256 },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.details.reason).toBe("transferable");

    const mismatch = validateLocalAnalysisMessage({
      schemaVersion: "1.0.0",
      kind: "bootstrap",
      taskId: taskId(),
      nonce: nonce(),
      transferables: [{ kind: "array-buffer", byteLength: 16 }],
      wasm: { byteLength: 8, sha256: FIXED_WASM_SHA256 },
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error.details.reason).toBe("transferable");
  });

  it("固定 WASM fixture 的 SHA-256 与字节被冻结（防止误改）", () => {
    expect(FIXED_WASM_BYTES.byteLength).toBe(8);
    const digest = crypto.subtle.digest("SHA-256", FIXED_WASM_BYTES).then((bytes) =>
      Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
    return expect(digest).resolves.toBe(FIXED_WASM_SHA256);
  });
});

describe("M0-031 BrowserWorkerAdapter bootstrap 失败路径", () => {
  it("WASM 资源不可达返回 WORKER_FAILED wasm-fetch-failed", async () => {
    const adapter = browserWorkerAdapter({
      wasm: { resourceUrl: missingUrl, sha256: "bb".repeat(32) },
    });
    const result = await adapter.run(requestFixture(), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.workerFailed);
      expect(result.error.details.reason).toBe("wasm-fetch-failed");
    }
  });

  it("WASM 内容哈希不匹配返回 WORKER_FAILED wasm-hash-mismatch", async () => {
    const adapter = browserWorkerAdapter({
      wasm: { resourceUrl: wasmUrl, sha256: "aa".repeat(32) },
    });
    const result = await adapter.run(requestFixture(), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.workerFailed);
      expect(result.error.details.reason).toBe("wasm-hash-mismatch");
    }
  });

  it("Worker 构造失败返回 WORKER_FAILED worker-unreachable", async () => {
    const throwingCtor = (() => {
      throw new Error("no worker");
    }) as unknown as BrowserWorkerConstructor;
    const adapter = browserWorkerAdapter({ workerCtor: throwingCtor });
    const result = await adapter.run(requestFixture(), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.workerFailed);
      expect(result.error.details.reason).toBe("worker-unreachable");
    }
  });

  it("bootstrap 应答超时返回 WORKER_FAILED worker-unreachable", async () => {
    const noopPath = join(tmpdir(), "local-analysis-noop-worker.mjs");
    writeFileSync(noopPath, "export {};\n", "utf8");
    const adapter = browserWorkerAdapter({
      workerScriptUrl: pathToFileURL(noopPath).href,
      bootstrapTimeoutMs: 200,
    });
    const result = await adapter.run(requestFixture(), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.workerFailed);
      expect(result.error.details.reason).toBe("worker-unreachable");
    }
  });

  it("Worker 运行期崩溃返回 WORKER_FAILED worker-terminated", async () => {
    const boomPath = join(tmpdir(), "local-analysis-boom-worker.mjs");
    writeFileSync(boomPath, "throw new Error('worker boom');\n", "utf8");
    const adapter = browserWorkerAdapter({
      workerScriptUrl: pathToFileURL(boomPath).href,
    });
    const result = await adapter.run(requestFixture(), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(LOCAL_ANALYSIS_ERROR_CODES.workerFailed);
      expect(result.error.details.reason).toBe("worker-terminated");
    }
  });
});