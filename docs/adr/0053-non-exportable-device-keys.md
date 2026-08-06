# 不可导出设备密钥只通过 IndexedDB 句柄持久化并绑定设备密封

首次设备绑定时由 Web Crypto CSPRNG 生成一次性 AES-256-GCM 256 位设备密钥，extractable=false 且仅授予 encrypt/decrypt，句柄只通过 IndexedDB structured clone 持久化，原始密钥字节绝不落盘、入日志或发送网络；设备绑定对象（如“记住”的模型凭据与本地设置）使用注册 purpose datapulse/device-bound-seal 经用途绑定 AES-256-GCM（AAD 为 JCS {v:1, purpose, ...fields}）执行 seal/open，只有存储中的同一密钥句柄能打开。首次创建设备密钥时请求 navigator.storage.persist()，被拒绝或不支持时返回稳定错误 STORAGE_PERSISTENCE_UNAVAILABLE 且不得声称持久；清除站点数据后密钥句柄丢失、已密封对象永久不可读并返回稳定错误 STORAGE_DEVICE_KEY_MISSING，不提供恢复路径。真实浏览器必须验证 exportKey 拒绝、IndexedDB/日志/网络均无原始字节、清除站点数据后 open 失败；设备密钥不参与发布或分享协议，发布内容仍使用独立随机密钥与既有 purpose。
