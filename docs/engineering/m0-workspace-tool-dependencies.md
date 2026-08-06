# M0 workspace 工具依赖评估

> 任务：M0-005、M0-008、M0-009、M0-011、M0-012、M0-013、M0-014、M0-015、M0-016、M0-048、M0-049
>
> 状态：Windows 工程、本地页面与五类测试 runner 阶段已验证；固定视觉／无障碍矩阵、干净 Ubuntu 与 GitHub Actions 尚未运行
>
> 评估日期：2026-08-06（Asia/Shanghai）

本文记录 M0-005 首批根开发依赖的用途、产物影响、维护方式与许可证兼容性。它不把开发工具视为产品运行时能力，也不替代后续 SBOM、漏洞扫描或发布认证。

M0-013／048 的 `@datapulse/story-migrations` 只消费仓库内 Domain 与 Story Schema，使用平台 `Uint8Array`／`TextDecoder`／JSON 能力；M0-049 的 `@datapulse/metric-runtime` 产品源码只消费 Domain，并使用平台 `ArrayBuffer`／`DataView`。二者都不引入新的第三方产品运行时依赖或远程 Adapter。M0-015 的 Renderer 内部 workspace 依赖仅为 Story Schema 与 Themes，React 由 Creator／Viewer 消费者提供；两个页面各自形成独立 Vite bundle。正式 Schema／fixture 的 SHA-256 仅由 Node 构建、检查与测试代码计算；浏览器运行时读取静态字节资源与生成 metadata，不引入 Node crypto 或 polyfill。

| 依赖 | 固定版本 | 用途 | 浏览器／Worker／服务运行时影响 | 安装与产物影响 | 许可证与维护 |
|---|---:|---|---|---|---|
| `turbo` | `2.10.8` | 编排 monorepo 根任务；工具链自检、Story Schema 与 Metric Runtime build 均禁用缓存，后两者透传 `DATAPULSE_MERGE_BASE` 以执行各自正式历史检查 | 仅为根 `devDependency`，不进入浏览器、Worker 或服务运行时 bundle；M0-015 页面 bundle 不包含 Turbo | 锁文件保留各平台可选原生包，安装时只选择当前平台；Windows x64 干净安装逻辑文件体积计入下述合计，运行时 bundle 增量为 0 | 主包与当前平台包均为 MIT，与 `AGPL-3.0-only` 仓库兼容；由上游官方包维护，升级必须单独审查并精确固定 |
| `typescript` | `6.0.3` | 提供严格 TypeScript 配置解析和后续 workspace 编译器 | 仅为根 `devDependency`，编译器不进入浏览器、Worker 或服务运行时 bundle | 增加本地／CI 编译器安装体积，运行时 bundle 增量为 0 | Apache-2.0，与 `AGPL-3.0-only` 仓库兼容；采用与后续 `typescript-eslint` peer 范围兼容的稳定版本，升级必须重跑类型与锁文件矩阵 |
| `@changesets/cli` | `2.31.1` | M0-008 生成面向用户变更的版本记录和后续发布说明 | 只在开发／发布编排中运行，不进入浏览器、Worker 或服务 bundle | 增加本地／CI 治理工具及其传递依赖；产品运行时 bundle 增量为 0 | MIT，与 `AGPL-3.0-only` 仓库兼容；配置和 CLI 版本必须与锁文件一同审查 |
| `ajv` | `8.17.1` | 根开发依赖用于 M0-009 证据合同与结构测试；`story-schema` 运行时依赖只承载其 standalone validator 所需静态 helper；`metric-runtime` 仅在包级生成脚本中编译无 helper import 的 standalone validator | 浏览器读取边界不调用 `Ajv.compile()`，生成源码拒绝 `eval`、`new Function`、`require()` 和动态 import；正式 Story 根 bundle 不加载实验 validator，Metric Runtime 公共运行时不导入 Ajv 或 helper；当前 Vite no-write 探针不是产品 bundle 认证 | 锁文件复用同一固定版本；生成 validator 包含展开后的结构规则，现有未压缩探针不能当作最终 gzip／产品预算；Metric Runtime 新增用途不增加产品运行时依赖 | MIT，与 `AGPL-3.0-only` 仓库兼容；禁用远程 Schema 获取，生成器只接受仓库内固定 Schema；升级须重新生成、核对 CSP 源码并运行 Node／Vite 双探针 |
| `json-schema-to-typescript` | `15.0.4` | 从唯一 JSON Schema 生成 M0-012 Story 与 M0-049 Metric Runtime TypeScript 类型；只由两个包各自的生成脚本消费 | 仅包级 `devDependency`，不会由公开入口导入，也不进入浏览器、Worker 或服务运行时 | 复用既有锁定解析包；包含 Prettier 与 `$RefParser` 等构建期传递依赖，生成结果提交并由各包 `--check` 拒绝漂移；尚未形成全新空 store 体积报告 | MIT，Node engine `>=16`，与固定 Node 匹配；生成器关闭外部 `$ref`，避免网络／本机路径参与构建；升级须审查两套生成 diff 与许可证 |
| `@google/design.md` | `0.4.0` | M0-014 解析／lint `DESIGN.md`，并为四主题语义 Token 提供固定工具语义 | 只在开发／CI 中运行，不进入浏览器、Worker 或服务 bundle | 增加 Markdown／YAML linter 及传递依赖；产品运行时 bundle 增量为 0 | 上游 tag 为 Apache-2.0；npm 包缺少 `license` 字段且只发布 `dist`，该元数据缺口必须保留为已知风险，不能冒充包管理器已自动认证 |
| `react` | `19.2.8` | M0-015 Creator／Viewer 与受控 Renderer 的 UI runtime；Renderer 以精确 peer 声明，根构建环境和两个消费者提供同版本运行时，`@types/react` 单独承担包级类型构建 | 进入 Creator／Viewer 页面 bundle；不进入原始数据 Worker、Connector 或服务端 bundle。Renderer 不用 React 执行任意 HTML/CSS/脚本，所有蓝图文字由 React 转义 | npm 未压缩包 `171,598` 字节、27 个文件；最终页面 bundle 体积以本次 Vite 构建输出为准，不把 registry 未压缩体积当下载预算 | MIT；Node engine `>=0.10.0`，与固定 Node 匹配；React 与 React DOM 必须同版本升级并重跑 SSR、页面构建和浏览器矩阵 |
| `react-dom` | `19.2.8` | 两个页面使用 `createRoot` 挂载，Vitest 产品合同使用 `react-dom/server` 静态渲染验证受控输出 | 仅进入 Creator／Viewer bundle；不进入 Worker、Connector 或服务端产品 runtime | npm 未压缩包 `7,319,407` 字节、43 个文件；开发安装体积不等于压缩页面下载，最终产物由 Vite 报告 | MIT；peer 要求 React `^19.2.8`，当前精确版本匹配；升级必须与 React 原子进行 |
| `@types/react` / `@types/react-dom` | `19.2.18` / `19.2.4` | 严格 TSX、Renderer peer 和 DOM 挂载／SSR 测试类型 | 纯开发依赖，不进入任何运行时 bundle | registry 未压缩体积分别 `408,503`／`30,329` 字节；生成声明后不随页面发布 | MIT；React DOM 类型 peer 要求 `@types/react ^19.2.0`，当前固定组合匹配 |
| `vitest` | `4.1.10` | M0-016 的 Node 单元、jsdom 组件与 Storybook browser runner；从 M0-011 起承载 Schema、迁移、指标和协议合同 | 仅根 `devDependency`，不进入浏览器、Worker 或服务产品 bundle；browser project 只在测试时启动固定 Playwright Chromium，未启用 UI 或 coverage provider | npm 未压缩包约 1.91 MB；与 Vite 及 browser provider 共用锁定依赖，尚未形成最新空 store 干净安装体积报告；产品运行时 bundle 增量为 0 | 主包 MIT，Node engine 为 `^20 || ^22 || >=24`，与固定 Node `24.19.0` 匹配；精确固定并由公开 Fork 重跑 |
| `vite` | `8.2.0` | 满足 Vitest peer、执行既有公共 ESM `write:false` 探针，并为 M0-015 独立构建 Creator／Viewer 最小页面 | Vite 本身仍只在开发／构建期运行；输出的静态页面 bundle 进入浏览器。当前配置无 plugin、alias 或共享根配置，不打包 Worker／服务能力 | npm 未压缩包约 2.33 MB；锁文件包含 Rolldown 平台 binding（MIT）与 Lightning CSS 平台 binding（MPL-2.0）等选择项；两个页面的实际构建体积由本次报告记录 | 主包 MIT，Node engine 为 `^20.19 || >=22.12`，与固定 Node 匹配；MPL-2.0 传递文件边界、原生包和安全公告仍须随锁文件与 SBOM 审查 |
| `esbuild`（传递） | `0.28.1` | Storybook／Vite 测试构建所需的固定平台二进制 | 只在开发／测试构建期运行，不进入产品 bundle | pnpm 默认阻止安装脚本；`pnpm-workspace.yaml` 仅精确放行包名 `esbuild`，未配置通配或其他包 | MIT；平台二进制和安装脚本变更必须随锁文件、`allowBuilds` 与供应链检查一同审查 |
| `@testing-library/react` / `@testing-library/dom` / `@testing-library/jest-dom` | `16.3.2` / `10.4.1` / `7.0.0` | M0-016 以用户可观察 DOM 验证 Creator／Viewer `App` loading → ready 行为、标题、KPI、范围、evidence 与无 alert | 只在 jsdom 测试进程中运行，不进入应用 bundle；测试只替换 `fetch` 边界，不向产品组件增加注入接口 | 复用 React／DOM 传递依赖；jest-dom 仅注册 Vitest matcher；产品运行时 bundle 增量为 0 | 三者均为 MIT；升级必须复核 React 19、Vitest matcher 和 jsdom 兼容性 |
| `jsdom` | `30.0.1` | 为 RTL 提供固定 DOM 环境 | 仅 Node 测试进程；不能冒充真实布局、网络、Origin 或浏览器安全语义 | 带来 HTML／URL／CSS 解析等开发传递依赖；不进入产品 bundle | MIT，Node engine `>=20`，与固定 Node 匹配；安全公告与解析差异随锁文件复核 |
| `storybook` / `@storybook/react-vite` / `@storybook/addon-vitest` / `@storybook/addon-a11y` | `10.5.6` | 构建真实 Renderer story，并在 Playwright Chromium 中运行 `play` 与 addon axe 检查 | 仅生成测试静态站点和测试进程；story 位于根 `tests/`，不会污染 Viewer manifest 或产品 bundle | 静态 Storybook 产物被 `.gitignore` 排除；当前构建包含 axe 测试 chunk，不能作为产品下载体积 | MIT；四包必须保持同版本原子升级，并重跑静态构建、交互与 a11y 测试 |
| `@vitest/browser` / `@vitest/browser-playwright` | `4.1.10` | 为 Storybook addon-vitest 提供固定 Chromium browser project | 仅测试进程，产品 runtime 增量为 0；不允许静默回退到系统浏览器 | 复用 Playwright browser cache；锁文件不包含浏览器二进制 | MIT；必须与 Vitest 精确同版本，升级同时更新 Playwright 兼容组合 |
| `playwright` / `playwright-core` | `1.62.1` | Storybook browser、Creator／Viewer production preview E2E 与 axe 页面扫描 | 只在测试时启动 Chromium；当前 HTTP `127.0.0.1:4173/4174` 不构成 HTTPS、Cookie 或四 Origin 证据 | pnpm 安装不下载约束浏览器；本地显式安装 Chromium revision `1234`，CI 必须另行安装且记录版本 | Apache-2.0；自动近似不得冒充真实 Safari／微信认证，升级必须固定浏览器 revision 并审查截图／DOM 差异 |
| `@axe-core/playwright` | `4.12.1` | 对 Creator／Viewer 完整页面执行独立、未裁剪的自动无障碍扫描 | 只在 Playwright 测试中注入 axe；不进入产品 bundle，也不替代人工 WCAG 验证 | 依赖 `axe-core~4.12.1`，产品运行时增量为 0；要求显式 `playwright-core` peer | MPL-2.0 文件级许可；与 AGPL 仓库的测试工具使用兼容，分发与 SBOM 必须保留许可文本和文件边界 |

M0-015 当前 Vite 生产结果为 Creator JavaScript `335.48 kB / gzip 85.94 kB`、Viewer JavaScript `335.47 kB / gzip 85.94 kB`；每端另发出 `1.03 kB` Metric JSON 和 `1.55 kB` Story JSON。两端固定 `assetsInlineLimit: 0`，workspace 合同拒绝 `data:application/json` 进入脚本。M0-016 已在 Windows 为 RTL、Storybook、Playwright 和 axe 建立真实产品断言；它们仍不替代 HTTPS、四 Origin、CSP、固定视觉／键盘／缩放、完整 WCAG、真实设备、Ubuntu 或 CI 矩阵。

Windows x64 的 M0-005 空 pnpm store、干净临时项目安装中，`node_modules` 逻辑文件总量为 `74,213,367` 字节，内容寻址 store 逻辑文件总量为 `74,232,182` 字节。该历史数值只绑定当时 Turbo／TypeScript 锁文件；M0-008／009／011／012／014／016 新增开发工具后的安装体积尚未重新形成干净目录报告，不能沿用旧数值，也不能计入浏览器下载或产品性能预算。

M0-005 的 `pnpm licenses list` 只观察到 MIT（Turbo 及 Windows 平台包）和 Apache-2.0（TypeScript）；该历史观察不覆盖本次新锁文件。M0-008／009／011／012／014／016 已逐项记录直接依赖许可证与 Design 包元数据缺口，但完整传递依赖清单、SBOM 和持续漏洞状态仍由后续供应链／release dry-run 门槛复核。未来新增或升级依赖必须同时复核用途、精确版本、锁文件、传递依赖、浏览器／Worker 边界、许可证、安装／bundle 影响和安全公告。
