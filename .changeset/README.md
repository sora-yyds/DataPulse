# Changesets

Changeset 记录面向用户的行为变化及其 SemVer 影响，为 squash merge 后生成可审计的发布说明。它不是任务状态、测试报告或 M0 gate 证据。

## 何时添加

- 面向用户的功能、修复、兼容性或可观察行为变化必须随同一个 PR 添加 `.changeset/<短名称>.md`。
- 纯测试、内部重构、规划文档或不改变用户行为的仓库治理变化可以不添加，但必须在 PR 模板中说明理由。
- 不得添加空 Changeset 来绕过评审，也不得把安全、Schema 或迁移影响降级描述为普通文案变化。

## 格式

通过根目录的 `corepack pnpm changeset` 交互式创建，选择真正受影响的 workspace 和 `patch`、`minor` 或 `major` 级别，并用简体中文说明用户可观察结果。例如：

```md
---
"@datapulse/creator": minor
---

增加有界 CSV 导入，并在输入超限时保留最后可读项目。
```

M0 workspace 当前均为私有包，因此 `privatePackages` 配置允许版本化私有包，但不为它们创建 npm tag。正式 Release、变更日志、校验和与 SBOM 仍由后续受保护的 GitHub Actions 发布流程负责。
