/**
 * M0-032：CSP 通道否定探针 Worker（module worker，无任何 import）。
 *
 * 本 Worker 响应自身携带严格 CSP（default-src 'none'、script-src 'none'、
 * connect-src 'none'、worker-src 'none'、child-src 'none'），逐一尝试全部被禁
 * 网络／脚本通道并回报结构化结果；跨源目标统一指向 canary Origin（第二本地
 * server），配合服务器侧请求日志证明被禁通道在 CSP 层被拦截、不会产生任何请求。
 * 同源 fetch 也一并验证 connect-src 'none' 对同源同样生效。
 */
const canaryOrigin =
  new URLSearchParams(import.meta.url.split("?")[1] ?? "").get("canary") ?? "";

function describeError(error) {
  return {
    name: error?.name ?? null,
    message: String(error?.message ?? error).slice(0, 200),
  };
}

async function probe(run) {
  try {
    await run();
    return { rejected: false, error: null };
  } catch (error) {
    return { rejected: true, error: describeError(error) };
  }
}

function wsOrigin(origin) {
  return origin.replace(/^http/, "ws");
}

async function runChannelProbes() {
  const report = {};

  report.fetch = await probe(async () => {
    await fetch(canaryOrigin + "/prohibited/fetch");
  });

  report.sameOriginFetch = await probe(async () => {
    await fetch("/prohibited/same-origin-fetch");
  });

  report.webSocket = await probe(
    () =>
      new Promise((resolve, reject) => {
        let settled = false;
        const socket = new WebSocket(wsOrigin(canaryOrigin) + "/prohibited/websocket");
        socket.onerror = () => {
          if (!settled) {
            settled = true;
            reject(new Error("WebSocket error"));
          }
        };
        socket.onopen = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("WebSocket timeout"));
          }
        }, 1_000);
      }),
  );

  report.eventSource = await probe(
    () =>
      new Promise((resolve, reject) => {
        let source;
        try {
          source = new EventSource(canaryOrigin + "/prohibited/eventsource");
        } catch (error) {
          reject(error);
          return;
        }
        const timer = setTimeout(() => {
          source.close();
          reject(new Error("EventSource timeout"));
        }, 1_000);
        source.onerror = () => {
          clearTimeout(timer);
          source.close();
          reject(new Error("EventSource error"));
        };
        source.onopen = () => {
          clearTimeout(timer);
          source.close();
          resolve();
        };
      }),
  );

  let sendBeaconType = "unknown";
  try {
    sendBeaconType = typeof navigator.sendBeacon;
  } catch (error) {
    sendBeaconType = "threw:" + String(error);
  }
  report.sendBeacon = { typeof: sendBeaconType };

  report.importScripts = {
    typeof: typeof importScripts,
    rejected: (() => {
      try {
        importScripts(canaryOrigin + "/prohibited/importscripts.js");
        return false;
      } catch {
        return true;
      }
    })(),
  };

  report.dynamicImport = await probe(async () => {
    await import(canaryOrigin + "/prohibited/dynamic-import.js");
  });

  report.nestedWorker = await probe(
    () =>
      new Promise((resolve, reject) => {
        let worker;
        try {
          worker = new Worker(canaryOrigin + "/prohibited/nested-worker.js");
        } catch (error) {
          reject(error);
          return;
        }
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("nested worker timeout"));
        }, 1_000);
        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error("nested worker error"));
        };
        worker.onmessage = () => {
          clearTimeout(timer);
          worker.terminate();
          resolve();
        };
      }),
  );

  return report;
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === null || typeof data !== "object") {
    return;
  }
  if (data.kind === "run-channel-probes") {
    Promise.resolve()
      .then(runChannelProbes)
      .then((report) => {
        self.postMessage({ kind: "channel-probes-result", report });
      })
      .catch((error) => {
        self.postMessage({
          kind: "channel-probes-result",
          report: { internalError: String(error) },
        });
      });
    return;
  }
  if (data.kind === "transfer-probe") {
    self.postMessage({
      kind: "transfer-probe-result",
      receivedByteLength: data.buffer.byteLength,
    });
  }
});