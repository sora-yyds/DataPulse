# 未发布 Story Artifact 开发样本

本目录只为 M0-013 的 Reader／迁移执行器测试提供合成输入。`0.0.1` 与 `0.1.0` 均为未发布开发版本：`formalHistory=false`、`compatibilityPromise=false`，不得称为历史发布格式，也不得建立到 M0-048 正式 `1.0.0` 的兼容边。

- `0.0.1.valid.json`：执行 `storyTimeZone → storyTimezone` 的复制迁移。
- `0.1.0.valid.json`：验证当前开发版本无需迁移。
- `0.0.1.target-invalid.json`：源结构合法，但迁移目标结构必须失败。
- `0.1.0.final-invalid.json`：结构合法，但候选目录扩张可信引用，最终语义校验失败。
- `unknown-version.json`：合法 SemVer 但未登记。
- `malicious-source.json`：携带任意 HTML／脚本字段，必须在结构边界拒绝且绝不执行。

全部内容均为仓库合成数据，不含真实用户数据或密钥。固定 hash 由同目录 manifest 登记；正式 fixture 将由 M0-048 在独立目录和清单中建立。
