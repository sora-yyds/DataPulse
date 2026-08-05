# M0-009 日常与退出质量聚合器

> 任务：M0-009
> 状态：本地聚合器与否定自测已建立；GitHub Actions、全部 M0 gate 与外部环境仍未闭合
> 适用需求：NFR-QA-001、NFR-QA-002、NFR-QA-005、NFR-REL-005、NFR-REL-006
> 适用决定：ADR-0037、ADR-0038、ADR-0040

## 两类入口

- `verify:pr` 先以独立、固定身份和精确根命令 hash 的 `check:evidence` 完成不可绕过的证据合同启动检查，再只执行 `evidence-index.json` 中 `dailyGate.activated=true` 的自动 gate。`CI-ACTIVATION` 使用独立 `check:aggregators`，不复用或自证 bootstrap；索引仍是唯一 activation registry，不存在第二份日常 gate 清单。
- `verify:m0` 使用同一可信启动检查和已激活 gate 重跑，但额外要求冻结的 35 个 M0 gate 全部为 `passed`，且各自唯一链尾是状态一致的 passed record。当前大量 gate 尚未完成，因此该命令必须非零并逐项列出原因。

聚合器只读取 gate 的根 `package.json` 脚本键，不读取、拼接或执行 evidence JSON 中的命令字符串。激活脚本必须是安全语法允许的本地 `.mjs` runner；`verify:pr` 与 `verify:m0` 不能被登记为 gate 自身脚本，避免递归和任意命令旁路。

已激活脚本键必须唯一并直接映射到单个仓库内 `node ./...mjs` gate runner，且 `rootScriptCommandSha256` 必须匹配根 `package.json` 的精确命令；包管理器别名、命令漂移、聚合器递归、`node -e`、shell 串联和内联伪摘要均被 activation registry 拒绝。聚合器解析脚本路径后以当前固定 Node、参数数组和 `shell:false` 启动；复杂检查由该 runner 编排受控子进程，保持一个可审计的结构化结果边界。

## 合同与历史

`check:evidence` 使用精确固定的 Ajv `8.17.1` Draft 2020-12 实现，编译并自校验以下五类合同：

1. M0 evidence index；
2. external subject manifest；
3. external environment profile；
4. external attestation；
5. manual review attestation。

检查器枚举仓库中现有的相应实例并逐个验证，然后运行既有语义验证器及其定向自测。它还从显式完整提交 SHA 的 `DATAPULSE_MERGE_BASE`、`origin/main` 或本地 `main` 解析真实 Git merge base；任意 rev 表达式、等于 `HEAD` 的基线、Git 工作树重定向或无法取得真实祖先都 fail-closed。基线 records 必须是当前数组逐字节语义相等的前缀；删除、修改、重排历史 record、把已激活 gate 退回 false，或改变已稳定 check 名、`summaryCheck`、root script 都会失败。未来 M0-019 的 CI checkout 必须使用完整历史，浅克隆失败不能降级为跳过。

## 新鲜自动凭证

每次聚合运行创建系统临时目录和 256 位随机 nonce，并通过 `DATAPULSE_RUN_NONCE`／`DATAPULSE_GATE_ID` 传给每个已激活根脚本。根 runner 及其受控子检查必须在结构化结果中原样回显合同版本、结果 kind、本次 gate、登记的 `summaryCheck` 和 nonce；固定旧摘要或另一个 checker 的结果不能被重新包装成新凭证。聚合器将 gate ID、稳定 check 名、根脚本键、nonce、开始／结束时间与计数写入独立 JSON，再从磁盘回读并严格校验：

- `executed >= 1`；
- `passed = executed`；
- `failed = 0`；
- `skipped = 0`；
- gate、check、脚本、nonce 与本次时间窗口完全匹配。

临时凭证默认在验证后删除；设置 `DATAPULSE_KEEP_ATTESTATIONS=1` 只用于本地诊断并保留隔离目录，不改变证据索引或历史 record。旧 nonce、gate mismatch、时间窗口外凭证、零断言、失败、跳过和计数不一致均有恶意 self-test。

## 当前边界

本切片不创建返回成功的空产品测试，也不把 M3 四主题组件矩阵、M4 全量语料或真实设备／供应商／阿里云认证标成“尚未到期”或“通过”。GitHub 工作流、merge queue、required check 和退出候选由 M0-019、M0-045、M0-046 继续闭合；在此之前，本地 `verify:pr` 只证明当前已激活断言，`verify:m0` 的明确失败才是正确结果。

外部 attestation v1 目前只是内容合同，不是可信发行者机制。真实平台 API 回读、提供方签名或冻结公钥验证落地前，语义 validator 无条件拒绝 `external_environment / passed` record；GitHub、设备与阿里云 gate 必须继续外部阻塞，不能用格式正确的本地 JSON 自行解锁。
