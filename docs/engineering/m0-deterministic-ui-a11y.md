# M0-018 固定视觉／键盘／缩放冒烟阶段实现

> 任务：M0-018
> 需求：NFR-QA-003、NFR-QA-004
> 决定：ADR-0013、ADR-0039
> 状态：Windows x64 固定环境视觉／键盘／焦点／200% 缩放冒烟与四主题视觉基线已验证；完整 WCAG 2.2 AA 人工签署、固定视觉人工审查、真实设备与 Ubuntu／GitHub Actions／公开 Fork 尚未运行，因此任务和 gate 仍为 `in_progress / partially_evidenced`

## 1. 固定环境合同

M0-018 在 M0-015 只读页面上冻结浏览器与运行环境，保证视觉结果可复现：

- locale `zh-CN`、时区 `Asia/Shanghai`（`new Date().getTimezoneOffset() === -480`）、页面 `lang="zh-CN"`；
- 弱动效：`openStory` 显式调用 `page.emulateMedia({ reducedMotion: "reduce" })`，并断言 `matchMedia("(prefers-reduced-motion: reduce)")` 为真、`document.getAnimations().length === 0`；
- 字体回退链由主题 Token 固定：正文 `--dp-font-family-body-md`（Inter → Noto Sans SC），数字 KPI 使用 Space Grotesk；
- 视口：Creator／Viewer 桌面 `1280×720`、Viewer 平板 `834×1112`、Viewer 手机 `390×844`；
- 四主题：`deep-space-neon`、`soft-glass`、`data-editorial`、`enterprise-minimal`，通过 `data-dp-theme` 属性切换并逐主题截图。

已知环境缺陷：Playwright runner 级 `use.reducedMotion: "reduce"` 在当前版本不生效；已在 spec 内注明，并用 `page.emulateMedia` 显式兜底。

## 2. 冒烟矩阵（test:visual）

`playwright.visual.config.ts` 复用 `createHttpPreviewConfig`（同一对 `127.0.0.1:4173/4174`、`--strictPort`、`reuseExistingServer=false`、各 app cwd 直启 Node／Vite CLI），定义四个项目：

| 项目 | 页面 | 视口 | 承担测试 |
|---|---|---|---|
| creator-desktop | Creator | 1280×720 | 固定环境、字体、键盘焦点、200% 缩放、四主题基线 |
| viewer-desktop | Viewer | 1280×720 | 固定环境、字体、键盘焦点、200% 缩放、四主题基线 |
| viewer-tablet | Viewer | 834×1112 | 固定环境、字体、键盘焦点、响应式 |
| viewer-mobile | Viewer | 390×844 | 固定环境、字体、键盘焦点、响应式 |

`tests/visual/deterministic-ui-smoke.spec.ts` 六项测试：

- 固定环境：locale、时区、弱动效、无运行动画、renderer lang；
- 字体回退链按主题 Token 固定；
- 键盘焦点顺序与 `:focus-visible` 焦点环规则：Renderer 注入 2px `var(--dp-focus)` outline、2px offset 与 `var(--dp-radius-control)`，且首个 Tab 存在焦点目标；
- 200% 缩放：仅桌面项目；把视口宽度减半模拟浏览器 200% 放大，断言无水平溢出、核心内容可见且不重叠；
- 响应式：仅平板／手机项目；断言无水平溢出且核心内容可见；
- 四主题视觉基线：仅桌面项目；`toHaveScreenshot` 使用 `animations: "disabled"`、`fullPage: true`、`maxDiffPixelRatio: 0.001`。

当前 Windows 结果：`24 run / 18 passed / 6 designed skips / 0 failed`（6 项跳过全部是缩放、响应式与视觉基线按项目矩阵的设计性跳过）。`scripts/check-test-runners.mjs` 已把 `testScripts` 扩展为六项，`check:test-runners` 返回 `6/6`。

## 3. 证明边界

Windows 阶段结果证明固定 Chromium 下六项自动冒烟与八张主题基线可以稳定重放。它不证明：

- 完整 WCAG 2.2 AA：axe 自动扫描与焦点环规则都不等于键盘／焦点／对比度的人工签署；
- 固定视觉人工审查：PNG 基线只冻结当前像素，仍需同一 PR 人工审查；
- HTTPS、Creator／Viewer／API／Connector 四 Origin、Safari／微信或真实设备；
- 干净 Ubuntu、GitHub Actions、merge queue、公开 Fork 复现。

因此 M0-018 与 DETERMINISTIC-UI-A11Y 保持 `in_progress / partially_evidenced`；daily gate 继续绑定 `check:design`，不把视觉冒烟写成新的日常根脚本。规划顺序上的下一项是 M0-019 CI。