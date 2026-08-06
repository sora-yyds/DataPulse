# M0-015 最小二维 Renderer 与 Creator／Viewer 页面

> 任务：M0-015  
> Gate：`CREATOR-VIEWER-CONTRACT`  
> 状态：Windows 本地阶段已实现并取证；gate 仍为 `in_progress / partially_evidenced`，不激活  
> 适用决定：ADR-0002、ADR-0030、ADR-0036

## 1. 本次纵向切片

M0-015 是实施计划中首次允许建立产品页面的任务。本次只连通一条正式、可失败关闭的二维读取链：

```text
Creator 自有正式 Story／Metric 字节        Viewer 自有正式 Story／Metric 字节
                │                                      │
                └──── Story Artifact Reader ───────────┘
                                   │
                         共享 metric-runtime
                                   │
                         zh-CN 展示 composition
                                   │
                    受控 title-summary／kpi Renderer
```

正式合成结果固定为标题“订单概览”、KPI“订单总数”、结果 `23`、范围“全部数据（无附加条件）”及证据 `evidence_order-count`。页面不提供编辑、保存、导入、AI、分享、导出、3D 或自由画布；不能据此把 M0 称为产品 Alpha。

## 2. Renderer 边界

`@datapulse/renderer` 的内部 workspace 依赖精确为 `@datapulse/story-schema + @datapulse/themes`，React 只作为精确 peer。公共根 seam 只接受：

- 已由正式 Reader 返回的 `ValidatedStoryBlueprint`；
- 已解析、已格式化的 `ResolvedStoryComposition`；
- `available`、`unavailable`、`error` 三类 KPI 展示 DTO。

Renderer 只注册 `title-summary` 和 `kpi`。它不导入 Reader、fixture、`metric-runtime`、分析、存储或网络，不接收 accumulator、原始数值、公式、任意 HTML／CSS／JavaScript／Shader／ECharts option，也不计算指标或叙事。React 对所有蓝图文字执行文本转义；缺失、重复或 metric 不匹配的 KPI composition 显示稳定错误状态，不尝试自行补算。

主题 Provider 只把 `@datapulse/themes` 的四主题 × 35 个语义色与 70 个共享设计变量序列化为受控样式规则。故事画布遵守 `DESIGN.md` 的 1440px 最大内容宽度和居中约束；桌面可形成两列，平板和手机保持单列，页面主体不得横向滚动。Google Design `0.4.0` 当前不暴露 front matter 的 `lineHeight`，因此实现不伪造第二份行高 Token。

Renderer 仍在 DOM 中插入内容固定的受控 `<style>`。主题变量不再写入元素 `style` 属性；M0-036 必须为该固定样式建立 hash／nonce 或迁移到外部静态样式，禁止通过 `unsafe-inline` 放宽 CSP。

## 3. 两端独立 composition

Creator 与 Viewer 分别拥有物理独立的 Story 和 Metric JSON 字节副本。两端都执行：

1. 以 `fetch`、`credentials: omit`、`cache: no-store` 读取自身静态资源并转成 `Uint8Array`；
2. 由 `readStoryArtifact` 在 16 MiB 先验限制、fatal UTF-8、正式版本注册及可信上下文下读取 Story；
3. 对最多 65,536 字节的固定 Metric fixture 做 UTF-8／JSON／合同检查；
4. 分别通过 `evaluateCreatorMetric`／`evaluateViewerMetric` 委托同一 `metric-runtime`；
5. 只在 Story、条件范围、metric ID、aggregate 和固定黄金值全部一致时构建 `zh-CN` Renderer DTO。

任一 Reader、资源、指标或条件错误都返回不含 `blueprint`／`composition` 的失败 Result，页面显示明确错误且不会渲染候选故事。条件非空时不会错误显示“全部数据（无附加条件）”。

两端 Vite `8.2.0` 配置无 plugin、alias 或共享根配置，并固定 `assetsInlineLimit: 0`。生产构建分别发出两个 JSON 文件，workspace 合同拒绝把 fixture 内联为 `data:application/json` 后再由 `fetch` 读取，避免为后续 CSP 引入 `data:` connect 旁路。

## 4. Fixture 身份

[`tests/fixtures/creator-viewer-composition/manifest.v1.json`](../../tests/fixtures/creator-viewer-composition/manifest.v1.json) 使用 `hand-authored-m0-015-v1` 绑定：

| 内容 | 两端单份字节 | 两端共同 SHA-256 |
|---|---:|---|
| Story Artifact | 1,555 | `c199eaf2125a8ea1c74446708d80727343d903fd215049f13213a33bb4265386` |
| Metric Runtime fixture | 1,033 | `a480e13e60802d6d068d69cbc72bc933a54ada4cdfb605516ebc07b56727b872` |

manifest 同时引用正式 Story Schema `1.0.0` 和 M0-049 既有 Metric Runtime canonical fixture。它只冻结本次组合身份，不表示 M0-017 的通用 fixture manifest／语料 gate 已完成。

## 5. Windows 阶段验证

固定 Node `24.19.0`、Corepack `0.35.0`、pnpm `11.20.0` 下的当前结果：

| 检查 | 结果 |
|---|---|
| `corepack pnpm run build` | 11/11 workspace；Creator JS `335.48 kB`（gzip `85.94 kB`），Viewer JS `335.47 kB`（gzip `85.94 kB`），每端另有 `1.03 kB` Metric JSON 与 `1.55 kB` Story JSON |
| `corepack pnpm run check:workspace` | `395/395`，含两端独立 JSON 资源及禁止 `data:application/json` |
| `corepack pnpm run check:dependencies` | M0-015 报告绑定主断言 `2076/2076`；M0-016 冻结测试入口与 esbuild build policy 后为 `2087/2087`；M0-017 增加 fixture 边界后当前为 `2089/2089`，self-test `193/193`、domain contract `60/60`、循环 `0` |
| `corepack pnpm run test:unit` | 5 files / 168 tests；M0-015 新增 8 项组合／渲染断言 |
| `corepack pnpm run check:design` | 主断言 `356/356`、self-test `5/5`、`0 errors / 85 reviewed warnings / 1 info` |

本地 HTTP 浏览器另检查：

- Creator：桌面 `1440×900`；
- Viewer：桌面 `1280×720`、平板 `1024×768`、手机 `390×844`；
- 四档均可见标题、摘要、KPI `23`、范围与 evidence，无页面 alert、console warning/error、横向溢出或必需内容裁切；
- Viewer 平板／手机为单列，手机必需文字全部有可见布局盒；
- Creator／Viewer 的渲染根元素没有主题内联 `style` 属性。

这组观察仍只是 M0-015 的本地浏览器人工可读性冒烟。M0-016 已另外建立 production preview Playwright／axe runner，但两者都不是视觉基线、HTTPS／四 Origin 或外部环境认证。

## 6. 延期与停止线

下列内容仍未完成，不能由本报告推断为通过：

- M0-016 的干净 Ubuntu、GitHub Actions 与公开 Fork 复现；Windows 五类 runner 已形成阶段证据但未关闭任务／gate；
- M0-018 固定字体、时区、浏览器、种子、弱动效、键盘、焦点和 200% 缩放矩阵；
- HTTPS、严格 CSP、Creator／Viewer／API／Connector 四 Origin 与 SEC-008 存储隔离；
- Creator 项目保存／恢复、Viewer 发布包、M0-043／067 独立端到端链；
- WCAG 2.2 AA、四主题完整组件视觉基线、真实 Safari／微信设备；
- 干净 Ubuntu、GitHub Actions、公开 Fork 和真实 ruleset。

因此 `CREATOR-VIEWER-CONTRACT` 保持 `in_progress / partially_evidenced` 且不激活；M0-016 虽已补齐 Windows RTL、Storybook、Playwright 与 axe 真实产品断言并激活 TEST-RUNNERS 日常检查，但 `TEST-RUNNERS`、`DETERMINISTIC-UI-A11Y`、`METRIC-RUNTIME` 和 M0 退出状态均未关闭。规划顺序上的下一项是 M0-017 的通用 fixture manifest。
