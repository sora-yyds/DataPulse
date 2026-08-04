# AGENTS.md 与 DESIGN.md 官方指南研究

> 核验日期：2026-08-04（Asia/Shanghai）  
> 目标：为 DataPulse AI 仓库根目录的 `AGENTS.md` 与 `DESIGN.md` 提供可追溯的编写依据。  
> 证据范围：只采用 [agents.md](https://agents.md/) 官方站点及其直接链接的第一方仓库/示例、[getdesign.md](https://getdesign.md/) 官方站点及其第一方仓库，以及 getdesign 明确链接的 Google Stitch 官方 DESIGN.md 文档。未把搜索结果、博客转载或第三方模板作为规范依据。

## 结论摘要

1. **`AGENTS.md` 是 Agent 的仓库工作手册，不是另一份 PRD。** 官方格式只有标准 Markdown，没有必填字段或固定章节；根文件覆盖整个仓库，子目录可用更近的 `AGENTS.md` 提供局部规则。官网明确的冲突顺序只有：用户在聊天中的明确指令优先，之后是离目标文件最近的 `AGENTS.md`，再之后才是更上层文件。[A1][A3][A4]
2. **`AGENTS.md` 中的命令必须真实、精确、可运行。** 官网说 Agent 会尝试执行列出的相关程序化检查并修复失败。因此，规划期尚不存在的安装、构建和测试命令应明确标为“尚未建立”，不能杜撰。[A2][A4]
3. **`DESIGN.md` 应同时服务机器和人。** Google Stitch 当前 alpha 规范将其分为 YAML front matter 与 Markdown 正文：YAML token 是规范值，正文解释应用语境和理由；发生歧义时应以 token 为精确值。[D1][D2]
4. **Google 规范是开放的基础，不是封闭模板。** 规范给出 8 个有顺序的规范正文章节，但允许省略不相关章节并增加领域章节；未知章节应保留而不是报错。DataPulse 因而可以在规范章节之后增加“数据可视化”“动效与 3D”“交互状态”“响应式与展示模式”“可访问性”“已知空白”等领域章节。[D2]
5. **getdesign 的“9 段写法”是很有价值的扩展实践，不是 Google 的全部强制字段。** getdesign 将 Responsive Behavior、Known Gaps、Agent Prompt Guide 等纳入自己的分析模板；其仓库 README 也明确称这些是 “extended sections”。应借鉴其具体度和 rationale 写法，但不能把它们表述成 Google alpha 的必填规范。[G2][G3]
6. **DataPulse 可把根 `DESIGN.md` 设为品牌和界面设计的唯一手写事实源。** 由它导出的 Tailwind、W3C token、CSS 变量或图表主题应视为生成物；设计变更在同一 PR 中更新 token、说明与预览，并运行 Google CLI 的 lint/diff。此单一事实源治理方式是项目建议；Google 官方明确支持 lint、diff 与导出，但没有替项目规定 PR 流程。[D3][D4][D5]

## 一、AGENTS.md

### 1.1 官网明确规定或明确说明

| 主题 | 官方内容 | 对 DataPulse AI 的直接含义 | 证据 |
|---|---|---|---|
| 定位 | 官网把 `AGENTS.md` 比作 “a README for agents”，为编码 Agent 提供专用、可预测的上下文与指令位置。 | 写 Agent 如何安全、正确地修改仓库；产品需求正文仍留在 PRD/架构/ADR。 | [A1][A2] |
| 根位置 | 在仓库根目录创建 `AGENTS.md`。 | 当前文件应位于 `E:\DataPulse AI\AGENTS.md`。 | [A3] |
| 文件格式 | 没有 required fields；它只是标准 Markdown，可自行选择标题。 | 不需要 YAML front matter、JSON schema 或固定标题顺序。 | [A4] |
| 常见内容 | 官网列出 Project overview、Build and test commands、Code style guidelines、Testing instructions、Security considerations，并建议加入提交/PR、部署、大数据集和安全陷阱等新同事需要知道的内容。 | 这些是官方推荐选题，不是必填字段。 | [A3] |
| 嵌套作用域 | 大型 monorepo 可在 package 内放置额外 `AGENTS.md`；Agent 读取目录树中离目标文件最近的文件，最近者优先。 | 根文件覆盖全仓；将来 Creator、Viewer、Connector 等形成独立 package 时，再增加局部文件。 | [A3] |
| 冲突优先级 | “The closest AGENTS.md to the edited file wins; explicit user chat prompts override everything.” | 官网能证明的顺序是：用户本次明确指令 > 最近的 `AGENTS.md` > 更上层 `AGENTS.md`。官网没有规定 PRD、ADR、DESIGN 等项目文档之间的顺序，DataPulse 必须自行声明。 | [A4] |
| 命令执行 | 如果文件列出测试命令，Agent 会尝试运行相关程序化检查并在完成任务前修复失败。 | 不得留下猜测命令；命令变化时要同步更新。 | [A4] |
| 维护 | 官网要求把 `AGENTS.md` 当作 living documentation。 | 技术栈、目录、脚本、安全边界或交付门槛变化后同步修改。 | [A4] |

### 1.2 可执行指令应怎样写

官网最小示例采用“动作说明 + 精确命令”的格式：[A2]

```md
## Setup commands
- Install deps: `pnpm install`
- Start dev server: `pnpm dev`
- Run tests: `pnpm test`
```

官网与其直接链接的真实仓库示例进一步展示了以下做法。这些是从示例归纳的高质量写法，不是 Markdown 语法要求：

- 用反引号或 fenced code block 给出原样可复制的命令。
- 写明从哪个目录运行，并先定义 `<project_name>` 等占位符。
- 区分单文件、单 package、全仓检查，优先运行与改动最相关的最小检查。
- 写明触发时机，例如改动 import、移动文件、修改协议或发布包后需要运行什么。
- 写明通过标准，例如退出码、测试套件全绿、不得新增 warning。
- 写明失败后的动作和扩大检查范围的条件。
- 将边界分成可直接执行、需先询问、绝对禁止，避免含糊的“谨慎处理”。

上述模式分别可在官方最小示例、agents.md 自身仓库、OpenAI Codex、Apache Airflow 和 Temporal Java SDK 的官方链接示例中看到。[A2][A5][A6][A7][A8]

建议 DataPulse 的每条可执行指令至少回答四个问题：

1. 在哪个目录运行？
2. 执行哪条精确命令？
3. 哪类改动必须运行？
4. 什么结果才算通过？

当前仓库仍处规划阶段，尚无实现脚手架。合理写法是明确“安装/构建/测试命令尚未建立；脚手架落地后以仓库中已验证的 package scripts 替换本段”，而不是预先写死 `pnpm`、测试框架或部署命令。这是依据“命令会被 Agent 执行”所得出的项目风险控制建议，不是官网原句。

### 1.3 推荐的根文件结构

以下结构结合了官网推荐主题、第一方示例和 DataPulse 已确认的规划成果，属于项目方案而非强制格式：

1. `# AGENTS.md — DataPulse AI`
2. `## Scope and precedence`
3. `## Project mission and current phase`
4. `## Sources of truth`
5. `## Non-negotiable product and security invariants`
6. `## Repository map`
7. `## Setup and commands`
8. `## Engineering and architecture rules`
9. `## Testing and verification`
10. `## Documentation and ADR synchronization`
11. `## Change boundaries`
12. `## Commit and pull-request expectations`
13. `## Definition of done`
14. `## References`

项目化建议：

- `Sources of truth` 只说明 PRD、ARCHITECTURE、ROADMAP、CONTEXT、ADR、DESIGN 的职责、链接与冲突处理，不复制全文。
- 把密钥仅存浏览器本地、模型证据包禁止直接标识符/机密/自由文本外发、云端临时处理与 TTL、Origin 隔离、Connector 沙箱、包体/加密限制等浓缩为不可破坏的不变量，并链接到权威 ADR。
- 根文件承担全仓共性；未来的嵌套文件只写局部差异，减少规则漂移。这一“只写差异”是维护建议，官网只规定了最近文件优先，并未要求差量书写。
- `AGENTS.md` 只要求 UI 工作遵循 `DESIGN.md`，不要把完整视觉系统复制一遍。

### 1.4 不应伪装成官网规范的内容

- 官网没有规定固定章节、front matter、最大长度或特定语种。
- 官网没有规定 PRD、ADR、ARCHITECTURE、DESIGN 之间的优先级。
- 官网没有规定必须使用某个包管理器、测试框架、分支策略或 Conventional Commits。
- 官网没有说嵌套文件只能写差异；这是减少重复与冲突的项目建议。
- 官网列出的 Pluto 示例链接在本次核验时指向不存在的 `AGENTS.md`，不应将其内容作为证据。[A9]

## 二、DESIGN.md

### 2.1 来源层级与规范边界

本研究对冲突内容采用以下证据层级：

1. **Google Stitch 官方 specification**：Google alpha 格式、token 类型、章节顺序和 consumer behavior 的规范依据。[D2]
2. **Google Stitch 其他官方文档**：目的、维护、CLI、lint 与导出的操作依据。[D1][D3][D4][D5]
3. **getdesign 官方解释及其第一方仓库**：具体度、rationale 和扩展章节的实践参考。[G1][G2][G3][G4]

getdesign 明确说明其品牌分析是基于公开可观察模式的独立分析，不属于被分析品牌的官方设计系统，也不代表品牌方背书。因此，DataPulse 可以借鉴其文档结构和描述方法，不应照搬某个品牌的标识资产或把其分析称为该品牌官方规范。[G1][G3][G4]

### 2.2 Google 官方明确的两层结构

Google 将 `DESIGN.md` 定义为人和 Agent 都能读取、编辑、执行的纯文本设计系统文档，并称其为 `AGENTS.md` 的设计侧对应物。每个文件有两层：[D1][D2]

- **YAML front matter**：机器可读的精确设计 token；这是规范值。
- **Markdown 正文**：人可读的设计理由和应用语境，说明这些值为何存在以及何时使用。

Google 明确说 token 是 normative values，正文提供使用上下文。由此，DataPulse 应规定：

- 色值、字号、间距、圆角及组件属性发生数值冲突时，以 YAML token 为准。
- 正文不得重新发明另一组独立数值；它通过 token 名称引用值并解释角色、例外与理由。
- YAML 与正文仍应在一次变更中同步更新；“token 优先”是冲突兜底，不是容许长期分叉。

### 2.3 YAML schema、token 类型与引用

Google 当前示例使用以下基础结构：[D2]

```yaml
---
version: alpha
name: DataPulse AI
description: ...
colors:
  primary: "#..."
typography:
  body-md:
    fontFamily: ...
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
rounded:
  md: 8px
spacing:
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
---
```

明确规则包括：[D2]

- front matter 必须由单独一行、内容恰为 `---` 的起止分隔符包围。
- 当前规范版本是 `alpha`；schema 把 `version` 与 `description` 明确标成 optional。
- Color 使用带 `#` 的 sRGB 十六进制；Dimension 是带 `px`、`em` 或 `rem` 的数值。
- Typography 是复合对象，可含 `fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`、`fontFeature`、`fontVariation`；无单位 `lineHeight` 是官方推荐。
- token reference 使用 `{path.to.token}`；一般 token 组应引用 primitive，`components` 内允许引用 Typography 等复合值。
- 组件 state/variant 作为独立 component entry，例如 `button-primary-hover`，不嵌套为 state object。
- token 键名可以是描述性字符串；官方列出的 `primary`、`body-md`、`md` 等名称是 recommended，而非全部强制。

不要过度解释 schema：Google 页面只把 `version` 和 `description` 显式标为 optional，但 CLI 对 `spacing`、`rounded` 缺失只报 info，对 primary 或 typography 缺失报 warning，而不是统一判为 parse error。[D2][D5] 因此，本项目应通过自身完整性门槛明确“DataPulse 要求哪些 token 组必须存在”，不要把该项目门槛说成 Google parser 的全部硬性要求。

### 2.4 Google 官方规范正文章节

Google 当前 specification 给出的规范顺序是：[D2]

1. `## Overview`（别名 `Brand & Style`）
2. `## Colors`
3. `## Typography`
4. `## Layout`（别名 `Layout & Spacing`）
5. `## Elevation & Depth`（别名 `Elevation`）
6. `## Shapes`
7. `## Components`
8. `## Do’s and Don’ts`

官方同时明确：[D2]

- 正文 section 使用 `##`；可有一个仅用于文档标题、不作为 section 解析的 `#` 标题。
- 不相关的规范章节可以省略，但出现的规范章节应保持上述顺序。
- 可以增加领域专用章节；格式有意保持开放。
- consumer 遇到未知章节应保留、不报错；有效的未知颜色/字体 token 名应接受；未知组件属性可接受并警告。
- 重复的 section heading 是错误，consumer 应拒绝文件。

各规范章节的官方职责是：

| 章节 | 官方职责 | DataPulse 需要达到的具体度 |
|---|---|---|
| Overview | 品牌人格、目标受众、希望 UI 唤起的情绪；在没有具体规则时提供基础判断。 | 说明“数据可信、清晰、具有脉搏感与未来感”的边界，而不是只写“现代、高级”。 |
| Colors | palette 与每个颜色角色；至少 primary palette 应定义。 | 给每个色值一个语义职责，并涵盖文本、表面、状态与图表系列，而非 `blue-1` 一类无语义命名。 |
| Typography | semantic role 与尺寸变体。 | 除标题/正文外，定义指标数字、轴标签、图例、tooltip、代码/字段名等数据产品角色。 |
| Layout | grid、spacing scale、containment。 | 说明 Creator、Viewer、动态卡片和大屏在不同密度下的容器、网格和留白策略。 |
| Elevation & Depth | 阴影或替代它的边框、色阶、层次。 | 为 3D/玻璃/发光设预算和使用条件，避免所有元素同时浮起。 |
| Shapes | 圆角、边缘处理与整体形状语言。 | 说明卡片、控件、tooltip、图表容器和品牌图形的形状分工。 |
| Components | 原子组件样式；官方示例含按钮、chip、列表、输入、勾选、单选和 tooltip，并允许领域组件。 | 除通用控件外，定义 KPI 卡、图表框架、筛选器、时间范围、图例、tooltip、数据表和空状态。 |
| Do’s and Don’ts | 生成时的护栏和常见陷阱。 | 用可判断的规则阻止“默认紫蓝渐变、无意义 3D、仅靠颜色编码、图表装饰压过数据”等漂移。 |

上表第三列是 DataPulse 的项目化解释，不是 Google 原文要求。

### 2.5 getdesign 明确倡导的具体度

getdesign 的官方说明强调，`DESIGN.md` 不是纯 token 列表、Figma 导出、截图模仿、组件库或“把主题做完”的代码文件，而应像有经验的设计师向首次接触品牌的开发者解释视觉语言：[G2]

- token 回答“用什么精确值”；
- rule 回答“在哪里用”；
- rationale 回答“为什么，以及未覆盖场景中如何判断”。

其第一方示例将每个颜色写成“语义名 + hex + 角色 + 使用边界”，将字体写成完整的 family/size/weight/line-height/letter-spacing，并把组件组合回已有 token。[G2][G4] 这种具体度非常适合 DataPulse。

getdesign 官方文章还建议或展示：

- Overview 以多段文字说明氛围，并用 Key Characteristics 收束最重要的事实。
- token 在 YAML 只定义一次，正文以 `{colors.primary}` 等引用并解释理由。
- 组件正文与 YAML 组件 key 建立清晰对应。
- 文末记录 Responsive Behavior 与 Known Gaps。
- 文件随品牌演进而更新、版本化、经 PR 讨论，像代码一样维护。[G2]

这些属于 getdesign 的方法论。尤其需要注意：getdesign 文章称 YAML/prose component coverage 可由 linter 检查，但 Google 当前公开的 8 条 lint rule 中没有“一一覆盖”规则；Google 对未知 component property 的当前文档也有“规范页接受并 warning”与“linter broken-ref 将未知属性列入 error”的表述差异。[D2][D5][G2] 因此：

- DataPulse 可以把 YAML/正文组件一一对应设为项目检查项，但不要称为 Google CLI 当前保证的规则。
- 项目实现前应以实际安装版本运行合成样例，确认未知 component property 的真实严重级别；在此之前只使用 Google 已列出的标准 component property，额外元数据放入自定义正文或独立 token 组。

### 2.6 推荐用于 DataPulse 的完整章节

以下方案保持 Google 的 8 个规范章节在前，并把 DataPulse 特有内容作为允许的扩展章节。它是项目建议，不是官方必填模板。

**YAML front matter**

- `version`、`name`、`description`
- `colors`：品牌、canvas/surface、文本、边界、focus、success/warning/error、连续/发散/分类图表 palette
- `typography`：display、heading、body、label、metric、axis、legend、tooltip、mono/data-field
- `rounded`、`spacing`
- `components`：button、input、select、time-range、filter-chip、KPI card、chart-frame、legend、tooltip、data-table 等稳定原子/组合

**Google 规范正文**

1. Overview
2. Colors
3. Typography
4. Layout
5. Elevation & Depth
6. Shapes
7. Components
8. Do’s and Don’ts

**DataPulse 扩展正文**

9. `## Data Visualization & Information Design`
   - 图表选型与禁用场景
   - categorical/sequential/diverging palette
   - 轴、网格线、图例、tooltip、阈值、缺失值、异常值、负值和高基数处理
   - 数字格式、单位、时间范围和数据新鲜度表达
10. `## Interaction States`
    - hover、focus、selected、brush、zoom、drill-down、筛选联动、时间范围编辑
    - loading、empty、partial、error、stale、permission-denied 状态
11. `## Motion & 3D`
    - 时长、easing、层次与光照原则
    - 入场、更新、筛选、数据变化动画的语义
    - 3D 的准入条件、性能降级和 `prefers-reduced-motion`
12. `## Responsive & Presentation Modes`
    - Creator、Viewer、动态卡片、桌面大屏、平板/手机、嵌入和分享态
    - breakpoints、touch target、折叠策略和数据密度下限
13. `## Accessibility`
    - 键盘、focus、对比度、色盲安全、非颜色冗余编码、屏幕阅读器摘要、动画降级
14. `## Brand Assets & Content Voice`
    - Logo 安全区、图标/插画/背景风格、品牌命名、界面语气、数据洞察文案
15. `## Known Gaps`
    - 尚未定义或待实测的模式，避免 Agent 自行把猜测写成品牌规则

为防文件退化成巨型 UI 实现手册，正文应描述“视觉决策、语义、使用边界和理由”；组件 API、渲染器内部结构、ECharts/Three.js 代码和业务逻辑仍应留在架构或代码文档中。getdesign 也明确说 `DESIGN.md` 本身不是代码或组件库。[G2]

### 2.7 作为单一事实源的维护方式

建议在 DataPulse 根 `AGENTS.md` 与贡献流程中声明以下治理规则：

1. **唯一手写源**：根 `DESIGN.md` 是品牌视觉、界面语言和可视化设计的 canonical source；YAML token 是精确值，正文是语义与理由。
2. **派生物只生成**：Tailwind theme、W3C `tokens.json`、CSS custom properties、图表主题和预览清单从 `DESIGN.md` 生成或同步，不作为可独立手改的第二事实源。Google CLI 官方支持 Tailwind 与 DTCG 导出。[D4]
3. **同一变更同步**：新增/改变颜色、字体、间距、形状、公共组件或图表视觉编码时，在同一 PR 更新 YAML、相应正文、组件预览/视觉回归基线。
4. **自动校验**：至少运行 `npx @google/design.md lint DESIGN.md`。官方 CLI 会解析 YAML、解析 token 引用、检查 8 条规则并在 error 时以退出码 1 结束。[D4][D5]
5. **评审差异**：重大品牌变更用 `npx @google/design.md diff DESIGN-before.md DESIGN.md` 查看 token 增删改与 warning/error regression。命令由 Google 官方提供；临时 before 文件如何取得由项目工作流决定。[D4]
6. **项目级门槛**：Google CLI 的 contrast warning 只检查组件 `backgroundColor`/`textColor` 对且阈值为 4.5:1；它不覆盖整套图表可访问性。DataPulse 应另外测试图表 palette、focus、非文本对比度、键盘和 reduced motion。[D5]
7. **alpha 复核**：front matter 明示 `version: alpha`，升级 Google spec 或 CLI 前复核 schema、规则和导出结果，不假定 alpha 永久稳定。[D2][D4]
8. **所有权与变更记录**：为 `DESIGN.md` 指定评审所有者，并要求品牌/核心视觉更改说明 rationale 与迁移影响。这是项目治理建议，不是 Google 或 getdesign 的强制机制；getdesign 仅明确倡导版本化、PR 与持续演进。[G2]
9. **定期去漂移**：版本发布前抽样核对 Creator、Viewer、分享页、KPI 卡和代表性图表是否仍符合 `DESIGN.md`，并把无法覆盖的事实写进 Known Gaps。

### 2.8 Google CLI 当前公开的 8 条规则

| 规则 | 严重度 | 检查内容 |
|---|---|---|
| `broken-ref` | error | token reference 无法解析；lint 页面还将未知 component sub-token 列入此规则 |
| `missing-primary` | warning | 已有 colors 但没有 `primary` |
| `contrast-ratio` | warning | component 背景/文本低于 WCAG AA 4.5:1 |
| `orphaned-tokens` | warning | 已定义但没有任何 component 引用的 color token |
| `missing-typography` | warning | 已有 colors 但没有 typography token |
| `section-order` | warning | 规范章节顺序错误 |
| `missing-sections` | info | spacing 或 rounded 等可选 token section 缺失 |
| `token-summary` | info | 各 token 组数量摘要 |

来源：[Google Stitch Linting rules][D5]。

## 三、明确要求、官方建议与项目建议的边界

| 内容 | 分类 | 说明 |
|---|---|---|
| 根目录创建 `AGENTS.md` | agents.md 官方明确步骤 | 适用于当前根文件。 |
| `AGENTS.md` 必须有固定字段 | 不成立 | 官网明确说无 required fields。 |
| 用户聊天指令 > 最近 AGENTS > 上层 AGENTS | agents.md 官方明确优先级 | 只覆盖官网明确说出的层级。 |
| 根 AGENTS 列项目概览、命令、风格、测试、安全 | agents.md 官方推荐 | “Popular choices”，非必填。 |
| 命令写目录/触发条件/通过标准 | 第一方示例归纳 | 高质量写法，非格式语法。 |
| DESIGN 由 YAML token + Markdown rationale 构成 | Google 官方明确结构 | token 是规范值。 |
| DESIGN 只能有 8 个章节 | 不成立 | Google 明确允许省略和扩展。 |
| Google 8 个规范章节按顺序出现 | Google 官方明确规则 | 出现的规范章节应按 canonical order。 |
| Responsive、Known Gaps、Agent Prompt Guide 是 Google 必填项 | 不成立 | 是 getdesign 的扩展/实践模板。 |
| 每个 component YAML key 必须有同名 prose 且 Google CLI 会检查 | Google 当前公开规则未证明 | 可作为 DataPulse 自定义门槛。 |
| DESIGN 是 DataPulse 品牌单一事实源 | 项目治理决定 | 与 Google 的 portable/living artifact 模型一致，但“唯一源”由项目自行规定。 |
| Data Visualization、Motion & 3D、Accessibility 等扩展 | DataPulse 项目建议 | Google 允许领域扩展；具体章节由本项目定义。 |

## 四、来源

### AGENTS.md

- **[A1]** [AGENTS.md 官方站点](https://agents.md/) — 定位、使用步骤、FAQ、嵌套作用域。
- **[A2]** [agentsmd/agents.md 官方 README（固定提交）](https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/README.md#L5-L32) — 定位、最小示例和更完整的命令写法。
- **[A3]** [官方站点 HowToUseSection 源码（固定提交）](https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/components/HowToUseSection.tsx#L7-L40) — 根位置、推荐内容、嵌套优先。
- **[A4]** [官方站点 FAQ 源码（固定提交）](https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/components/FAQSection.tsx#L12-L30) — 无必填字段、冲突顺序、测试执行、持续维护。
- **[A5]** [agents.md 自身仓库 AGENTS.md（固定提交）](https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/AGENTS.md#L8-L37) — Always/Do not、原因与命令用途表的第一方示例。
- **[A6]** [OpenAI Codex AGENTS.md（官网直接链接示例，固定提交）](https://github.com/openai/codex/blob/5af85998c24fb3353ddd8164c3ed472057b03cb3/AGENTS.md#L64-L70) — 命令范围和边界示例。
- **[A7]** [Apache Airflow AGENTS.md Commands（官网直接链接示例，固定提交）](https://github.com/apache/airflow/blob/b99aa145c400d204aa72e84a05e5691136e28e46/AGENTS.md#L29-L58) 与 [Boundaries](https://github.com/apache/airflow/blob/b99aa145c400d204aa72e84a05e5691136e28e46/AGENTS.md#L501-L510) — 分层命令、Ask first/Never 示例。
- **[A8]** [Temporal Java SDK AGENTS.md（官网直接链接示例，固定提交）](https://github.com/temporalio/sdk-java/blob/1dabe5d773feaedaef66a2a71b1347dc20e666d3/AGENTS.md#L19-L57) — 构建、测试与 review checklist 示例。
- **[A9]** [PlutoLang/Pluto 官网示例链接](https://github.com/PlutoLang/Pluto/blob/-/AGENTS.md) — 本次核验时目标文件不存在，未采用其内容。

### DESIGN.md

- **[D1]** [Google Stitch：What is DESIGN.md?](https://stitch.withgoogle.com/docs/design-md/overview/) — 定位、两层模型、living artifact、开放哲学和最小示例。
- **[D2]** [Google Stitch：The DESIGN.md specification](https://stitch.withgoogle.com/docs/design-md/specification/) — alpha schema、token 类型、引用、规范章节、扩展与未知内容处理。
- **[D3]** [Google Stitch：View, edit, and export](https://stitch.withgoogle.com/docs/design-md/usage/) — token/正文同步编辑、可移植导出和外部工作流。
- **[D4]** [Google Stitch：Validate with the CLI](https://stitch.withgoogle.com/docs/design-md/cli/) — `@google/design.md` 的 lint、diff、Tailwind/DTCG 导出、退出码和程序化 API。
- **[D5]** [Google Stitch：Linting rules](https://stitch.withgoogle.com/docs/design-md/linting-rules/) — 8 条当前公开规则及严重度。
- **[G1]** [getdesign.md 官方站点](https://getdesign.md/) — DESIGN.md 作为可复用设计参考、品牌分析免责声明和目录入口。
- **[G2]** [getdesign.md：What is DESIGN.md? 原始 Markdown](https://getdesign.md/what-is-design-md.md) — token/rule/rationale、具体度、9 段编辑性讲解、维护和免责声明。
- **[G3]** [VoltAgent/awesome-design-md README（getdesign 第一方仓库，固定提交）](https://github.com/VoltAgent/awesome-design-md/blob/8147538b4226ae41e2487a9179e3bcc1f68e8554/README.md) — Google 规范链接、extended sections、使用方法和版权边界。
- **[G4]** [VoltAgent DESIGN.md 第一方示例（固定提交）](https://github.com/VoltAgent/awesome-design-md/blob/e06a96660396d741d0c106c8972172254dafbdc2/design-md/voltagent/DESIGN.md) — 语义 token、完整 typography、组件组合和 rationale 的具体写法。

[A1]: https://agents.md/
[A2]: https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/README.md#L5-L32
[A3]: https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/components/HowToUseSection.tsx#L7-L40
[A4]: https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/components/FAQSection.tsx#L12-L30
[A5]: https://github.com/agentsmd/agents.md/blob/d1ac7f063d20e70015ed6732664049ae4ba9d74e/AGENTS.md#L8-L37
[A6]: https://github.com/openai/codex/blob/5af85998c24fb3353ddd8164c3ed472057b03cb3/AGENTS.md#L64-L70
[A7]: https://github.com/apache/airflow/blob/b99aa145c400d204aa72e84a05e5691136e28e46/AGENTS.md#L29-L58
[A8]: https://github.com/temporalio/sdk-java/blob/1dabe5d773feaedaef66a2a71b1347dc20e666d3/AGENTS.md#L19-L57
[A9]: https://github.com/PlutoLang/Pluto/blob/-/AGENTS.md
[D1]: https://stitch.withgoogle.com/docs/design-md/overview/
[D2]: https://stitch.withgoogle.com/docs/design-md/specification/
[D3]: https://stitch.withgoogle.com/docs/design-md/usage/
[D4]: https://stitch.withgoogle.com/docs/design-md/cli/
[D5]: https://stitch.withgoogle.com/docs/design-md/linting-rules/
[G1]: https://getdesign.md/
[G2]: https://getdesign.md/what-is-design-md.md
[G3]: https://github.com/VoltAgent/awesome-design-md/blob/8147538b4226ae41e2487a9179e3bcc1f68e8554/README.md
[G4]: https://github.com/VoltAgent/awesome-design-md/blob/e06a96660396d741d0c106c8972172254dafbdc2/design-md/voltagent/DESIGN.md
