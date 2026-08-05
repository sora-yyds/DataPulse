# M0-006／014 workspace 与构建边界

> 任务：M0-006、M0-014
>
> 状态：Windows 工程链已验证；Ubuntu 与统一人工验证延期
>
> 适用决定：ADR-0028、ADR-0029、ADR-0030

本任务只建立后续 M0 近期任务会真实消费的 module、独立构建入口与显式 export seam。它不提前实现业务 interface，不把空 UI、空 HTTP 路由、假 IaC 或零断言测试冒充产品能力。

## 1. 当前 workspace

| 路径 | 包名 | M0 消费者 | 本任务冻结的 interface |
|---|---|---|---|
| `packages/domain` | `@datapulse/domain` | M0-010，以及 Creator／API contract | 仅根 `.` export；领域 ID、稳定错误与 Result DTO 尚未实现 |
| `packages/api-contracts` | `@datapulse/api-contracts` | M0-036～039、M0-058～062 | 只开放 `./connector-message`、`./http`、`./origin-policy`；禁止根 export 和通配符 export |
| `packages/themes` | `@datapulse/themes` | M0-014、M0-015、M0-018 | 零依赖根 `.` export；只公开由 `DESIGN.md` 生成的四主题语义 Token 类型与值 |
| `apps/creator` | `@datapulse/creator` | M0-015、M0-043 | 独立 TypeScript 构建入口；尚无 React、Vite 或产品 composition |
| `apps/viewer` | `@datapulse/viewer` | M0-015、M0-067 | 独立 TypeScript 构建入口；不引入导入、分析、AI 或本地项目存储 |
| `apps/custom-connector` | `@datapulse/custom-connector` | M0-038、M0-058、M0-059 | 独立低权限构建入口；登记 Connector 消息协议为唯一允许消费的 subpath |
| `services/share-api` | `@datapulse/share-api` | M0-036、M0-060～062 | 独立无状态服务构建入口；不提前实现 M3 分享产品路由 |

应用和服务不是可被其他 workspace 依赖的库，因此不声明 `exports`。三个共享包均为 `private: true`，只从 `dist/` 暴露列举的 JavaScript 与声明文件，不开放源码深导入或 `./*`。

## 2. 当前依赖方向

```text
@datapulse/domain
  ├─ @datapulse/api-contracts
  │    ├─ @datapulse/custom-connector
  │    └─ @datapulse/share-api
  └─ @datapulse/creator

@datapulse/viewer
@datapulse/themes
```

依赖同时使用 `workspace:*` 与 TypeScript project reference 表达。Viewer 当前不直接依赖 `domain`；后续只在正式 Schema、迁移、codec、metric runtime、narrative、renderer、themes 与 crypto 消费落地时按完整目标集合原子加入。当前跨 workspace 消费只验证包链接、构建产物和 exports map 可解析；业务源码 import 必须在对应 interface 真正落地的任务中原子加入，禁止发明 package marker、健康 DTO、成功空响应或 side-effect import。

Custom Connector 当前构建链验证 `@datapulse/api-contracts/connector-message` 可解析，并拒绝未公开的 contracts 根；M0-007 源码策略另行强制 Connector 只能导入该受限 subpath。Share API 当前验证 `./http` 与 `./origin-policy` 可解析。

## 3. 构建与验证链

每个 workspace 继承根严格 TypeScript 基线，并使用独立的：

- `tsc --build tsconfig.json` 入口；
- `composite` project reference；
- `src/` 输入、`dist/` 输出与 `dist/.tsbuildinfo`；
- JavaScript、类型声明及其 source map。

根 `build` 由 Turbo 按 `^build` 排序。`check:workspace` 先运行真实构建，再执行 `tests/architecture/check-workspace.mjs`，验证必需 workspace、package metadata、显式 exports、project references、构建产物、消费侧解析和禁止的 API Contracts 根 export。失败返回非零，不是占位聚合器。

`@datapulse/themes` 自身为零依赖；M0-014 的 Design CLI 只作为根开发工具，产品运行时 bundle 增量为 0。第三方工具评估见 `m0-workspace-tool-dependencies.md`。

## 4. 延期目录

以下 module 在当前任务没有真实 interface，不创建空包：

- `packages/story-schema`、`packages/story-migrations`、`packages/metric-runtime`、`packages/renderer`：在 M0-011～015、M0-048、M0-049 出现正式消费者时创建；
- `packages/crypto`、`packages/local-storage`：在 M0-021 及后续协议任务创建；
- `packages/import-engine`、`packages/analysis-engine`、`packages/evidence`、`packages/generation`：在 M0-028～033、M0-050、M0-054～056 创建；
- `packages/narrative`、`packages/package-codec`、`packages/provider-adapters`、`packages/static-export`：分别留给其 M1／M2／M3 能力；
- `services/model-proxy`、`services/telemetry-ingest`：分别留给 M2 模型连接与后续明确同意遥测；
- `infra/aliyun`、`infra/self-host`：只在真实 OpenTofu／编排入口落地时创建；
- `tests/fixtures`、`tests/e2e`、`tests/device-checklists`：只在存在真实 fixture、runner 或人工清单时创建。

`infra/README.md` 与 `tests/README.md` 只登记作用域和禁止内容；它们不是已通过的 IaC 或测试产物。

## 5. 延期验证

Windows x64 使用固定 Node `24.19.0`、Corepack `0.35.0`、pnpm `11.20.0`、Turbo `2.10.8` 与 TypeScript `6.0.3` 验证冻结安装、7 个 workspace 构建和 workspace 契约。

当前执行面没有 WSL 发行版或容器运行时，因此干净 Ubuntu 未运行；统一人工边界复核也延期。两项不会被记为 Windows 的 skipped，也不会被表述为通过。`M0-005`、`M0-006` 与 `REPO-FOUNDATION` 继续保持进行中；日常 gate 的激活只表示当前真实根断言必须持续通过，不代表完整 gate 已完成。
