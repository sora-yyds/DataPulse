# M0 workspace 工具依赖评估

> 任务：M0-005
>
> 状态：Windows 阶段已验证；干净 Ubuntu 尚未运行
>
> 评估日期：2026-08-04（Asia/Shanghai）

本文记录 M0-005 首批根开发依赖的用途、产物影响、维护方式与许可证兼容性。它不把开发工具视为产品运行时能力，也不替代后续 SBOM、漏洞扫描或发布认证。

| 依赖 | 固定版本 | 用途 | 浏览器／Worker／服务运行时影响 | 安装与产物影响 | 许可证与维护 |
|---|---:|---|---|---|---|
| `turbo` | `2.10.8` | 编排 monorepo 根任务；M0-005 只运行非缓存工具链自检 | 仅为根 `devDependency`，不进入浏览器、Worker 或服务运行时 bundle；M0-005 尚无产品 bundle | 锁文件保留各平台可选原生包，安装时只选择当前平台；Windows x64 干净安装逻辑文件体积计入下述合计，运行时 bundle 增量为 0 | 主包与当前平台包均为 MIT，与 `AGPL-3.0-only` 仓库兼容；由上游官方包维护，升级必须单独审查并精确固定 |
| `typescript` | `6.0.3` | 提供严格 TypeScript 配置解析和后续 workspace 编译器 | 仅为根 `devDependency`，编译器不进入浏览器、Worker 或服务运行时 bundle | 增加本地／CI 编译器安装体积，运行时 bundle 增量为 0 | Apache-2.0，与 `AGPL-3.0-only` 仓库兼容；采用与后续 `typescript-eslint` peer 范围兼容的稳定版本，升级必须重跑类型与锁文件矩阵 |

Windows x64 的空 pnpm store、干净临时项目安装中，`node_modules` 逻辑文件总量为 `74,213,367` 字节，内容寻址 store 逻辑文件总量为 `74,232,182` 字节。该数值用于说明开发／CI 获取成本，会随平台、路径和文件系统硬链接语义变化，不能计入浏览器下载或产品性能预算。

本次 `pnpm licenses list` 只观察到 MIT（Turbo 及 Windows 平台包）和 Apache-2.0（TypeScript）；使用 npm 官方审计端点的临时检查未发现已知漏洞。该观察只绑定本次锁文件，不是持续安全承诺。未来新增或升级依赖必须同时复核用途、精确版本、锁文件、传递依赖、浏览器／Worker 边界、许可证、安装／bundle 影响和安全公告。
