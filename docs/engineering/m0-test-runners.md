# M0-016 测试 runner 阶段实现

> 任务：M0-016  
> 需求：NFR-QA-001、NFR-QA-002  
> 决定：ADR-0037、ADR-0038  
> 状态：Windows x64 六类真实 runner 与结构化日常检查已验证并激活；干净 Ubuntu、GitHub Actions、公开 Fork 与完整视觉／无障碍矩阵尚未运行，因此任务和 gate 仍为 `in_progress / partially_evidenced`

## 1. 当前测试 seam

M0-016 不增加产品接口。六类 runner 复用 M0-015 已有的正式字节、Story Artifact Reader、共享 `metric-runtime`、Creator／Viewer composition 和受控 Renderer：

| runner | 环境 | 当前真实产品断言 |
|---|---|---|
| Vitest | Node、fork pool、单 worker | 7 个文件、173 项；覆盖正式 Story／Metric Runtime Schema、Reader、迁移隔离、确定性指标、Creator／Viewer composition 与 Renderer |
| React Testing Library | jsdom、单 worker | 1 个文件、2 项；仅 mock 浏览器 `fetch`，验证两端 `App` 从 loading 进入可追溯 KPI `23` 且无 alert |
| Storybook + addon-vitest | Playwright Chromium | 1 个真实 Renderer story；从 Viewer 正式 fixture 经 Reader／composition 准备，并在 `play` 中验证标题、KPI、范围和 evidence |
| Playwright | 两个 production HTTP preview | Creator／Viewer 各 1 项；验证文档标题、应用身份、标题、KPI `23`、范围、evidence 和无 alert |
| axe | 两个 production HTTP preview | Creator／Viewer 各 1 项；不排除产品节点、不禁用规则，要求实际规则结果非零且自动可检测违规为零 |
| Playwright 视觉冒烟 | 同一对 production HTTP preview | 24 run／18 passed／6 designed skips；固定 `zh-CN`、`Asia/Shanghai`、弱动效与四主题 Token，覆盖 Creator／Viewer 桌面、Viewer 平板／手机视口，检查字体回退链、`:focus-visible` 焦点环、200% 缩放、响应式与四主题视觉基线 |

Storybook 的 `@storybook/addon-a11y` 固定 `parameters.a11y.test = "error"`，因此 story test 会把 addon 检出的违规转为失败。独立 `test:a11y` 仍直接运行 `@axe-core/playwright`；二者不是给同一命令换名字。

## 2. 根入口与 fail-closed 行为

每个根入口先构建 12 个 workspace，避免依赖工作树中既有 `dist`：

```powershell
corepack pnpm run test:unit
corepack pnpm run test:component
corepack pnpm run test:storybook
corepack pnpm run test:e2e
corepack pnpm run test:a11y
corepack pnpm run test:visual
corepack pnpm run check:test-runners
```

Vitest 配置全部设置 `passWithNoTests=false` 和 `allowOnly=false`；Playwright 设置 `forbidOnly=true`、`retries=0`、单 worker 和固定 test directory。Storybook 先做静态构建，再通过独立 Vitest browser project 执行 story；静态 build warning 不能替代测试结果。

`scripts/check-test-runners.mjs` 以参数数组和 `shell:false` 调用包管理器，Windows 使用 `corepack.cmd`／`pnpm.cmd` shim，兼容仓库含空格路径。它依次真实运行六个根脚本，捕获子进程输出，只打印一个 `datapulse-root-check-summary`；失败时保留各子命令的有界输出尾部，最终退出非零，不把未通过入口记作跳过。环境注入的 `DATAPULSE_GATE_ID` 与 `DATAPULSE_RUN_NONCE` 原样回显，供 `verify:pr` 生成新鲜 attestation。

TEST-RUNNERS 的日常激活绑定：

- check name：`m0 / test-runners`；
- summary check：`test-runners`；
- root script：`check:test-runners`；
- 精确命令：`node ./scripts/check-test-runners.mjs`；
- 命令 SHA-256：`b188d26b5eca9e36d0199bced5106125bb63313bbd1c78341b88553a110c5909`。

激活表示该真实检查从此进入日常聚合，不表示 M0-016、TEST-RUNNERS 或 M0 已完成。

## 3. 浏览器固定条件

当前 Windows 运行固定 Playwright `1.62.1`、Chromium revision `1234`（Chrome for Testing `151.0.7922.34`）、`zh-CN`、`Asia/Shanghai`、light color scheme、`prefers-reduced-motion: reduce`、禁止 Service Worker、无权限、单 worker、零重试。Creator 使用 `127.0.0.1:4173`，Viewer 使用 `127.0.0.1:4174`；两个 preview 都启用 `--strictPort` 且 `reuseExistingServer=false`，端口占用必须显式失败。每个 preview 在对应 app cwd 中直接运行固定 Node／Vite CLI，不经过额外的 `corepack`／`pnpm` wrapper；这样 Playwright 在 Windows 上拥有实际监听进程树并能在 E2E、axe 与视觉冒烟连续运行之间同步释放端口。`test:visual` 复用同一对 preview 与 launcher 边界；根 Vitest 合同固定该 launcher 边界，防止重新引入脱离清理树的孙进程。Playwright runner 级 `use.reducedMotion` 在当前版本不生效，视觉冒烟在 `openStory` 中显式 `page.emulateMedia({ reducedMotion: "reduce" })` 兜底。

pnpm 安装固定 JavaScript 依赖，但不下载浏览器二进制。首次本地运行需显式执行：

```powershell
corepack pnpm exec playwright install chromium
```

该外部缓存不能由锁文件或 Windows 阶段报告冒充干净 Ubuntu／CI 已具备。M0-019 已在 `ci.yml`／`main-review.yml`／`m0-exit.yml`／`release-dry-run.yml` 中显式执行 `corepack pnpm exec playwright install --with-deps chromium`，公开 Fork 以相同步骤复现；真实 GitHub 运行待推送远端。

## 4. 依赖和产品边界

RTL、Storybook、Vitest browser provider、Playwright 与 axe 都是根 `devDependencies`；仅 `@datapulse/renderer` 作为根测试开发依赖暴露公共包名。Story 文件保留在根 `tests/storybook`，不会把 Storybook 依赖写入 Viewer manifest 或高风险浏览器产品源码。应用 Vite 配置没有 plugin、alias 或根共享配置，Creator／Viewer 产品 bundle 不包含测试 runner。

pnpm `11.20.0` 默认阻止未批准的依赖安装脚本；Storybook／Vite 所需 `esbuild@0.28.1` 仅通过 `pnpm-workspace.yaml` 的精确 `allowBuilds.esbuild=true` 放行。该变化已纳入依赖边界冻结配置，不形成任意包脚本通配。

## 5. 当前证明边界

Windows 阶段结果证明六类 runner 都有至少一个真实 M0 产品断言，结构化根检查可以在含空格工作区内 fail-closed 重跑并绑定新鲜 nonce。它不证明：

- HTTPS 或 Creator／Viewer／API／Connector 四 Origin；端口差异不是 Cookie 隔离证据；
- M0-018 的固定字体、四主题、桌面／平板／手机、键盘、焦点、200% 缩放与视觉基线矩阵（由 M0-018 独立工程文档与 Windows 阶段证据报告记录，不属于本任务证明范围）；
- 完整 WCAG 2.2 AA；axe 只能覆盖自动可检测规则；
- Playwright Chromium 等同真实 Chrome／Edge、Safari、微信或真实设备认证；
- 导入—分析—生成—编辑—保存—分享链路；当前页面仍是只读验证探针；
- 干净 Ubuntu、GitHub Actions、merge queue、公开 Fork 或 required check 已通过。

因此 M0-016 与 TEST-RUNNERS 保持 `in_progress / partially_evidenced`。M0-017 的统一 fixture manifest 与 M0-018 的固定视觉／键盘／缩放冒烟已在各自 Windows 阶段工程文档与证据报告中记录；规划顺序上的下一项是 M0-019：GitHub Actions PR 快检、merge queue 完整矩阵、main 复核与 M0 退出候选。
