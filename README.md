# DataPulse AI

DataPulse AI 将 Excel 或 CSV 中的结构化业务数据转化为可验证、可编辑、可交互和可分享的数据故事。产品以浏览器本地分析为基础，AI 只增强目标、洞察组织、文案和受控视觉选择，不负责计算或改写事实。

## 当前状态

项目正在实施 **M0：工程与正确性底座**。Wave 0 已冻结实施口径、证据契约、外部阻塞和工具链决策，M0-004 已建立公开仓库治理基础。M0-005 的 Windows 固定工具链与锁文件已经形成阶段证据；M0-006 又建立了 6 个近期 M0 workspace、独立 TypeScript 构建和真实 workspace 契约检查。干净 Ubuntu 与统一人工验证仍延期，因此 M0-005、M0-006 和 `REPO-FOUNDATION` 均未宣告通过。

M0 不是产品 Alpha，不包含完整导入向导、AI 调用、分享、四主题或 3D 成品。当前执行顺序以 [实施计划](docs/IMPLEMENTATION_PLAN.md) 和 [M0 证据索引](docs/evidence/m0/evidence-index.json) 为准。

## 核心边界

后续实现必须持续满足以下边界；它们是规划与发布门槛，不表示当前尚未存在的产品代码已经通过验证：

- 原始文件、未发布原始行和完整项目只在浏览器本地处理；资源超限时明确拒绝，不静默抽样、截断或转云端。
- 指标和判定由确定性引擎计算；AI 输出始终作为不可信结构化输入校验。
- Creator、Viewer、API 与 Custom Connector 使用独立 Origin；连接器不能持久化凭据、证据或响应。
- 官方云端只保存端到端加密发布包和严格 TTL 的运行状态，不建立账号或长期用户内容数据库。
- 渲染器只消费通过 Schema 校验的故事蓝图和注册组件，不执行模型、文件或发布物提供的代码。

完整产品行为见 [PRD](docs/PRD.md)，技术与信任边界见 [架构文档](docs/ARCHITECTURE.md)，阶段顺序见 [路线图](docs/ROADMAP.md)，领域术语见 [CONTEXT.md](CONTEXT.md)，品牌规则见 [DESIGN.md](DESIGN.md)，已接受的技术决定保留在 [ADR 目录](docs/adr/)。

## 仓库现状

当前已存在：

- 产品、架构、路线图、ADR、设计和 Agent 行为规范；
- M0 原子 gate、证据 Schema、退出 manifest 与语义验证器；
- 工具链、基础设施候选和外部资源登记；
- 开源许可证、贡献说明、安全策略和跨平台文本规范。
- 固定 Node/pnpm/Corepack 版本、pnpm workspace、精确锁文件、Turbo 根自检和严格 TypeScript 基线；首批开发依赖影响见 [M0 workspace 工具依赖评估](docs/engineering/m0-workspace-tool-dependencies.md)。
- Creator、Viewer、Custom Connector、Domain、API Contracts 与 Share API 的最小构建／exports seam；范围和延期项见 [M0-006 workspace 与构建边界](docs/engineering/m0-workspace-boundaries.md)。

其余 `apps/`、`packages/`、`services/`、`infra/` 和 `tests/` 子目录仍只在出现真实 M0 interface、fixture 或部署入口时创建，不预先生成业务空包。

## 开始参与

1. 阅读 [AGENTS.md](AGENTS.md)、[CONTEXT.md](CONTEXT.md) 和 [实施计划](docs/IMPLEMENTATION_PLAN.md)。
2. 从计划中选择依赖已满足的原子任务，并核对关联 PRD 需求、当前 ADR 和证据 gate。
3. 遵循 [贡献指南](CONTRIBUTING.md) 创建短期分支并提交可验证的纵向改动。
4. 当前可运行的仓库检查只以 [AGENTS.md 第 8 节](AGENTS.md#8-命令)列出的精确命令为准。

正式工程工具链固定为 Node `24.19.0`、pnpm `11.20.0` 和 Corepack `0.35.0`。在满足这些精确版本后，当前真实入口是：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run check:toolchain
corepack pnpm run build
corepack pnpm run check:workspace
node docs/evidence/m0/validate-evidence-index.mjs --self-test
```

工具链自检会回读精确版本、锁定元数据、pnpm 生效策略和严格 TypeScript 选项；`build` 独立编译当前 6 个 workspace，workspace 契约检查还验证显式 exports、project references、构建产物与消费侧解析。证据索引命令只验证静态与语义完整性。这些入口都不是产品测试，当前仍无 lint、单元测试或完整产品 typecheck。不要使用不匹配的全局 Node/pnpm/Corepack 改写正式锁文件。

## 安全

不要在 Issue、日志、夹具、截图或提交中提供真实用户数据、模型密钥、云凭据或发布秘密。安全问题请按 [SECURITY.md](SECURITY.md) 的当前过渡报告流程处理。

## 许可证

DataPulse AI 以 [GNU Affero General Public License v3.0 only](LICENSE) 发布，SPDX 标识为 `AGPL-3.0-only`。贡献代码将按同一许可证提供。通过网络向用户提供修改版服务时，运营者必须向这些用户提供对应部署 revision 的完整对应源码获取方式，不能只链接会漂移的 `main`。
