# ECharts 编码数据，Three.js 与 R3F 渲染 3D 场景

所有二维数据图表由 Apache ECharts 的受控组件渲染，优先使用 SVG 以支持无障碍与本地静态导出，元素规模超限时可切换 Canvas 但必须保留等价文字摘要；Three.js 与 React Three Fiber 只负责延迟加载的 3D 视觉场景，CSS/Web Animations 或 Motion 负责叙事与状态过渡。该分层禁止 AI 生成任意 ECharts 脚本或 Shader，并以多渲染层协调成本换取准确数据编码、渐进式 3D 降级和可测试的故事蓝图。
