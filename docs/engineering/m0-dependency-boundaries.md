# M0-007 依赖方向与循环检查

## 1. 阶段口径

本检查对应 `M0-007`、`M0-010`、`NFR-REL-001`、`DEPENDENCY-BOUNDARIES`，实施依据为 ADR-0029、ADR-0030 与 ADR-0035。它在当前 Windows 执行面形成依赖边界与 domain 合同的阶段实现及自动证据，但不改变以下状态：

- M0-006 的正式前置尚未闭合；
- 干净 Ubuntu 与 GitHub Actions 尚未运行；
- M0-010 的 Windows 合同已经接入，干净 Ubuntu、GitHub Actions 与统一人工复核仍未运行；
- 因此 gate 保持 `in_progress / partially_evidenced`；M0-009 只将当前真实根断言激活到日常聚合，不得据此宣告 M0-007、M0-010 或 `REPO-FOUNDATION` 完成。

## 2. Module 与 interface

依赖检查 module 的唯一程序 interface 是：

```js
analyzeDependencyBoundaries({ repositoryRoot })
```

调用者只提供仓库根目录，并取得确定性 JSON 结果；workspace 发现、完整策略目录、源码 AST、manifest 图、TypeScript project references、exports 与循环检测都封装在 implementation 内。预期中的非法仓库输入返回稳定诊断而不是抛出异常。CLI 只负责参数、JSON 输出、自测编排和退出码，不复制依赖规则。

文件职责：

| 文件 | 职责 |
|---|---|
| `tests/architecture/dependency-boundaries.mjs` | 深 module；分析仓库并返回稳定结果 |
| `tests/architecture/check-dependencies.mjs` | CLI；运行当前仓库、domain 合同与临时恶意 fixture，失败时返回非零 |
| `packages/domain/tests/domain-contract.mjs` | M0-010 合同；验证公开领域 ID、协议隔离版本注册、稳定错误码与可区分 Result DTO |

正常根运行先用固定 Node 与仓库本地 TypeScript CLI 构建 `packages/domain`，再动态加载其 `runDomainContract()`；显式 `--root` 只用于临时 fixture，不要求复制真实 domain 合同。构建、加载、导出、执行或摘要结构异常都归一为稳定 `DOMAIN_CONTRACT_*` 诊断，且不回显编译输出、异常正文或恶意输入。该 implementation 复用已固定的 TypeScript Compiler API，不增加第三方依赖、workspace 或运行时 bundle。

## 3. 完整方向策略

策略目录从第一天登记规划中的全部 23 个 workspace；当前只分析已经实例化的 7 个，不为延期 module 创建空实现。允许集合是上限，不要求尚无消费者的依赖提前出现。

```text
domain / story-schema / themes -> ∅
story-migrations -> domain + story-schema
metric-runtime -> domain + story-schema
crypto / import-engine / api-contracts -> domain
analysis-engine -> domain + metric-runtime
evidence -> story-schema + analysis-engine + metric-runtime
narrative -> story-schema + metric-runtime
local-storage -> domain + crypto + story-migrations
generation -> story-schema + evidence + narrative
renderer -> story-schema + themes
package-codec -> domain + story-schema
provider-adapters -> api-contracts
static-export -> renderer + themes
```

高风险消费者另有精确策略：

- Creator 当前只允许已实例化且确有消费 seam 的 `domain`；新增真实消费者时必须在同一变更中收窄地扩展策略，不依赖其他 app 或 service；
- Viewer 当前不直接依赖 `domain`；完整目标只允许 Schema、迁移、codec、metric runtime、narrative、renderer、themes 与 crypto 子集。浏览器源码的外部 import 暂只允许 React／Vite 明确集合且禁止 Node builtin，manifest 另允许对应类型与构建工具，扩展集合必须随真实消费者同变更审查；
- Custom Connector 的 manifest 只能依赖 `api-contracts`，源码只能导入 `@datapulse/api-contracts/connector-message`，外部 package 与 Node builtin 默认集合均为空；
- Model Proxy 只允许 `api-contracts + provider-adapters`；Share API 与 Telemetry Ingest 只允许 `api-contracts`；
- 任一 service 都不能依赖 app、其他 service 或本地 import/analysis/storage implementation。

Package `exports` 仍是生产者的公开解析 seam，不是按消费者访问控制。Connector 的更窄能力通过源码 import 策略单独强制。

## 4. 自动断言

检查合并以下事实后再判定：

- `dependencies`、`optionalDependencies`、`peerDependencies` 与 `devDependencies` 中的 `@datapulse/*` 依赖；
- 每个 workspace 的 TypeScript project references；
- workspace 内全部 TS／JS 源码，以及有效 tsconfig `fileNames` 中的静态 import、type import、re-export、字面量 dynamic import、`require` 和常见 resolver／glob 调用；
- JSDoc `import()`、triple-slash path／types 指令，以及局部同名 `require`／`module` 的 TypeScript 符号归属；
- package 显式 exports 与消费者专属 subpath；
- package／TypeScript／browser／Vite alias，以及 `link:`、`file:`、`portal:`、`npm:` 和 workspace alias 等本地所有者改写入口；
- workspace、源码、配置和相对 import 的 symlink／junction 与 realpath 边界；
- `pnpm-workspace.yaml` 的精确 scope／设置，以及 root `pnpm`／`overrides`／`resolutions`／`workspaces` 和 `.pnpmfile.*` 依赖图改写旁路；
- workspace manifest 有向图与完整策略有向图。
- `@datapulse/domain` 的前缀化 opaque ID（含字段、判定规则与叙事规则的独立身份）、协议 kind 隔离版本注册、稳定安全错误与 `ok` 判别 Result DTO 合同。

以下情况均返回稳定 `ARCH_*` 诊断并使进程非零：

- 未登记 workspace、未知或未声明的内部／外部依赖、非精确 `workspace:*` 协议；
- 反向依赖、Viewer／Connector／service 越界或任意循环；
- project reference 与 manifest 依赖不一致、TypeScript 输入逃逸 workspace，或尚未支持的 `paths/baseUrl/rootDirs`、package `imports`／`browser`／`typesVersions` 别名；
- `link:`／`file:`／`portal:`／`npm:`、workspace package alias、symlink／junction、realpath 逃逸、绝对路径、URL 模块标识，或含百分号编码、反斜杠、query／fragment 歧义的相对模块路径；
- 跨 workspace 相对深导入、自身 export 回绕、未公开 subpath 或通配符 export；
- package export target 逃逸生产者 workspace；
- 非字面量 dynamic import／`require`、`require.resolve/call/apply/bind`、`module.require`、`import.meta.resolve/glob`、`process.getBuiltinModule` 能力传播、裸或浏览器全局 `eval`／`Function`／`constructor`，以及不透明 `node:module` resolver 等静态检查旁路；
- Vite 对象／数组／计算／赋值 alias、`mergeConfig`、plugin、本地静态／动态配置片段、程序化 API 和 `--config/-c` 自定义入口；在解析后 realpath module graph 落地前，只接受单一静态 `export default` 对象或 `defineConfig(静态对象)`；
- 空 workspace 集合、不可解析 manifest／tsconfig／源码。

`--self-test` 使用系统临时目录生成合法与恶意仓库，验证合法最小 workspace、已声明外部 package 子路径、Connector 消息协议、Share HTTP 子路径、局部 resolver 同名绑定、内部 `..hidden` 路径和静态 Vite 配置可通过，并验证两／三节点循环、package → app、Viewer／Connector／service 越界、相对深导入、未知／未声明／未导出 import、JSDoc／triple-slash、各类 alias、scope／workspace symlink／junction 与 realpath 逃逸、pnpm 图改写、浏览器全局动态代码、ESM 路径规范化、TypeScript 输入／reference 漂移、Vite 动态配置和间接 resolver 旁路被拒绝。恶意 fixture 会启动真实 CLI 并断言退出码为 `1`、不加载真实 domain 合同；参数缺失另断言退出码为 `2`，防止只检查内部结果却遗漏 CI 退出语义。

## 5. 精确命令与退出语义

在仓库根目录、冻结 Node `24.19.0` 环境运行：

```powershell
corepack pnpm run check:dependencies
```

通过标准：输出 `check=dependency-boundaries`、`result=passed`，`executed>=1`、`failed=0`、`skipped=0`，当前仓库 `cycles=0`，并且 `selfTest.result=passed`、`domainContract.result=passed`。仓库违规、domain 构建／合同失败或自测失败返回 `1`；CLI 参数错误返回 `2`。

## 6. 延期验证

| 验证 | 当前状态 | 闭合条件 |
|---|---|---|
| Windows 固定工具链、本地真实仓库、M0-010 domain 合同与恶意 fixture | 阶段已运行并取证 | 最终 subject hash 与干净目录报告一致 |
| 干净 Ubuntu 的大小写、路径与 symlink 行为 | `not_run` | 在固定工具链和冻结锁文件下重跑同一根命令 |
| GitHub Actions required check | `not_run` | M0-009 已接入本地日常聚合器；M0-019／046 仍须运行真实 workflow、ruleset 与否定 PR，不以本地结果替代 |
| 完整 allowlist 人工签署 | `not_run` | 后续统一人工验证批次核对架构与策略；不替代自动断言 |
| M0-010 稳定领域 ID／协议隔离版本／错误码／Result 合同 | Windows 本地阶段已取证 | 在干净 Ubuntu、真实 GitHub Actions 与统一人工复核中重跑并核对后继记录；gate 此前仍为 `in_progress / partially_evidenced` |

Ubuntu、CI 和人工验证是正式闭合条件。当前 Windows 结果允许继续其他经项目所有者授权的阶段预实现，但不能被解释为这些条件已经通过。
