# WebChat

基于 Cloudflare Pages + Workers 的实时聊天应用。

## 项目结构

```
webchat/
├── index.html          # Pages 入口
├── assets/             # 前端资源
├── functions/          # Pages Functions (Worker 绑定)
├── src/                # Workers 源码
└── wrangler.toml       # Workers 配置
```

## 部署说明

### 1. 部署 Worker (后端)
在 Cloudflare Dashboard 中创建 Worker，上传 `src/` 目录下的代码。

### 2. 部署 Pages (前端)
在 Cloudflare Dashboard 中创建 Pages 项目：
- 连接 GitHub 仓库
- 构建设置：无需构建命令
- 输出目录：`/` (根目录)

### 3. 配置 Worker 绑定
在 Pages 项目设置中：
1. 进入 "Functions" → "Worker Routes & Bindings"
2. 添加 Worker 绑定：
   - Variable name: `WEBCHAT_WORKER`
   - Service: 你的 Worker 名称

## 功能特性

- **局域网模式**: 自动发现同网段用户，P2P 直连
- **公网模式**: 通过房间号连接，WebSocket 中转
- **文件传输**: 支持图片和文件共享
- **实时聊天**: 低延迟消息传输

## 技术架构

- 前端通过 `/api/*` 路径访问后端
- Pages Functions 使用 Worker 绑定直接调用 Worker
- WebSocket 连接自动处理
- Durable Objects 管理房间状态