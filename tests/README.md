# Test scope

`tests/` 只保存跨 workspace、跨浏览器或跨部署 seam 的验证；模块内部行为优先在对应 workspace 内通过其公开 interface 测试。

当前真实入口：

- `architecture/check-workspace.mjs`：构建并核对 M0-006 的必需 workspace、显式 exports、TypeScript references、产物与消费侧解析。
- `architecture/dependency-boundaries.mjs`：M0-007 的单一分析 interface，封装完整依赖策略、源码 import、exports、references 与循环检查。
- `architecture/check-dependencies.mjs`：运行真实仓库和临时恶意 fixture；任何架构越界或自测回归都返回非零。
- `governance/check-repository-governance.mjs`：核对 Changesets、CODEOWNERS、PR 模板和最小权限 workflow，并拒绝 `pull_request_target`、浮动 Action、写权限或治理绕过。
- `design/design-warning-baseline.v1.json`：逐项冻结固定 `@google/design.md@0.4.0` 已审查 warning；由根 `check:design` 同时核对 4×35 主题与生成物。

以下目录只在所属任务具备真实 fixture 或断言时创建，不放置返回成功的占位：

- `fixtures/`：M0-017；
- `e2e/`：M0-016、M0-043、M0-067；
- `device-checklists/`：M0-023 及后续真实设备认证。
