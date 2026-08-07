import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "playwright/test";

/**
 * M0-032：真实 Chromium 的 Worker CSP 网络通道否定与 LocalAnalysis
 * 生命周期释放矩阵。
 *
 * - `/`（文档严格 CSP：connect-src 'none'）验证页面侧 sendBeacon 与适配器 WASM
 *   预取被拦截；Worker 脚本响应自身携带 WORKER_CSP（Chromium 不把文档 CSP
 *   继承进 Worker），验证 fetch／WebSocket／EventSource／动态 import／
 *   importScripts／嵌套 Worker 在 Worker 内全部被拒绝；
 * - `/lifecycle.html`（connect-src 'self'）驱动真实 BrowserWorkerAdapter 的
 *   完成／取消／超时／失败场景：每次 run 独占派生一个 module Worker，任何终态
 *   后都调用 terminate，transferable 移交后主线程被 detach；
 * - 服务器侧请求日志证明所有被禁通道在 CSP 层被拦截：canary Origin 零请求／
 *   零升级，主 Origin 无任何 /prohibited 请求。
 *
 * 环境合同：本地 HTTP 127.0.0.1（潜在可信 Origin）的真实 Chromium；HTTPS 与
 * 四 Origin 矩阵属于 M0-036～M0-039／M0-058，不由此关闭。
 */

const fixtureRoot = fileURLToPath(
  new URL("../worker-csp-fixture/", import.meta.url),
);
const localAnalysisDist = fileURLToPath(
  new URL("../../packages/local-analysis/dist/", import.meta.url),
);

const FIXED_WASM_BYTES = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

const STRICT_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SELF_CONNECT_CSP = STRICT_CSP.replace(
  "connect-src 'none'",
  "connect-src 'self'",
);

/**
 * Worker 自身响应携带的 CSP：Chromium 不会把创建者文档的 CSP 继承进 Worker，
 * 因此按 ROADMAP 要求由 Worker 响应头直接禁止连接、脚本源与嵌套 Worker。
 */
const WORKER_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");


const MIME_BY_EXTENSION: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

type RequestLogEntry = { method: string; path: string };

type ChannelReport = {
  fetch: { rejected: boolean };
  sameOriginFetch: { rejected: boolean };
  webSocket: { rejected: boolean };
  eventSource: { rejected: boolean };
  importScripts: { typeof: string; rejected: boolean };
  sendBeacon: { typeof: string };
  dynamicImport: { rejected: boolean };
  nestedWorker: { rejected: boolean };
};

type RunResult =
  | { ok: true; value: unknown }
  | { ok: false; code: string; reason: string | null };

type LifecycleReport = {
  result: RunResult;
  phases: string[];
  spawned: Array<{ trackedId: number; terminated: boolean }>;
  spawnedCount: number;
};

type StrictAdapterReport = {
  result: RunResult;
  spawnedCount: number;
};

type WorkerProbe = {
  probeSendBeacon: () => { accepted: boolean; threw: boolean };
  probeWorkerChannels: () => Promise<ChannelReport>;
  runStrictAdapter: () => Promise<StrictAdapterReport>;
  runLifecycleScenario: (options: {
    workerScriptUrl: string;
    bootstrapTimeoutMs?: number;
    abortAfterProgress?: number;
  }) => Promise<LifecycleReport>;
  scanWorkerBundle: () => Promise<{
    byteLength: number;
    forbidden: Record<string, boolean>;
  }>;
  probeTransferDetach: () => Promise<{
    before: number;
    afterDetach: number;
    receivedByteLength: number;
  }>;
};

declare global {
  interface Window {
    __dpWorkerProbe: WorkerProbe;
  }
}

const LOCAL_ANALYSIS_WORKER_FAILED = "LOCAL_ANALYSIS_WORKER_FAILED";
const LOCAL_ANALYSIS_CANCELLED = "LOCAL_ANALYSIS_CANCELLED";

const FORBIDDEN_CHANNEL_KEYS = [
  "importStatement",
  "exportStatement",
  "importMeta",
  "fetch",
  "webSocket",
  "eventSource",
  "sendBeacon",
  "importScripts",
  "xmlHttpRequest",
  "newWorker",
  "dynamicImport",
] as const;

let mainServer: Server | undefined;
let canaryServer: Server | undefined;
let mainOrigin = "";
let canaryOrigin = "";
let mainRequests: RequestLogEntry[] = [];
let canaryRequests: RequestLogEntry[] = [];
let canaryUpgrades: string[] = [];

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../worker-csp-fixture/${name}`, import.meta.url));
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function sendDocument(response: ServerResponse, name: string, csp: string): void {
  const html = readFileSync(fixturePath(name), "utf8").replace(
    /\{CANARY_ORIGIN\}/gu,
    encodeURIComponent(canaryOrigin),
  );
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": csp,
  });
  response.end(html);
}

function serveFile(
  response: ServerResponse,
  absolutePath: string,
  contentSecurityPolicy?: string,
): void {
  let body: Buffer;
  try {
    body = readFileSync(absolutePath);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
    return;
  }
  const dotIndex = absolutePath.lastIndexOf(".");
  const extension = dotIndex >= 0 ? absolutePath.slice(dotIndex) : "";
  const contentType = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
  const headers: Record<string, string> = { "content-type": contentType };
  if (contentSecurityPolicy !== undefined) {
    headers["content-security-policy"] = contentSecurityPolicy;
  }
  response.writeHead(200, headers);
  response.end(body);
}

function routeMain(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
): void {
  if (path === "/" || path === "/index.html") {
    sendDocument(response, "index.html", STRICT_CSP);
    return;
  }
  if (path === "/lifecycle.html") {
    sendDocument(response, "lifecycle.html", SELF_CONNECT_CSP);
    return;
  }
  if (path.startsWith("/local-analysis/")) {
    const relative = path.slice("/local-analysis/".length);
    const absolute = resolve(localAnalysisDist, relative);
    if (!absolute.startsWith(resolve(localAnalysisDist))) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    const workerBundle = path === "/local-analysis/worker/local-analysis-worker.js";
    serveFile(response, absolute, workerBundle ? WORKER_CSP : undefined);
    return;
  }
  if (path === "/wasm") {
    response.writeHead(200, { "content-type": "application/wasm" });
    response.end(Buffer.from(FIXED_WASM_BYTES));
    return;
  }
  const fixtureNames = new Set([
    "probe.js",
    "probe-worker.js",
    "stalled-worker.js",
    "crash-worker.js",
  ]);
  const fixtureName = path.slice(1);
  if (fixtureNames.has(fixtureName)) {
    const workerScript = fixtureName !== "probe.js";
    serveFile(response, fixturePath(fixtureName), workerScript ? WORKER_CSP : undefined);
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
}

test.beforeAll(async () => {
  canaryServer = createServer((request, response) => {
    canaryRequests.push({ method: request.method ?? "", path: request.url ?? "" });
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("canary 404");
  });
  canaryServer.on("upgrade", (request) => {
    canaryUpgrades.push(request.url ?? "");
    request.destroy();
  });
  await listen(canaryServer);
  const canaryAddress = canaryServer.address() as AddressInfo;
  canaryOrigin = `http://127.0.0.1:${canaryAddress.port}`;

  mainServer = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    mainRequests.push({ method: request.method ?? "", path });
    routeMain(request, response, path);
  });
  mainServer.on("upgrade", (request) => {
    mainRequests.push({ method: "UPGRADE", path: request.url ?? "" });
    request.destroy();
  });
  await listen(mainServer);
  const mainAddress = mainServer.address() as AddressInfo;
  mainOrigin = `http://127.0.0.1:${mainAddress.port}`;
});

test.afterAll(async () => {
  await closeServer(mainServer);
  await closeServer(canaryServer);
});

test.describe("M0-032 real-browser Worker CSP negation", () => {
  test("strict CSP rejects sendBeacon and every worker channel with zero requests", async ({
    page,
  }) => {
    await page.goto(mainOrigin + "/");
    await page.waitForFunction(
      () => window.__dpWorkerProbe !== undefined,
      undefined,
      { timeout: 10_000 },
    );

    const sendBeacon = await page.evaluate(() => window.__dpWorkerProbe.probeSendBeacon());
    // Chromium 对 navigator.sendBeacon 在 connect-src 'none' 下仍返回 true
    // （返回值不可靠），因此只以服务器侧请求日志证明 beacon 不产生请求。
    expect(sendBeacon.threw).toBe(false);

    const channels = await page.evaluate(() => window.__dpWorkerProbe.probeWorkerChannels());
    expect(channels.fetch.rejected).toBe(true);
    expect(channels.sameOriginFetch.rejected).toBe(true);
    expect(channels.webSocket.rejected).toBe(true);
    expect(channels.eventSource.rejected).toBe(true);
    // Chromium 在 module Worker 中暴露 importScripts 占位函数但调用即抛
    // （结构性否定）；真实 bundle 静态扫描另证不含任何 importScripts 调用。
    expect(channels.importScripts.rejected).toBe(true);
    // Worker 侧不存在 sendBeacon 通道（WorkerNavigator 无该方法）。
    expect(channels.sendBeacon.typeof).toBe("undefined");
    expect(channels.dynamicImport.rejected).toBe(true);
    expect(channels.nestedWorker.rejected).toBe(true);

    const strictAdapter = await page.evaluate(() =>
      window.__dpWorkerProbe.runStrictAdapter(),
    );
    expect(strictAdapter.result.ok).toBe(false);
    if (!strictAdapter.result.ok) {
      expect(strictAdapter.result.code).toBe(LOCAL_ANALYSIS_WORKER_FAILED);
      expect(strictAdapter.result.reason).toBe("wasm-fetch-failed");
    }
    expect(strictAdapter.spawnedCount).toBe(0);

    expect(canaryRequests).toEqual([]);
    expect(canaryUpgrades).toEqual([]);
    expect(mainRequests.filter((entry) => entry.path.startsWith("/prohibited"))).toEqual(
      [],
    );
  });

  test("complete/cancel/timeout/failure all terminate the worker and release references", async ({
    page,
  }) => {
    await page.goto(mainOrigin + "/lifecycle.html");
    await page.waitForFunction(
      () => window.__dpWorkerProbe !== undefined,
      undefined,
      { timeout: 10_000 },
    );

    const complete = await page.evaluate(() =>
      window.__dpWorkerProbe.runLifecycleScenario({
        workerScriptUrl: "/local-analysis/worker/local-analysis-worker.js",
      }),
    );
    expect(complete.result.ok).toBe(true);
    expect(complete.phases).toEqual(["preparing", "evaluating", "finalizing"]);
    expect(complete.spawnedCount).toBe(1);
    expect(complete.spawned[0]?.terminated).toBe(true);

    const cancel = await page.evaluate(() =>
      window.__dpWorkerProbe.runLifecycleScenario({
        workerScriptUrl: "/local-analysis/worker/local-analysis-worker.js",
        abortAfterProgress: 1,
      }),
    );
    expect(cancel.result.ok).toBe(false);
    if (!cancel.result.ok) {
      expect(cancel.result.code).toBe(LOCAL_ANALYSIS_CANCELLED);
      expect(cancel.result.reason).toBe("abort-signal");
    }
    expect(cancel.spawnedCount).toBe(1);
    expect(cancel.spawned[0]?.terminated).toBe(true);

    const timeout = await page.evaluate(() =>
      window.__dpWorkerProbe.runLifecycleScenario({
        workerScriptUrl: "/stalled-worker.js",
        bootstrapTimeoutMs: 400,
      }),
    );
    expect(timeout.result.ok).toBe(false);
    if (!timeout.result.ok) {
      expect(timeout.result.code).toBe(LOCAL_ANALYSIS_WORKER_FAILED);
      expect(timeout.result.reason).toBe("worker-unreachable");
    }
    expect(timeout.spawnedCount).toBe(1);
    expect(timeout.spawned[0]?.terminated).toBe(true);

    const failure = await page.evaluate(() =>
      window.__dpWorkerProbe.runLifecycleScenario({
        workerScriptUrl: "/crash-worker.js",
      }),
    );
    expect(failure.result.ok).toBe(false);
    if (!failure.result.ok) {
      expect(failure.result.code).toBe(LOCAL_ANALYSIS_WORKER_FAILED);
      expect(failure.result.reason).toBe("worker-terminated");
    }
    expect(failure.spawnedCount).toBe(1);
    expect(failure.spawned[0]?.terminated).toBe(true);

    expect(canaryRequests).toEqual([]);
    expect(canaryUpgrades).toEqual([]);
    expect(mainRequests.filter((entry) => entry.path.startsWith("/prohibited"))).toEqual(
      [],
    );
  });

  test("bundle negation, transfer detach and zero forbidden requests in real Chromium", async ({
    page,
  }) => {
    await page.goto(mainOrigin + "/lifecycle.html");
    await page.waitForFunction(
      () => window.__dpWorkerProbe !== undefined,
      undefined,
      { timeout: 10_000 },
    );

    const scan = await page.evaluate(() => window.__dpWorkerProbe.scanWorkerBundle());
    expect(scan.byteLength).toBeGreaterThan(0);
    for (const key of FORBIDDEN_CHANNEL_KEYS) {
      expect(scan.forbidden[key]).toBe(false);
    }

    const detach = await page.evaluate(() => window.__dpWorkerProbe.probeTransferDetach());
    expect(detach.before).toBe(64);
    expect(detach.afterDetach).toBe(0);
    expect(detach.receivedByteLength).toBe(64);

    expect(canaryRequests).toEqual([]);
    expect(canaryUpgrades).toEqual([]);
    expect(mainRequests.filter((entry) => entry.path.startsWith("/prohibited"))).toEqual(
      [],
    );
  });
});