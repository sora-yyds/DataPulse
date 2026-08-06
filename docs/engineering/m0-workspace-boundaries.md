# M0-006／010～016／021／048／049 workspace 与构建边界

> 任务：M0-006、M0-010、M0-011、M0-012、M0-013、M0-014、M0-015、M0-016、M0-021、M0-048、M0-049
>
> 状态：Windows 工程链、domain 合同、M0-048／049 契约、M0-015 本地页面与 M0-016 五类 runner 阶段已验证；固定视觉／无障碍矩阵、Ubuntu、GitHub Actions 与统一人工验证延期
>
> 适用决定：ADR-0028、ADR-0029、ADR-0030

本说明记录后续 M0 近期任务会真实消费的 module、独立构建入口与显式 export seam；其中 `@datapulse/domain` 已按 M0-010 落地最小公共合同，`@datapulse/story-schema` 已在 M0-011／012 基础上按 M0-048 冻结正式 `1.0.0`、生成类型与对象校验 seam，`@datapulse/story-migrations` 按 M0-013／048 集中正式原始字节读取，并把未发布开发迁移隔离在包内测试 seam，`@datapulse/metric-runtime` 按 M0-049 冻结正式 accumulator／plan、最小 `COUNT_ROWS`／`SUM` 求值与两端共享 seam，`@datapulse/crypto` 按 M0-021 建立纯浏览器本地加密原语（base64url、JCS、CSPRNG 与 purpose 绑定 AES-256-GCM）；M0-015 已以受控 Renderer 和两个独立 React／Vite 页面把 Reader、共享指标与正式标题／摘要／KPI fixture 连成最小二维切片。它不提前实现编辑、保存、导入、AI、分享、3D 或其他业务 interface。

## 1. 当前 workspace

| 路径 | 包名 | M0 消费者 | 本任务冻结的 interface |
|---|---|---|---|
| `packages/domain` | `@datapulse/domain` | M0-010，以及 Creator／API contract | 仅根 `.` export；已实现前缀化 opaque ID、协议 kind 隔离版本注册、稳定安全错误与 `ok` 判别 Result DTO |
| `packages/story-schema` | `@datapulse/story-schema` | M0-011～013、M0-048，以及后续 Creator／Viewer Reader | 零内部 workspace 依赖；根 `.` 只公开当前正式 `1.0.0` Schema／对象校验，正式版本 tuple 与 validator mapping 从 history 生成；`./formal-migration-support` 只向迁移包提供正式历史结构校验，`./development-migration-support` 只向迁移包提供未发布开发历史测试；两个受限 subpath 均不得成为产品调用入口 |
| `packages/story-migrations` | `@datapulse/story-migrations` | M0-013、M0-015、M0-048，以及后续项目包／发布包 Reader | 根 `.` 只开放 `readStoryArtifact(bytes, trustedContext)` 操作与稳定错误码；固定原始字节上限、版本注册、迁移链与逐步校验均留在 implementation 内，正式 Result 不暴露迁移路由或开放绕过入口 |
| `packages/metric-runtime` | `@datapulse/metric-runtime` | M0-049、M0-015，以及后续 Creator／Viewer 指标求值 | 只依赖 Domain；根 `.` 公开 `createMetricAccumulator`、`evaluateMetric`、稳定错误码与类型，固定版本、binary64 wire、65,536 输入上限及 merge/finalize 语义留在 implementation／正式 history 内 |
| `packages/crypto` | `@datapulse/crypto` | M0-021，以及后续发布包／项目包／撤销协议 | 只依赖 Domain；纯浏览器本地实现 RFC 4648 无填充 base64url、RFC 8785 JCS、Web Crypto CSPRNG 分块、协议 purpose 与 `aes-256-gcm-v1` 档案；根 `.` 公开封口／开启与稳定错误码，purpose 绑定 JCS AAD 留在 implementation 内 |
| `packages/api-contracts` | `@datapulse/api-contracts` | M0-036～039、M0-058～062 | 只开放 `./connector-message`、`./http`、`./origin-policy`；禁止根 export 和通配符 export |
| `packages/themes` | `@datapulse/themes` | M0-014、M0-015、M0-018 | 零依赖根 `.` export；公开由 `DESIGN.md` 生成的四主题语义色及间距、圆角、排版 CSS Token 类型与值 |
| `packages/renderer` | `@datapulse/renderer` | M0-015、M0-018、M0-067 | 内部 workspace 只依赖 Story Schema 与 Themes，React 为消费者提供的 peer；根 `.` 只接收 `ValidatedStoryBlueprint` 与已解析 KPI 展示 DTO，显式注册 `title-summary`／`kpi`，不读取 fixture、不求值指标或叙事 |
| `apps/creator` | `@datapulse/creator` | M0-015、M0-043 | 独立 TypeScript + Vite 页面构建；从自身正式字节副本经 Reader 与共享指标 seam 形成只读桌面预览，不实现编辑、保存或发布 |
| `apps/viewer` | `@datapulse/viewer` | M0-015、M0-067 | 独立 TypeScript + Vite 页面构建；从自身字节副本经相同 Reader／指标／Renderer 契约形成响应式观看页，不引入 Creator、导入、分析、AI 或本地项目存储 |
| `apps/custom-connector` | `@datapulse/custom-connector` | M0-038、M0-058、M0-059 | 独立低权限构建入口；登记 Connector 消息协议为唯一允许消费的 subpath |
| `services/share-api` | `@datapulse/share-api` | M0-036、M0-060～062 | 独立无状态服务构建入口；不提前实现 M3 分享产品路由 |

应用和服务不是可被其他 workspace 依赖的库，因此不声明 `exports`。七个共享包均为 `private: true`，只从 `dist/` 暴露列举的 JavaScript、声明文件及 Story Schema 所需固定 JSON，不开放源码深导入或 `./*`。

## 2. 当前依赖方向

```text
story-migrations  -> domain + story-schema
metric-runtime    -> domain
crypto            -> domain
api-contracts     -> domain
renderer          -> story-schema + themes
creator           -> domain + metric-runtime + story-migrations + renderer
viewer            -> metric-runtime + story-migrations + renderer
custom-connector  -> api-contracts
share-api         -> api-contracts
domain / story-schema / themes -> ∅
```

依赖同时使用 `workspace:*` 与 TypeScript project reference 表达。`@datapulse/domain` 的公共 seam 已真实存在，并由可执行合同从构建产物验证。Metric Runtime 当前只依赖 Domain；Renderer 的内部 workspace 依赖精确为 Story Schema 与 Themes，React 由精确 peer 声明并由根构建环境及 Creator／Viewer 消费者提供。Creator／Viewer 都通过 Story Migrations 根 Reader、各自的共享指标委托和 Renderer 根 seam 形成产品 composition，两端没有互相依赖或读取对方存储。后续 codec、narrative、crypto 等消费只能在真实 interface 落地时原子加入；禁止发明 package marker、健康 DTO、成功空响应或 side-effect import。

Story Migrations 当前构建链验证 `@datapulse/domain`、Story Schema 根、`./formal-migration-support` 与 `./development-migration-support` 可解析；M0-007 源码策略另行强制只有该包的迁移实现能使用两个受限 Story Schema subpath，公共根 JavaScript 与声明文件不得引用或再导出它们。Metric Runtime、Creator 与 Viewer 分别验证 Domain／共享运行时的根 seam 可解析。Custom Connector 验证 `@datapulse/api-contracts/connector-message` 可解析，并拒绝未公开的 contracts 根；Share API 验证 `./http` 与 `./origin-policy` 可解析。

## 3. 构建与验证链

每个 workspace 继承根严格 TypeScript 基线，并使用独立的：

- `tsc --build tsconfig.json` 入口；
- `composite` project reference；
- `src/` 输入、`dist/` 输出与 `dist/.tsbuildinfo`；
- JavaScript、类型声明及其 source map。

`@datapulse/story-schema` 的构建先以源 JSON Schema 确定性核对已提交的生成类型、Ajv standalone ESM 与正式历史 validator registry，再执行真实 `tsc --build`；生成器显式 UTF-8、LF、无 BOM、拒绝外部 `$ref`，并以脚本自身位置解析含空格路径，不依赖 shell 当前目录。正式历史 manifest 固定 `1.0.0` 的 Schema ID、源路径、原始字节数与 SHA-256；正式协议 hash 始终以源文件原始 UTF-8 字节为准，不以重序列化对象或 `dist` JSON 替代。版本化 JSON Schema 仍作为受控 TypeScript 输入复制到 `dist/`，source／dist 只要求 JSON 深语义相同。正式根运行时只加载正式 standalone validator 和 Ajv 两个静态 helper，不加载实验 validator，也不调用 `Ajv.compile()`、`eval`、`new Function`、CommonJS `require()` 或动态 import。该 workspace 的 Turbo build 禁用缓存并透传 `DATAPULSE_MERGE_BASE`，使正式历史相对可信 merge-base 与 HEAD 可达的受保护提交检查每次真实执行；浅克隆直接拒绝。

`@datapulse/metric-runtime` 的构建同样先核对两个正式 `1.0.0` Schema、生成类型、无 Ajv helper import 的 standalone ESM、版本 metadata 与只追加历史，再执行 `tsc --build`。Accumulator 固定 `COUNT_ROWS`／`SUM`、binary64 大端小写十六进制 wire、正零规范化、ordinal 升序左折叠与不可注入的 65,536 输入上限。该 workspace 的 Turbo build 也禁用缓存并透传 `DATAPULSE_MERGE_BASE`；公共产品源码不导入生成工具或任何第三方运行时 package。

根 Vitest 合同先构建 workspace，再从公开 `dist` seam 核对正式 Schema／Reader／metric runtime／domain／themes／renderer 交叉事实，并对 M0-012 的对象边界、M0-013 的原始字节准入／fatal UTF-8／失败不替换、M0-048 的正式版本／根 bundle 隔离／Reader 最小公开 Result／Story fixture hash、M0-049 的 accumulator／plan hash与稳定求值，以及 M0-015 的两端独立字节、Reader → metric → composition → Renderer、失败不渲染和 React 转义执行测试。未发布复制迁移仍只通过隔离的开发内部 seam 复核。

Creator 与 Viewer 的 `build` 先运行独立 `tsc --build`，再由无 plugin、alias 或共享根配置的 Vite `8.2.0` 生成各自 `dist/site`。`assetsInlineLimit: 0` 保持 Story／Metric JSON 为独立静态资源，workspace 检查同时拒绝 `data:application/json` 进入页面脚本。当前 Creator JavaScript 为 `335.48 kB / gzip 85.94 kB`，Viewer 为 `335.47 kB / gzip 85.94 kB`；M0-016 的 Playwright／axe 只对这些 production HTTP preview 做阶段断言，Storybook 只消费根测试 story。这些仍不是可发布产品、HTTPS Origin 隔离、完整 CSP、固定视觉矩阵或 WCAG 认证。

根 `build` 由 Turbo 按 `^build` 排序。`check:workspace` 先运行真实构建，再执行 `tests/architecture/check-workspace.mjs`，当前以 `424/424` 验证必需 workspace、package metadata、显式 exports、project references、构建产物、两端独立 JSON 资源、消费侧解析和禁止的 API Contracts 根 export。失败返回非零，不是占位聚合器。

`check:dependencies` 的正常根路径另外使用固定 Node `24.19.0` 与仓库本地 TypeScript `6.0.3` 先构建 `packages/domain`，再运行 `packages/domain/tests/domain-contract.mjs`。该合同覆盖公开 seam 的合法／恶意输入，不允许跳过；临时 `--root` fixture 分支不依赖真实仓库合同。

M0-016 的 RTL、Storybook、Playwright 与 axe 全部是根测试工具，不写入 Creator／Viewer manifest。根 story 通过 `@datapulse/renderer` 的公共 package export 消费 Renderer；将 story 放入 Viewer workspace 会被依赖检查视为产品源码并拒绝 Storybook 外部依赖，因此测试与产品图保持分离。`check:test-runners` 顺序真实重跑五类根脚本并输出 `check=test-runners` 的 nonce 绑定摘要；Windows 通过不替代 Ubuntu、GitHub Actions 或公开 Fork。

`@datapulse/story-schema` 与 `@datapulse/themes` 均无内部 workspace 依赖；Story Schema 声明 `ajv@8.17.1` 运行时依赖以解析固定 standalone helper，并声明 `json-schema-to-typescript@15.0.4` 为包级构建依赖。Story Migrations 只依赖仓库内的 Domain 与 Story Schema；Metric Runtime 只依赖 Domain。Renderer 内部 workspace 依赖仅 Story Schema／Themes，并以 React peer 让两端提供同一 UI runtime。React／React DOM、类型包、Vite、bundle 与许可证边界见 `m0-workspace-tool-dependencies.md`。

## 4. 延期目录

以下 module 在当前任务没有真实 interface，不创建空包：

- `packages/local-storage`：在后续协议任务创建（`packages/crypto` 已由 M0-021 建立）；
- `packages/import-engine`、`packages/analysis-engine`、`packages/evidence`、`packages/generation`：在 M0-028～033、M0-050、M0-054～056 创建；
- `packages/narrative`、`packages/package-codec`、`packages/provider-adapters`、`packages/static-export`：分别留给其 M1／M2／M3 能力；
- `services/model-proxy`、`services/telemetry-ingest`：分别留给 M2 模型连接与后续明确同意遥测；
- `infra/aliyun`、`infra/self-host`：只在真实 OpenTofu／编排入口落地时创建；
- `tests/e2e`、`tests/device-checklists`：只在存在真实 runner 或人工清单时创建；`tests/fixtures/story-artifacts/development` 已由 M0-013 建立未发布开发样本，不得称为正式历史。

`infra/README.md` 与 `tests/README.md` 只登记作用域和禁止内容；它们不是已通过的 IaC 或测试产物。

## 5. 延期验证

Windows x64 使用固定 Node `24.19.0`、Corepack `0.35.0`、pnpm `11.20.0`、Turbo `2.10.8` 与 TypeScript `6.0.3` 验证冻结安装、12 个 workspace 构建、workspace 契约、M0-010 domain 合同、M0-011～013 Schema／对象校验／Reader、M0-048 正式 Story `1.0.0`／fixture 契约、M0-049 正式 Metric Runtime `1.0.0`／两端黄金契约，以及 M0-015 Renderer／独立 Creator／Viewer Vite 最小页面链。另以本地 HTTP 浏览器检查 Creator 桌面和 Viewer `1280×720`、`1024×768`、`390×844`，标题、KPI `23`、范围和证据引用均可见且无横向溢出；这不是 M0-018 固定视觉／无障碍矩阵或 HTTPS Origin 证据。

当前执行面没有 WSL 发行版或容器运行时，因此干净 Ubuntu 未运行；真实 GitHub Actions 与统一人工边界复核也延期。这些项不会被记为 Windows 的 skipped，也不会被表述为通过。`M0-005`、`M0-006` 与 `REPO-FOUNDATION` 继续保持进行中；`DEPENDENCY-BOUNDARIES` 即使已有 M0-010 Windows 合同证据，仍保持 `in_progress / partially_evidenced`。日常 gate 的激活只表示当前真实根断言必须持续通过，不代表完整 gate 已完成。
