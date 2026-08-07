/**
 * M0-032：真实浏览器 CSP 网络通道否定与 LocalAnalysis 生命周期释放矩阵的页面探针。
 *
 * 由 tests/worker-csp/worker-csp.spec.ts 的自持本地 HTTP server 提供：
 * - `/`（文档严格 CSP：connect-src 'none'）验证页面侧 sendBeacon 与适配器 WASM
 *   预取被拦截；Worker 脚本响应各自携带 CSP，验证 fetch、WebSocket、
 *   EventSource、动态 import、importScripts 与嵌套 Worker 在 Worker 内全部被拒绝；
 * - `/lifecycle.html`（connect-src 'self'）驱动真实 BrowserWorkerAdapter 的
 *   完成／取消／超时／失败场景，断言每次 run 独占派生一个 module Worker、
 *   任何终态后都调用 terminate，且期间不产生任何 /prohibited 请求。
 *
 * 本文件与 /local-analysis/* 模块图在同一 Origin 提供，文档 CSP 由响应头生效；
 * Worker 脚本响应各自携带 CSP 头（Chromium 不把文档 CSP 继承进 Worker）。
 */
import { createBrowserWorkerAdapter } from "/local-analysis/index.js";

const canaryOrigin =
  new URLSearchParams(import.meta.url.split("?")[1] ?? "").get("canary") ?? "";

const FIXED_WASM_SHA256 =
  "93a44bbb96c751218e4c00d479e4c14358122a389acca16205b1e4d0dc5f9476";

const trackedWorkers = [];
const OriginalWorker = globalThis.Worker;
class TrackedWorker extends OriginalWorker {
  constructor(...args) {
    super(...args);
    this.__dpTrackedId = trackedWorkers.length;
    this.__dpTerminated = false;
    trackedWorkers.push(this);
  }
  terminate() {
    this.__dpTerminated = true;
    return super.terminate();
  }
}
globalThis.Worker = TrackedWorker;

function requestFixture() {
  return Object.freeze({
    schemaVersion: "1.0.0",
    kind: "request",
    taskId: "task_analysis_032",
    nonce: "nonce_20260807_0032",
    transferables: Object.freeze([
      Object.freeze({ kind: "array-buffer", byteLength: 1024 }),
      Object.freeze({ kind: "uint8-array", byteLength: 4096 }),
    ]),
    payload: Object.freeze({ dataset: "synthetic" }),
  });
}

function serializeResult(result) {
  if (result.ok) {
    return { ok: true, value: result.value };
  }
  return {
    ok: false,
    code: result.error.code,
    reason: result.error.details?.reason ?? null,
  };
}

function spawnProbeWorker() {
  return new Promise((resolve, reject) => {
    const worker = new TrackedWorker(
      "/probe-worker.js?canary=" + encodeURIComponent(canaryOrigin),
      { type: "module" },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("probe worker timed out"));
    }, 10_000);
    worker.addEventListener("message", (event) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    });
    worker.postMessage({ kind: "run-channel-probes" });
    worker.addEventListener("error", (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(event.error ?? new Error("probe worker error"));
    });
  });
}

function probeSendBeacon() {
  const target = canaryOrigin + "/prohibited/sendbeacon";
  try {
    const accepted = navigator.sendBeacon(target, new Blob(["probe"]));
    return { accepted, threw: false };
  } catch (error) {
    return { accepted: false, threw: true };
  }
}

async function probeWorkerChannels() {
  const message = await spawnProbeWorker();
  return message.report;
}

async function runStrictAdapter() {
  const spawnedStart = trackedWorkers.length;
  const adapter = createBrowserWorkerAdapter({
    workerScriptUrl: "/local-analysis/worker/local-analysis-worker.js",
    wasm: { resourceUrl: "/wasm", sha256: FIXED_WASM_SHA256 },
  });
  const result = await adapter.run(requestFixture(), {});
  const spawned = trackedWorkers.slice(spawnedStart);
  return {
    result: serializeResult(result),
    spawnedCount: spawned.length,
  };
}

async function runLifecycleScenario({
  workerScriptUrl,
  bootstrapTimeoutMs,
  abortAfterProgress,
}) {
  const spawnedStart = trackedWorkers.length;
  const phases = [];
  const controller = new AbortController();
  const adapter = createBrowserWorkerAdapter({
    workerScriptUrl,
    wasm: { resourceUrl: "/wasm", sha256: FIXED_WASM_SHA256 },
    ...(bootstrapTimeoutMs === undefined ? {} : { bootstrapTimeoutMs }),
  });
  const options = {
    onProgress: (progress) => {
      phases.push(progress.phase);
      if (abortAfterProgress !== undefined && phases.length === abortAfterProgress) {
        controller.abort();
      }
    },
  };
  if (abortAfterProgress !== undefined) {
    options.signal = controller.signal;
  }
  const result = await adapter.run(requestFixture(), options);
  const spawned = trackedWorkers.slice(spawnedStart).map((worker) => ({
    trackedId: worker.__dpTrackedId,
    terminated: worker.__dpTerminated,
  }));
  return {
    result: serializeResult(result),
    phases,
    spawned,
    spawnedCount: spawned.length,
  };
}

async function scanWorkerBundle() {
  const response = await fetch("/local-analysis/worker/local-analysis-worker.js");
  const text = await response.text();
  return {
    byteLength: text.length,
    forbidden: {
      importStatement: /\bimport\s*[`"'(]/.test(text),
      exportStatement: /\bexport\s*[{*]/.test(text),
      importMeta: text.includes("import.meta"),
      fetch: text.includes("fetch("),
      webSocket: text.includes("WebSocket("),
      eventSource: text.includes("EventSource("),
      sendBeacon: text.includes("sendBeacon("),
      importScripts: text.includes("importScripts("),
      xmlHttpRequest: text.includes("XMLHttpRequest("),
      newWorker: text.includes("new Worker("),
      dynamicImport: text.includes("import("),
    },
  };
}

async function probeTransferDetach() {
  const worker = new TrackedWorker(
    "/probe-worker.js?canary=" + encodeURIComponent(canaryOrigin),
    { type: "module" },
  );
  const buffer = new ArrayBuffer(64);
  const before = buffer.byteLength;
  worker.postMessage({ kind: "transfer-probe", buffer }, [buffer]);
  const afterDetach = buffer.byteLength;
  const received = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("transfer probe timed out"));
    }, 10_000);
    worker.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        resolve(event.data);
      },
      { once: true },
    );
    worker.addEventListener(
      "error",
      (event) => {
        clearTimeout(timer);
        reject(event.error ?? new Error("transfer probe error"));
      },
      { once: true },
    );
  });
  worker.terminate();
  return {
    before,
    afterDetach,
    receivedByteLength: received.receivedByteLength,
  };
}

window.__dpWorkerProbe = Object.freeze({
  probeSendBeacon,
  probeWorkerChannels,
  runStrictAdapter,
  runLifecycleScenario,
  scanWorkerBundle,
  probeTransferDetach,
});