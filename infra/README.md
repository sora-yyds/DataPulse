# Infrastructure scope

`infra/` 只承载 DataPulse AI 可公开审计的部署配置，不是产品内容或凭据存储位置。

M0-006 只建立本作用域，尚未创建 IaC module、state、plan 或“成功”占位：

- `infra/aliyun/` 由 M0-041、M0-063、M0-064 在取得适用阿里云验证条件后创建；
- `infra/self-host/` 由 M0-040、M0-066 在社区四 Origin 与临时存储 contract 就绪后创建；
- OpenTofu 固定版本、Provider lock 与真实入口必须在首次实际消费时一起提交和验证。

任何凭据、`*.tfstate*`、`.terraform/`、plan、crash log 或用户内容都不得进入此目录。
