/**
 * M0-032：失败场景的“处理消息即崩溃”module Worker。
 * 收到 bootstrap 后抛错，触发 Worker error 事件，使适配器以
 * worker-terminated 结束，并验证失败后 Worker 被 terminate。
 */
self.addEventListener("message", () => {
  throw new Error("intentional worker crash");
});