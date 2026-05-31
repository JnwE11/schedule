# 📅 我的日程

一个**免费、跨平台**的智能日程管理工具 —— 电脑/手机/平板都能用。

## ✨ 功能

- 📋 **粘贴即提取** — 从微信/钉钉/邮件复制消息，自动识别日期
- 🤖 **AI 增强** — 可选接入 DeepSeek API，理解更模糊的表达
- 📅 **月历视图** — 简洁的手机日历风格
- ⏳ **实时倒计时** — 所有日程自动显示剩余时间
- 🔔 **浏览器提醒** — 日程前 15 分钟弹出通知
- 🌙 **暗色模式** — 跟随系统自动切换
- 📱 **PWA** — 手机上可「添加到桌面」，像原生 App 一样使用

## 🚀 免费部署到公网（3 分钟）

### 方法一：Vercel（推荐，最简单）

1. 打开 [vercel.com](https://vercel.com) 注册（用 GitHub 账号一键登录）
2. 点击 **「New Project」**
3. 把这 5 个文件（index.html, style.css, app.js, extractor.js, ai-extractor.js, manifest.json, vercel.json）拖进网页即可
4. 自动获得一个 `xxx.vercel.app` 的公网地址

### 方法二：GitHub Pages（永久免费）

1. 把这 7 个文件上传到你自己的 GitHub 仓库
2. Settings → Pages → Source 选 `main` 分支 → Save
3. 等 1 分钟，获得 `xxx.github.io` 地址

### 方法三：本地直接用

双击 `index.html` 用浏览器打开即可，所有数据存你浏览器里。

## 🤖 启用 AI 提取（可选）

1. 打开 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 注册
2. 新用户免费送 **500 万 tokens**（够提取几万条日程）
3. 复制 API Key（sk- 开头）
4. 在网页中点击 ⚙️ 设置 → 粘贴 Key → 保存
5. 点击「🤖 本地」按钮切换到「🤖 AI」模式

> AI 模式 vs 本地模式：
> - **本地**：正则匹配，免费无限，覆盖常见格式（"明天下午3点"、"3月15日"等）
> - **AI**：DeepSeek 语义理解，能处理模糊表达（"下下周左右"、"等春节之后"），每次约 200 tokens

## 🛠️ 技术栈

纯前端，零依赖，无需服务器：

- HTML5 + CSS3 + Vanilla JavaScript
- localStorage 数据持久化
- DeepSeek API（可选）
- PWA manifest（可安装到桌面）
- 响应式设计（375px ~ 1440px）
