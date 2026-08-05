# M0 工具链、Schema 与基础设施决策基线

> 任务：M0-003  
> 状态：已接受；阿里云 FC Node 24 运行时保留显式阻塞  
> 生效：2026-08-04（Asia/Shanghai）  
> 一手资料：[M0 工具链、基础设施与 Worker 依赖基线研究](../research/m0-toolchain-and-infrastructure-baseline.md)

本文冻结 M0 后续脚手架应消费的工程选择。它不创建 `package.json`、锁文件、IaC state、云资源或 Worker bundle；这些产物分别由 M0-005、M0-022、M0-029、M0-040/041/063/064 实现和验证。

## 1. 已接受决定

| 决策面 | M0 基线 | 实施约束 |
|---|---|---|
| Node.js | `24.19.0`（Krypton LTS） | 开发、CI、构建、服务制品统一精确版本；不使用 `24.x`、`latest` 或本机 Node 20 代替 |
| pnpm | `11.20.0` | 根 `packageManager` 保留 Corepack 生成的版本与 hash；锁文件由相同版本生成 |
| Corepack | `0.35.0` | 显式安装并只作为 pnpm 引导器；设置 `COREPACK_DEFAULT_TO_LATEST=0` |
| workspace 包命名 | `@datapulse/*` | M0 包全部 `private: true`；该内部 namespace 不表示已拥有 npm 公共 scope，公开发布包需另行决策 |
| 实验 Story Schema | `0.1.0` 起步 | 仅用于 M0 前半段的未发布开发样本；不伪造历史正式版本或兼容承诺 |
| 首个正式 Story Schema | `1.0.0` | M0-048 在项目包固定向量、Project Repository 与纵向 E2E 前冻结；之后只能新增显式版本与迁移 |
| IaC CLI | OpenTofu `1.12.5` | 根模块精确 `required_version`；CI action 固定提交 SHA；提交 `.terraform.lock.hcl`，不提交 state/plan/`.terraform/` |
| 阿里云 Provider | `aliyun/alicloud` `1.287.0` | 精确约束并提交跨平台 provider hash；只使用官方 namespace |
| 社区 S3-compatible 候选 | SeaweedFS `4.40` | 固定镜像 digest、非匿名启动，必须通过 `CipherObjectStorePort` 并发条件写入、删除、404、错误与双清理路径 contract |
| 项目 SPDX 标识 | `AGPL-3.0-only` | 既有决定没有授权自动采用以后版本；M0-004 的根许可证、包元数据与源码提供说明保持一致 |

本机当前是 Node `20.20.2`、pnpm `10.34.4` 与 Corepack `0.34.6`，只作为观察事实。进入 M0-005 前必须先切换到上述固定版本并重新回读；不能用本机现状生成正式 workspace 或锁文件。

## 2. 固定与升级方式

M0-005 应原子落地以下内容：

- `.node-version`：`24.19.0`；
- 根 `package.json` 的精确 Node/pnpm engine、`packageManager` 和 `AGPL-3.0-only`；
- 项目级 engine-strict；
- pnpm workspace、锁文件、Turbo 和严格 TypeScript；
- Windows 本地与干净 Ubuntu 的实际版本断言；
- `COREPACK_DEFAULT_TO_LATEST=0`；
- 若使用容器，基础镜像固定 digest 并保留 Node 第三方 notices。

规范引导流程由研究文档记录，使用固定 `corepack@0.35.0` 和 `pnpm@11.20.0`。这里不把尚不存在的根命令写进 `AGENTS.md`，也不把研究时的 ad-hoc 查询命令冒充项目命令。

版本升级必须由单独 PR 同时修改版本文件、`packageManager`、锁文件、CI、制品镜像、SBOM 和本决策记录；不得让 CI 或 Corepack 自动追随新版本。

## 3. 包 namespace 与 Schema 版本

### 3.1 包 namespace

逻辑模块使用 `@datapulse/<name>`，例如未来的 `@datapulse/story-schema`、`@datapulse/metric-runtime` 与 `@datapulse/renderer`。M0-006 只为真实消费者创建包，不按这份示例一次生成空目录。

所有 M0 workspace 包都设为 `private: true`。如果以后需要发布 npm 包，必须先确认公共 scope 所有权、发布边界和许可证元数据；本决定不授予或假定 registry 所有权。

### 3.2 Story Schema

- `0.1.0` 是未发布实验线，只允许在 M0-011～013 的开发样本中演进。
- M0-048 将当前结构提升并冻结为首个正式 `1.0.0`，重新生成类型、Schema hash、正式 fixture 和项目包向量。
- 正式兼容新增提升次版本，破坏性变化提升主版本；每个正式版本和迁移 fixture 永久保留。
- 写入器只写当前正式版本，读取器通过注册表读取支持的历史版本；外部字节始终先限尺寸，再解析、迁移和校验。

证据索引自身的合同版本属于工程质量契约，与 Story Schema 没有版本关联。历史 v1（`schemaVersion=1.0.0`）保持只读；当前 v2（`schemaVersion=2.0.0`）增加已激活 gate 的结构化摘要身份与根命令 hash 绑定。

## 4. IaC 与状态边界

采用 OpenTofu `1.12.5` 和 Alicloud Provider `1.287.0`：

- `.opentofu-version` 在 M0-005/040 首次消费 IaC 时写入 `1.12.5`；
- 根模块精确约束 CLI 与 Provider；首次 `tofu init` 后提交 `.terraform.lock.hcl` 的 Windows、Linux、macOS hashes；
- 不引入没有精确 ref 的远程 module；
- `*.tfstate*`、`.terraform/`、plan 文件与 crash log 永不提交；
- 云凭据只通过短期环境变量、OIDC 或等价批准机制提供，不进入 `.tf`、backend config、plan artifact 或日志；
- 官方远程 state 与产品的临时发布密文 Bucket 分离，不包含用户内容、模型密钥或发布密文；
- 公开 Fork 的 validate/plan 不依赖真实阿里云凭据、付费 SaaS 或维护方远程 state。

Pulumi 暂不采用，因为会增加生成 SDK、Node 插件和状态工作流而没有 M0 产品收益。HashiCorp Terraform 新版不作为全新公开项目的默认工具；OpenTofu 已提供兼容的开放路径。

## 5. 社区对象存储

选择 SeaweedFS `4.40` 作为 M0 社区参考候选，理由是其官方 S3 实现提供集群级原子 `If-None-Match: *`，能覆盖 `CipherObjectStorePort` 的 compare-and-create seam；许可证为 Apache-2.0，且可在公开 Fork 单节点运行。

它只有在下列 M0 验证全部通过后才能成为参考配置：

1. 镜像固定 digest，显式配置非默认凭据，启动检查拒绝匿名模式；
2. 并发客户端对同一 key 条件 PUT 时恰好一个成功，其余稳定为 `412`；
3. ETag 条件操作、普通删除幂等、404、断连、超限与供应商错误归一化通过；
4. 禁用版本化、Object Lock 和保留旧版本的设置，对象 key 不含用户字段；
5. DataPulse 到期事件处理器与独立定时 sweep 分别证明可删除对象；SeaweedFS 每日生命周期只作第三层防御，不单独证明“≤24 小时”；
6. 日志、镜像层、示例配置、IaC state 和测试快照不含 S3 凭据、发布密文或正文。

Garage `2.3.0` 因官方明确无法安全实现条件写入而拒绝；不能用“先 HEAD 再 PUT”制造竞态旁路。MinIO Community 因官方仓库声明停止维护，不作为新参考部署候选。

## 6. Worker 与数据依赖候选

这些版本是后续探针的候选，不是已经进入锁文件的依赖，也不表示安全、性能或真实设备认证通过。

| 能力 | 候选 | 许可证 | 进入实现前的强制门槛 |
|---|---|---|---|
| Argon2id | `hash-wasm@4.12.0` | MIT；需递归收集内嵌实现许可 | 固定向量、参数/内存上限、取消清理、真实设备 ≤5 秒、bundle hash、零网络与独立安全评审；失败则换库，不自写密码学 |
| JCS | `canonicalize@3.0.0` | Apache-2.0 | RFC 8785 与项目 Unicode/数字/边界黄金向量；调用前先限字节、深度和节点数 |
| ZIP 中央目录预检 | `@zip.js/zip.js@2.8.34` | BSD-3-Clause | 强制 `useWebWorkers:false`、禁 OPFS、只读 entry metadata；构建扫描和真实浏览器证明无嵌套 Worker/网络 |
| `.xlsx` 受控解析 | `exceljs@4.4.0` | MIT | 必须先 ZIP 预检，再传有界 ArrayBuffer；不使用 Node streaming API，不执行公式、宏或外链 |
| 本地 SQL | `@duckdb/duckdb-wasm@1.32.0` | MIT | 固定稳定包与 WASM hash，关闭 extension install/autoload 和外部协议；禁止当前指向 dev build 的 npm `latest` |
| Arrow | `apache-arrow@21.2.0` | Apache-2.0 | 只引入必要模块，校验 transferable metadata/字节上限，不使用示例 `fetch` 路径 |

上述实际 bundle 的全部传递依赖进入 SPDX/SBOM 扫描。`NOASSERTION`、自定义许可证、SSPL/BUSL、GPL-2.0-only、Commons Clause 或缺少源码/notice 的组件必须人工阻断。

## 7. 阿里云 FC Node 24 阻塞

Alicloud Provider `1.287.0` 的 FCv3 function runtime 白名单包含 `nodejs20`，但没有 `nodejs22` 或 `nodejs24`；它同时允许 `custom.debian12` 与 `custom-container`。这不能证明云端后台永远不支持 Node 24，却足以阻止当前 IaC 静默声明托管 Node 24。

M0-063 前必须在真实北京地域完成以下二选一决策：

1. API/控制台和 Provider 均已支持托管 Node 24，并以真实 apply 证明；或
2. 新增/取代 ADR，选择固定 Node 24 的 `custom.debian12` 或 custom container，并承担制品、补丁、冷启动、SBOM 和 digest 固定责任。

在此之前：

- 本地服务、CI 和构建仍使用 Node `24.19.0`；
- 可以实现公开 IaC 结构和社区路径；
- 官方函数运行时证据保持 `external_blocked`；
- 禁止回退 `nodejs20` 后仍声称满足“当前 Node.js LTS”，也禁止修改 Provider 白名单冒充云端能力。

## 8. M0-003 完成判断

本任务完成的是可实施口径：精确工具链、包 namespace、实验/正式 Schema 策略、IaC 工具/Provider、社区对象存储候选以及关键许可证/Worker 风险均已冻结并有一手资料。

以下仍不是“通过”证据：

- 锁文件、workspace、Turbo、TypeScript 与版本文件；
- Worker 单文件/禁网、Argon2id 真实设备、ZIP 恶意输入和性能探针；
- SeaweedFS contract、Valkey、双路径 TTL；
- 阿里云北京 IaC apply、FC Node 24、OSS/Tair 删除与官方域证据。

这些状态继续由 [M0 证据索引](../evidence/m0/evidence-index.json) 保持 `planned` 或 `external_blocked`，不能因本决策文档存在而升级为通过。
