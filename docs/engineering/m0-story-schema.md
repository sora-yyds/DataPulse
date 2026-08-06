# M0-011～013／048 StoryBlueprint Schema、对象校验与 Artifact Reader

> 正式 Schema：`1.0.0`；开发测试线：`0.0.1 → 0.1.0`（未发布且与正式历史隔离）  
> 任务：M0-011、M0-012、M0-013、M0-048；M0-016 已在其后复用这些公共 seam 建立 Windows 五类 runner  
> 需求：NFR-SCHEMA-001～004、FR-ANA-001、FR-ANA-009、FR-EDIT-004、FR-GEN-009  
> 决定：ADR-0002、ADR-0036、ADR-0048、ADR-0051

## 1. 状态与边界

`packages/story-schema/src/formal/1.0.0/story-blueprint.schema.json` 是首个正式结构的唯一机器事实源。`formal/history.v1.json` 显式登记 `1.0.0`、Schema ID、源路径、原始 UTF-8 字节数、SHA-256、`predecessor=null` 与 `changeKind=initial`；生成器核对 manifest、自身位置、原始字节、可信 merge base 以及 HEAD 可达且曾触碰正式目录的全部提交，既有正式条目与 Schema 只能保留，后续变化必须新增版本与相邻迁移。这样首次冻结尚未进入主线的长分支也不能在后续提交中覆写历史。

`packages/story-schema/src/experimental/` 下的 `0.0.1` 与 `0.1.0` 只服务 M0-013 开发迁移回归。开发 fixture manifest 明确 `formalHistory=false`、`compatibilityPromise=false`；正式 registry 的 kind 为 `story-blueprint` 且当前只有 `1.0.0`，开发 registry 的 kind 为 `experimental-story-blueprint`。二者不存在 `0.x → 1.0.0` 边，公共 Reader 对两个 `0.x` 都返回 `STORY_ARTIFACT_VERSION_UNSUPPORTED`。

生成器从正式 Schema 与两个开发 Schema 确定性生成：

- `src/generated/formal-story-blueprint-v1_0_0.generated.ts` 与对应 standalone validator：当前正式类型和结构校验；
- `src/generated/formal-story-history.generated.ts`：只读正式版本、Schema ID、原始字节数与 hash metadata；
- `src/generated/formal-story-validator-registry.generated.ts`：从正式 history 派生完整版本 tuple、版本联合与版本到 standalone validator 的映射；
- `src/generated/experimental-story-blueprint.generated.ts`：供真实 `tsc --build` 消费的 TypeScript 合同；
- `src/generated/experimental-story-blueprint.validator.generated.ts`：Ajv Draft 2020-12 standalone ESM；运行时不调用 `Ajv.compile()`；
- `src/generated/experimental-story-blueprint-v0_0_1.generated.ts` 与对应 standalone：只服务未发布开发迁移；
- `validateCurrentStory()`：公开正式入口；先隔离未知对象，再执行 `1.0.0` 结构与语义校验，成功时返回深冻结、品牌化的只读快照。正式根 bundle 不加载实验 validator；实验 validator 只从受限开发支持 subpath 供迁移包内部回归使用。正式与开发 Adapter 复用纯语义 core，但没有版本字面量或 validator 依赖。

M0-013 新增、M0-048 正式化的 `@datapulse/story-migrations` 根模块只提供 `readStoryArtifact(bytes, trustedContext)` 操作与稳定错误码词汇；原始字节准入、fatal UTF-8、私有正式版本注册、源结构校验、复制逐步迁移、每步目标结构校验和最终可信语义校验都留在同一 implementation 内。正式成功 Result 只有 `ok + value`，迁移失败也不公开来源版本、目标版本或步数。当前正式历史没有迁移边；开发迁移通过不在 package exports 中的内部 adapter 继续测试。调用方不能注入 registry、指定迁移路径、调节限额或传入已解码字符串。

构建脚本使用脚本文件自身位置解析路径，显式以 fatal UTF-8 解码源 Schema，要求 LF、无 BOM、终止换行和仅 `#/` 本地 `$ref`。生成结果不含时间戳、绝对路径或动态代码；`build` 在 `tsc` 前运行 `--check`，陈旧或缺失产物直接失败。Turbo 对 Story Schema build 固定 `cache: false` 并透传完整 SHA 形式的 `DATAPULSE_MERGE_BASE`；浅克隆、该值无效或等于 HEAD、无法解析可信祖先或无法枚举受保护提交时均 fail-closed。源 Schema 与 TypeScript 复制到 `dist` 后的 JSON 可以格式不同；证据分别记录两个字节 hash，并只断言 `semanticEqual=true`，不把 `dist` 误写成字节复制。

## 2. 最小 StoryBlueprint

正式 `1.0.0` 根对象显式保存：

- `schemaVersion`、`storyId`、单一精确 `datasetVersionId`、`reportGoal` 与 `storyTimezone`；Viewer 不能用设备时区替代故事时区；
- field、metric、evidence、judgment rule、narrative rule 的前缀化引用目录；
- 受控条件定义、`globalConditionIds` 及每个区块的 `additionalConditionIds`；
- 四个既定主题、语义 layout、二维 `renderMode`、`scenePreset=none` 与 `motionPreset=none`；
- 仅 `title-summary` 和 `kpi` 两类 M0 注册区块。KPI 只保存 `metricId`、证据／规则引用、标签和受控视觉变体，不保存 `value`、`delta`、百分比、累加器或公式。

全部对象设置 `additionalProperties: false`，数组和文本有当前局部上限。Schema 没有 HTML、JavaScript、CSS、Shader、SQL、文本公式、任意 ECharts option、任意 WebGL、像素坐标、重叠／旋转布局或自由动效参数。

## 3. 不可信对象与资源 profile

校验器绝不把原候选直接交给 Ajv、`structuredClone()` 或 `JSON.stringify()`。它先通过 property descriptor 做有界复制，仅接受普通对象、密集数组和 JSON 原始值，并拒绝：

- getter／setter、Symbol 属性、稀疏数组和数组额外属性；
- 循环、共享对象别名、`Date`／Map／Set／类实例／null prototype 等非普通对象；
- `undefined`、函数、Symbol、BigInt、NaN 和正负 Infinity；
- revoked Proxy 或抛错 reflection trap。透明 Proxy 无法被 JavaScript 可靠识别，本实现只能保证 trap 异常不逃逸、getter 不执行，并且后续阶段只读取隔离副本。

正式 `1.0.0` 对象 profile 固定为：

| 限制 | 数值 | 计数口径 |
|---|---:|---|
| JSON 快照 UTF-8 | 16 MiB | 对安全副本按 `JSON.stringify` 等价编码计数；超限字符串在剩余额度耗尽时提前停止 |
| 深度 | 16 | 根对象深度为 1 |
| 节点 | 65,536 | 容器和原始值都计数 |
| opaque ID／引用出现次数 | 65,536 | 身份、目录、条件和区块使用点均计数 |
| 对外 issue | 32 | 稳定 code + 受控 path，去重并确定性排序；不回显 Ajv params 或输入正文 |

对象 profile 之外，Reader 固定 `maxInputBytes=16,777,216` 与 `maxMigrationSteps=64`。它只接受真实 `Uint8Array` 内部槽位（Node `Buffer` 与跨 realm `Uint8Array` 可接受），拒绝 Proxy、其他 TypedArray、`SharedArrayBuffer` view 和 detached buffer；先读取原始 `byteLength` 并拒绝超限，再复制到私有字节。单个 UTF-8 BOM 被明确接受且计入原始上限，第二个 BOM 仍由 JSON 边界拒绝。随后才使用 `TextDecoder('utf-8', { fatal: true })` 和 `JSON.parse`，因此字符串调用方不存在绕过原始编码字节与解码规则的 seam。

版本读取和迁移顺序固定为：

1. 根值必须是 JSON object，`schemaVersion` 必须通过 Domain 的 Core SemVer 解析及协议隔离 registry；畸形与未登记版本使用不同稳定错误码，未知文本不回显。
2. 公共 Reader 只在正式 `story-blueprint` registry 中解析版本；当前只登记 `1.0.0`，`0.0.1`、`0.1.0` 和其他未知版本统一 fail-closed。
3. 按源正式版本 standalone 建立隔离、深冻结的结构快照；未经源校验的数据不能进入迁移器。未来只沿 manifest 中显式登记的相邻正式版本边复制迁移并逐步复验。
4. 到达当前版本后调用 `validateCurrentStory()` 执行可信身份、引用、条件、文本和最小 KPI 语义校验。只有成功值能离开 Reader；失败 Result 不含 `value`，Reader 本身不接收或替换当前草稿／项目。

未发布 `0.0.1 → 0.1.0` 的 `storyTimeZone → storyTimezone` 复制迁移仍走相同核心顺序，但只由包内开发 adapter 与开发 fixture 测试，不从根 export 暴露，也不形成正式兼容承诺。

## 4. 可信上下文与语义校验

候选自身 `references` 不能成为授权源。调用者必须提供安全复制并验证的 trusted context：

- 精确 `expectedStoryId` 与 `expectedDatasetVersionId`；
- field／metric／evidence／judgment rule／narrative rule 五类可信 catalog；
- 已确认的 `expectedGlobalConditions`；
- 当前最小 `kpiApplicableMetricIds` 白名单。

结构通过后执行以下 fail-closed 规则：

1. 候选目录是可信目录的子集；每个条件／区块使用点还必须同时存在于候选目录和可信目录。候选把伪 ID 同时写入目录与使用点仍会失败。
2. `blockId`、`conditionId` 不得重复；global／additional 条件不得悬空。候选必须完整保留 trusted context 中的全局条件集合和定义。
3. 时间条件使用手写 Gregorian／offset 解析，不调用 `Date.parse` 或设备时区；拒绝无效日期、反向范围和 date-only／datetime 混用。数值上下界必须有序。
4. additional 不得复用 global ID；同字段 additional 必须对所有同字段 global 收紧。时间范围要内含，数值上下界不能外扩，分类值／`includeMissing` 不能放宽；缺少字段类型元数据时，同字段不同 kind 直接失败。新字段上的 additional 可接受，因为其语义是 `global AND additional`。
5. 当前没有数值 placeholder AST，因此只扫描 `title-summary` 的 title／summary 和 KPI label，并按 `zh-CN-numeric-v1` 拒绝可识别的 Unicode Number、全角／兼容形态、科学／百分比／日期形态及版本化中文数词；`reportGoal` 不在本阶段扫描范围。
6. `zh-CN-judgment-v1` 词表命中的评价语言必须在同一区块绑定可信 judgment rule。KPI metric 还必须属于可信的最小适用白名单。

错误 DTO 只含封闭错误码、受控路径和截断标记；不会回显未知属性名、文本、getter 异常或 Ajv `params`。成功值与所有输入对象脱离 identity，输入不会被修改或冻结，返回快照及 Result wrapper 均冻结；品牌只存在于 TypeScript 类型层，不写入协议对象。

## 5. Windows 可复现性

当前阶段在仓库真实含空格路径 `E:\DataPulse AI`、Node `24.19.0`、Corepack `0.35.0`、pnpm `11.20.0` 下验证：

- 生成器在包目录、仓库根和外部当前目录都以 `fileURLToPath`／`resolve` 找到同一源文件；输出固定 UTF-8、LF、无 BOM、无绝对路径，并核对正式 history manifest、原始 Schema hash、可信 merge-base 与长分支受保护提交的只追加关系；Turbo 对该 build 禁用缓存并透传 `DATAPULSE_MERGE_BASE`；
- Ajv `8.17.1` standalone 的两处 CommonJS helper 被确定性改写为带 `.js` 的静态 ESM import，并兼容 Node 与 Vite 的 CJS default unwrap；生成源码拒绝剩余 `require()`、`eval`、`new Function` 和动态 import；
- 公开 `dist` seam 由 Node 原生 ESM 加载，Vite `8.2.0` 另执行 `write:false` 包级探针，并断言正式根 bundle 不含 `experimental`、`0.1.0` 或旧字段 `storyTimeZone`；M0-015 在该包级探针之外新增了 Creator／Viewer 各自的真实 Vite 页面构建；
- Reader 的 Node 原生 ESM 探针从外部 cwd 加载含空格绝对 URL，不通过 shell；Vite 同样只执行 `write:false` 包级探针，并核对根运行时仅有读取操作与稳定错误码、正式成功 DTO 仅含 `ok + value`；
- Vitest 固定单 worker、fork pool 和串行执行，覆盖正式 Schema／fixture 原始字节 hash、Creator／Viewer 独立字节副本、正式 Reader 拒绝 `0.x`、`1.0.0` fixture manifest 永久不变，以及对象边界、数量／排名语境单个中文数词、原始字节恰好／超过 16 MiB、Buffer／跨 realm、BOM／畸形 UTF-8、未知／恶意样本、开发迁移目标失败、最终语义失败和失败不替换。

PowerShell 5.1 的默认文本显示编码可能把 UTF-8 无 BOM 中文显示为问号或乱码；生成／检查脚本只使用显式 UTF-8 字节 API，不能以终端显示替代文件字节与 hash 证据。

## 6. 当前能证明与不能证明

本阶段可以证明固定 Windows 工具链下：正式 `1.0.0` Schema、原始字节 hash、生成类型／standalone／静态 metadata／历史 validator registry 和 Creator／Viewer canonical fixture 自洽；正式根 runtime 与实验 validator 隔离；正式 Schema 历史的既有条目、顺序、路径、hash 与 Schema 字节受每次真实执行的可信 merge-base 及长分支受保护提交检查，`1.0.0` fixture manifest 与 fixture 字节也按相同提交集合整体永久不变，未来版本必须使用新的 manifest 路径；对象结构校验不依赖运行时动态编译；原始 artifact 在解码／解析前按编码字节限尺寸；公共 Reader 只接受正式 `1.0.0` 并拒绝 `0.x`，且正式 Result 不暴露迁移路由；畸形 UTF-8、畸形／未知版本和恶意结构 fail-closed；未发布旧样本只通过开发内部 seam 在安全副本上逐步迁移并逐步校验；任一步或最终语义失败都不返回候选值。既有可信引用、全局／区块条件、文本与最小 KPI 规则继续成立。

本阶段仍不能证明：

- Creator／Viewer 的 HTTPS Origin／存储隔离和完整消费链；M0-015 已证明两端各自真实 Vite 构建、独立字节副本经 Reader／共享 runtime／Renderer 的最小只读链，但没有项目存储、发布包或跨 Origin 否定验证；
- 未来正式版本的真实迁移与上一主版本兼容；当前正式历史只有首个 `1.0.0` 节点，不存在可执行的正式迁移边；
- Project Repository／IndexedDB／OPFS 的事务原子切换与失败后可导出原项目；Reader 是纯内存候选边界，不冒充存储事务；
- evidence 与 metric／judgment rule 的真实关系。当前 context 只有可信集合，尚无版本化关系映射；
- 所有中文／外语数值或评价表达都能被词法规则识别，或某个 rule 逐句支持相应评价；完整证明需要结构化文本 AST／受控模板和可信 rule 元数据；
- 折线、柱状、环形等完整图表适用矩阵。正式 `1.0.0` 仍只实现 `title-summary` 与 `kpi` 最小适用性；
- Ubuntu、GitHub Actions、真实浏览器矩阵、正式产品稳定性或 M0 退出。

## 7. 阶段验证

根 `corepack pnpm run test:unit` 先构建全部 12 个 workspace，再从公开 `dist` seam 运行 Schema、对象 validator、Reader、Metric Runtime 与 M0-015 Renderer／双页面组合合同；`corepack pnpm run build`、`check:workspace`、`check:dependencies` 和证据检查共同验证生成物、真实 TypeScript／Vite 构建、依赖声明和工作区边界。具体通过计数与 Windows hash 写入对应的不可变阶段报告，不在本说明中复制会漂移的运行结果。

M0-016 已在 Windows 为 Vitest、RTL、Storybook、Playwright 与 axe 分别加入真实产品断言并激活结构化日常检查；M0-015 的本地 HTTP 可读性冒烟与 M0-016 Chromium 自动近似都不替代固定视觉／完整无障碍、HTTPS／四 Origin、干净 Ubuntu、GitHub Actions、完整产品消费链与统一人工复核。`FORMAL-STORY-SCHEMA` 与 `BOUNDED-READER-MIGRATION` 继续保持 `in_progress / partially_evidenced` 且不激活日常检查，M0-016／TEST-RUNNERS 也未关闭。
