# Test scope

`tests/` 只保存跨 workspace、跨浏览器或跨部署 seam 的验证；模块内部行为优先在对应 workspace 内通过其公开 interface 测试。

当前真实入口：

- `architecture/check-workspace.mjs`：构建并核对 M0-006 的必需 workspace、显式 exports、TypeScript references、产物与消费侧解析。

以下目录只在所属任务具备真实 fixture 或断言时创建，不放置返回成功的占位：

- `fixtures/`：M0-017；
- `e2e/`：M0-016、M0-043、M0-067；
- `device-checklists/`：M0-023 及后续真实设备认证。
