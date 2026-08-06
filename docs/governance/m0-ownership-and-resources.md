# M0 责任人与外部资源登记

> 任务：M0-002  
> 状态：登记完成；缺失资源按下表保持外部阻塞  
> 更新：2026-08-04（Asia/Shanghai）

本登记只记录责任与验证资源，不保存账号凭据、访问令牌、设备指纹、真实用户数据或云密钥。资源“外部阻塞”不代表 Wave 0 失败；它表示相应实现或 M0 退出证据不能用模拟结果替代。

| 元数据 | 值 |
|---|---|
| 登记格式版本 | `1.0.0` |
| 任务 | `M0-002` |
| 证据状态 | `passed`：登记已建立，资源可用性仍逐项判定 |
| 维护责任 | 仓库所有者；正式维护者任命待确认 |
| 证据入口 | `docs/evidence/m0/evidence-index.json` |

## GitHub 与仓库治理

| 项目 | 登记值 | 状态 | 后续证据 |
|---|---|---|---|
| GitHub 仓库 | ID `1322822015`；`sora-yyds/DataPulse`；public；`https://github.com/sora-yyds/DataPulse.git` | GitHub REST 与 Git 均已验证；2026-08-04 创建，size 0，当前远端无 refs | 首次 push 后回读远端 |
| 本地远程名 | `origin` | 已配置 fetch/push URL | `git remote -v` |
| 默认分支 | `main` | GitHub REST 已确认；本地已初始化且尚无 commit | 首次 push 后核对本地跟踪关系 |
| 仓库所有者账号 | `github:@sora-yyds`，account type `User` | GitHub REST 已确认账号归属；不能据此确认当前操作者身份 | M0-046 回读权限 |
| 初始维护者 | 建议 `github:@sora-yyds` | 待角色确认；尚未验证 repository permission 或 review eligibility | 确认后记录生效时间；新增维护者时更新本表 |
| 第二维护者 | 未登记 | 外部阻塞：不能声称敏感路径已经实现非作者复核 | M0-008/046 前确认治理方案 |
| GitHub ruleset / merge queue 管理责任 | 建议 `github:@sora-yyds` | ruleset 已配置并回读（`m0 / main-protection`：squash-only、`m0 / pr-quick` 必查、non-fast-forward、无 bypass），直接推送与失败 PR 否定测试通过；merge queue 对个人账户不可用（GitHub 官方文档 + REST 422），保持外部阻塞 | M0-046 正例合并；merge queue 需 org 仓库或正式决策 |
| Conventional Commit、Changeset 与 squash merge 维护责任 | 建议 `github:@sora-yyds` | 待角色确认，实现尚未到期 | M0-008、M0-046 |

## 计划中的 CODEOWNERS

M0-008 创建真实 `.github/CODEOWNERS` 时以下规则作为**建议基线**；owner 任命仍待确认。文件创建前不能把本登记冒充 GitHub 已执行的审批规则，也不能在只有一名维护者时声称已经强制非作者复核。

| 路径 | 初始 owner | 理由 |
|---|---|---|
| `*` | `@sora-yyds` | 当前单维护者兜底 |
| `/docs/adr/`、`/docs/PRD.md`、`/docs/ARCHITECTURE.md`、`/CONTEXT.md` | `@sora-yyds` | 产品、领域、架构与决策事实源 |
| `/packages/story-schema/`、`/packages/story-migrations/` | `@sora-yyds` | 正式 Schema 与永久迁移链 |
| `/packages/crypto/`、`/packages/package-codec/`、`/packages/local-storage/` | `@sora-yyds` | 密码协议、包格式与本地数据安全 |
| `/packages/evidence/`、`/services/share-api/`、`/services/telemetry-ingest/` | `@sora-yyds` | 证据外发、分享与隐私边界 |
| `/apps/custom-connector/`、`/infra/`、`/services/` | `@sora-yyds` | Origin、云资源与安全边界 |
| `/.github/`、`/AGENTS.md`、`/DESIGN.md` | `@sora-yyds` | 仓库治理、Agent 与设计基线 |

## 真实设备与性能资源

“协调 owner”负责取得和登记设备，不代表设备已经存在。设备报告只记录完成验证所需的最小公开元数据，不建立跨会话设备 ID。

| 资源 | 最低条件 | 协调 owner | 当前状态 | 首个阻塞任务 |
|---|---|---|---|---|
| Windows 参考创作设备 | 4 核 CPU、8 GB RAM、集成显卡、当前稳定 Chrome 与 Edge | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：具体设备未登记 | M0-035 |
| macOS 参考设备 | 4 核级 CPU、8 GB RAM、集成显卡、当前稳定浏览器 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：具体设备未登记 | M0-035 |
| 当前 iOS Safari 代表设备 | 当前受支持 iOS 与 Safari；运行 KDF/AES/JCS/Fragment 固定探针 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：设备未登记 | M0-023 |
| Android 微信代表设备 | 当前受支持 Android 与微信内置浏览器；运行同一固定探针 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：设备未登记 | M0-023 |
| iOS 微信代表设备 | 当前受支持 iOS 与微信内置浏览器；运行同一固定探针 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：设备未登记 | M0-023 |

参考设备实际到位后，应补充仓库自定义 asset ID、保管/访问方式、OS/build、CPU 与物理核、RAM、集显、可用磁盘、Chrome/Edge 版本与 channel、语言、时区、电源/散热前置条件和 inventory evidence。移动探针按 Safari、Android 微信、iOS 微信三个独立执行环境登记设备档位、OS、浏览器/微信版本、探针与 fixture hash、profile、向量结果、KDF 耗时和内存终止结果。禁止写入序列号、IMEI、广告 ID、账号、Cookie 或稳定设备指纹。

## 阿里云北京与官方托管域

| 资源/责任 | 约束 | 协调 owner | 当前状态 | 首个阻塞任务 |
|---|---|---|---|---|
| 阿里云测试订阅与预算 | 北京地域、最小权限、仅合成测试密文 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：账号/预算未登记 | M0-041 |
| Creator / Viewer 静态 Origin 与 CDN | 独立 Origin，逐应用安全头 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：域名与证书未登记 | M0-041 |
| Connector 安全纪元域 | 每纪元独占且不承载其他应用的可注册域 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：域名池未登记 | M0-041 |
| API 网关与函数计算 | 无状态、逐路由 CORS、无内容日志 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：测试资源未登记 | M0-063 |
| 函数计算 Node 24 运行时决策 | Provider/API/控制台真实支持托管 Node 24，或以新增／取代 ADR 选择固定 Node 24 的 `custom.debian12`／custom container | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：Alicloud Provider `1.287.0` 的 FCv3 白名单没有 Node 22/24，且尚无真实支持证据或替代 ADR | M0-063 |
| 密文 OSS Bucket | 北京地域、默认加密、≤24 小时生命周期、定时清理第二路径 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：测试 Bucket 未登记 | M0-064 |
| Tair 临时状态 | 每个测试键强制 TTL，不保存用户内容 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：实例未登记 | M0-064 |
| 备案、官方测试域与证书责任 | 真实托管域验证；不替代公开 Fork 的本地 `.test` HTTPS 矩阵 | 待确认；建议 `github:@sora-yyds` 协调 | 外部阻塞：域名/证书未登记 | M0-041 |

资源到位后，每项至少补充逻辑 ID、服务类型、北京地域、技术/预算/备份 owner、用途、最小权限角色引用、预算上限与到期、网络暴露、默认加密、生命周期/TTL、定时清理引用、日志策略和证据路径。仓库只登记 CI secret 的名称或不透明 credential reference，不登记任何 AccessKey 或 token。

### 函数计算 Node 24 运行时决策

阿里云账号、预算、域名和 FC 资源到位**不会自动解除**此阻塞。M0-063 只能在以下二者之一完成后进入通过候选：

1. 北京地域 API／控制台与固定 Provider 均支持托管 Node 24，并以真实 apply 和运行时回读证明；或
2. 先新增／取代 ADR，明确采用固定 Node `24.19.0` 的 `custom.debian12` 或 custom container，同时冻结制品 digest、补丁责任、冷启动预算与 SBOM 路径，再进行真实 apply。

禁止把 `nodejs20` 静默当作兼容回退，也禁止只因云资源可创建就把 `ALIYUN-IAC` gate 从 `external_blocked` 改为通过。

## 社区与本地可复现资源

以下资源不能依赖维护方 secret 或付费 SaaS，必须在公开 Fork 复现：

- 多个映射到回环地址的独立 `.test` 可注册域和临时本地 CA/证书；
- 四 Origin 与 Connector 安全纪元的生产式 HTTPS server；
- Valkey；
- 经 M0-003 接受为 contract 候选的 SeaweedFS `4.40`（固定镜像 digest、非匿名配置仍待 M0-040/066）；
- 仓库合成数据、固定种子和当前 M0 语料生成器。

这些能力尚未实现，分别由 M0-039、M0-040、M0-047、M0-060～066 负责。缺少实现时状态是“计划中/未运行”，不是外部阻塞。

## 更新规则

1. 新维护者、设备或云资源到位时更新本表和证据索引；凭据只进入批准的本地/CI secret 机制，绝不进入仓库。
2. 责任人变化不改写历史证据；新增记录说明取代关系和生效时间。
3. M0-046 必须以真实 GitHub ruleset、失败 PR/merge-group 和直接推送否定验证替代本表中的计划状态。
4. M0-023、M0-035、M0-041/042/063/064 的外部阻塞只有真实设备或真实阿里云记录才能解除；M0-063 还必须单独满足上述 Node 24 运行时／ADR 决策，资源到位本身不足以解除。
