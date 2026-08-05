# M0 仓库治理入口

> 任务：M0-008
> 状态：本地治理文件与静态否定检查已建立；GitHub 远端强制仍外部阻塞
> 更新：2026-08-05（Asia/Shanghai）

本切片建立 Changesets、PR 模板、敏感路径所有权、Conventional Commit PR 标题检查和 GitHub Actions 最小权限约定。它只证明仓库中的治理配置可审查，不把尚未配置的 protected `main`、merge queue、squash merge 或 required check 表述为通过。

## 已建立边界

- `.changeset/config.json` 允许当前私有 workspace 生成版本与变更说明，但不创建 npm tag；面向用户的变化必须添加真实 Changeset。
- `.github/CODEOWNERS` 标出产品事实源、Schema／迁移、密码学、本地数据、证据、分享、隐私、Origin 和部署路径。当前只有候选 owner `@sora-yyds`，因此不能声称已经强制非作者复核。
- PR 模板要求任务／需求／ADR、验证、未运行风险、Changeset、跨层同步和安全边界说明。
- PR 标题 workflow 只响应 `pull_request`，授予 `pull-requests: read`，不 checkout Fork 代码，并将 `amannn/action-semantic-pull-request` 固定到提交 `48f256284bd46cdaab1048c3721360e808335d50`（上游 `v6.1.1`）。该 Action 使用 Node 24，许可证为 MIT，只影响 GitHub CI，不进入浏览器、Worker 或服务 bundle。
- 本地治理 checker 只使用 Node.js 内置模块，验证真实配置并对 `pull_request_target`、浮动 Action、写权限、敏感路径缺失、Changesets 私有包 tag 和模板缺项运行恶意变体。

## 依赖影响

Changesets CLI 由根集成变更以精确开发依赖加入锁文件；它只在开发／发布编排中运行，不进入任何产品 bundle。其自身和 PR 标题 Action 均须随锁文件／固定 SHA 复核许可证、上游维护与安全公告。M0-008 不增加产品运行时依赖，不改变浏览器、Worker、服务或原始数据边界。

## 延期验证

- GitHub workflow 语法与标题失败路径仍需在首次 push 后由真实 PR 回读。
- `main` ruleset、merge queue、squash-only、required check 和无法直接推送由 M0-046 真实否定测试证明。
- 两名维护者到位前，CODEOWNERS 只标记责任路径，不能满足 NFR-REL-003 的非作者复核部分。
- M0-009 的 activation registry、`verify:pr`、`verify:m0` 和新鲜 attestation 不属于本切片。
