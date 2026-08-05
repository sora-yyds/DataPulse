# GitHub Actions 最小权限约定

> 任务：M0-008
> 状态：仓库约定已建立；真实 required check、protected `main` 与 merge queue 仍由 M0-019／046 验证
> 适用范围：`.github/workflows/` 与被其调用的本地 Action／脚本

本约定约束 GitHub Actions 的权限和不可信输入边界。它不表示远端 ruleset 已配置，也不能替代真实失败 PR、merge group 或直接推送否定测试。

## 1. 权限与触发器

- workflow 默认使用 `permissions: {}`；确需 GitHub API 时，只在 workflow 或 job 显式授予最小只读权限。写权限必须有对应任务、ADR／架构依据和独立安全评审。
- PR 工作流只使用 `pull_request`。禁止 `pull_request_target`，包括所谓“只读”“临时”或 Fork 兼容旁路。
- Fork PR 不读取仓库、环境或组织 secret，不依赖维护方 token、付费专有 SaaS 或真实供应商凭据。内建 `github.token` 也必须受显式最小 `permissions` 约束。
- 所有 job 设置有限 `timeout-minutes`；重复运行使用只由仓库与 GitHub 数字 ID 组成的 `concurrency` key，不能使用 PR 标题、分支名或正文拼接 shell 命令。

## 2. 依赖与不可信输入

- 第三方和 GitHub 官方 Action 一律固定到完整 40 位提交 SHA，并在旁注记录审查时对应的版本；禁止 `@main`、浮动 major tag 或短 SHA。本地 Action 使用仓库相对路径。
- PR 标题、正文、分支名、Issue 文本、文件内容和 Action 输出均视为不可信。通过 `env` 或结构化文件传递，禁止直接插值到 `run` shell。
- PR 工作流不执行来自 Fork 的任意脚本并同时持有写权限；不上传密钥、用户内容、证据包、提示词、发布密文或完整错误正文。
- 下载的工具、浏览器和二进制必须由锁文件、固定版本、校验和或受审查 Action 提供；安全和核心协议不得依赖不可审计的远程运行时代码。

## 3. Check、日志与发布

- required check 使用稳定且唯一的 workflow／job 名；重命名必须与 ruleset 在同一治理变更中更新并回读，不能制造同名空 job。
- 已激活 gate 失败、`executed=0`、`skipped>0`、过期报告或缺少 attestation 时必须非零；未实现 gate 不得以成功占位。
- 日志只记录无内容状态、稳定错误码和必要环境版本；不得输出 secret、Authorization、真实用户数据或跨会话标识。
- 正式写权限、Release、SBOM、merge queue 聚合和 M0 退出工作流分别由 M0-019、020、045、046 落地；在这些任务完成前，本文件不授权发布或远端配置变更。

当前 PR 标题 workflow 仅授予 `pull-requests: read`，通过固定 SHA 的语义标题 Action 读取 PR 元数据，不 checkout、不执行 Fork 代码，也不提供忽略 label 或 WIP 绕过入口。
