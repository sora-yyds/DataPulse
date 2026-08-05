# M0 workspace 工具依赖评估

> 任务：M0-005、M0-008、M0-009、M0-014
>
> 状态：Windows 阶段已验证；干净 Ubuntu 尚未运行
>
> 评估日期：2026-08-04（Asia/Shanghai）

本文记录 M0-005 首批根开发依赖的用途、产物影响、维护方式与许可证兼容性。它不把开发工具视为产品运行时能力，也不替代后续 SBOM、漏洞扫描或发布认证。

| 依赖 | 固定版本 | 用途 | 浏览器／Worker／服务运行时影响 | 安装与产物影响 | 许可证与维护 |
|---|---:|---|---|---|---|
| `turbo` | `2.10.8` | 编排 monorepo 根任务；M0-005 只运行非缓存工具链自检 | 仅为根 `devDependency`，不进入浏览器、Worker 或服务运行时 bundle；M0-005 尚无产品 bundle | 锁文件保留各平台可选原生包，安装时只选择当前平台；Windows x64 干净安装逻辑文件体积计入下述合计，运行时 bundle 增量为 0 | 主包与当前平台包均为 MIT，与 `AGPL-3.0-only` 仓库兼容；由上游官方包维护，升级必须单独审查并精确固定 |
| `typescript` | `6.0.3` | 提供严格 TypeScript 配置解析和后续 workspace 编译器 | 仅为根 `devDependency`，编译器不进入浏览器、Worker 或服务运行时 bundle | 增加本地／CI 编译器安装体积，运行时 bundle 增量为 0 | Apache-2.0，与 `AGPL-3.0-only` 仓库兼容；采用与后续 `typescript-eslint` peer 范围兼容的稳定版本，升级必须重跑类型与锁文件矩阵 |
| `@changesets/cli` | `2.31.1` | M0-008 生成面向用户变更的版本记录和后续发布说明 | 只在开发／发布编排中运行，不进入浏览器、Worker 或服务 bundle | 增加本地／CI 治理工具及其传递依赖；产品运行时 bundle 增量为 0 | MIT，与 `AGPL-3.0-only` 仓库兼容；配置和 CLI 版本必须与锁文件一同审查 |
| `ajv` | `8.17.1` | M0-009 以 Draft 2020-12 校验五类冻结证据合同及既有实例 | 当前仅为根开发检查依赖，不进入产品、Worker 或服务 bundle；未来产品 Schema 的运行时依赖须另行评估 | 增加本地／CI JSON Schema 编译器及少量传递依赖；产品运行时 bundle 增量为 0 | MIT，与 `AGPL-3.0-only` 仓库兼容；禁用远程 Schema 获取，合同只从仓库固定路径加载 |
| `@google/design.md` | `0.4.0` | M0-014 解析／lint `DESIGN.md`，并为四主题语义 Token 提供固定工具语义 | 只在开发／CI 中运行，不进入浏览器、Worker 或服务 bundle | 增加 Markdown／YAML linter 及传递依赖；产品运行时 bundle 增量为 0 | 上游 tag 为 Apache-2.0；npm 包缺少 `license` 字段且只发布 `dist`，该元数据缺口必须保留为已知风险，不能冒充包管理器已自动认证 |

Windows x64 的 M0-005 空 pnpm store、干净临时项目安装中，`node_modules` 逻辑文件总量为 `74,213,367` 字节，内容寻址 store 逻辑文件总量为 `74,232,182` 字节。该历史数值只绑定当时 Turbo／TypeScript 锁文件；M0-008／009／014 新增开发工具后的安装体积尚未重新形成干净目录报告，不能沿用旧数值，也不能计入浏览器下载或产品性能预算。

M0-005 的 `pnpm licenses list` 只观察到 MIT（Turbo 及 Windows 平台包）和 Apache-2.0（TypeScript）；该历史观察不覆盖本次新锁文件。M0-008／009／014 已逐项记录直接依赖许可证与 Design 包元数据缺口，但完整传递依赖清单、SBOM 和持续漏洞状态仍由后续供应链／release dry-run 门槛复核。未来新增或升级依赖必须同时复核用途、精确版本、锁文件、传递依赖、浏览器／Worker 边界、许可证、安装／bundle 影响和安全公告。
