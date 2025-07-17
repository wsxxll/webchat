# WebChat Cloudflare Workers 部署指南

## 前置要求

1. Cloudflare 账号（免费或付费）
2. Node.js 16+
3. npm 或 bun

## 部署步骤

### 1. 安装依赖

```bash
npm install
# 或使用 bun
bun install
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

### 3. 部署到 Cloudflare Workers

```bash
npm run deploy
# 或直接使用
npx wrangler deploy
```

## 注意事项

### SQLite Durable Objects

本项目使用 SQLite-based Durable Objects，这是 Cloudflare 免费计划支持的方式。相关配置在 `wrangler.toml` 中：

```toml
[[migrations]]
tag = "v1"
new_sqlite_classes = ["ChatRoom"]
```

### 首次部署

首次部署时，Cloudflare 会自动创建：
- Worker 脚本
- Durable Objects 命名空间
- Workers.dev 子域名

### 更新配置

部署成功后，你会获得一个 Worker URL，格式如：
```
https://webchat.YOUR-SUBDOMAIN.workers.dev
```

请更新 `assets/config.js` 中的服务器配置：

```javascript
const WS_CONFIG = {
  servers: [
    'wss://webchat.YOUR-SUBDOMAIN.workers.dev/ws',
    // ... 其他备用服务器
  ]
};
```

## 常见问题

### 1. Durable Objects 错误

如果遇到错误：
```
In order to use Durable Objects with a free plan, you must create a namespace using a `new_sqlite_classes` migration.
```

确保 `wrangler.toml` 中使用的是 `new_sqlite_classes` 而不是 `new_classes`。

### 2. Wrangler 版本过旧

如果提示 Wrangler 版本过旧，请更新：
```bash
npm install --save-dev wrangler@latest
```

### 3. 部署失败

如果部署失败，请检查：
1. 是否已登录 Cloudflare：`npx wrangler whoami`
2. 是否有正确的账号权限
3. `wrangler.toml` 配置是否正确

## 本地开发

```bash
npm run dev
# 或
npx wrangler dev
```

本地开发服务器默认运行在 `http://localhost:8787`。

## 生产环境配置

### 自定义域名

编辑 `wrangler.toml`，添加路由配置：

```toml
route = { pattern = "chat.yourdomain.com/*", zone_name = "yourdomain.com" }
```

### 环境变量

在 `wrangler.toml` 中配置：

```toml
[env.production]
vars = { ENVIRONMENT = "production" }
```

## 监控和日志

查看实时日志：
```bash
npx wrangler tail
```

## 费用说明

### 免费计划限制
- 每日 100,000 个请求
- 每个请求最多 10ms CPU 时间
- Durable Objects：每月 100 万个请求

### 付费计划
- Workers Paid：$5/月起
- 包含更高的请求限制和 CPU 时间

## 技术支持

如有问题，请查看：
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Durable Objects 指南](https://developers.cloudflare.com/durable-objects/)
- 项目 Issues 页面