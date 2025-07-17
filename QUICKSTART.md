# WebChat 快速开始指南

## 🚀 直接使用

应用已部署在：https://webchat.wsxxll.workers.dev

## 📱 Cloudflare 部署说明

通过 Cloudflare Dashboard 直接连接 GitHub 仓库即可自动部署。

### 手动部署步骤：

```bash
# 克隆项目
git clone https://github.com/wsxxll/webchat.git
cd webchat

# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login

# 部署
npm run deploy
```

## ✨ 功能特点

- **零配置**：前端自动从 GitHub 获取最新代码
- **全栈部署**：前端和后端都在 Cloudflare Workers 上运行
- **自动更新**：推送到 GitHub 后自动更新（配置 GitHub Actions）

## 🔧 自定义配置

### 使用自己的 Worker URL

你的 WebSocket URL 已配置为：
```
wss://webchat.wsxxll.workers.dev/ws
```

如需修改，编辑 `assets/config.js`。

### GitHub Actions 自动部署

1. 在 GitHub 仓库设置中添加 Secret：
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: 你的 Cloudflare API Token

2. 推送代码自动部署：
```bash
git add .
git commit -m "Update"
git push
```

## 🌐 访问你的应用

部署成功后，访问：
```
https://webchat.YOUR-SUBDOMAIN.workers.dev
```

## 📋 检查清单

- [ ] 运行了 setup.sh 配置脚本
- [ ] 安装了依赖 (npm install)
- [ ] 登录了 Cloudflare (npx wrangler login)
- [ ] 成功部署 (npm run deploy)
- [ ] 可以访问应用 URL

## ❓ 常见问题

**Q: 部署失败提示 Durable Objects 错误**
A: 确保 wrangler.toml 中使用 `new_sqlite_classes` 而不是 `new_classes`

**Q: 404 错误**
A: 检查 GitHub 仓库是否公开，用户名和仓库名是否正确

**Q: WebSocket 连接失败**
A: 检查 config.js 中的 WebSocket URL 是否正确

## 🆘 需要帮助？

- 查看 [完整文档](README.md)
- 查看 [GitHub 设置指南](GITHUB_SETUP.md)
- 查看 [部署指南](DEPLOYMENT.md)