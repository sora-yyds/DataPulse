# DataPulse AI 模型供应商 API 兼容性核验

> 核验日期：2026-08-04（Asia/Shanghai）  
> 范围：阿里云百炼中国大陆（北京）、Glosc AI One，以及 DataPulse AI 的 OpenAI-compatible Chat Completions 接入约束。  
> 证据标准：只采用供应商官方文档和供应商自己的 API 端点；未在这些一手来源中确认的事项均标记为“官方未核实/需实测”。

## 结论

两个供应商都具备接入 DataPulse AI 的基础 Chat Completions 形态，但成熟度不同：

- **阿里云百炼（北京）可以作为首发内置预设。** 官方明确给出北京地域的 OpenAI-compatible 地址、Bearer 鉴权、`model`、流式输出和 JSON Mode，并提供较完整的限流与错误文档。推荐使用业务空间专属域名；旧 `dashscope.aliyuncs.com` 仍可用，但官方建议迁移。[A1][A2][A3][A4][A5]
- **Glosc AI 可以作为首发内置预设，但必须标记为“按模型实测能力”。** 官方文档明确给出 Base URL、Bearer、`POST /v1/chat/completions`、`GET /v1/models`、`stream` 和 `response_format` 字段；但没有说明 `response_format` 接受 `json_object` 还是 `json_schema`，也没有公开承诺 CORS、限流、SLA 或数据留存策略。[G1][G2][G3][G4]
- 两个预设都应走 DataPulse 的**无状态后端代理**；自定义 Base URL 仍只允许浏览器直连。这里的“内置预设”仅表示 DataPulse 预配置连接方式，不表示供应商与 DataPulse 存在合作或背书关系。
- DataPulse 的“云端最长保留 24 小时”只约束 DataPulse 自身，**不能延伸为上游供应商不留存、不训练或在 24 小时内删除**。两个供应商在本次核验的公开 API 文档中都没有给出足以让 DataPulse 作出这类承诺的条款，发布前需另行完成条款/合同核验。

### 后续产品决定

所有模型连接都不允许手填模型 ID。阿里云百炼从 DataPulse 根据北京地域官方模型目录维护的版本化列表中选择，Glosc AI 从鉴权后的 `GET /models` 结果中选择；自定义 Base URL 也必须提供兼容 OpenAI 的鉴权后 `GET /models`，否则不进入 MVP。每个所选模型都必须通过合成连接测试。

## 兼容性矩阵

| 能力 | 阿里云百炼（北京） | Glosc AI One | DataPulse 处理方式 |
|---|---|---|---|
| OpenAI-compatible Base URL | 推荐 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`；旧 `https://dashscope.aliyuncs.com/compatible-mode/v1` 仍可用 [A1] | `https://one.gloscai.com/v1` [G1][G2] | 两者均走无状态代理；代理自行拼接固定路径，不接受任意完整 URL |
| Chat Completions | `POST /chat/completions`，完整北京地址由上述 Base URL 拼接 [A1][A2] | `POST /chat/completions`，官方文档也写作 `POST /v1/chat/completions` [G1][G3] | 使用统一内部请求 DTO，再由供应商适配器转换 |
| 鉴权 | `Authorization: Bearer $DASHSCOPE_API_KEY` [A1][A2][A7] | `Authorization: Bearer sk-xxxxxx` [G1][G2] | 密钥从浏览器随单次 TLS 请求传入代理；不落日志、数据库、追踪或错误报告 |
| 模型选择 | 请求体必填 `model`；支持范围很广，且部分模型需先开通；Qwen-Audio 不支持此协议 [A1][A2][A6] | 请求体必填 `model`；可由 `GET /models` 获取当前可用模型 [G3][G4] | 百炼从 DataPulse 维护的北京地域版本化目录中选择；Glosc 从 `/models` 选择；官方预设均不允许手填模型 ID，能力仍按每个模型实测 |
| 模型发现 | 本次核验的 OpenAI 兼容文档未确认 `GET /models` | 官方确认 `GET /v1/models`，Bearer 请求时返回 OpenAI 格式 [G4] | 不对百炼调用未文档化的 `/models`；以官方模型目录和连接测试为准 |
| 结构化 JSON | 官方确认 `response_format: {"type":"json_object"}`；提示词必须出现“JSON”；仅部分模型/模式可靠 [A2][A3] | 官方只列出 `response_format object`，未说明可接受的 `type` [G3] | 百炼使用 `json_object` 后做本地 JSON Schema 校验；Glosc 在有效密钥、具体模型上通过探测后才开启该参数 |
| 严格 `json_schema` | 官方 JSON Mode 页面未记录 `type: "json_schema"` [A3] | 官方文档未说明 [G3] | MVP 不向任一预设宣称原生 JSON Schema；由 DataPulse 校验，结构失败时最多一次修复调用 |
| 流式输出 | `stream: true`；`stream_options.include_usage: true` 可在最后一个块返回 Token 用量 [A2] | `stream` 与 `stream_options` 被列为支持参数，但未详细约定事件/用量块 [G3] | 百炼按 OpenAI chunk 解析；Glosc 需用有效密钥核验 SSE、结束标记、错误块和 usage 后才能在生产启用 |
| 限流 | 官方说明主账号聚合、不同模型独立；存在 RPM/TPM，也可能按 RPS/TPS 和突发速率保护执行 [A4] | 官方 API 文档未公开限流指标或响应头约定 | 百炼解析 429 子类；Glosc 将 429 先作为不可自动重试的供应商错误并展示原始 request ID（脱敏后） |
| 错误语义 | 官方列出 401 无效 Key、429 请求/Token/突发限流、500 超时等 [A5] | 官方文档未给出错误码表 | 连接测试必须区分鉴权、模型不存在、余额、限流、超时、结构不合格 |
| CORS | 官方未核实；内置预设走代理，因此不依赖浏览器 CORS | 文档未承诺；2026-08-04 对官方端点的 OPTIONS 与无效密钥请求均观察到 `Access-Control-Allow-Origin: *`，但不是合同保证，且尚未用有效密钥确认成功响应 [G5] | Glosc 预设走代理；如果同一地址作为“自定义端点”浏览器直连，必须现场通过成功响应的 CORS 测试 |
| SLA/可用性承诺 | 本次核验的 API 文档未形成可直接用于 DataPulse 产品承诺的 SLA 结论 | 官方未核实 | UI 不展示未经合同支持的 SLA；监控中按供应商分别统计成功率和时延 |
| 数据留存/训练 | 本次核验的公开 API 文档未找到请求/响应保留期限或“不用于训练”的明确承诺 | 官方未核实 | 模型配置页展示第三方数据风险；不把 DataPulse 的 24 小时删除承诺扩展到供应商 |
| 中国大陆可用性 | 官方明确提供华北 2（北京）地域；北京 Workspace、API Key 与地址必须配套 [A1][A7] | 官方文档给出公网服务地址，但未公开承诺中国大陆网络可用性、地域或数据驻留 | 百炼标注“北京”；Glosc 只标注“公网服务”，上线前从目标中国大陆网络实测，不宣传境内驻留 |

## 阿里云百炼（中国大陆/北京）核验细节

### 地址与鉴权

官方当前推荐的北京 Base URL 是：

```text
https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
```

完整 Chat Completions 地址是：

```text
POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer <DASHSCOPE_API_KEY>
Content-Type: application/json
```

`{WorkspaceId}` 从百炼控制台的业务空间详情取得。官方明确建议北京地域从旧域名 `https://dashscope.aliyuncs.com` 迁移到业务空间专属域名，同时说明旧域名仍可正常使用。[A1] DataPulse 不能让客户端把完整 URL 原样交给代理；应只接收并严格校验 Workspace ID，由服务端从固定模板构造允许的主机，从而避免把预设代理变成任意转发器。

API Key 与地域绑定。连接测试应同时检查“北京 Workspace + 北京 Key + 北京 Base URL”，不能在失败后静默切换到其他地域。[A1][A7]

### 模型与 JSON 输出

模型 ID 放在请求体 `model` 字段。官方兼容范围包括 Qwen 文本、VL、Coder、Omni、Math 以及部分第三方直供模型，但具体模型需以模型目录、地域和开通状态为准；Qwen-Audio 明确不支持 OpenAI 兼容协议。[A1][A2][A6]

DataPulse 可将 `qwen-plus` 作为默认建议值，但不能把它写死为唯一选项。它是官方示例和限流文档中的常用稳定别名；真正保存配置前仍须用用户的 Workspace、Key 和模型 ID 执行合成连接测试。[A2][A4]

百炼公开确认的是 JSON Mode，而不是严格 JSON Schema：

```json
{
  "model": "qwen-plus",
  "messages": [
    {"role": "system", "content": "请仅输出符合要求的 JSON。"},
    {"role": "user", "content": "返回一个最小 DataPulse 故事蓝图 JSON。"}
  ],
  "response_format": {"type": "json_object"}
}
```

提示词必须包含“JSON”关键词，否则官方说明会报错；支持情况还与模型及思考/非思考模式有关。[A3] 因此适配器必须把供应商 JSON Mode 与 DataPulse 的故事蓝图 Schema 校验分开：模型只保证返回 JSON 对象，DataPulse 再验证字段、枚举、数值引用和证据 ID，失败时才允许既定的一次修复调用。

### 流式、限流与错误

官方支持 `stream: true`；`stream_options: {"include_usage": true}` 会把 Token 用量放在最后一个流式块。[A2] 若 DataPulse 为了交互反馈启用流式，必须先缓冲完整 JSON 后再校验，不能把未闭合 JSON 当成故事蓝图增量应用。

百炼限流并非一个固定全局数字。官方说明：

- 同一主账号下的 RAM 子账号、业务空间和 API Key 合并计量；
- 不同模型的限流额度相互独立；
- 可能同时存在 RPM、TPM、RPS、TPS 和突发速率保护；
- 常见 429 包括请求频率、Token 配额和突发流量三类。[A4][A5]

DataPulse 应将 401 映射为密钥问题，将 429 至少区分“调用频率”“Token/额度”“突发保护”，将 500/503 映射为供应商故障。受既定产品规则约束，网络错误或供应商错误不应偷偷连续重试；界面说明原因和建议等待时间后，由用户确认重试。

### 未核实边界

在本报告列出的百炼官方公开 API 文档中，未找到可直接证明下列事项的承诺：请求/响应保留多久、是否用于训练、适用于 DataPulse 场景的 SLA、浏览器 CORS。它们必须进入上线前法务/商务核验，不能由技术兼容性推断。

## Glosc AI One 核验细节

### 地址、鉴权与模型列表

官方文档给出的常用 Base URL 是 `https://one.gloscai.com/v1`，请求使用 Bearer Token。[G1][G2]

```text
POST https://one.gloscai.com/v1/chat/completions
GET  https://one.gloscai.com/v1/models
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

`GET /v1/models` 会根据请求头选择返回格式；普通 Bearer 请求返回 OpenAI 格式，模型 ID 位于 `data[].id`。[G4] DataPulse 可在密钥验证通过后读取列表，但不能仅因一个模型出现在列表里就推断它支持 JSON Mode、流式 usage 或特定上下文长度。

### 结构化输出与流式能力

聊天补全文档明确列出 `stream`、`stream_options` 和 `response_format` 参数，并称接口兼容 OpenAI Chat Completions。[G3] 但公开页面没有定义 `response_format.type` 的允许值，也没有说明 `json_object`、`json_schema`、提示词约束或模型间差异。因此：

- 首次连接只先验证基础非流式 Chat Completions；
- 再对用户选中的具体模型探测 `response_format: {"type":"json_object"}`；
- 只有响应为标准 JSON 且通过 DataPulse 蓝图 Schema 校验时，才在本地能力缓存中标记 `json_object=true`；
- 不探测成功就不发送 `response_format`，改用强约束提示词、JSON 提取、Schema 校验和最多一次修复；
- `json_schema` 在 MVP 中始终视为未支持。

流式也必须按具体模型验证 SSE Content-Type、分块格式、结束标记、错误事件和最终 usage；文档仅列出参数不足以证明所有上游模型具有一致行为。[G3]

### CORS 与运营信息

2026-08-04 对供应商官方 API 端点进行不含真实数据的协议探测：

- `OPTIONS /v1/chat/completions` 返回 HTTP 204，并带 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers: *` 和允许 `GET,POST,PUT,DELETE,OPTIONS`；
- 使用无效密钥的 `POST /v1/chat/completions` 返回 HTTP 401，同时观察到 `Access-Control-Allow-Origin: *`。[G5]

这只能说明探测时的预检和 401 响应允许跨域，不能代替官方 CORS 承诺，也不能证明有效密钥成功响应、流式响应或未来配置继续允许跨域。Glosc 内置预设走 DataPulse 无状态代理，因此不依赖 CORS；如果用户将同一 URL 填入自定义端点，仍需在浏览器中用有效密钥执行合成测试。

Glosc 的公开 API 页面未给出 SLA、RPM/TPM、429 语义、数据保留期、训练用途或中国大陆数据驻留承诺。DataPulse 必须把这些项目显示为“供应商未公开/待确认”，不得用 API 可访问性代替合规或可用性承诺。

## 建议的 DataPulse 内置预设

### 预设 1：阿里云百炼（北京）

```yaml
id: aliyun-bailian-cn-beijing
label: 阿里云百炼（北京）
transport: stateless-proxy
protocol: openai-chat-completions
base_url_template: https://{workspace_id}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
chat_path: /chat/completions
auth: bearer
required_local_fields:
  - workspace_id
  - api_key
  - model
default_model_suggestion: qwen-plus
model_discovery: curated-official-catalog
structured_output:
  preferred: json_object
  native_json_schema: false
streaming:
  documented: true
  include_usage: true
```

实现约束：后端从经格式校验的 `workspace_id` 构造主机；不接受用户覆盖协议、端口、主机或路径。可以提供“使用旧域名”的兼容开关，但应标注为官方建议迁移的旧入口。[A1]

### 预设 2：Glosc AI One

```yaml
id: glosc-ai-one
label: Glosc AI
transport: stateless-proxy
protocol: openai-chat-completions
base_url: https://one.gloscai.com/v1
chat_path: /chat/completions
models_path: /models
auth: bearer
required_local_fields:
  - api_key
  - model
model_discovery: authenticated-get-models
structured_output:
  preferred: probe-per-model
  native_json_schema: false
streaming:
  documented: true
  production_enabled: after-valid-key-test
```

实现约束：能力缓存以“端点 + 模型 ID + 测试版本”为键，只保存在浏览器本地；切换模型后必须重新测试结构化输出和流式能力。供应商返回的 `owned_by` 只用于展示，不能作为安全或能力证明。[G3][G4]

### 入口 3：自定义端点

继续遵循既定边界：浏览器直连、仅 HTTPS 公网地址（另行允许 localhost）、禁止重定向、必须支持 CORS，并同时兼容 OpenAI Chat Completions 与鉴权后的 `GET /models`。界面只能从模型列表中选择并验证模型；列表不可用、为空或格式不兼容时拒绝保存配置。自定义端点不复用两个内置预设的无状态代理。

## 上线前必须实测清单

以下每项都应使用**最小合成数据**；测试结果与用量只保存在浏览器本地。

1. **鉴权与地域**：百炼北京 Workspace、北京 Key、专属域名三者配套；Glosc 有效 Key 能读取 `/models` 并调用所选模型。
2. **基础调用**：非流式简体中文响应、超时、取消请求、响应体大小上限和错误体解析。
3. **故事蓝图**：每个候选模型至少进行多轮 JSON 蓝图测试，覆盖中文、空数组、枚举、嵌套对象、Unicode、长证据包和输出截断。
4. **JSON Mode**：百炼验证 `json_object` 与“JSON”关键词约束；Glosc 对每个模型验证 `json_object`，不得从参数名推断支持。
5. **Schema 失败路径**：确认无效蓝图只触发一次修复调用，并在第二次失败后明确停止。
6. **流式**：验证 Content-Type、SSE 分块、结束标记、半途断开、错误事件、UTF-8 跨块字符和 usage；未通过时回退非流式。
7. **模型变化**：模型下线、改名、无权限、未开通、余额不足及 Glosc `/models` 列表变化。
8. **限流与故障**：百炼的请求频率、Token 配额和突发 429 分类；两家 401、404、429、500、503、连接超时及用户确认后重试。
9. **密钥防泄漏**：代理日志、APM、错误追踪、访问日志、请求转储和前端崩溃报告中均不出现 Authorization 或请求证据包。
10. **CORS**：若 Glosc 或其他地址经自定义端点浏览器直连，必须用有效密钥分别验证非流式成功、流式成功和错误响应的 CORS；OPTIONS/401 结果不能替代。
11. **中国大陆网络**：从目标运营商与地区实测 DNS、TLS、首 Token 时延和完整响应时延；Glosc 未通过前不得宣传中国大陆稳定可用。
12. **条款与留存**：由产品/法务确认两家当前服务条款、隐私政策、请求与响应留存、训练用途、分包商/上游模型、数据地域和删除机制，并在配置页把实际条款链接展示给用户确认。

## 官方一手来源

### 阿里云百炼

- [A1：OpenAI 兼容接口总览（含地域 Base URL、迁移说明、模型范围）](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)
- [A2：OpenAI 兼容 Chat Completions API 参考](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)
- [A3：结构化输出（JSON Mode）](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- [A4：模型调用限流](https://help.aliyun.com/zh/model-studio/rate-limit)
- [A5：错误码](https://help.aliyun.com/zh/model-studio/error-code)
- [A6：模型列表](https://help.aliyun.com/zh/model-studio/getting-started/models)
- [A7：获取 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)

### Glosc AI

- [G1：AI 模型调用总览](https://one-docs.gloscai.com/api/0.index.html)
- [G2：认证与公共请求](https://one-docs.gloscai.com/api/auth.html)
- [G3：聊天补全](https://one-docs.gloscai.com/api/completions.html)
- [G4：模型列表](https://one-docs.gloscai.com/api/list.html)
- [G5：Glosc AI 官方 API 端点协议探测](https://one.gloscai.com/v1/chat/completions)（2026-08-04，仅 OPTIONS 与无效密钥请求；未发送用户数据）

所有链接访问日期均为 2026-08-04。
