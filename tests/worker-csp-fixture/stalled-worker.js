/**
 * M0-032：超时场景的“永不确认”module Worker。
 * 故意忽略所有消息，使 BrowserWorkerAdapter 的 bootstrap ACK 超时触发
 * worker-unreachable，并验证超时后 Worker 被 terminate。
 */
self.addEventListener("message", () => {
  /* 故意不回复：冻结 bootstrap ACK。 */
});