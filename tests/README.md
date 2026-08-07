# Test scope

`tests/` 只保存跨 workspace、跨浏览器或跨部署 seam 的验证；模块内部行为优先在对应 workspace 内通过其公开 interface 测试。

当前真实入口：

固定 Windows 工作树的当前八类 runner 均已有真实产品断言：Vitest `17 files / 362 tests`、RTL `1 file / 2 tests`、Storybook Chromium `1 file / 1 story test`、Playwright storage `3 files / 13 tests`、Worker CSP `1 file / 3 tests`、Playwright E2E `2 tests`、独立 axe `2 tests`、Playwright 视觉冒烟 `24 run / 18 passed / 6 designed skips`。结构化 `check:test-runners` 真实重跑八个根入口并返回 `8/8`；这仍只是 Windows HTTP 阶段结果，不代表 Ubuntu、GitHub Actions、公开 Fork、HTTPS／四 Origin、完整 WCAG 认证或真实设备矩阵，也不关闭 M0-016／TEST-RUNNERS／M0-018／M0-032。

- `unit/story-blueprint-schema.test.ts`：M0-011／048 的根级交叉契约；`test:unit` 先构建 workspace，再从三个包的公开 `dist` seam 使用 Vitest + Ajv 验证正式 `1.0.0` Story Schema、原始字节 hash、深只读边界、domain opaque ID 与四主题目录。放在根目录是因为它同时核对三个零内部 workspace 依赖的 workspace 的公开事实，不为任一包制造反向依赖。
- `unit/story-blueprint-validator.test.ts`：M0-012／048 的公开 `dist` 合同；验证正式确定性生成物、正式根 bundle 不加载实验 validator、Node ESM／Vite no-write 探针、安全对象快照、资源上限、可信身份／引用、全局条件保持、区块条件收紧、版本化中文文本规则和最小 KPI 白名单。它不解析原始字符串／字节，也不冒充完整自然语言证明或产品应用构建。
- `unit/story-artifact-reader.test.ts`：M0-013／048 的 `@datapulse/story-migrations` 公共 `dist` seam 黑盒合同；验证唯一读取操作／稳定错误码的根运行时 surface、无迁移路由的正式 Result、原始字节先验限制、fatal UTF-8、正式版本识别、`0.x` 拒绝、正式 Creator／Viewer fixture 对齐、失败不替换和 Windows 含空格路径 ESM／Vite no-write 探针；隔离的内部测试继续覆盖未发布 `0.0.1 → 0.1.0` 复制迁移和逐步校验。它不冒充项目仓库原子提交、产品应用构建或跨平台认证。
- `unit/metric-runtime.test.ts`：M0-049 的 `@datapulse/metric-runtime` 公共 `dist` seam 黑盒合同；以正式 `1.0.0` accumulator／plan Schema 和固定 hash fixture 验证 `COUNT_ROWS`、`SUM`、安全整数、IEEE-754 binary64 大端 hex、NaN／Infinity／负零、固定 `mergeOrdinal`、错误集合全排列的固定失败优先级、65,536／65,537 accumulator 数量边界、空选择／溢出不可用、恶意对象，以及 Creator／Viewer 分别读取同一正式 fixture 后的 available／unavailable／error 一致性和 Windows 含空格路径 Node ESM／Vite no-write 探针。M0-015 已在独立测试中消费该 seam，但这里仍不冒充真实 Origin、AVG、精确 `COUNT_DISTINCT` 或完整 FR-MET-009。
- `unit/creator-viewer-renderer.test.ts`：M0-015 的根级组合合同；逐字节核对 Creator／Viewer 各自 Story 与 Metric fixture、正式 Story／Metric manifest，分别执行 Reader → 共享 runtime → composition → Renderer 静态渲染，验证 KPI `23`、范围与 evidence、对象隔离、Reader／runtime 失败不暴露候选、四主题变量、无元素内联主题 style、React 攻击文本转义，以及 Renderer 不导入 metric-runtime 或任意代码执行入口。
- `unit/browser-preview-lifecycle.test.ts`：冻结 Creator／Viewer preview 由各 app cwd 的固定 Node／Vite CLI 直接启动且 `reuseExistingServer=false`，拒绝重新引入会让 Windows 子进程脱离 Playwright 清理树的包管理器 wrapper。
- `unit/fixture-manifest.test.ts`：M0-017 的公开 `verifyFixtureManifest(repositoryRoot)` seam；从真实仓库路径核对四个逻辑集／12 个合成 artifact，并通过只读 memory adapter 拒绝未知 set／generator／oracle、重复 ID、路径逃逸、库存遗漏、bytes／hash 漂移、根 manifest symlink、artifact realpath 逃逸与读取前资源超限。
- `component/creator-viewer-app.test.tsx`：在 jsdom 中只替换浏览器 `fetch` 边界，分别挂载真实 Creator／Viewer `App`；验证正式独立字节从 loading 进入可追溯 KPI `23`，且没有 alert。它不扩大产品组件接口，也不冒充真实浏览器布局或网络隔离。
- `storybook/story-renderer.stories.tsx`：从 Viewer 正式 fixture 经 Reader／composition 准备真实 `StoryRenderer` story；`play` 断言标题、KPI、范围和 evidence。`addon-a11y` 以 `test: error` 参与同一 Chromium story test，但独立页面 axe 仍由专用 runner 负责。
- `e2e/creator-viewer.spec.ts`：通过固定 `4173/4174` 端口、各 app cwd 的直接 Node／Vite CLI 启动两端 production preview，分别验证文档标题、应用身份、标题、KPI `23`、范围、evidence 和无 alert；直接 launcher 让 Playwright 在 Windows 上拥有并同步清理实际监听进程，连续 E2E／axe 运行不得复用残留服务；只证明本地 HTTP Chromium 近似，不证明 HTTPS、Cookie／存储隔离或完整产品链。
- `a11y/creator-viewer-a11y.spec.ts`：对两端完整页面运行不排除产品节点、不禁用规则的 `@axe-core/playwright` 扫描；要求自动可检测违规为零，并要求实际评估的规则结果非零。axe 自动扫描不等于 WCAG 2.2 AA 人工与设备认证。
- `visual/deterministic-ui-smoke.spec.ts`：M0-018 的固定视觉冒烟；复用与 E2E／axe 同一对严格 production HTTP preview 与各 app cwd 直启 Node／Vite CLI 生命周期，固定 `zh-CN`、`Asia/Shanghai`、弱动效和四主题 Token，覆盖 Creator／Viewer 桌面 `1280×720`、Viewer 平板 `834×1112` 与手机 `390×844` 视口，检查字体回退链、`:focus-visible` 焦点环、200% 缩放无水平溢出且核心内容不重叠、响应式不溢出与四主题视觉基线。`openStory` 显式调用 `page.emulateMedia({ reducedMotion: "reduce" })` 兜底 Playwright runner 级 `use.reducedMotion` 不生效的问题。Playwright 快照只是固定 Chromium 的自动近似，不是完整 WCAG 2.2 AA 人工与设备认证。
- `worker-csp/worker-csp.spec.ts`：M0-032 的真实 Chromium Worker CSP 网络通道否定与生命周期释放矩阵；由 spec 自持本地 HTTP server 提供文档严格 CSP 与 Worker 响应自身携带的 CSP，验证 fetch／WebSocket／EventSource／动态 import／importScripts／嵌套 Worker 与 sendBeacon 不产生请求（canary Origin 零请求／零升级），并驱动 BrowserWorkerAdapter 完成／取消／超时／失败四终态均 terminate 独占 Worker 与释放 transferable；spec 内服务器不触碰 Creator／Viewer 的 4173/4174 双 webServer 生命周期合同。
- `../scripts/check-test-runners.mjs`：顺序真实运行 `test:unit`、`test:component`、`test:storybook`、`test:storage`、`test:worker-csp`、`test:e2e`、`test:a11y` 和 `test:visual`，汇总退出状态为绑定 gate／nonce 的 `check=test-runners` 单行 JSON；任一子入口失败时最终非零且不把其他入口记为跳过。
- `fixtures/story-artifacts/formal/`：保存 M0-048 的单一正式 `1.0.0` 合成契约 fixture 与固定原始字节 SHA-256 manifest；该 manifest 与 fixture 一经证据记录即相对可信 merge-base 和长分支受保护提交整体永久不变，未来正式版本新建 manifest 路径。Creator、Viewer 分别读取独立字节副本，只按版本和 hash 对齐，不共享运行时存储，也不冒充产品发布样本。
- `fixtures/metric-runtime/formal/`：保存 M0-049 的正式 accumulator／plan Schema hash 与 Creator／Viewer 黄金向量；`sum-f64-v1` fixture 固定非结合求和和 binary64 舍入位型，不包含原始行、真实用户数据或十进制精确性承诺。
- `fixtures/manifest.v1.json` 与 `fixture-manifest.schema.v1.json`：M0-017 的统一合成 fixture catalog；登记现有四个领域集合的用途、具体 oracle、generator 版本、seed 适用性、子 manifest 及原始 bytes／SHA-256。`check:fixtures` 只读核对路径、库存和身份，不执行未来 generator，也不冒充 M0-047 `test:corpus`。
- `fixtures/creator-viewer-composition/manifest.v1.json`：绑定 M0-015 两端四份物理独立合成资源、正式 Story Schema 与既有 Metric Runtime 黄金 fixture；继续由统一根 catalog 引用，使用 `hand-authored-m0-015-v1` 和原始字节 SHA-256。
- `fixtures/story-artifacts/development/`：只保存 M0-013 的合成未发布开发样本及固定 SHA-256 manifest；`formalHistory=false`、`compatibilityPromise=false`，且不存在 `0.x → 1.0.0` 正式迁移边。
- `architecture/check-workspace.mjs`：构建并核对 M0-006 的 11 个必需 workspace、显式 exports、TypeScript references、产物与消费侧解析，并固定 Story／Metric Runtime Turbo build 历史检查；M0-015 还核对 Renderer 及两端独立 Vite 页面、两个非内联 JSON 资源和禁止 `data:application/json` bundle。
- `architecture/dependency-boundaries.mjs`：M0-007 的单一分析 interface，封装完整依赖策略、源码 import、exports、references 与循环检查。
- `architecture/check-dependencies.mjs`：运行真实仓库和临时恶意 fixture；任何架构越界或自测回归都返回非零。
- `governance/check-repository-governance.mjs`：核对 Changesets、CODEOWNERS、PR 模板和最小权限 workflow，并拒绝 `pull_request_target`、浮动 Action、写权限或治理绕过。
- `design/design-warning-baseline.v1.json`：逐项冻结固定 `@google/design.md@0.4.0` 已审查 warning；由根 `check:design` 同时核对 4×35 主题与生成物。

以下目录只在所属任务具备真实 fixture 或断言时创建，不放置返回成功的占位：

- `fixtures/` 的大型 CSV／XLSX 和完整攻击语料：M0-028／047 及后续拥有真实生成器与断言的任务；
- `device-checklists/`：M0-023 及后续真实设备认证。
