# WebChat - 实时聊天应用

基于 Cloudflare Pages + Workers 的实时聊天应用，支持局域网和公网模式。

## 项目结构

```
webchat/
├── web/           # 前端项目 (Cloudflare Pages)
│   ├── assets/    # 静态资源
│   ├── functions/ # Pages Functions
│   ├── index.html # 主页面
│   └── package.json
└── core/          # 后端项目 (Cloudflare Workers)
    ├── server.js      # Worker 源码
    └── wrangler.toml
```

## 部署方式

### 前端 (Cloudflare Pages)
1. 在 Cloudflare Dashboard 中创建 Pages 项目
2. 连接到此 Git 仓库的 `web` 目录
3. 在 Pages 设置中添加 Worker 绑定: `webchat-core`

### 后端 (Cloudflare Workers)
1. 在 Cloudflare Dashboard 中创建 Worker 项目
2. 上传 `core` 目录中的代码
3. 配置 Durable Objects

## 功能特性

- **局域网模式**: 自动检测同网段用户，支持 P2P 连接
- **公网模式**: 基于 WebSocket 的实时通信
- **文件传输**: 支持拖拽上传和 P2P 文件传输
- **响应式设计**: 适配移动端和桌面端

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **后端**: Cloudflare Workers, Durable Objects
- **通信**: WebSocket, WebRTC
- **部署**: Cloudflare Pages + Workers