# M0 工具链、基础设施与 Worker 依赖基线研究

> 核验时间：2026-08-04（Asia/Shanghai）  
> 对应任务：`M0-003`  
> 适用范围：Node.js／pnpm 固定策略、IaC 工具、社区 S3-compatible 对象存储、AGPL-3.0 与浏览器 Worker 候选依赖。  
> 证据边界：只采用项目所有者的官方文档、官方源码／发布页、官方 Registry/API、RFC 与 Web 标准；检索页和第三方测评未作为结论证据。本文中的“建议”是 DataPulse 的工程判断，不冒充来源原文，也不构成法律意见。

## 结论摘要

| 决策项 | M0 基线 | 状态 |
|---|---|---|
| Node.js | `24.19.0`（Krypton LTS） | **采用**；开发、CI、构建和服务制品统一精确版本 |
| pnpm | `11.20.0` | **采用**；不留在 pnpm 10，也不采用 pnpm 12 beta |
| Corepack | `0.35.0`，只作为 pnpm 引导器 | **采用**；不能依赖 Node 内置的未固定 Corepack |
| IaC | OpenTofu `1.12.5` | **采用**；根模块精确约束，CI 精确安装 |
| 阿里云 Provider | `aliyun/alicloud` `1.287.0` | **条件采用**；锁文件固定，但 FC Node 24 支持存在阻塞 |
| 社区 S3-compatible 存储 | SeaweedFS `4.40` | **采用为 M0 候选**；必须通过 `CipherObjectStorePort` contract 和 TTL 否定测试 |
| Garage `2.3.0` | 不作为 M0 候选 | 官方明确不支持安全的条件写入，不能满足 `If-None-Match` contract |
| MinIO Community | 不作为新参考部署候选 | 官方仓库已声明不再维护 |
| Argon2id | `hash-wasm` `4.12.0` | **条件候选**；Worker／固定向量可行，但维护与独立审计证据不足 |
| JCS | `canonicalize` `3.0.0` | **首选候选**；用 RFC 8785 黄金向量验证 |
| ZIP 预检 | `@zip.js/zip.js` `2.8.34` | **条件候选**；必须关闭其默认嵌套 Worker，并证明零网络／零 OPFS |

冻结这些版本不表示它们已经通过运行时、性能、安全或官方云认证。`M0-005` 才会创建锁文件，Worker 和对象存储候选仍须通过本文列出的验收门槛。

## 1. 仓库约束与选择标准

本研究按以下既有边界作判断：

- [架构](../ARCHITECTURE.md)要求 pnpm workspaces + Turborepo、当前 Node.js LTS、公开 IaC、官方阿里云北京部署，以及由 `CipherObjectStorePort` 隔离 OSS／S3-compatible 差异。
- [实施计划](../IMPLEMENTATION_PLAN.md)要求 M0 冻结精确工具链，社区对象存储覆盖条件写入、删除、not-found 与供应商错误归一化；原始数据 Worker 必须单文件、无运行时 import、无网络、无嵌套 Worker。
- [ADR-0028](../adr/0028-fully-open-source-under-agpl.md)要求全栈以 AGPL-3.0 在 GitHub 公开；[ADR-0034](../adr/0034-alibaba-cloud-beijing-ephemeral-hosting.md)要求官方实例的基础设施配置公开；[ADR-0031](../adr/0031-duckdb-wasm-local-analysis.md)固定了 ExcelJS、DuckDB-WASM 与 Arrow 的技术方向。

因此选择标准不是“最流行”，而是：可精确固定、可在干净公开 Fork 重现、许可证可审计、不依赖付费专有控制面、能满足四 Origin／临时密文／Worker 禁网边界，并能用 contract test 替换供应商。

## 2. Node.js 与 pnpm

### 2.1 截至核验日的事实

Node.js 官方发布页把 `24.19.0` 标为 `Krypton (LTS)`，发布日期为 2026-08-03；官方分发索引也把它记录为当前 v24 LTS 的最新补丁。[N1][N2] 官方发布日程显示 v24 于 2025-10-28 进入 LTS、2026-10-20 转入 Maintenance、2028-04-30 结束支持；v26 在 2026-08-04 仍是 Current，计划到 2026-10-28 才进入 LTS。[N3]

pnpm 官方发布页和 npm 官方 Registry 均显示稳定最新版为 `11.20.0`，发布于 2026-08-03；该包要求 Node `>=22.13`，因此 Node `24.19.0` 满足要求。[P1][P2] pnpm 12 在官方安装文档中仍是 beta 且安装模型不同，不应进入 M0 基线。[P3]

Node v24 虽仍分发 Corepack，但 Node 官方文档把 Corepack 标为 experimental，并明确从 Node v25 起不再随 Node 分发。[N4] pnpm 官方文档又要求先更新 Corepack，以避开旧签名问题；Corepack 官方 README 支持用 `packageManager` 的精确版本和 hash 固定项目包管理器。[P3][C1] 2026-08-04 的 Corepack 官方 npm 包稳定版为 `0.35.0`，其 Node 范围包含 `24.19.0`。[C2]

### 2.2 项目决定

1. **采用 Node `24.19.0`，不采用本机已有的 Node 20。** Node 20 已不能代表“当前 LTS”，也不得作为阿里云运行时限制的静默回退。
2. **采用 pnpm `11.20.0`。** pnpm 11 是稳定主线、与 Node 24 兼容；停留在 pnpm 10 只会在脚手架刚建立时制造一次可避免的大版本迁移。
3. **采用 Corepack `0.35.0` 作为显式引导器。** 不依赖 Node 安装包中碰巧附带的版本；未来 Node 大版本不再附带 Corepack，也不会改变项目固定方式。

### 2.3 M0-005 应落地的固定方式

- `.node-version` 只写 `24.19.0`；GitHub Actions 的 `actions/setup-node` 支持从版本文件读取 Node，CI 仍应在日志中断言实际版本。[N5]
- 根 `package.json` 写精确 `engines.node`／`engines.pnpm`，并由项目级 engine-strict 设置拒绝不匹配环境；不要用 `>=24`、`24.x` 或 `latest` 作为构建基线。
- 根 `package.json` 的 `packageManager` 使用 `corepack use pnpm@11.20.0` 生成的精确值并保留 hash；`pnpm-lock.yaml` 随仓库提交。[P3][C1]
- 本地和 CI 的规范引导流程为：

```powershell
npm install --global corepack@0.35.0
corepack enable pnpm
corepack install --global pnpm@11.20.0
```

  创建根包后，再在仓库根执行一次 `corepack use pnpm@11.20.0` 写入 `packageManager`。这些命令分别来自 Corepack 的官方手动安装、enable、global install 与 use 接口；版本号由本项目固定，不使用文档示例中的 `latest`。[C1]
- CI 明确执行 frozen install；pnpm 11 在 CI 会拒绝由更新主版本写出的不兼容锁文件，因此本地与 CI 必须使用同一 pnpm 版本。[P4]
- 设置 `COREPACK_DEFAULT_TO_LATEST=0`，阻止 Corepack 在项目外查找或自动更新同主线 Known Good Release；版本升级只能由单独 PR 同步修改版本文件、`packageManager`、锁文件、CI 和制品基础镜像。[C1]
- 若直接下载 Node 二进制或构建镜像，验证 Node 官方 `SHASUMS256`／签名；容器基础镜像还应固定 digest，而不是只用可移动 tag。[N6]

### 2.4 阿里云 Function Compute 运行时阻塞

`aliyun/alicloud` Provider `1.287.0` 的当前 `alicloud_fcv3_function` 源码把 `runtime` 限定在一个显式白名单；其中有 `nodejs20`、`nodejs18` 等，但**没有 `nodejs22` 或 `nodejs24`**，同时允许 `custom.debian12` 与 `custom-container`。[A4]

这只证明“当前 Provider 不能用该资源声明托管 `nodejs24`”，不能单凭源码断言 Function Compute 后台永远不支持 Node 24。M0 必须把它作为阻塞而不是猜测：

- 先在真实北京地域验证 Function Compute API／控制台是否已提供 Node 24 托管运行时，并核对 Provider 是否只是验证列表滞后；
- 若没有，选择“固定 Node 24 的 `custom.debian12`／custom container”会增加制品、补丁和冷启动责任，属于需记录的正式部署决定；
- 不得改用已经不符合当前 LTS 基线的 `nodejs20` 后仍声称满足架构；也不得在 Provider 源码中私改白名单冒充云端支持。

在该项解决前，可以完成本地 IaC validate/plan 结构和社区路径，但不能把官方函数运行时证据标记为通过。

## 3. IaC 工具

### 3.1 评估

| 候选 | 一手事实 | DataPulse 判断 |
|---|---|---|
| OpenTofu | `1.12.5` 是 2026-07-21 发布的稳定版；CLI 为 MPL-2.0。OpenTofu Registry 已发现 `aliyun/alicloud` `1.287.0` 的 Windows、Linux、macOS 包和校验和。[T1][T2][A1] | **选择。** 开放 CLI、声明式 plan、阿里云官方 Provider、无需把 IaC 启动依赖于本仓 Node 工具链。 |
| Pulumi | CLI 为 Apache-2.0，官方 Registry 提供 Alicloud package，可用 TypeScript。[U1][U2] | 技术上可行，但会引入生成 SDK、Node 依赖与另一套状态／插件工作流；对 M0 的四 Origin、OSS TTL 和 FC 资源没有额外产品收益，暂不选择。 |

### 3.2 固定决定

- OpenTofu CLI 固定 `1.12.5`，在根模块写精确 `required_version`；CI 的 setup action 固定完整提交 SHA，并把 `tofu_version` 设为精确值，不能用 `latest`。
- `aliyun/alicloud` 固定 `1.287.0`。Provider 的官方 GitHub release 和 OpenTofu Registry 都已发布该版本；M0 首次 `tofu init` 后提交 `.terraform.lock.hcl` 的跨平台 hashes。[A1][A2][T3]
- OpenTofu 官方说明 `.terraform.lock.hcl` 应进入版本控制，它锁定 Provider 选择与校验和；远程 module 不受该锁文件固定，因此 M0 不引入无精确 ref 的远程 module。[T3]
- `.opentofu-version` 写 `1.12.5`，供官方 setup action／本地工具读取；所有 upgrade 由显式 PR 执行 `init -upgrade`，审查版本和 hash 变化。
- Provider 采用 `aliyun/alicloud` 的官方 namespace，不替换为匿名 fork。官方实例的资源覆盖仍须以北京地域真实 `plan/apply` 证明，Registry 中“存在包”不等于资源已成功部署。

### 3.3 State 与凭据边界

OpenTofu 官方文档明确指出 state 含资源 ID 和全部属性，可能包含密码等敏感数据；本地 state 是明文 JSON，backend 参数写入配置、`.terraform` 或 plan 也可能泄漏凭据。[T4][T5] 因而：

- `*.tfstate*`、`.terraform/`、plan 文件和 crash log 不得提交；只有 `.terraform.lock.hcl` 应提交。
- 阿里云访问凭据通过短期环境变量／OIDC 或等价短期机制提供，不写 `.tf`、backend config、plan artifact 或 GitHub 日志。
- 官方远程 state 与产品的 24 小时密文 Bucket 分离，启用静态加密、最小权限、审计和锁；state 是基础设施元数据，不得混入任何用户内容、模型密钥或发布密文。
- 公共 Fork 的 validate/plan 不依赖付费云、真实凭据或远程 state；apply 和真实 TTL 证据保持受保护工作流。

## 4. 社区 S3-compatible 对象存储

### 4.1 Contract 所需的最小能力

M0 只需要存放不透明的端到端加密字节，不需要账号、查询、全文检索或长期内容数据库。候选必须提供：

- 原子的 compare-and-create（`If-None-Match: *`）及需要时的 ETag 条件删除；
- `PUT`／`GET`／`HEAD`／`DELETE`、明确 not-found 与稳定错误归一化；
- 可运行的单节点社区参考配置、非匿名鉴权、固定镜像／二进制；
- 允许 DataPulse 的到期处理器和独立清理 sweep 在 24 小时承诺内删除对象；
- 开源许可证、可审计日志与不依赖付费控制面。

### 4.2 候选比较

| 候选 | 官方证据 | 结论 |
|---|---|---|
| **SeaweedFS `4.40`** | 2026-07-20 稳定发布；Apache-2.0；官方 README 提供 `weed mini`／Docker 的单节点 S3 启动方式。官方 S3 表声明 `PutObject` 支持条件头，专题文档明确 `If-None-Match: *` 是集群级原子 compare-and-create，竞态中最多一个 PUT 成功；同时实现生命周期 Expiration。[S1][S2][S3][S4][S5] | **M0 首选。** 能直接覆盖 `CipherObjectStorePort` 的关键原子语义。 |
| Garage `2.3.0` | 稳定、AGPL-3.0、可单节点运行，且实现部分生命周期；但官方 Known Issues 明确称其架构无法安全实现条件写入／`if-none-match`。[G1][G2][G3] | **拒绝。** 不能用应用层“先 HEAD 再 PUT”模拟原子条件写入。 |
| MinIO Community | AGPL-3.0 且 S3-compatible，但官方仓库顶部已明确写明“不再维护”，最新 community release 停在 2025-10-15。[M1][M2] | **拒绝作为新基线。** 不为新公开参考部署引入已停止维护的服务。 |

### 4.3 SeaweedFS 的落地约束

采用 `4.40` 作为 **M0 contract 候选**，不是直接宣布生产认证：

- 社区编排固定 `4.40` 的镜像 digest，挂载持久卷，显式配置非默认访问密钥；官方 quick start 在未给密钥时可进入匿名开发模式，DataPulse 启动检查必须拒绝该状态。[S2]
- Bucket 禁用版本化、Object Lock 和任何会保留旧版本的设置，避免 `DELETE` 只产生 delete marker；对象 key 使用随机、不含用户字段的标识。
- 运行真实并发测试：多个客户端对同一 key 做 `If-None-Match: *`，只能一个成功，其余稳定为 `412`；另测 ETag 条件删除、普通删除幂等、404、超限对象、断连和供应商错误。[S4]
- SeaweedFS 原生生命周期的默认 worker 为每日运行，官方文档明确过期删除可能滞后“触发时间 + 调度周期”，`Days` 最小实用单位是 24 小时。因此它**不能单独证明 DataPulse 的 ≤24 小时承诺**。[S5]
- 社区路径必须由 DataPulse 的到期事件处理器和独立定时 sweep 各自删除 S3 对象，并把执行截止时间留出安全余量；SeaweedFS 生命周期只做防御性后备。M0-065 要分别故障注入并证明两条 DataPulse 路径可独立完成删除，不能拿存储端“最终会删”代替。
- 日志测试扫描访问密钥、发布密文和正文；S3 凭据只进入运行时 secret，不进入示例文件、镜像层、IaC state 或测试快照。

## 5. AGPL-3.0 与许可证治理

### 5.1 项目许可证标识

GNU AGPLv3 第 13 节要求：若修改版程序通过网络与用户交互，应向这些用户提供通过网络免费取得相应源码的显著方式。[L1] SPDX 把 `AGPL-3.0-only` 与 `AGPL-3.0-or-later` 作为不同标识；仓库 ADR 只确认“AGPL-3.0”，没有授权自动选择以后版本。[L2][L3]

因此 M0-004 应暂按 **`AGPL-3.0-only`** 处理，并在根 `LICENSE`、`package.json.license`、源码标头政策和发布元数据中保持一致。若所有者想采用 `or-later`，应先明确记录，而不是靠模糊的 `AGPL-3.0` shorthand 猜测。官方托管页面应提供指向对应部署 revision 源码的可见链接，构建元数据记录 commit SHA；不能只链接一个可能已变化的 `main`。

GNU 许可清单把 Apache-2.0 视为 GPLv3-compatible，AGPLv3 第 13 节也规定了与 GPLv3 代码组合的处理方式。[L1][L4] 这为 Apache-2.0／MIT／BSD-3-Clause 依赖进入 AGPLv3 项目提供了可行基础，但仍须逐包履行 copyright、LICENSE、NOTICE 和修改声明；本文不替代具体发布物的法律审查。

### 5.2 当前候选的许可证与分发动作

| 组件 | 许可证／来源状态 | 必须动作 |
|---|---|---|
| Node.js `24.19.0` | Node 许可文本及捆绑第三方 notices。[N7] | 若分发 runtime／容器，保留完整 license 与第三方 notices。 |
| pnpm `11.20.0` | MIT。[P2] | 构建工具；固定版本和 Registry integrity。 |
| OpenTofu `1.12.5` | MPL-2.0。[T2] | 作为独立 CLI 使用；若分发或修改其文件，履行 MPL 文件级源码与 notice 义务。 |
| Alicloud Provider `1.287.0` | MPL-2.0。[A3] | 独立 Provider；提交 lock hashes，不把二进制误标为 DataPulse 自有 AGPL 代码。 |
| SeaweedFS `4.40` | Apache-2.0。[S3] | 参考编排保留镜像／二进制来源、LICENSE／NOTICE；DataPulse 自有 adapter 仍为 AGPL。 |
| `hash-wasm` `4.12.0` | MIT；其 LICENSE 提醒内嵌 C 实现可能有其他宽松许可证。[W1][W2] | 生成第三方 notices 时递归纳入内嵌实现许可；不得只看 npm 顶层字段。 |
| `canonicalize` `3.0.0` | Apache-2.0。[J1][J2] | 保留 LICENSE／NOTICE，固定 RFC 8785 vectors。 |
| `@zip.js/zip.js` `2.8.34` | BSD-3-Clause。[Z1][Z2] | 保留 copyright、条件和免责声明。 |
| ExcelJS `4.4.0` | MIT。[E1][E2] | 同时审计实际浏览器 bundle 的全部 transitives。 |
| DuckDB-WASM `1.32.0` 稳定包 | MIT。[D1][D2] | 固定 npm 稳定包和 WASM hash；禁止用当前指向 dev build 的 `latest` tag。 |
| Apache Arrow JS `21.2.0` | Apache-2.0，含 NOTICE 机制。[R1][R2] | 保留 LICENSE／NOTICE，按实际 bundle 生成 SBOM。 |

M0 依赖门槛应解析完整 SPDX expression 并扫描产物，而不只扫描直接依赖。`NOASSERTION`、自定义许可证、SSPL／BUSL、GPL-2.0-only、带 Commons Clause 或无法取得源码／notice 的包必须人工阻断；“项目本身是 AGPL”不能替代第三方条款履行。

## 6. 浏览器 Worker 候选与兼容性

### 6.1 标准与仓库边界

HTML Worker 规范会从构造参数取得脚本 URL并抓取 classic script 或 module graph；module 的静态／动态依赖本质上仍可能触发网络加载。[B1] CSP `worker-src` 和 `connect-src` 分别约束 Worker 加载与连接，但 CSP 是第二道边界，不能替代单文件 bundle 和依赖审计。[B2] WebAssembly 编译还受 CSP 的 Wasm code-generation 控制。[B3]

DataPulse 因而必须把“支持浏览器／支持 Worker”与“满足原始数据 Worker”区分开。合格产物应同时满足：无运行时 import、无 CDN／extension autoload、无嵌套 Worker、无 OPFS／IndexedDB／Cache 写入、固定 WASM 由主线程先取证再传入，并在交付带标记原始数据后用真实浏览器否定测试证明没有请求。

### 6.2 候选评估

#### Argon2id

- `hash-wasm` `4.12.0` 官方说明支持 Argon2id、现代浏览器和 Web Worker，WASM 以 base64 字符串打包、零运行时依赖，因此比外部 `.wasm` fetch 更容易形成固定单文件密码学 Worker。[W1]
- 风险是官方最后一个 release／源码提交仍为 2024-11-19，README 没有给出 Argon2 实现的独立审计承诺；其内嵌 C 代码许可证还要逐项收集。[W2][W3]
- `@noble/hashes` `2.2.0` 更活跃、MIT、零依赖并提供 Argon2id，但官方明确警告纯 JS Argon2 约慢于 native 5 倍，且既有 Cure53 audit 不包含 Argon2。[W4]

**决定：** `hash-wasm@4.12.0` 作为首个实验候选，只有在固定 Argon2id 向量、参数／内存上限、取消与资源清理、弱设备耗时、bundle hash、零网络和许可清单全部通过后才能进入 `packages/crypto`。`@noble/hashes` 只作交叉实现／回退评估，不以“更活跃”掩盖其官方性能和审计说明。任一候选失败就更换库，不自写 Argon2。

#### JCS

RFC 8785 定义 I-JSON 约束、ECMAScript primitive 序列化和按 UTF-16 code unit 排序的 JSON Canonicalization Scheme。[J3] `canonicalize@3.0.0` 官方说明直接实现 RFC 8785，并提供 TypeScript 类型，许可证为 Apache-2.0。[J1][J2]

**决定：** 作为首选候选。Artifact Reader／codec 必须先限制输入字节、深度和节点数，再解析／canonicalize；用 RFC 8785 和项目恶意数字／Unicode／深层对象向量证明 Creator 与 Viewer 字节一致。不能把库函数当成无界 JSON parser。

#### ZIP 预检

`@zip.js/zip.js@2.8.34` 是 BSD-3-Clause 浏览器 ZIP 库，条目接口提供压缩／解压尺寸，适合在 ExcelJS 前读取中央目录做数量、总大小、压缩比和 ZIP64 准入。[Z1][Z2] 但官方类型定义显示 `useWebWorkers` 默认 `true`，默认 worker URI 和 WASM URI 也可能产生额外加载；它还提供 OPFS 临时流。[Z3]

**决定：** 只把它作为预检候选，并强制 `useWebWorkers: false`、禁用 OPFS 路径、固定内存 reader；预检阶段只列 entry metadata，不解压正文。构建后扫描不得包含可达的 `new Worker`、worker URI、WASM URI、动态 import 或网络 URL；真实 Worker 否定测试必须覆盖。若无法证明，淘汰该候选，不放宽 CSP。

#### 已接受技术方向中的风险

- ExcelJS 官方只称“部分库”在浏览器测试过，浏览器只支持 document-based workbook，不含 streaming reader/writer；`4.4.0` 也是 2023 年发布的旧稳定包。[E1][E3] M0 必须先做 ZIP 预检、再给 ExcelJS 有界 ArrayBuffer，拒绝公式执行、宏与外链；不能把 Node streaming API 带进 Worker。
- DuckDB-WASM 官方 README 明确说明默认 HTTP 栈、extension lazy install／autoload 会在运行时取网络资源，且默认架构本身使用 Web Worker。[D1] DataPulse 只能使用固定稳定 npm 包 `1.32.0`，关闭 extension install/autoload 与外部文件协议，由主线程预取并 hash 校验 WASM，再组合进既定单文件 Worker。当前 npm `latest` 指向 `1.33.1-dev57.0`，不得使用 dist-tag。[D3]
- Apache Arrow JS `21.2.0` 官方支持现代浏览器并提供 ESM bundle。[R1] 仍要只引入需要的模块，验证 transferable metadata 和字节上限；示例中的 `fetch` 不是 DataPulse 可用路径。

## 7. M0 的阻塞项与验收动作

| 项目 | 当前状态 | 解除条件 |
|---|---|---|
| FC Node 24 | **阻塞官方运行时** | 北京地域真实 API／控制台证明托管 Node 24，或正式决定并验证固定 Node 24 custom runtime/container；禁止 Node 20 静默回退 |
| `hash-wasm` Argon2id | 条件候选 | 固定向量、资源／性能、Worker 零网络、bundle hash、内嵌许可证和安全评审通过 |
| `canonicalize` | 条件候选 | RFC 8785 + 项目 Unicode／数字／边界向量一致，输入先有界 |
| `zip.js` | 条件候选 | 关闭嵌套 Worker／OPFS，中央目录预检正确，恶意 ZIP 和零网络测试通过 |
| SeaweedFS | 条件候选 | `CipherObjectStorePort` 并发 contract、非匿名启动、删除／404／错误归一化、两条 DataPulse TTL 路径和日志脱敏通过 |
| OpenTofu／Alicloud | 工具选择完成 | M0-005 固定 CLI／Provider／lock hashes；M0-041/064 真实 plan/apply 另行取证 |

本研究完成的是“可实施口径”。它不声称任何云资源、Worker 产物、TTL 或密码学实现已经通过。

## 8. 一手来源

### Node.js、pnpm 与 Corepack

- **[N1]** [Node.js 24.19.0 (LTS) 官方发布页](https://nodejs.org/en/blog/release/v24.19.0)
- **[N2]** [Node.js 官方发行索引](https://nodejs.org/dist/index.json)
- **[N3]** [Node.js Release Working Group 官方 schedule.json](https://github.com/nodejs/Release/blob/main/schedule.json)
- **[N4]** [Node v24.19.0 Corepack 文档](https://github.com/nodejs/node/blob/v24.19.0/doc/api/corepack.md)
- **[N5]** [actions/setup-node v7 官方 README](https://github.com/actions/setup-node/blob/v7.0.0/README.md)
- **[N6]** [Node.js v24.19.0 官方 SHA256 清单](https://nodejs.org/dist/v24.19.0/SHASUMS256.txt)
- **[N7]** [Node.js v24.19.0 LICENSE 与第三方许可](https://github.com/nodejs/node/blob/v24.19.0/LICENSE)
- **[P1]** [pnpm v11.20.0 官方发布](https://github.com/pnpm/pnpm/releases/tag/v11.20.0)
- **[P2]** [npm Registry：pnpm 11.20.0](https://registry.npmjs.org/pnpm/11.20.0)
- **[P3]** [pnpm 官方安装文档](https://pnpm.io/installation)
- **[P4]** [pnpm 官方 CI 文档](https://pnpm.io/continuous-integration)
- **[C1]** [Node Corepack 官方 README](https://github.com/nodejs/corepack/blob/main/README.md)
- **[C2]** [npm Registry：Corepack 0.35.0](https://registry.npmjs.org/corepack/0.35.0)

### IaC 与阿里云 Provider

- **[T1]** [OpenTofu v1.12.5 官方发布](https://github.com/opentofu/opentofu/releases/tag/v1.12.5)
- **[T2]** [OpenTofu 官方 MPL-2.0 LICENSE](https://github.com/opentofu/opentofu/blob/main/LICENSE)
- **[T3]** [OpenTofu Dependency Lock File](https://opentofu.org/docs/language/files/dependency-lock/)
- **[T4]** [OpenTofu：Sensitive Data in State](https://opentofu.org/docs/language/state/sensitive-data/)
- **[T5]** [OpenTofu：Backend Configuration 与凭据警告](https://opentofu.org/docs/language/settings/backends/configuration/)
- **[A1]** [OpenTofu Registry：aliyun/alicloud versions API](https://registry.opentofu.org/v1/providers/aliyun/alicloud/versions)
- **[A2]** [Alicloud Provider v1.287.0 官方发布](https://github.com/aliyun/terraform-provider-alicloud/releases/tag/v1.287.0)
- **[A3]** [Alicloud Provider 官方 MPL-2.0 LICENSE](https://github.com/aliyun/terraform-provider-alicloud/blob/master/LICENSE)
- **[A4]** [Alicloud Provider FCv3 function runtime 白名单源码](https://github.com/aliyun/terraform-provider-alicloud/blob/v1.287.0/alicloud/resource_alicloud_fcv3_function.go)
- **[U1]** [Pulumi Alicloud 官方 Registry package](https://www.pulumi.com/registry/packages/alicloud/)
- **[U2]** [Pulumi CLI 官方 Apache-2.0 LICENSE](https://github.com/pulumi/pulumi/blob/master/LICENSE)

### S3-compatible 对象存储

- **[S1]** [SeaweedFS 4.40 官方发布](https://github.com/seaweedfs/seaweedfs/releases/tag/4.40)
- **[S2]** [SeaweedFS 官方 README 与单节点／Docker S3 quick start](https://github.com/seaweedfs/seaweedfs/blob/4.40/README.md)
- **[S3]** [SeaweedFS Apache-2.0 LICENSE](https://github.com/seaweedfs/seaweedfs/blob/4.40/LICENSE)
- **[S4]** [SeaweedFS 官方 S3 Conditional Operations](https://github.com/seaweedfs/seaweedfs/wiki/S3-Conditional-Operations)
- **[S5]** [SeaweedFS 官方 S3 Lifecycle 与 timing 说明](https://github.com/seaweedfs/seaweedfs/wiki/S3-Lifecycle)
- **[G1]** [Garage v2.3.0 官方发布 API](https://git.deuxfleurs.fr/api/v1/repos/Deuxfleurs/garage/releases/latest)
- **[G2]** [Garage v2.3.0 官方 S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)
- **[G3]** [Garage v2.3.0 官方 Known Issues：无安全条件写入](https://git.deuxfleurs.fr/Deuxfleurs/garage/src/tag/v2.3.0/doc/book/reference-manual/known-issues.md)
- **[M1]** [MinIO 官方仓库 README：repository no longer maintained](https://github.com/minio/minio/blob/master/README.md)
- **[M2]** [MinIO Community 最后一个官方 release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z)

### 许可证、Worker 标准与库候选

- **[L1]** [GNU Affero General Public License v3](https://www.gnu.org/licenses/agpl-3.0.html)
- **[L2]** [SPDX：AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html)
- **[L3]** [SPDX：AGPL-3.0-or-later](https://spdx.org/licenses/AGPL-3.0-or-later.html)
- **[L4]** [GNU license list：Apache License 2.0](https://www.gnu.org/licenses/license-list.html#apache2)
- **[B1]** [WHATWG HTML：Web workers](https://html.spec.whatwg.org/multipage/workers.html)
- **[B2]** [W3C Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)
- **[B3]** [WebAssembly Content Security Policy](https://webassembly.github.io/content-security-policy/)
- **[W1]** [hash-wasm 官方 README](https://github.com/Daninet/hash-wasm/blob/v4.12.0/README.md)
- **[W2]** [hash-wasm 官方 LICENSE](https://github.com/Daninet/hash-wasm/blob/v4.12.0/LICENSE)
- **[W3]** [hash-wasm v4.12.0 官方发布](https://github.com/Daninet/hash-wasm/releases/tag/v4.12.0)
- **[W4]** [@noble/hashes 官方 README：Argon2 性能与 audit 范围](https://github.com/paulmillr/noble-hashes/blob/2.2.0/README.md)
- **[J1]** [canonicalize 官方 README](https://github.com/erdtman/canonicalize/blob/v3.0.0/README.md)
- **[J2]** [canonicalize 官方 Apache-2.0 LICENSE](https://github.com/erdtman/canonicalize/blob/v3.0.0/LICENSE)
- **[J3]** [RFC 8785：JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
- **[Z1]** [zip.js v2.8.34 官方 README](https://github.com/gildas-lormeau/zip.js/blob/v2.8.34/README.md)
- **[Z2]** [zip.js v2.8.34 官方 BSD-3-Clause LICENSE](https://github.com/gildas-lormeau/zip.js/blob/v2.8.34/LICENSE)
- **[Z3]** [zip.js v2.8.34 Configuration／WorkerConfiguration 类型](https://github.com/gildas-lormeau/zip.js/blob/v2.8.34/index.d.ts)
- **[E1]** [ExcelJS 官方 README：Browser 范围](https://github.com/exceljs/exceljs/blob/v4.4.0/README.md#browser)
- **[E2]** [ExcelJS v4.4.0 MIT LICENSE](https://github.com/exceljs/exceljs/blob/v4.4.0/LICENSE)
- **[E3]** [npm Registry：ExcelJS 4.4.0](https://registry.npmjs.org/exceljs/4.4.0)
- **[D1]** [DuckDB-WASM 官方 README：网络与 extension autoload](https://github.com/duckdb/duckdb-wasm/blob/v1.32.0/README.md)
- **[D2]** [DuckDB-WASM v1.32.0 MIT LICENSE](https://github.com/duckdb/duckdb-wasm/blob/v1.32.0/LICENSE)
- **[D3]** [npm Registry：@duckdb/duckdb-wasm dist-tags](https://registry.npmjs.org/@duckdb%2Fduckdb-wasm)
- **[R1]** [Apache Arrow JS 官方 README：browser 与 packaging](https://github.com/apache/arrow-js/blob/v21.2.0/README.md)
- **[R2]** [Apache Arrow JS 官方 LICENSE／NOTICE](https://github.com/apache/arrow-js/tree/v21.2.0)
