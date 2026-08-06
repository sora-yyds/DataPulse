# M0-017 统一 Fixture Manifest

> 任务：M0-017  
> 需求：NFR-QA-005  
> 决定：ADR-0038、ADR-0039、ADR-0052  
> 状态：Windows x64 已建立统一合成 fixture manifest 与只读校验 seam；M0-047 语料执行、干净 Ubuntu、GitHub Actions 和公开 Fork 尚未运行，因此 `M0-CORPUS` 保持 `in_progress / partially_evidenced` 且不激活

## 1. 单一校验 seam

M0-017 不新增生产 workspace，也不修改已经冻结的正式 Story／Metric Runtime manifest。根清单 `tests/fixtures/manifest.v1.json` 为既有领域清单增加统一目录层；调用者只使用 `verifyFixtureManifest(repositoryRoot)` 或根命令：

```powershell
corepack pnpm run check:fixtures
```

该 interface 固定根清单路径、Schema、SHA-256、路径策略、校验顺序和错误投影，调用者不能注入更宽的目录、替换 hash 算法、跳过条目或执行夹具内容。实现集中处理有界读取、fatal UTF-8、JSON Schema、路径 containment、普通文件检查、原始字节 hash、库存完整性和稳定错误排序。Schema、根 manifest、子 manifest／generator 和已提交 artifact 分别在读取前应用 256 KiB、8 MiB、1 MiB 和 16 MiB 上限；库存固定最多 100,000 项／32 层，失败明细最多 256 项。CLI 与 Vitest 的内存快照辅助入口另有 16 MiB 单文件／256 MiB 总量上限，并在主验证失败时不启动自测快照。

成功输出单行 `datapulse-root-check-summary`，其中 `check=fixture-manifest`。当前 Windows 基线为 4 个逻辑集、12 个 artifact、0 个 generated 集，主检查 `312/312`、恶意 self-test `26/26`；完整 `test:unit` 为 `8 files / 215 tests`。该名称刻意不同于未来 `test:corpus`：当前命令只证明 manifest 合同与既有合成文件身份，不证明导入、分析、生成、性能或攻击语料已经运行。

## 2. Manifest 合同

版本化 Schema 关闭额外属性。每个逻辑 fixture 集至少声明：

- 全局唯一且稳定的 `id`；
- 描述验证目的的 `purpose`；
- `dataOrigin=synthetic`，并明确不包含真实用户数据；
- 精确 generator ID／版本；
- `fixed` 或 `not-applicable` 的 seed 联合；手写夹具不得伪造随机种子；
- 受控的机器可判定预期断言，不接受命令、JSONPath、公式或任意代码；
- 所属领域 manifest 以及一个或多个 artifact 的仓库相对路径、原始字节数和小写 SHA-256。

当前根清单聚合四个逻辑集合：未发布 Story 迁移样本、正式 Story Creator／Viewer 契约、正式 Metric Runtime 黄金向量，以及 Creator／Viewer composition 的四份物理独立资源。既有子 manifest 继续拥有各自领域字段和正式历史语义；根清单只引用其原始字节身份，不覆盖或重新解释它们。

## 3. 路径、身份与失败规则

fixture 路径只能使用仓库相对 POSIX 形式，并限制在 `tests/fixtures/`、`apps/creator/src/fixtures/` 或 `apps/viewer/src/fixtures/`。绝对路径、盘符、UNC、反斜杠、空段、`.`、`..`、百分号编码、控制字符、Windows 设备名、`~` 短路径别名、大小写折叠冲突、重复 realpath、符号链接或 junction 逃逸全部拒绝。

SHA-256 始终针对文件原始字节；校验器不重新序列化 JSON、不规范化换行，也不自动修复 bytes 或 hash。相同内容 hash 可以出现多次，因为 Creator 与 Viewer 必须保留物理独立副本；同一仓库路径只能登记一次，且不同登记路径不得解析到同一真实文件。`tests/fixtures/` 和两端 fixture 目录中的受管文件与 catalog／显式 metadata 必须双向对应，幽灵记录和未登记文件都失败。

失败结果使用稳定错误码、fixture ID、受控角色和仓库相对路径，不回显文件正文、本机绝对路径或任意异常内容。多项错误按稳定顺序输出并有数量上限；任一失败使进程非零，不能返回部分通过。

## 4. 确定性生成边界

Schema 为未来 `generated` materialization 预留精确 generator 身份、generator 文件 hash、固定字符串 seed 和预期输出 bytes／hash。M0-017 只验证该声明分支的 fail-closed 规则，不执行生成器；当前仓库清单的 generated 数量为零。

M0-028 才建立小型、常见、窄表、宽表和早期攻击夹具，M0-047 才实现并运行 `test:corpus`、确定性物化大型夹具以及导入／拒绝／分析断言。后续实现不得在 manifest 中存放 shell 命令、动态模块路径或任意代码，也不得把大型生成物提交进仓库。

## 5. 当前证明边界

Windows 阶段结果只证明：

- 既有合成 fixture 与领域 manifest 能由一个只读 interface 完整枚举并核对原始 bytes／hash；
- 缺字段、重复 ID／路径、非法路径、逃逸、缺失／额外文件、bytes／hash 漂移和 generated seed／generator 漂移会稳定失败；
- 检查不联网、不写入仓库、不执行 fixture 内容，且兼容含空格的 Windows 仓库路径。

它不证明 M0-047 或 ADR-0052 的完整语料库已经完成，不证明大型 CSV／XLSX 可生成，不证明导入／分析／性能预算，也不替代人工确认数据确为合成数据。因此 `M0-CORPUS` 不进入日常 activation registry；M4 的 30／200／100／1,000 全量语料继续标记为尚未到期。
