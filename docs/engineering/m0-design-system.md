# M0-014 Design lint 与主题语义 Token

> 任务：M0-014
> 状态：主题契约与本地检查已实现；根聚合、CI、视觉和无障碍矩阵分别由 M0-009、M0-018、M0-019 接线
> 适用决定：ADR-0002、ADR-0013、ADR-0030、ADR-0039

## 1. 边界

根 [`DESIGN.md`](../../DESIGN.md) 仍是品牌视觉、界面语言和可视化 Token 的唯一手写事实源。M0-014 只冻结四主题的机器可读语义色契约和可重复检查，不声称四主题组件、视觉基线、真实浏览器无障碍或 M3 完整渲染系统已经完成。

`@datapulse/themes` 是零依赖、纯 TypeScript workspace。它不依赖 React、Renderer、Story Schema、存储或网络，只导出由 `DESIGN.md` 生成的稳定主题 ID、35 个 `--dp-*` 语义变量及其解析后 sRGB hex。M0-015 的 Renderer 可以消费该类型化接口，组件不得反向读取 primitive color。

## 2. DataPulse themes 扩展

Google `design.md` alpha schema 没有主题组，但 `0.4.0` 会保留与标准 key 不近似的未知顶层扩展。DataPulse 因而在 front matter 中增加：

```yaml
themes:
  deep-space-neon:
    label: 深空霓虹
    semanticColors:
      canvas: "{colors.canvas-dark}"
```

项目检查器而非 Google export 负责该扩展。约束为：

- 主题 ID 精确为 `deep-space-neon`、`soft-glass`、`data-editorial`、`enterprise-minimal`；
- 中文标签分别为深空霓虹、玻璃柔光、数据编辑部、企业极简；
- 每个主题精确提供同一组 35 个角色：17 个表面／文字／交互／状态角色、8 个分类图表角色、5 个顺序色阶角色和 5 个发散色阶角色；
- 每个值只能是 `{colors.*}` 引用，禁止字面色、CSS、脚本、其他 token group 或缺失时跨主题回退；
- 每个引用必须由固定 CLI 解析为有效 color，生成结果统一为小写 sRGB hex。

## 3. 固定工具与 warning 基线

Design CLI 精确固定为 `@google/design.md@0.4.0`。检查器会跨平台实际执行 `designmd --version` 并要求输出精确为 `0.4.0`；Windows 不调用会与根 `DESIGN.md` 路径冲突的 `design.md` bin。它只用于开发和 CI，不进入浏览器、Worker 或服务运行时 bundle。上游固定 tag 使用 Apache-2.0；npm 包自身没有 `license` 字段且发布文件只含 `dist`，因此依赖治理必须保留这一元数据缺口，不能把包管理器的未知许可证结果解释成已自动认证。

当前 `DESIGN.md` 的固定结果为 `0 errors / 85 warnings / 1 info`：

- 7 个 `broken-ref` warning：Google alpha 的 component sub-token 尚未登记 DataPulse 必需的 `borderColor`；
- 78 个 `orphaned-tokens` warning：Google 只把 `components` 引用计为消费，不识别 DataPulse `themes` 扩展、图表色阶或正文语义引用；
- 1 个 `token-summary` info：90 colors、15 typography、6 rounded、11 spacing、11 components。

[`design-warning-baseline.v1.json`](../../tests/design/design-warning-baseline.v1.json) 记录每个已审查 warning 的严重度、规则、路径和精确消息模板。检查器要求实际 warning 集合与它完全相等：新增 warning 会失败，已移除 warning 也要求显式清理基线，不能留下失真的“已审查”记录。任何 error 无条件失败。

## 4. 生成与验证

直接检查入口为：

```powershell
node scripts/check-design.mjs --self-test
```

在审查 `DESIGN.md` 和 warning baseline 后，需要更新派生文件时运行：

```powershell
node scripts/check-design.mjs --write --self-test
```

`--write` 只有在固定工具版本、零 error、warning 基线和 4×35 主题契约全部通过后才覆盖 `packages/themes/src/index.ts`。普通检查只读并逐字核对生成结果。

同一命令还运行五个 fail-closed 否定样例：恶意 CSS／代码样式色值、未审查 component warning、缺失主题角色、主题字面色绕过和生成物漂移。通过报告必须同时满足主检查与 self-test 的 `failed=0`、`skipped=0`。

Google CLI 的文字对比度检查只覆盖已登记 component 的 `backgroundColor`／`textColor`。图表非文本对比度、非颜色区分、键盘、焦点、200% 缩放、弱动效、四主题页面截图和真实浏览器行为仍由 M0-018 及后续视觉／无障碍门槛验证。
