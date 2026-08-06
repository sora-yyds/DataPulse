# M0 证据索引

本目录是 M0 **工程质量验证**事实的机器可读入口，不是产品领域中的 Evidence/证据包，不是测试结果的人工摘要，也不替代 PRD、ADR、架构或路线图。

## 文件

- `evidence-index.schema.v1.json`：只读保留的首版证据索引合同，供历史不可变 record 校验。
- `evidence-index.schema.v2.json`：当前证据索引 JSON Schema；v2 为已激活 gate 增加稳定 `summaryCheck` 与根命令 SHA-256，并同时拒绝把 `verify:pr`／`verify:m0` 登记为自身脚本。这里的合同版本与 Story Schema 版本无关。
- `m0-exit-manifest.v1.json`：M0 退出信任根，冻结 35 个 gate、67 个任务及每个 gate 静态定义的 SHA-256。其文件 hash 同时固化在 Schema、索引和验证器中。
- `m0-external-subject-policies.v1.json`：冻结五个真实外部 gate 必须覆盖的 contract／implementation／verification 角色及允许的仓库路径范围，防止用一个无关文件冒充被测 subject。
- `external-subject-manifest.schema.v1.json`、`external-environment-profile.schema.v1.json`、`external-attestation.schema.v1.json`：真实 GitHub、设备与阿里云证据的三类版本化内容契约；分别绑定被测 revision/文件、脱敏环境和非模拟通过断言。
- 上述外部 JSON 定义三类版本化内容契约，`validate-evidence-index.mjs` 对 `external_environment / passed` record 执行冻结 subject policy、revision 祖先、文件与修订字节 SHA-256 及 attestation 绑定校验；只有真实外部验证完成并留下可回读证据时 gate 才能标为 `passed`，平台 API 回读或提供方签名未落地前不能凭本地自我声明解除 `external_blocked`。
- `manual-review-attestation.schema.v1.json`：人工评审凭证契约；把唯一 record、gate、评审时间、评审人、完整主体集合及其工作树 SHA-256 绑定为不可变通过证明。
- `evidence-index.json`：M0-E1～E6 映射、原子 `gateCatalog`、当前状态和已产生的证据记录。它是唯一状态与 activation registry，不另建容易漂移的激活清单。
- `validate-evidence-index.mjs`：无第三方运行时依赖的语义验证器，核对退出 manifest、静态 gate hash、任务覆盖、PRD/ADR 引用、record 链、文件 hash 和当前 fail-closed 状态；它不代替 JSON Schema 校验，也不冒充 `verify:m0` 的自动门槛重跑。

M0-E1～E6 只是 Epic 分组，不能作为六条粗粒度“通过”记录。`gateCatalog` 将退出标准拆成原子 gate；Schema 以 35 个有序 slot 固定其 ID，manifest 再固定静态定义。删除、换名、改顺序、把 `m0ExitRequired` 改成 `false`、改变任务或验收映射都会失败。没有对应通过记录的 `planned` 或 `external_blocked` gate 会持续让 `verify:m0` 失败。

静态定义 hash 使用 UTF-8 `JSON.stringify` 的固定投影，键顺序依次为 `id`、`title`、`epicIds`、`taskIds`、`requirementIds`、`governingAdrIds`、`coverageKind`、`scopeStatement`、`environmentKind`、`executionKind`、`dailyGateEligible`、`m0ExitRequired`；数组顺序参与 hash。需要改变这些字段时必须显式升级并审查 manifest，不能只更新 hash 掩盖门槛变化。

## 状态语义

`evidenceStatus` 只描述某一份具体证据：

- `planned`：已经进入计划，但尚未开始执行；
- `in_progress`：正在形成，不能用于通过门槛；
- `passed`：真实断言或文档契约已经完成，且引用的产物存在；
- `failed`：执行完成但没有满足断言；
- `not_run`：本阶段到期但尚未执行；
- `external_blocked`：需要真实外部权限、设备或资源，且当前不可运行。

`requirementStatus` 独立描述完整需求：

- `not_started`：尚未形成相关证据；
- `partially_evidenced`：本阶段证据成立，但不能据此声称完整需求通过；
- `satisfied`：完整需求的全部当前验收条件已经通过；
- `not_due`：只用于后续里程碑能力，不得用于掩盖当前 M0 门槛。

因此允许“`evidenceStatus=passed` 且 `requirementStatus=partially_evidenced`”。M0 的性能技术探针就是这一类，不能冒充 M1 的完整可编辑草稿验收。

## 两类聚合门槛

- 日常 PR/merge queue 聚合只运行 `dailyGate.activated=true` 的检查。检查必须在具有真实断言的同一变更中原子激活；激活后不能退回空脚本或占位。
- 独立 M0 退出聚合以 `m0-exit-manifest.v1.json` 的 35 个 gate 为全集，而不是以现存 `records` 为全集。每个 gate 都必须为 `passed`，其唯一历史链尾必须是反向引用该 gate 且状态一致的 `passed` record；任一条件不成立即失败。
- `executionKind=automated` 的 gate 只有在真实断言、根 `package.json` 脚本、稳定 check 名和不可变测试报告同时落地后才能激活并标为通过。退出候选必须在本次运行重新执行所有已激活自动 gate，不能只信索引中的历史 `passed`。
- `executionKind=external_environment` 的通过记录必须携带结构化 provenance、被测 revision、带 hash 的环境 profile/subject manifest 与不可变 attestation；本地文档、模拟器或 IaC plan 不能替代真实环境。

文档登记本身通常不进入日常代码门槛，因此 `eligible=false`。这不影响它作为 M0 退出证据的一部分。

## 记录规则

1. 所有路径使用仓库根目录相对路径和 `/` 分隔符。
2. 一条 record 只证明一个 gate。record 中的 Epic、任务、需求、ADR、环境、执行类型、日常 gate 与退出属性是 gate 定义的快照，验证器要求逐项一致。
3. record 只追加、不覆写；`supersedesRecordId` 只能指向同一 gate 的直接前序，历史不得成环或分叉，`latestRecordId` 必须指向唯一链尾。M0-009 接入 Git 历史后还必须拒绝删除或修改基线 record，以及 `activated: true → false`。
4. 固定 fixture 必须分别提供 fixture 路径/hash、manifest 路径/hash 与生成器版本；验证器对两个文件实际重算 SHA-256。不可变证据产物也必须提供并核对 SHA-256。
5. 可持续更新的目录、策略或配置文件标记为 `immutable=false`，不记录会因自身更新而失效的自引用 hash。
6. 自动 gate 的 `rootScript` 只允许引用根 `package.json.scripts` 的键，禁止保存或执行索引提供的任意 shell 字符串，也禁止递归指向 `verify:m0`。
7. 外部证据必须写明真实环境类型与既定 verification method；subject manifest 的 `subjectDigestSha256` 是其有序 `artifactDigests` 数组 UTF-8 `JSON.stringify` 的 SHA-256。每个被测文件必须满足冻结的 gate 级 subject policy，当前文件 hash 和 `git show <subjectRevision>:<path>` 字节 hash 均需匹配，revision 必须是当前 `HEAD` 的祖先。attestation 必须绑定 gate、subject policy/hash、subject/profile hash，且 `result=passed`、`simulation=false`、`passed=executed>=1`、`failed=0`、`skipped=0`。模拟、IaC plan、Playwright WebKit 或 CI 不能标记为真实供应商、Safari、微信、参考设备或阿里云认证。
8. `manual_review` 的通过记录必须引用唯一的不可变人工评审凭证。凭证必须绑定 record ID、gate ID 与 `observedAt`，完整列出除凭证自身外的 record 产物，并记录评审时工作树中每个主体的真实 SHA-256；最新记录的任一主体变化都会使凭证失效。首次 Git 基线前的 Wave 0 bootstrap 记录可以在最终评审时一次性冻结；进入 Git 历史后只能追加 superseding record，不得回写旧时间或旧凭证。
9. 不在索引、报告、fixture、日志、provenance 或路径中写入真实用户数据、密钥、Authorization、发布密文或设备指纹。
10. `gateCatalog.latestRecordId` 必须指向 `records` 中存在且反向引用该 gate 的唯一链尾；`passed` gate 不允许缺失最新 `passed` record。
11. `external_blocked` gate 必须提供 blocker 路径；本地模拟或 CI 结果不能解除真实设备、GitHub 治理或阿里云阻塞。
12. gate ID 和 record ID 永不复用；退出 manifest 或静态 gate 定义如确需改变，必须先正式审查并升级 manifest/Schema 版本，不能原地缩减 M0 门槛。

## 自动重跑凭证

M0-009 的 `verify:m0` 必须为每次退出候选生成随机 nonce 和临时结果目录。每个已激活自动 gate 的根脚本至少执行一个真实断言，并输出只属于本次运行的 attestation，例如：

```json
{
  "gateId": "FORMAL-STORY-SCHEMA",
  "runNonce": "由聚合器本次生成",
  "result": "passed",
  "assertions": {
    "executed": 12,
    "passed": 12,
    "failed": 0,
    "skipped": 0
  }
}
```

聚合器必须核对 nonce、gate ID、时间窗口与 `executed >= 1`、`failed = 0`、`skipped = 0`。旧报告、空脚本、跳过项或索引中的历史通过状态均不能替代本次重跑。

最终退出公式是：

```text
Schema、manifest、引用和 append-only 历史有效
AND 35 个冻结 gate 当前全部 passed
AND 每个 gate 的唯一最新 record 为 passed 且快照一致
AND 所有自动 gate 本次真实重跑通过
AND 所有外部 gate provenance 仍匹配当前被测 subject
```

当前可从仓库根运行 `node docs/evidence/m0/validate-evidence-index.mjs --self-test` 核对语义契约与定向否定变体。M0-009 建立真实根脚本后，必须把该检查、证据索引、人工评审及三份外部内容契约共五份锁定版本的 Ajv Schema／实例校验、Git 基线不可缩减检查和上述新鲜 attestation 重跑协议接入自动验证。
