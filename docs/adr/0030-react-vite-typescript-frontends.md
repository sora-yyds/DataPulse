# 前端使用 TypeScript、React 与 Vite

创作端和观看端均使用 TypeScript 严格模式、React 与 Vite，采用 pnpm workspaces 管理依赖并由 Turborepo 编排 monorepo 构建、测试和缓存；创作端、观看端与低权限自定义连接器独立打包并部署到不同 Origin，只共享各自所需的故事 Schema、指标运行时、渲染、加密及必要领域包，连接器不得依赖本地存储或设备密钥。该选择放弃 Next.js 的服务端渲染和服务端组件能力，并增加多 Origin 部署成本，以更直接地支持 Web Worker、WASM、WebGL、本地加密、静态部署、轻量观看包及浏览器存储安全隔离。
