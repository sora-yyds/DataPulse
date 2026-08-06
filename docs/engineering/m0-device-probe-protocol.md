# M0-023 设备固定向量矩阵执行协议

本协议定义 `KDF-DEVICE-MATRIX` gate 的真实设备执行方法、登记字段与通过标准。
它只描述如何收集证据，不代表任何设备已经运行。Windows x64 Chromium 的本地结果
（`m0-crypto-kdf-probe-v1`）只是开发环境近似，不能替代本矩阵。

## 1. 目的与范围

在以下 5 个执行环境运行同一固定向量探针（`apps/device-probe`），验证
`a2id-v1-64m-t3-p1` profile 的互操作结果一致、单次 KDF ≤5 秒且无内存终止：

| 环境 | 载体 | 执行方式 |
|---|---|---|
| Chrome | Windows 参考创作设备（4 核 / 8 GB） | 当前稳定 Chrome，默认设置 |
| Edge | Windows 参考创作设备 | 当前稳定 Edge，默认设置 |
| iOS Safari | 当前受支持 iOS 代表设备 | 系统 Safari，默认设置 |
| Android 微信 | 当前受支持 Android 代表设备 | 微信内置浏览器，默认设置 |
| iOS 微信 | 当前受支持 iOS 代表设备 | 微信内置浏览器，默认设置 |

## 2. 前置条件

- 构建固定版本探针页：`corepack pnpm run build` 后取
  `apps/device-probe/dist/site/` 产物，记录 `git rev-parse HEAD`、`src/main.ts`
  的 SHA-256 与最终加载 JS 资源的 SHA-256（三者构成“探针与 fixture hash”）。
- **必须 HTTPS**：探针使用 Web Crypto（`crypto.subtle`），只存在于安全上下文。
  移动设备经 LAN 访问普通 HTTP 时探针会整体失败，不得用 Chrome
  “Insecure origins treated as secure” 标志或任何降级开关代替真实 HTTPS。
  推荐方式（任选其一，记录实际采用方式）：
  1. 本地 HTTPS 反向代理（自签证书）并将 CA 导入设备受信任证书库；
  2. 仓库公开 HTTPS 静态托管（GitHub Pages 等）部署同一构建产物——探针只含
     固定测试向量，不含任何用户内容、原始数据或凭据；
  3. 临时 HTTPS 隧道（如 cloudflared）指向本地 `vite preview --host 0.0.0.0`。
- 测试只使用仓库合成数据；不输入真实口令、密钥或用户数据。
- 设备报告只登记完成验证所需的最小公开元数据。**禁止**写入序列号、IMEI、
  广告 ID、账号、Cookie 或任何可建立跨会话设备 ID 的信息。

## 3. 执行步骤

1. 每个环境用默认设置打开 HTTPS 探针 URL，等待 5 项探针渲染完成。
2. 从页面复制 `datapulse-device-probe` JSON 结果（含 `allPassed`、`profileId`、
   每项 `detail` 的 `elapsed` 与 `length`）。
3. 观察页面是否发生内存终止（页面被杀、白屏或浏览器崩溃）。
4. 按第 4 节模板登记该环境记录。

## 4. 登记字段（每环境一条）

| 字段 | 说明 |
|---|---|
| `environment` | `chrome` / `edge` / `ios-safari` / `android-wechat` / `ios-wechat` |
| `deviceTier` | 设备档位（如 `windows-reference` / `ios-current` / `android-current`） |
| `os` | OS 名称与版本 |
| `browserOrWechat` | Chrome/Edge/Safari 版本或微信版本与内核版本 |
| `probeSourceHash` | `git rev-parse HEAD` + `src/main.ts` SHA-256 |
| `probeBundleHash` | 加载的 JS 资源 SHA-256 |
| `profileId` | `a2id-v1-64m-t3-p1` |
| `vectorResults` | 5 项探针逐项 `passed` 与 `detail` |
| `kdfElapsedMs` | 单次 KDF 耗时（页面 `elapsed`，最多 3 次取最大值） |
| `memoryTermination` | 是否发生内存终止（布尔） |
| `recordedAt` | 观测时间 |

结果 JSON 模板：

```json
{
  "schemaVersion": "1.0.0",
  "kind": "datapulse-device-probe-record",
  "environment": "ios-safari",
  "deviceTier": "ios-current",
  "os": "iOS 18.x",
  "browserOrWechat": "Safari 18.x",
  "probeSourceHash": "<git-rev-parse-HEAD>:<sha256(src/main.ts)>",
  "probeBundleHash": "<sha256(served-js)>",
  "profileId": "a2id-v1-64m-t3-p1",
  "servedVia": "<https 服务方式>",
  "kdfElapsedMsMax": 0,
  "memoryTermination": false,
  "vectorResults": [
    { "name": "KDF a2id-v1-64m-t3-p1 固定向量", "passed": true, "detail": "..." },
    { "name": "KDF 拒绝任意参数 profile", "passed": true, "detail": "..." },
    { "name": "AES-256-GCM purpose 固定向量", "passed": true, "detail": "..." },
    { "name": "JCS RFC 8785 固定向量", "passed": true, "detail": "..." },
    { "name": "Fragment passwordEnvelope 固定向量", "passed": true, "detail": "..." }
  ],
  "allPassed": true
}
```

## 5. 通过标准与 profile 冻结决策

- 5 个环境全部 `allPassed=true`、`kdfElapsedMsMax <= 5000` 且
  `memoryTermination=false` 时，冻结 `a2id-v1-64m-t3-p1`，关闭本 gate 的
  blocker 并追加 `passed` 证据记录。
- 任一环境未通过、单次 KDF >5 秒或发生内存终止：**不得**降级或调参绕过，
  须改用新 profile ID（如降低内存成本）在 `packages/crypto` 重做黄金向量并
  重跑本矩阵；M0-024/025 的 project envelope 固定向量同步更换。
- 移动探针记录必须能对应到第 4 节字段；缺字段的记录不作为 gate 证据。

## 6. 证据登记流程

- 每个环境完成后，在 `docs/evidence/m0/evidence-index.json` 按 append-only
  规则追加 `m0-crypto-kdf-device-<env>-v1` 记录（`executionKind=external_environment`，
  引用本协议与探针 artifact refs），并生成对应外部 attestation。
- 5 个环境全部登记且满足第 5 节后，追加 `m0-crypto-kdf-matrix-v1` 汇总记录，
  将 `KDF-DEVICE-MATRIX` 置为可关闭候选，同步 `docs/governance/m0-ownership-and-resources.md`
  的设备登记表与 `docs/IMPLEMENTATION_PLAN.md` 的 M0-023 状态。
- 任何记录不得包含真实密钥、真实用户数据或可识别设备身份字段。