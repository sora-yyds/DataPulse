# M0-049 共享确定性指标运行时

> 任务：M0-049
>
> 需求：FR-MET-009、FR-ANA-011
>
> 适用决定：ADR-0031、ADR-0051
>
> 状态：Windows 正式契约、黄金 fixture、Creator／Viewer 委托及 M0-015 最小页面 composition 已验证；完整浏览器／Origin 矩阵、Ubuntu 与 GitHub Actions 延期

本文记录 `@datapulse/metric-runtime` 在 M0-049 冻结的最小正式契约。它使 Creator 与 Viewer 通过同一纯确定性运行时合并并求值版本化 accumulator，不让 AI、Renderer 或调用端复制数值逻辑。当前切片只覆盖 `COUNT_ROWS` 与 `SUM`，不是完整指标系统或本地分析引擎。

## 1. 包职责与公共 seam

`packages/metric-runtime` 的产品源码只依赖仓库内 `@datapulse/domain`，使用平台 `ArrayBuffer`／`DataView` 实现固定 binary64 wire。依赖检查禁止该纯运行时访问网络、浏览器存储、Node builtin、设备时间、随机源、默认 locale、React、DuckDB 或其他外部运行时 package；生成脚本使用的 Ajv 与类型生成器不进入公共运行时。

根 `.` export 的运行时值只有：

| API | 职责 |
|---|---|
| `createMetricAccumulator(input)` | 从受控 draft 创建经 Schema 校验、深冻结的正式 accumulator wire |
| `evaluateMetric(plan, accumulators)` | 校验计划与整个 accumulator 集合，按固定顺序合并并返回可区分 Result |
| `METRIC_RUNTIME_ERROR_CODES` | 冻结的稳定输入／合同错误码目录 |

公共类型随根 seam 导出，但调用者不能注入 validator、版本 registry、资源上限、merge 函数或 finalize 函数。分析引擎、原始行扫描和 DuckDB-WASM adapter 尚未建立；本包只消费已经形成的充分状态。

## 2. 正式 `1.0.0` 契约

唯一历史事实源是 `packages/metric-runtime/src/schema/history.v1.json`。构建会确定性核对 JSON Schema、生成类型、无运行时 helper import 的 Ajv standalone validator、版本 metadata 与只追加 Git 历史；正式版本发布后只能追加新版本，不能覆写已有 Schema 字节或语义。

| 产物 | Schema ID／用途 | 原始字节 | SHA-256 |
|---|---|---:|---|
| `metric-accumulator.schema.json` | `urn:datapulse:metric-accumulator:1.0.0` | 2,592 | `0e9fdf5c0925a388c5fcdf36a8bfedae8e198f28fa6feee1a15eb62792da00d4` |
| `metric-evaluation-plan.schema.json` | `urn:datapulse:metric-evaluation-plan:1.0.0` | 677 | `e3605377a5efef6de81b0b12c706e40e0d05a913f4a84d925ed1b13229e413d6` |
| Creator／Viewer 黄金 fixture | 三组固定 merge／舍入样例 | 3,398 | `825f05e15adaab0f843a6e30b30ea94748d6de9869592fb8b5f2c15d579f5673` |

`MetricEvaluationPlan` 固定 `schemaVersion`、领域 `metricId` 与 `aggregate`。所有 accumulator 必须与计划的 `metricId` 和 aggregate 完全一致，并包含以下公共字段：`schemaVersion`、`metricId`、`aggregate`、`mergeKind`、`interactionCapability`、`mergeOrdinal` 和 `state`。所有 Schema 对象都以 `additionalProperties: false` 关闭额外属性。

| 聚合 | `mergeKind` | 充分状态与边界 | 空选择 |
|---|---|---|---|
| `COUNT_ROWS` | `count` | `count` 为 `0..Number.MAX_SAFE_INTEGER` 的安全整数 | `available`，值为 `0` |
| `SUM` | `sum-f64-v1` | `sumF64` 为 16 位小写十六进制、IEEE-754 binary64 大端字节 | `unavailable / EMPTY_SELECTION` |

`SUM` wire 拒绝错误长度、大写十六进制、NaN、正负 Infinity 与负零位型。`createMetricAccumulator` 接受的有限 JavaScript number 会按当前 binary64 位型编码，并把 `-0` 规范为 `+0`；求值得到零时同样返回正零。

`interactionCapability: "exact"` 表示运行时完整使用所有选定 accumulator，不抽样、不截断、不采用近似算法，并严格遵循版本化 wire 与固定合并顺序。它不表示十进制实数数学或任意精度算术；`SUM` 明确保留 IEEE-754 binary64 的逐步舍入。

## 3. 固定 merge／finalize 语义

`mergeOrdinal` 必须是非负安全整数。运行时先完整校验输入，再按 ordinal 升序执行稳定左折叠；调用方提供的数组顺序不影响结果。任意两个 accumulator 使用重复 ordinal 时，整个求值以 `METRIC_RUNTIME_MERGE_ORDINAL_DUPLICATE` 失败，不能猜测次序。单次求值最多接受 65,536 个 accumulator，该上限来自版本历史，调用者不可调；这是已解析调用 seam 的 accumulator 数量上限，不是原始字节或 JSON 解析上限，原始产物仍必须由所属 Reader 在解析前另行限尺寸。

合法输入仍可能无法形成数值，这与合同错误严格区分：

| 类别 | Result 形态 | 当前原因 |
|---|---|---|
| 可求值 | `{ ok: true, value: { status: "available", ... } }` | 返回固定语义下的 number |
| 合法但不可求值 | `{ ok: true, value: { status: "unavailable", ... } }` | `EMPTY_SELECTION`、`NUMERIC_OVERFLOW` |
| 输入／版本／合同错误 | `{ ok: false, error: { code, details } }` | 整次求值失败，不返回部分值 |

`COUNT_ROWS` 合并超出安全整数，或有限 `SUM` 输入在固定左折叠中产生非有限结果，都返回 `unavailable / NUMERIC_OVERFLOW`，不静默截断、饱和、近似或伪装成零。任一 accumulator 无效、版本未知、metric 不一致或 aggregate 不一致时整次失败，不保留部分合并结果。

稳定错误码为：

- `METRIC_RUNTIME_DRAFT_INVALID`
- `METRIC_RUNTIME_PLAN_INVALID`
- `METRIC_RUNTIME_ACCUMULATOR_INVALID`
- `METRIC_RUNTIME_VERSION_INVALID`
- `METRIC_RUNTIME_VERSION_UNSUPPORTED`
- `METRIC_RUNTIME_INPUT_LIMIT_EXCEEDED`
- `METRIC_RUNTIME_CONTRACT_MISMATCH`
- `METRIC_RUNTIME_MERGE_ORDINAL_DUPLICATE`

错误 DTO 只返回稳定 code 与枚举 reason，不回显输入、异常正文或路径。同一输入集合同时包含多个错误时，运行时会检查完整集合并按版本历史冻结的优先级选择唯一错误，不依赖调用方数组排列：

1. accumulator shape；
2. accumulator version invalid；
3. accumulator version unsupported；
4. metric ID mismatch；
5. aggregate mismatch；
6. duplicate merge ordinal。

其中重复 ordinal 只在全部 accumulator 已通过结构、版本和计划一致性检查后判定；测试对错误集合全排列冻结同一 `code + reason`。

## 4. 恶意输入与确定性边界

运行时把 plan、draft 与 accumulator 视为不可信对象。边界只接受普通对象原型、允许集合内的自有可枚举 data property，以及普通、稠密、无额外 key 的数组；getter、symbol、额外属性、稀疏数组、Proxy 异常、循环结构与非法别名组合均 fail-closed，且 getter 不会被执行。所有读取先形成安全快照，输出冻结，不修改调用方对象；异常不越过公共 Result seam。

确定性不依赖设备时区、当前时间、随机数、默认 locale、对象偶然遍历顺序或网络返回顺序。当前 Windows 合同还验证外部 cwd／含空格路径下的 Node 原生 ESM，以及 Vite `write:false` 的单包 ESM 探针；后者只证明公共 seam 可被当前打包器静态处理，不是产品 bundle 或浏览器认证。

## 5. Creator／Viewer 一致性

`apps/creator` 的 `evaluateCreatorMetric` 与 `apps/viewer` 的 `evaluateViewerMetric` 都只委托共享 `evaluateMetric`，不复制 merge、finalize 或错误处理。测试让两端分别读取同一正式 fixture，并分别解析形成隔离对象；它验证输入排列不同仍得到逐值、必要时逐位一致的 available、unavailable 与 error 结果，但不把仓库 fixture 冒充两份永久协议字节。

M0-015 已让两个入口分别参与 React／Vite 页面 composition：两端从各自正式 Story／Metric 字节副本开始，经 Story Artifact Reader、共享 runtime 和 `zh-CN` 展示 DTO 进入受控 Renderer，并在 Windows 本地 HTTP 浏览器显示 KPI `23`。这仍不是完整指标产品、真实独立 Origin、HTTPS／CSP、Viewer 发布包读取或固定浏览器交互矩阵；这些由后续任务建立。

## 6. 明确延期

M0-049 未实现 `AVG`、`MIN`、`MAX`、`COUNT_VALID`、`COUNT_DISTINCT`、单位／币种传播、派生指标表达式树、除零语义或完整 LocalAnalysis adapter。尤其不能从当前 `exact` 标签推断精确集合去重已经存在。

完整产品 UI／编辑器、完整 Renderer 区块、真实浏览器／Origin 矩阵、干净 Ubuntu、GitHub Actions 与公开 Fork 重跑均未完成。M0-016 已用当前最小指标结果建立 Windows RTL、Storybook、Playwright 与 axe 阶段断言并激活 TEST-RUNNERS 日常检查，但这不关闭 `DETERMINISTIC-UI-A11Y`、`TEST-RUNNERS`、`CREATOR-VIEWER-CONTRACT` 或 M0 退出 gate，也不代表完整指标产品可在 Windows 浏览器稳定运行。
