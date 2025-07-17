# WebChat Cloudflare Workers Backend

基于 Cloudflare Workers 和 Durable Objects 的 WebChat 后端实现。

## 功能特性

- **Durable Objects**: 使用 Durable Objects 管理聊天房间状态
- **WebSocket 支持**: 原生 WebSocket 连接，低延迟通信
- **全球分布**: 利用 Cloudflare 的边缘网络，就近连接
- **自动扩展**: 无需担心服务器容量，自动按需扩展

## 部署步骤

### 1. 安装依赖

```bash
cd workers
npm install
```

### 2. 配置 Cloudflare 账号

```bash
npx wrangler login
```

### 3. 部署到 Cloudflare

```bash
npm run deploy
```

部署成功后，会显示你的 Worker URL，格式类似：
```
https://webchat.your-subdomain.workers.dev
```

### 4. 更新前端配置

编辑 `assets/config.js` 文件，将 Worker URL 添加到服务器列表：

```javascript
const WS_CONFIG = {
  servers: [
    'wss://webchat.your-subdomain.workers.dev/ws',
    // ... 其他备用服务器
  ]
};
```

## 使用说明

### WebSocket 连接

WebSocket 端点：`wss://your-worker.workers.dev/ws?room=ROOM_ID`

- `room`: 必需参数，房间 ID

### API 端点

- `/health` - 健康检查
- `/room/{roomId}` - 获取房间统计信息（调试用）

## 开发测试

本地开发测试：

```bash
npm run dev
```

这会启动一个本地开发服务器，通常在 `http://localhost:8787`。

## 架构说明

### Durable Objects

每个聊天房间是一个独立的 Durable Object 实例：

- 自动管理 WebSocket 连接
- 维护房间内的用户列表
- 转发 WebRTC 信令消息
- 处理心跳和连接状态

### 消息类型

支持的 WebSocket 消息类型：

1. **join** - 加入房间
```json
{
  "type": "join",
  "room": "room_id",
  "userId": "user_id",
  "userInfo": { /* 用户信息 */ }
}
```

2. **leave** - 离开房间
```json
{
  "type": "leave",
  "room": "room_id"
}
```

3. **offer/answer/ice-candidate** - WebRTC 信令
```json
{
  "type": "offer",
  "targetUserId": "target_user_id",
  "offer": { /* WebRTC offer */ }
}
```

4. **heartbeat** - 心跳保活
```json
{
  "type": "heartbeat"
}
```

## 注意事项

1. **Durable Objects 限制**
   - 每个 Durable Object 最多 32,768 个并发 WebSocket 连接
   - 单个消息最大 1MB

2. **费用考虑**
   - Durable Objects 按请求和持续时间计费
   - WebSocket 连接按活跃时间计费
   - 建议设置合理的心跳间隔（如 30 秒）

3. **安全建议**
   - 生产环境建议添加身份验证
   - 考虑添加速率限制
   - 实施消息大小限制

## 故障排除

### WebSocket 连接失败

1. 检查 Worker URL 是否正确
2. 确认房间 ID 参数已提供
3. 查看浏览器控制台错误信息

### 消息未送达

1. 检查 P2P 连接是否建立
2. 确认目标用户在线
3. 查看 Cloudflare Workers 日志

### 查看日志

```bash
npx wrangler tail
```

## 扩展功能

可以考虑添加的功能：

1. **持久化存储**: 使用 Durable Objects 存储聊天历史
2. **文件传输**: 通过 R2 存储支持大文件传输
3. **用户认证**: 集成 Cloudflare Access 或自定义认证
4. **监控告警**: 使用 Workers Analytics API

## 相关资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Durable Objects 指南](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [WebSocket API](https://developers.cloudflare.com/workers/examples/websockets/)