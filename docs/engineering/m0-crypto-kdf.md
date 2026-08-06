# M0 加密 KDF 依赖评估与固定 Argon2id profile

> 任务：M0-022
>
> 状态：Windows 工程与单元测试阶段已完成；真实设备矩阵（M0-023）外部阻塞
>
> 评估日期：2026-08-06（Asia/Shanghai）

本文记录 M0-022 对可审计 Argon2id WASM 的候选评估、依赖决策、固定 profile 参数和互操作向量来源。它不把依赖评估冒充为真实设备认证：`a2id-v1-64m-t3-p1` 只有在 M0-023 于 Chrome／Edge、当前 iOS Safari、Android 微信和 iOS 微信代表设备上单次派生 ≤5 秒且无内存终止后才冻结；在此之前该 profile 以白名单注册表形式存在，任何链接或包不得携带任意 KDF 参数（ADR-0047、ARCHITECTURE.md 第 9 节、ROADMAP.md 加密矩阵）。

## 1. 候选评估

| 候选 | 版本 | 许可证 | 运行时依赖 | WASM 交付 | 类型 | 未压缩包体 | 维护 |
|---|---:|---|---|---|---|---:|---|
| `hash-wasm` | `4.12.0` | MIT | 零 | Argon2id v1.3 WASM 以 base64 内嵌进 JS，无外部 `.wasm` 文件 | 自带 `.d.ts` | 1.72 MB | 上游活跃，`Daninet/hash-wasm` |
| `argon2-browser` | `1.18.0` | MIT | 零 | 需单独加载 `.wasm` 文件，bundler／CSP 需额外处理 | 无类型 | 0.13 MB | 社区维护，更新频率低 |

决策：接入 `hash-wasm@4.12.0`。理由：

- 单二进制内嵌：WASM 以 base64 常量随 JS 一起分发，不需要运行时 `fetch()` 外部 `.wasm`，对 Creator／Viewer／Connector 的 CSP 与离线本地处理更友好；`argon2-browser` 需要手动搬运并加载独立 `.wasm`，与“原始数据 Worker 无网络、固定 WASM 预取校验”的架构约束冲突风险更高。
- 自带完整 TypeScript 类型；`argon2-browser` 无类型，需在包内维护声明。
- 零传递依赖、MIT、无安装脚本：不触发 `pnpm-workspace.yaml` 的 `allowBuilds` 放行面（仍只允许 `esbuild`），供应链面最小。
- 提供 `argon2id` 固定函数，Argon2 版本锁定为 0x13（RFC 9106 / 参考实现 v1.3），与冻结 profile 的 version 字段一致。

已知边界：未压缩包体 1.72 MB 全部进入 `@datapulse/crypto` 依赖链，浏览器 bundle 增量为该 WASM 常量体积，必须计入后续性能预算；WASM 二进制来自上游预构建，无法逐字节审计源码，依赖“上游固定版本 + 锁文件 + SBOM + 后续漏洞扫描”治理，不得声称逐字节自证。

## 2. 固定 profile：`a2id-v1-64m-t3-p1`

`packages/crypto` 的 `ARGON2_KDF_PROFILES` 只注册一个 profile，公共 API 只接受 `profileId + password + salt`：

| 字段 | 值 |
|---|---|
| `id` | `a2id-v1-64m-t3-p1` |
| `algorithm` | `argon2id` |
| `version` | `0x13` |
| `memoryKiB` | `65536`（64 MiB） |
| `iterations` | `3` |
| `parallelism` | `1` |
| `saltBytes` | `16` |
| `keyBytes` | `32` |
| `textEncoding` | `utf8-nfc`（口令先 NFC 规范化，UTF-8 ≤ 1,024 字节） |
| `binaryEncoding` | `base64url-unpadded` |

拒绝边界：未知 profile id 抛出 `CRYPTO_PROFILE_UNKNOWN`；盐长不为 16 字节、口令 UTF-8 超 1,024 字节或类型错误抛出 `CRYPTO_INVALID_ARGUMENT`。链接／信封只能携带该注册 id，无法携带任意迭代、内存或并行参数；参数注入在进入 KDF 前被注册表拒绝，避免恶意 KDF 参数绕过受保护明细的门槛。

## 3. 互操作向量

`tests/unit/kdf-vectors.ts` 固定两组黄金向量，均在 2026-08-06 用两个独立实现交叉验证一致：

- 参考实现：`argon2-cffi 25.1.0`（基于参考 C 实现的 low-level API，Argon2id v1.3，`time_cost=3, memory_cost=65536, parallelism=1, hash_len=32`）。
- 候选实现：`hash-wasm 4.12.0` 的 `argon2id`。
- ASCII 向量：口令 `correct horse battery staple`、盐 `0x42×16`。
- Unicode NFC 向量：口令 `café 口令🔐 비밀번호`（NFC）、盐 `00..0f`；另以 NFD 分解输入验证模块先 NFC 规范化再派生，输出与 NFC 向量一致。

固定盐只允许出现在测试向量；生产盐必须来自 Web Crypto CSPRNG。

## 4. 设备探针页（M0-022 交付件）

`apps/device-probe`（`@datapulse/device-probe`）是独立的最小 Vite 探针 workspace，不进入 Creator／Viewer／Connector 产品链路。页面在浏览器内执行五组固定向量探针并输出 JSON 结果：

- KDF：以固定盐派生 `a2id-v1-64m-t3-p1`，核对黄金 key 并记录单次派生耗时（目标 ≤5 s）；
- KDF 拒绝：未知 profile id 必须在分配 KDF 内存前抛 `CRYPTO_PROFILE_UNKNOWN`，证明链接无法携带任意 KDF 参数；
- AES：purpose 绑定 AES-256-GCM 固定向量的 seal／open；
- JCS：RFC 8785 规范化固定对象；
- Fragment：构造 `#dp1.p.<base64url(JCS(passwordEnvelope))>` 固定向量，核对预计算 wrap 值、2,048 字符长度上限与 KEK 解包往返。

固定盐／key／nonce 只出现在本探针页与测试向量中；探针页输出不含任何真实用户数据或密钥。Chrome 本地产物为单文件 JS `39.61 kB / gzip 16.09 kB`（含 Argon2id WASM base64）。真实设备运行（Chrome／Edge／iOS Safari／Android 微信／iOS 微信）属于 M0-023 外部矩阵，本页面只是其执行载体，不代表设备认证或完整 WCAG。

## 5. 证据边界

- 已完成：依赖评估、`packages/crypto` Argon2id KDF 实现、11 个单元测试、黄金向量交叉验证、`test:unit` 全量通过。
- 未完成（M0-023，外部阻塞）：Chrome／Edge／iOS Safari／Android 微信／iOS 微信真实设备固定向量、单次派生 ≤5 秒与内存终止探针；只有真实设备矩阵通过后才冻结 profile 并激活 `KDF-DEVICE-MATRIX`。
- 未完成：`packages/crypto` 的 WASM 内嵌体积进入正式性能预算报告；完整传递依赖 SBOM 与持续漏洞状态由供应链／release dry-run 门槛复核。
