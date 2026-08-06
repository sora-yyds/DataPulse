# AGENTS.md — DataPulse AI 仓库行为准则

本文件面向在 DataPulse AI 仓库中工作的编码 Agent，作用域覆盖整个仓库。它说明如何理解规划基线、修改代码、验证结果并维护文档；它不是另一份 PRD。

## 1. 作用域与指令优先级

- 用户在当前任务中的明确指令优先于 `AGENTS.md`。
- 将来子目录可以增加更靠近目标文件的 `AGENTS.md`；最近的文件优先。局部文件应只补充包级规则，不得无意削弱本文件的数据、正确性、安全、隐私和发布不变量。
- 如果用户明确要求改变既有产品决定，应把该改变作为正式决策处理：同步更新适用的 ADR、PRD、架构、Schema、测试和路线图，而不是只在代码中绕过基线。
- 当前仓库处于已确认规划基线、尚未完成 M0 脚手架的阶段。不要把规划中的目录或命令误报为已经存在。

## 2. 开工前必须阅读

按改动职责使用以下事实源，不要把它们简化成一个容易漂移的线性优先级：

| 事实源 | 负责内容 |
|---|---|
| [CONTEXT.md](CONTEXT.md) | 领域术语、实体边界及 `_Avoid_` 反例 |
| [PRD.md](docs/PRD.md) | 用户可观察行为、稳定需求编号和验收结果 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 信任边界、模块职责、依赖方向、协议和部署不变量 |
| [ROADMAP.md](docs/ROADMAP.md) | 里程碑顺序、强制验证、退出标准和发布清单 |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 当前里程碑的原子任务、依赖、Wave 与外部阻塞路径；不替代上位产品或架构事实 |
| [M0 证据索引](docs/evidence/m0/evidence-index.json) | M0 原子 gate、状态、激活、需求成熟度和产物引用；不得把产品 Evidence/证据包写入这里 |
| [docs/adr/](docs/adr/) | 已接受的设计决策及取代关系 |
| [DESIGN.md](DESIGN.md) | 品牌、视觉 Token、组件语言、图表、动效和响应式规则 |
| 版本化 JSON Schema | 故事蓝图和发布快照字段、枚举及读取边界的唯一机器规范；生成类型不能替代运行时校验 |

当前有效且未被取代的 ADR 决定已接受的技术选择。PRD 与 ADR 冲突时，按 PRD 的规则采用编号更高且未被取代的 ADR；两个当前 ADR 若未明确写出取代关系却彼此冲突，不得仅凭编号暗自选择，必须先消解冲突。以下旧决定只保留历史，不得作为实现依据：

- ADR-0004 → ADR-0017
- ADR-0005 → ADR-0009
- ADR-0007 → ADR-0020
- ADR-0008 → ADR-0017
- ADR-0015 → ADR-0016 → ADR-0022

若不同事实源在各自职责范围内仍然冲突，先解决文档或新增取代 ADR，再实现；不得在代码中暗自选边。

## 3. 不可违背的不变量

### 3.1 数据与数值正确性

- 原始文件、未发布原始行和完整本地项目只在浏览器本地处理。只有经过既定裁剪与用户确认的证据包、发布内容或选定明细可以按各自协议离开设备。资源不足或输入超限时必须明确拒绝；不得静默抽样、截断、删列或转到云端。
- 成功导入的数据集版本不可变。分析假设、修正、排除和转换必须可见、可追溯、可撤销。
- 全部指标和判定由确定性引擎计算。AI 只能组织目标、洞察、文案和受控视觉选择，不能计算、重算或静默覆盖事实。
- Creator 与 Viewer 必须共享纯 `metric-runtime`。`AVG` 合并 `sum + count`；`COUNT_DISTINCT` 使用精确集合并集。禁止相加分组去重数或静默改用近似算法。
- 数值、百分比、比较和评价性结论必须能追溯到指标、证据、条件和判定规则。不得生成预测、因果结论或无来源行业基准。
- 任一失败路径必须保留最后可读项目或现有基础草稿；禁止半提交、静默清理版本或用候选 AI 输出覆盖可靠结果。

### 3.2 AI、证据包与供应商

- 模型只接收经过裁剪、可预览的证据包。唯一标识、直接标识、机密字段、自由文本和稀有分类值绝对禁止外发；不得增加调试旁路、用户覆盖开关或供应商例外。
- 模型输出始终是不可信输入。只有通过 Schema、引用、口径和图表适用性校验的蓝图或补丁才能进入草稿。
- 不执行模型、文件或发布物产生的 HTML、JavaScript、CSS、Shader、任意 ECharts option、SQL、公式文本或其他代码。
- 无模型配置、额度不足或供应商故障时，确定性基础生成闭环仍须可用。
- 模型必须从维护目录或 `/models` 发现结果中选择；禁止手填模型 ID。自定义端点只由低权限浏览器连接器直连，不得经过 DataPulse 后端代理。
- 只有结构校验失败可以自动修复一次。网络、鉴权、余额、限流或供应商错误必须等待用户决定，不得静默重试或切换供应商、模型、地域。
- 第三方留存、训练、地域、上游和 SLA 只能陈述已核实事实；不得把 DataPulse 的 24 小时承诺扩展到供应商、中转站或自定义端点。

### 3.3 本地存储、分享与密码学

- 在用户内容和应用运行状态层面，DataPulse 官方云端只能保存端到端加密发布包和严格 TTL 的运行状态；不得新增账号、云端项目、故事、原始数据或密钥数据库。ADR-0041 明确同意后的无内容遥测使用独立隐私管道，不得与内容/项目存储混为一谈或借此扩大采集范围。
- 项目数据与设备密钥保持本地；模型密钥默认只在会话内存，用户明确选择后才可设备绑定加密持久化。日志、遥测、错误报告和项目包不得泄露密钥。
- 发布普通明细由所有者知情决定，界面必须预览真实值、范围并二次确认。含直接标识或机密字段的明细强制密码和有效期，不提供绕过入口。
- 必要加密能力缺失时拒绝操作，绝不降级为明文。
- 修改 `packages/crypto`、`packages/package-codec`、项目包、发布包或 Fragment 前，必须完整阅读 [架构第 9 节](docs/ARCHITECTURE.md#9-发布包端到端加密与撤销协议)、ADR-0021、ADR-0024 与 ADR-0047。不得自行改写算法、字节布局、用途、nonce/tag、KDF profile、包体边界或解码顺序；协议变更必须同时提供版本、迁移、固定互操作向量和恶意输入向量。
- 遥测默认关闭，只接受白名单无内容事件；禁止 Cookie、设备指纹、跨会话 ID 和任何用户内容。

### 3.4 浏览器隔离与受控渲染

- Creator、Viewer、API 和 Custom Connector 使用四个不同 Origin。Connector 的每个安全纪元还使用独占可注册域；无法满足时禁用自定义连接器，不能退回同源路径或删掉 Cookie 清理继续运行。
- DataPulse 页面与 API 不以 Cookie 承担身份、会话或遥测；基础设施不可避免的 Cookie 必须全部使用 `__Host-`、`Secure; Path=/` 且无 `Domain`。端口差异不构成 Cookie 隔离，Connector 的 `Clear-Site-Data: "cookies"` 只能在独占可注册域使用。
- 原始数据 Worker 必须无运行时 import 且禁止网络、动态导入和嵌套 Worker。固定 WASM 在原始数据交付前预取和校验。
- Connector 每个请求使用新 iframe、严格来源与 nonce/Schema 校验、`credentials: "omit"`、禁止 Service Worker，并在疑似污染时换用全新 Origin 与独占可注册域。从该安全纪元首次 HTML 响应起，每次都必须在代码执行前发送 `Clear-Site-Data: "cache", "cookies", "storage"` 与 `Cache-Control: no-store`；已有 Service Worker 污染不能靠原地清理修复，必须轮换纪元。Connector 不得向 Web Storage、IndexedDB、OPFS、Cache、Cookie 或任何持久化机制写入凭据、证据或响应；所有材料只驻留当前请求内存，完成、取消或超时即释放。
- CSP、逐路由 CORS、Origin 检查、存储隔离和消息边界是部署不变量，不得为本地调试临时放宽后遗留到提交中。
- Renderer 只渲染已注册组件和通过校验的故事蓝图。3D 只提供景深、光影与氛围，绝不承担数据编码；二维内容和等价信息必须先完整成立。
- WCAG 2.2 AA 核心项是发布门槛。品牌色、主题、WebGL 或动画不得覆盖可读性、键盘、焦点、非颜色区分、图表等价描述和弱动效要求。

## 4. 模块与依赖边界

目标逻辑结构见 [架构第 4 节](docs/ARCHITECTURE.md#4-monorepo-逻辑结构与依赖方向)。M0 可以调整等价目录名，但不得合并职责或制造循环依赖。

- `packages/story-schema` 是蓝图与发布快照的结构契约；所有读取边界仍须运行时校验。
- `packages/analysis-engine` 不依赖 React、模型适配器或云服务；它输出版本化累加器并调用纯 `metric-runtime`。
- `packages/metric-runtime` 保持纯、确定性且无网络、存储、React 或 DuckDB 依赖。
- `packages/generation` 从分析层取得的事实输入只能来自证据/证据 ID，不直接读取原始行；它可以接收受控的汇报目标、字段角色、质量状态、指标/图表规则、用户设置和既有蓝图上下文。
- `packages/renderer` 只消费已校验蓝图和注册组件，不接受任意脚本、HTML、Shader 或图表配置。
- `apps/viewer` 只依赖观看所需的 Schema、迁移、codec、metric runtime、renderer、narrative 和 crypto 子集；不得引入导入、OPFS、AI 或完整分析工作台。
- `apps/custom-connector` 只依赖请求/响应 DTO 与消息协议；不得依赖本地存储、crypto、analysis engine、Creator 状态或设备密钥。
- `services/*` 不依赖本地分析实现；分享服务把发布包视为不透明字节。
- Creator、Viewer 与 Connector 独立构建和部署。跨包协议变更必须在同一变更中原子升级生产者、消费者、Schema、迁移和测试。

## 5. 工作方式

1. 开工前确定关联的实施任务、PRD 需求 ID、当前有效 ADR、所属模块和当前里程碑退出标准；任务或 gate 状态变化同步更新适用的机器证据索引。
2. 优先实现最小可运行纵向切片；不能用孤立组件“完成”代替导入—分析—生成—编辑—分享链路的阶段验收。
3. 先修改规范边界，再修改消费者：故事结构从 Schema 和迁移开始；协议从版本和向量开始；公共视觉从 `DESIGN.md` Token 和组件目录开始。
4. 将输入视为恶意，将模型输出视为不可信，将跨 Origin 消息视为外部输入；在边界处解析、限尺寸、校验并使用稳定错误码。
5. 默认采用显式、可取消、可恢复的状态机。不得以无限等待、虚假进度、静默重试或模糊错误掩盖失败。
6. MVP 产品界面和生成内容仅支持简体中文与中国大陆区域格式；不得顺手增加英文或多语言旁路。故事时间使用固定故事时区，不能随 Viewer 设备变化。
7. MVP 范围已经冻结。未获当前任务明确授权时，不顺手加入实时数据源、多人协作、自由画布、任意代码、预测、PPTX/视频/GIF、手机创作或其他延期能力。
8. 遵循当前工作树，保留用户已有改动；禁止破坏性 Git 操作或重写无关文件。

## 6. 代码规则

- TypeScript 使用严格模式；公共边界提供显式类型和运行时 Schema，避免无理由的 `any`、非空断言及不可区分字符串错误。
- 确定性路径禁止依赖当前设备时区、非固定随机数、对象遍历偶然顺序或网络返回顺序。测试与视觉基线使用固定种子、语言、时区、字体和视口。
- UI 直接编辑是主入口，自然语言是辅助入口；关键操作必须有明确控件、撤销/重做和可见影响范围。
- 组件优先复用 `packages/themes`、`packages/renderer` 与共享 Token；不得在页面中散落未经说明的颜色、字号、圆角、阴影或动效常量。
- UI 工作必须遵循 [DESIGN.md](DESIGN.md)，同时不得让设计规范覆盖 PRD、安全、数据正确性或无障碍门槛。
- 项目全栈以 AGPL-3.0 在单一公开 GitHub monorepo 发布。依赖新增必须说明用途、浏览器/Worker 影响、包体与许可证兼容性；安全或核心协议不得依赖不可审计的远程运行时代码，公开 Fork 的强制测试不得依赖付费专有 SaaS。
- 不在日志、快照、夹具、Storybook、URL、错误正文或提交记录中放置真实密钥或真实用户数据。

## 7. 测试与验证

按改动类型执行最低验证；跨层改动取并集而不是任选其一。

| 改动 | 最低验证 |
|---|---|
| 指标、质量、证据、叙事、Schema、迁移、codec、crypto、服务逻辑 | Vitest；固定黄金向量、边界和恶意输入向量 |
| 编辑器、确认流程、撤销/重做、错误和恢复状态 | React Testing Library |
| 区块、主题、空/错/小样本、品牌约束、二维回退 | Storybook + 无障碍检查 |
| 导入到发布/导出、迁移和跨包契约 | Playwright 端到端 |
| Origin、Worker、Connector、CSP/CORS、Service Worker | 真实浏览器否定测试；不能只测 happy path |
| 视觉变更 | 固定种子并关闭动效；桌面/平板/手机、四主题和二维回退；同一 PR 人工审查基线 |
| 性能相关变更 | 固定环境多次运行中位数；绝对预算与相对 `main` 退化门槛 |

附加规则：

- 测试只使用仓库合成数据或明确维护的本地语料，禁止真实用户数据。
- 模拟供应商和 Playwright WebKit 不能冒充真实百炼、Glosc、Safari 或微信认证。
- 禁止批量重录视觉快照掩盖回归；有意变化和基线必须在同一 PR 审查。
- 无法运行的检查必须在交付中写明“未运行”、原因和风险；不得声称通过。
- 正式发布必须同时通过数值正确性、Schema/迁移、视觉、无障碍、核心端到端、性能、安全、真实供应商和真实设备门槛，并为每项当前有效 ADR 提供实现证据。

## 8. 命令

当前已建立 M0-005 固定工具链、M0-006 的最小 workspace／独立 TypeScript 构建／workspace 契约、M0-007 依赖边界、M0-008 本地治理配置、M0-009 两类聚合器、M0-010 的 Windows 领域合同阶段实现、M0-011／012 的实验 Schema 与 Windows 对象校验基础、M0-013 的有界 Story Artifact Reader／未发布 `0.0.1 → 0.1.0` 复制迁移、M0-014 主题 Token／Design lint、M0-015 的最小二维 Renderer 与独立 Creator／Viewer React + Vite 验证页、M0-016 的 Windows Vitest／RTL／Storybook／Playwright／axe 五类真实 runner 与结构化日常检查、M0-017 的统一合成 fixture manifest／原始字节 hash／有界只读校验 seam 阶段实现、M0-018 的固定 `zh-CN`／`Asia/Shanghai`／字体／视口／弱动效视觉、键盘焦点、200% 缩放与四主题基线冒烟、M0-019 的 GitHub Actions CI 表面（PR 快检／merge_group 已激活完整聚合／main 复核／M0 退出候选／标签 release dry-run，已完成本地语法与治理校验但未在真实远端运行）、M0-048 的正式 `1.0.0` Story Schema／原始字节 hash／Creator-Viewer 契约 fixture，以及 M0-049 的正式 `1.0.0` Metric Accumulator／Evaluation Plan Schema、固定 binary64 wire、最小 `COUNT_ROWS`／`SUM` 运行时与 Creator-Viewer 黄金结果 Windows 阶段实现；当前共 11 个 workspace。正式根运行时只加载正式 validator，正式历史的完整版本 tuple 与 validator mapping 从 manifest 生成；`0.x` 继续是隔离的未发布开发历史，公共 Reader 不接受它们，也不存在 `0.x → 1.0.0` 正式迁移边。公共 Reader 不开放可调限额或迁移路由，正式 Result 不暴露来源版本、目标版本或迁移步数。M0-015 页面只提供正式 fixture → Reader → 共享 metric-runtime → Renderer 的只读探针；M0-016 的 production HTTP preview 与 Chromium／axe 自动近似不能替代固定视觉、键盘、缩放、完整 WCAG、HTTPS、四 Origin 或真实设备认证；M0-017 不执行生成器、导入／分析闭环或 M0-047 `test:corpus`；M0-018 的固定 Chromium 视觉／键盘／缩放冒烟仍是自动近似，不替代完整 WCAG 2.2 AA 人工签署、固定视觉人工审查或真实设备矩阵。Hono、未来正式版本迁移边、完整产品 UI／编辑器仍未建立；干净 Ubuntu 验证、真实 GitHub Actions 运行（远端当前为空仓库）与公开 Fork 复现仍未完成；Windows 阶段结果不能推断为产品可用或关闭 M0-016、M0-017、M0-018、M0-049、TEST-RUNNERS、M0-CORPUS、CREATOR-VIEWER-CONTRACT。所有 pnpm 命令必须使用 Node `24.19.0`、Corepack `0.35.0` 和 `packageManager` 固定的 pnpm `11.20.0`，不匹配环境必须拒绝。

| 运行目录 | 精确命令 | 触发条件 | 通过标准 |
|---|---|---|---|
| 仓库根目录 | `corepack pnpm install --frozen-lockfile` | 修改根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.node-version`、`.corepack.env` 或依赖清单 | 在精确工具链下进程退出 0，锁文件无改写；Windows 本地已形成阶段证据，干净 Ubuntu 仍须单独执行后才能完成 M0-005 |
| 仓库根目录 | `corepack pnpm run check:toolchain` | 修改固定版本、包管理器配置、锁文件、Turbo、TypeScript 基线或 `scripts/check-toolchain.mjs` | 进程退出 0，JSON 结果 `result=passed`、`executed>=1`、`failed=0`、`skipped=0`，并回读 Node `24.19.0`、Corepack `0.35.0`、pnpm `11.20.0`、Turbo `2.10.8`、TypeScript `6.0.3` |
| 仓库根目录 | `corepack pnpm run build` | 修改任一 workspace 的源码、`package.json`、TypeScript reference、根 `tsconfig.json`、Story／Metric Runtime Schema、正式历史 manifest、生成器或 Turbo build 任务 | 进程退出 0，当前 11 个 workspace 均执行真实 `tsc --build`，产出独立 `dist` JavaScript、声明文件和 source map；Creator 与 Viewer 还分别执行 Vite 生产构建并生成独立 `dist/site`。`story-schema` 与 `metric-runtime` 先以 `--check` 拒绝陈旧的生成类型、Ajv standalone validator 和正式历史 metadata，并相对可信 merge-base 及 HEAD 可达、曾触碰各自正式目录的全部受保护提交核对版本、路径、原始字节数、SHA-256 与只追加语义；两个 workspace 的 Turbo build 均固定 `cache: false` 并透传 `DATAPULSE_MERGE_BASE`，防止缓存或长分支后续提交绕过历史检查；`story-schema` 的正式根运行时只加载正式 validator，`metric-runtime` 的公共运行时不加载 Ajv；`tsc` 发出的 `dist` JSON 只要求与源 Schema 语义等价，正式协议 hash 只取源文件原始字节；页面产物只是 M0-015 只读验证 bundle，不是完整可发布产品 |
| 仓库根目录 | `corepack pnpm run check:workspace` | 修改 workspace 目录、包名、依赖、exports、入口、构建配置、`tests/architecture/check-workspace.mjs` 或延期目录范围 | 先完成真实 Turbo build，再输出 `check=workspace-foundation`、`result=passed`、当前 Windows `395/395`、`failed=0`、`skipped=0`；验证 11 个必需 workspace、显式 exports、project references、产物、两端 Vite bundle／独立 JSON 资源与消费侧解析 |
| 仓库根目录 | `corepack pnpm run check:dependencies` | 修改任一 workspace manifest、TypeScript reference、`src`／包级脚本 import/re-export/dynamic import、package exports、完整方向策略、`pnpm-workspace.yaml`、`packages/domain` 公共合同／合同测试或 `tests/architecture/check-dependencies.mjs` | 进程退出 0，输出 `check=dependency-boundaries`、`result=passed`、当前 Windows 主断言 `2089/2089`、self-test `193/193`、domain contract `60/60`、`failed=0`、`skipped=0`、`cycles=0`；反向引用、循环、未声明／深导入、Renderer／Viewer／Connector／service 越界、Story Migrations 未授权 Schema subpath 或公共声明泄漏、Metric Runtime 非 Domain 运行时依赖、非法领域 ID、非法／重复／未知版本、不可区分 Result 或未登记 pnpm 图／build policy 必须非零 |
| 仓库根目录 | `corepack pnpm run test:unit` | 修改版本化 Story／Metric Runtime Schema、正式历史／生成类型／standalone validator／对象校验器、Story Artifact Reader／迁移、统一或领域 fixture／manifest、fixture checker、Metric Runtime merge／finalize／稳定错误优先级、Renderer、Creator／Viewer composition、domain ID／主题交叉契约、`tests/unit/`、`vitest.config.mts` 或 Vitest／Vite／Ajv／React／类型生成依赖 | 先构建 11 个 workspace，再在固定 Node 环境下从公开 `dist` seam 运行；进程退出 0，`passWithNoTests=false`、`allowOnly=false`，当前至少 `7 test files / 173 tests` 全部通过；覆盖 M0-011／012 既有合同、正式 Story 与 Metric Runtime `1.0.0` Schema／fixture 原始字节 hash、正式 Story 根 bundle 不含实验 validator、公共 Reader 拒绝 `0.x` 且不暴露迁移路由、Metric Runtime `COUNT_ROWS`／`SUM`、binary64 wire、固定 merge 顺序／错误优先级、65,536 accumulator 数量边界、Creator／Viewer 独立字节经 Reader → metric-runtime → composition → Renderer 的逐值一致、失败不渲染、四主题变量和 React 文本转义，以及统一 fixture catalog 的未知 set／generator／oracle、路径／realpath 别名逃逸、双向库存、重复身份、资源上限与稳定失败；同时覆盖 16 MiB Story Artifact 先验限制、真实 Uint8Array／Buffer／跨 realm、fatal UTF-8／BOM、未知／恶意样本、开发复制迁移、逐步／最终校验、数量／排名语境单个中文数词、失败不替换、Node 原生 ESM 与 Vite no-write。该入口本身不代表其余五类 runner、项目仓库原子提交、固定视觉／完整无障碍矩阵或跨平台 gate 通过 |
| 仓库根目录 | `corepack pnpm run test:component` | 修改 Creator／Viewer `App` 可观察状态、Renderer DOM、fixture fetch 边界、`tests/component/`、`vitest.component.config.mts` 或 RTL／jsdom 依赖 | 先构建 11 个 workspace，再以 jsdom、单 worker、`passWithNoTests=false`、`allowOnly=false` 运行；当前 `1 file / 2 tests` 全部通过，只 mock `fetch` 并验证两端正式独立字节显示标题、KPI `23`、范围、evidence 且无 alert；不冒充真实浏览器布局／Origin |
| 仓库根目录 | `corepack pnpm run test:storybook` | 修改 Renderer story、Storybook 配置／preview、主题／区块可观察输出、`vitest.storybook.config.mts` 或 Storybook／Vitest browser 依赖 | 先构建 11 个 workspace，再完成 Storybook 静态构建并以固定 Playwright Chromium 运行；当前 `1 file / 1 story test` 通过，`play` 验证标题、KPI `23`、范围、evidence，`addon-a11y` 以 `test=error` 接入；静态构建成功不能替代交互测试，chunk warning 不作为产品预算 |
| 仓库根目录 | `corepack pnpm run test:e2e` | 修改 Creator／Viewer 生产页面、Vite 构建、Playwright config、浏览器 preview 生命周期合同、`tests/e2e/` 或 Playwright 依赖／浏览器版本 | 先构建 11 个 workspace，在各 app cwd 由 Playwright 直接拥有的固定 Node／Vite CLI 进程上，以 `127.0.0.1:4173/4174`、`--strictPort`、`reuseExistingServer=false` 启动独立 production HTTP preview；当前 Chromium `2/2` 通过并验证两端标题、应用身份、KPI `23`、范围、evidence、无 alert，连续 E2E／axe 运行后端口必须释放；仅为自动近似，不证明 HTTPS、四 Origin、Safari／微信或完整产品 E2E |
| 仓库根目录 | `corepack pnpm run test:a11y` | 修改页面语义、Renderer、主题 Token、Playwright axe config、`tests/a11y/` 或 axe／Playwright 依赖 | 先构建 11 个 workspace 并启动同一对严格 production HTTP preview；当前 Creator／Viewer `2/2` 通过，不排除产品内容、不禁用规则，要求 axe 实际评估结果非零且 `violations=0`；这不是完整 WCAG 2.2 AA、键盘、焦点、缩放、对比度人工签署或真实设备认证 |
| 仓库根目录 | `corepack pnpm run test:visual` | 修改页面语义／布局、Renderer、主题 Token、Playwright 视觉配置、`tests/visual/`、视觉基线或 Playwright 依赖 | 先构建 11 个 workspace，再以与 E2E／axe 相同的严格 production HTTP preview 与各 app cwd 直启 Node／Vite CLI 运行；固定 `zh-CN`、`Asia/Shanghai`、弱动效（`openStory` 显式 `emulateMedia` 兜底）与四主题 Token，当前 `24 run / 18 passed / 6 designed skips`，覆盖字体回退链、`:focus-visible` 焦点环、200% 缩放无水平溢出且核心内容不重叠、响应式不溢出和四主题视觉基线；Playwright 快照仅是固定 Chromium 自动近似，不证明完整 WCAG 2.2 AA、键盘／焦点人工签署、缩放对比度人工审查或真实设备 |
| 仓库根目录 | `corepack pnpm run check:test-runners` | 修改任一六类 runner 根脚本、测试配置／产品断言、`scripts/check-test-runners.mjs`、TEST-RUNNERS activation 或相关依赖 | 顺序真实运行 `test:unit`、`test:component`、`test:storybook`、`test:e2e`、`test:a11y`、`test:visual`；输出单行 `check=test-runners`、`result=passed`，当前结构化断言 `6/6`、`failed=0`、`skipped=0`，并回显本次 gate／nonce；任一子入口失败时最终非零且不静默跳过。Windows 通过不关闭 M0-016／TEST-RUNNERS／M0-018 |
| 仓库根目录 | `corepack pnpm run check:governance` | 修改 `.changeset/`、`.github/`、`CONTRIBUTING.md`、治理策略或治理 checker | 进程退出 0，输出 `check=repository-governance`、`result=passed`、真实断言和恶意 self-test 均 `failed=0`、`skipped=0`；这不替代真实 GitHub ruleset／失败 PR 证据 |
| 仓库根目录 | `corepack pnpm run check:design` | 修改 `DESIGN.md`、主题包、Design warning 基线、固定 CLI 或设计 checker | 进程退出 0，实际 `designmd --version=0.4.0`，Design lint 为 `0 errors / 85 reviewed warnings / 1 info`，四主题各 35 个语义色、70 个共享设计变量、生成物匹配，当前主断言 `356/356`、self-test `5/5` 且无失败／跳过 |
| 仓库根目录 | `corepack pnpm run check:fixtures` | 修改统一 fixture Schema／manifest、任一受控子 manifest 或 fixture、Creator／Viewer fixture 副本、fixture checker／单测、M0-CORPUS 状态或相关证据 | 进程退出 0，输出 `check=fixture-manifest`、`result=passed`、当前 `4` 个逻辑集／`12` 个 artifact／`0` 个 generated 集，主断言 `312/312`、恶意 self-test `26/26`、`failed=0`、`skipped=0`；核对具体 primitive／errorCode oracle、固定 generator policy、POSIX／Windows 保留名和 8.3 别名、symlink／junction、realpath 唯一性、原始 bytes／SHA-256、双向库存完整性和有界读取，且不执行生成器。该入口不等于 M0-047 `test:corpus`、大型 CSV／XLSX 生成、导入／分析、Ubuntu、GitHub Actions 或公开 Fork 已运行 |
| 仓库根目录 | `corepack pnpm run check:evidence` | 修改证据五类 Schema／实例、索引、根脚本 registry、聚合器、记录链或 merge-base 规则 | 进程退出 0；Ajv 合同／实例、既有语义自测、activation registry、相对 merge base 只追加规则和恶意 attestation 自测全部通过 |
| 仓库根目录 | `corepack pnpm run check:aggregators` | 修改日常／退出聚合器、激活命令语法、结构化摘要身份、nonce／gate 绑定或 M0 fail-closed 语义 | 进程退出 0；拒绝零 gate、脚本别名／递归、重复 rootScript／summary check、内联伪摘要、旧 nonce、错误 gate/check 与字符串计数，并确认 M0 未完成时退出条件仍不满足 |
| 仓库根目录 | `corepack pnpm run check:foundation` | 修改工具链、workspace、治理基础或 `REPO-FOUNDATION` 根脚本 | 固定运行工具链根断言、`check:workspace`、`check:governance`，并要求每项返回非空结构化断言；输出 `check=repository-foundation`、`result=passed`、`executed>=1`、`failed=0`、`skipped=0` |
| 仓库根目录 | `corepack pnpm run verify:pr` | 提交前，以及修改 activation registry、任一已激活根脚本或日常 check 名 | 先以独立 `check:evidence` 完成可信启动，再只按索引中的已激活根脚本键无 shell 重跑；每个单一 `.mjs` runner 必须回显本次 gate、summary check 与 256 位 nonce，每项生成并回读 attestation，全部 `executed>=1`、`passed=executed`、`failed=0`、`skipped=0` 时退出 0 |
| 仓库根目录 | `corepack pnpm run verify:m0` | M0 退出候选，或修改退出／freshness 语义 | 当前必须非零并列出未完成 gate；只有冻结 35 gate 全部 passed、唯一链尾一致、已激活自动 gate 本次新鲜重跑且外部 provenance 有效时才能退出 0 |
| 仓库根目录 | `corepack pnpm changeset` | 面向用户的功能、修复、兼容性或可观察行为变化 | 交互式生成非空 `.changeset/*.md`，选择真实受影响 workspace 与 SemVer 级别；纯内部／治理变更在 PR 模板中说明不适用理由 |
| 仓库根目录 | `node docs/evidence/m0/validate-evidence-index.mjs --self-test` | 修改 M0 证据 Schema、退出 manifest、索引、记录引用，或改变 `IMPLEMENTATION_PLAN.md` 的 M0 任务、PRD 需求 ID、ADR 状态／文件 | 进程退出 0，`integrityValid=true`、`selfTestValid=true`、35 个 gate 与 67 个任务完整覆盖；M0 未退出期间 `historicalGateRecordsPassed=false` 是预期状态，不得改写成通过 |

`REPO-FOUNDATION`、`DEPENDENCY-BOUNDARIES`、`DETERMINISTIC-UI-A11Y`、`CI-ACTIVATION` 与 `TEST-RUNNERS` 已以真实断言进入日常 activation registry，但都仍是 `in_progress / partially_evidenced`；激活不等于 gate 或任务完成。`FORMAL-STORY-SCHEMA`、`BOUNDED-READER-MIGRATION`、`METRIC-RUNTIME`、`CREATOR-VIEWER-CONTRACT` 与 `M0-CORPUS` 同样仍是 `in_progress / partially_evidenced`，且均未激活。Windows 本地结果不能替代 Ubuntu、GitHub Actions、真实 ruleset、完整人工签署、M0-010 的跨环境复核、FR-MET-009 的 M1 完整指标集合、M0-047 语料执行、HTTPS／四 Origin 或固定视觉／无障碍浏览器矩阵。`GITHUB-GOVERNANCE` 继续保持外部阻塞，`verify:m0` 的当前失败是正确结果。不得把 M0-005～020、M0-048、M0-049 或对应 gate 写成完成。

- Agent 必须先从根 `package.json`、锁文件、workspace、Turbo 配置和 GitHub Actions 中发现真实脚本，不得猜测。
- M0 脚手架必须建立安装、格式/静态检查、类型检查、单元测试、组件/Storybook、端到端、视觉/无障碍、性能、语料、构建和发布矩阵的根级入口或明确占位，并在干净公开 Fork 中运行当前 M0 纵向切片适用的可复现检查。后续里程碑再逐步填充相应矩阵；M4 全量语料和完整发布矩阵不得提前冒充已通过，官方真实供应商/设备认证也不属于 Fork 构建门槛。
- M0 建立任一真实脚本时，同一 PR 必须把本节更新为“运行目录 + 精确命令 + 触发条件 + 通过标准”。
- 脚本尚不存在时不得临时发明替代命令并宣称质量门槛已通过。

## 9. 文档、ADR 与变更治理

- 已进入实现或测试的需求编号不得复用；废弃需求保留编号并标明状态。
- 改变数据驻留、模型外发、加密协议、Schema 兼容、公开配额、Origin 边界或 MVP 范围时，先新增或取代 ADR，再同步 PRD、架构、Schema、迁移、夹具和路线图。
- 不覆写被取代 ADR 来隐藏历史；用更高编号 ADR 明确写出取代关系。
- 正式 Schema 的迁移器和历史黄金夹具永久保留，不得以“只支持最新版”为由删除。
- 新增或改变领域概念时同步 `CONTEXT.md`，沿用已有术语及 `_Avoid_` 边界。
- 外部供应商事实同步到研究文档，并明确区分“文档确认”“真实验证”和“未知”。
- 品牌、视觉 Token、公共组件语言、主题或动效规则变化时同步 `DESIGN.md`、预览和视觉基线。
- 文档、迁移样本、视觉基线、设备清单和供应商检查清单随功能同 PR 维护，不集中到发布前补写。

## 10. 变更边界

### 可以直接进行

- 与当前任务直接相关的只读调查、局部实现、测试、文档同步和可逆修复。
- 为满足现有需求而补充缺失测试、稳定错误处理、Schema 校验和无障碍状态。
- 在不改变公开行为的前提下，按既定依赖方向进行内部重构。

### 需要先确认或正式决策

- 当前任务未授权的用户可见范围扩张、MVP 延期项回流或显著改变交互模式。
- 破坏性 Schema/协议变化、删除历史迁移、降低兼容范围或改变密码学参数。
- 新增原始数据外发、长期云端状态、账号体系、第三方遥测或更宽的供应商代理能力。
- 放宽任何安全、隐私、正确性、可访问性或发布门槛。

### 绝对禁止

- 使用真实用户数据或真实密钥作为测试夹具。
- 为“先跑起来”上传原始表、执行生成代码、明文降级、绕过确认或关闭安全检查。
- 隐藏失败、伪造测试结果、把模拟结果表述为真实外部认证。
- 在未经明确授权时执行破坏性 Git、云资源、发布、密钥或数据操作。

## 11. 完成定义

交付前确认：

- 改动满足关联需求 ID、当前 ADR、模块边界和里程碑退出标准；
- 代码、Schema、迁移、测试、文档和视觉基线按影响同步；
- 相关最小检查已通过，跨包/协议改动扩大到完整矩阵；
- 没有秘密、真实用户数据、调试旁路、宽松安全头或未说明的新依赖；
- 用户可见失败可解释且可恢复，最后可读数据保持完整；
- 当前任务的证据记录、gate 状态与 artifact 引用已经同步，日常激活和里程碑退出状态没有被伪报；
- 最终说明列出结果、验证命令/范围、未运行项和剩余风险。

## 12. 外部格式参考

- [AGENTS.md 开放格式](https://agents.md/)
- [AGENTS.md 与 DESIGN.md 官方指南研究](docs/research/agents-and-design-guides.md)
