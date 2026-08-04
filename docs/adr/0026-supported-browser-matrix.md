# Chrome 与 Edge 承担创作，主流浏览器与微信承担观看

MVP 创作端正式支持 Windows/macOS 最新两个稳定版本的 Chrome 和 Edge，观看端支持最新两个稳定版本的 Chrome、Edge、Safari 及当前主流微信内置浏览器；微信和低性能移动设备使用弱动效或二维视觉回退，缺少 Web Crypto 等必要能力时必须提示改用受支持浏览器而不能降级为明文。Playwright 的 Chromium 与 WebKit 只承担自动近似验证，官方托管版本发布前还必须在覆盖所声明版本的真实 macOS/iOS Safari 以及 Android/iOS 微信设备上执行公开检查清单并保存结果。该范围放弃 Firefox 创作端、手机编辑、IE 和旧版国产双核浏览器，以集中验证浏览器本地分析、加密、WebGL 和静态导出的组合能力。
