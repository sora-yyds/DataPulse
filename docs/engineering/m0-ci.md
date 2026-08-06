# M0-019 GitHub Actions CI 阶段实现

> 任务：M0-019
> 需求：NFR-QA-001、NFR-QA-002、NFR-QA-005、NFR-REL-005、NFR-REL-006
> 决定：ADR-0037、ADR-0038、ADR-0040
> 状态：五个 workflow 表面已编写并通过本地校验（PyYAML 解析、`check:governance` 95/95+7/7、actionlint v1.7.12 且二进制 SHA-256 已核对）；main 首次推送的真实 `m0 / main-review` 已复跑通过（run 31081289668，`verify:pr` 6/6，详见第 6 节）。merge queue required check、保护分支、失败 PR／merge-group 否定验证、公开 Fork 复现与干净 Ubuntu 矩阵未执行，因此任务与 CI-ACTIVATION 保持 `in_progress / partially_evidenced`

## 1. 工作流表面

| 文件 | 触发 | 稳定 check 名 | 内容 |
|---|---|---|---|
| `.github/workflows/ci.yml` | `pull_request` | `m0 / ci / m0 / pr-quick` | 快检：`check:toolchain`、`check:foundation`、`check:dependencies`、`check:design`、`check:fixtures`、`test:unit`、`test:component` |
| `.github/workflows/ci.yml` | `merge_group` | `m0 / ci / m0 / daily-required` | 已激活日常聚合 `verify:pr`（evidence bootstrap + 5 个已激活 gate，含六类 runner） |
| `.github/workflows/main-review.yml` | `push` main | `m0 / main-review / m0 / main-review` | main 复核：`verify:pr` 完整聚合 |
| `.github/workflows/m0-exit.yml` | `workflow_dispatch` | `m0 / exit-candidate / m0 / verify-m0-exit` | 独立退出聚合 `verify:m0`，M0 未完成期间非零为正确结果，不加入 required set |
| `.github/workflows/release-dry-run.yml` | `push` tag `v*` | `m0 / release-dry-run / m0 / release-dry-run` | 标签 dry-run：`build` + `verify:pr`，不发布、不建 Release；构建物/校验和/SBOM 由 M0-020 补齐 |

## 2. 与本地聚合器合同对齐

- checkout 使用完整历史（`fetch-depth: 0`），浅克隆失败不能降级为跳过；
- `DATAPULSE_MERGE_BASE` 由事件派生：PR／merge_group 用 `git merge-base origin/<base> HEAD`，push main 用 `github.event.before`（首次推送回退 `HEAD^`），workflow_dispatch／tag 用 `HEAD^`；与 `M0_HISTORY_BASE_EQUALS_HEAD` 的 fail-closed 语义一致；
- 固定 Node `24.19.0`（自带 Corepack `0.35.0`）+ `packageManager` 固定的 pnpm `11.20.0`，`corepack pnpm install --frozen-lockfile`；
- Playwright Chromium 显式 `corepack pnpm exec playwright install --with-deps chromium` 安装，不依赖 postinstall 或外部缓存；
- 已激活项失败必须非零：`verify:pr`／`verify:m0` 以退出码驱动 job 结果；未实现 gate 不进日常聚合，不锁死合并。

## 3. 权限与 Fork 路径

- 所有 workflow 顶层 `permissions: {}`，不使用 GITHUB_TOKEN、secrets 或付费 SaaS；
- 无 `pull_request_target`；Fork 的 `pull_request` 以只读 token 运行同一路径；
- 远程 Action 全部固定完整 40 位 SHA：checkout v7.0.1（`3d3c42e5…`）、setup-node v7.0.0（`82076278…`）；
- concurrency 键只使用仓库与数字／Git 派生 ID：PR 用 `pull_request.number`，merge_group 用队列 `head_sha`（merge_group 事件无数字 ID，SHA 由 Git 校验且不会进入 shell），push／tag／dispatch 用固定键或 `github.sha`。

## 4. 视觉基线平台策略

`tests/visual/deterministic-ui-smoke.spec.ts` 的四主题像素基线只在维护者固定 Windows 环境运行（`process.platform === "win32" && !CI`）；CI／Linux 环境设计性跳过并显式记录原因，避免用缺失的 `-linux` 基线制造必然失败。固定环境、字体回退链、键盘焦点、200% 缩放与响应式冒烟继续在 CI 真实执行。Linux／CI 平台基线需按平台单独生成并人工审查后启用。

## 5. 证明边界

## 6. 首次真实 GitHub 运行发现与修复

`main` 首次推送触发 `m0 / main-review`（run 31080835495，Ubuntu 24.04）后，`verify:pr` 暴露两类跨平台问题并已修复：

- **pnpm shim 缺失**：checkout／merge-base／Node 24.19.0／frozen install／Playwright 安装均成功，但 `check:toolchain` 的 `pnpm --version` 与 turbo 都报 `ENOENT`／`Unable to find package manager binary`。原因：GitHub runner 上 Node 自带 corepack 但未启用 shim，裸 `pnpm` 不在 PATH。修复：所有 job 在 setup-node 后显式 `corepack enable`。
- **designmd 版本输出平台差异**：`designmd --version` 在 Linux 输出 `[log] 0.4.0`（自带日志前缀），Windows 输出 `0.4.0`；`check:design` 的 `DESIGN_CLI_BIN_VERSION` 断言要求精确 `0.4.0`。修复：`scripts/check-design.mjs` 对 CLI 版本输出归一化剥离 `[log] ` 前缀，仍强制固定版本 `0.4.0`。

其余已激活 gate（DEPENDENCY-BOUNDARIES 2068/2068、CI-ACTIVATION）在首次 Linux 运行即通过；`DATAPULSE_MERGE_BASE` 由 `github.event.before` 正确解析，`check:evidence` bootstrap 通过。修复后的复跑与 Windows 本地 `check:design` 356/356 均通过。

本切片证明 workflow 文件语法与治理契约有效（PyYAML、`check:governance` 95/95+7/7、actionlint v1.7.12 且二进制 SHA-256 已核对），且 main 推送的真实 `m0 / main-review`（Ubuntu 24.04）已复跑通过（`verify:pr` 6/6）。它不证明：merge queue required check、保护分支、失败 PR／merge-group 否定验证、公开 Fork 复现或干净 Ubuntu 矩阵通过；这些由 M0-046 与退出阶段闭合。
