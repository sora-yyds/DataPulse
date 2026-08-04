# 无状态服务使用 TypeScript 与 Hono

预设模型供应商代理、发布、撤销和过期处理使用 TypeScript、Hono 与阿里云函数计算的当前 Node.js 长期支持运行时，并与前端共享故事 Schema 和供应商适配器；HTTP 边界使用 JSON Schema/Ajv 校验，不引入 ORM 或长期用户内容数据库，限时状态遵守 ADR-0046。该选择放弃独立 Java/Python 后端生态，以统一类型、较小冷启动和较低开源贡献门槛换取全栈一致性，并要求日志、APM 与错误上报默认移除 Authorization、证据包和加密发布包。
