# Note Prompt — AI 提示词管理平台

现代化的 AI 提示词管理平台，支持多模型智能优化、暗色模式、版本历史、全局搜索等功能。

## 功能特性

- **提示词管理** — 双模编辑器（普通/专业模式），文件夹分层组织
- **AI 智能优化** — 接入 DeepSeek、Kimi（Moonshot）、通义千问、智谱 AI 共 17+ 模型
- **公共提示词库** — 分享、浏览、收藏社区提示词
- **暗色模式** — 支持亮色/暗色/跟随系统
- **版本历史** — 自动记录每次编辑，一键恢复到任意版本
- **全局搜索** — `Ctrl+K` 快速搜索提示词和文件夹
- **Landing 首页** — 产品级着陆页，展示平台特性

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15, React 18, TypeScript, Tailwind CSS |
| UI | shadcn/ui, Radix UI, Lucide Icons |
| 后端 | Next.js API Routes (Node.js) |
| 数据库 | MySQL |
| 认证 | JWT |
| 部署 | Docker + Nginx |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/note-prompt.git
cd note-prompt
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填写数据库和 AI API 密钥：

```env
# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=agent_report

# JWT
JWT_SECRET=your_secret

# AI API Keys (至少配置一个)
DEEPSEEK_API_KEY=your_api_key
KIMI_API_KEY=your_api_key
QWEN_API_KEY=your_api_key
ZHIPU_API_KEY=xxx.xxx
```

### 4. 初始化数据库

```bash
mysql -u root -p agent_report < database/mysql-schema-new.sql
```

### 5. 启动开发服务器

```bash
npm run dev
# 默认访问 http://localhost:3000
```

## Docker 部署

```bash
cp .env.example .env.production
# 编辑 .env.production 填写配置

docker-compose up -d
# 访问 http://localhost
```

## 项目结构

```
note-prompt/
├── src/
│   ├── app/            # Next.js App Router 页面
│   ├── components/     # React 组件
│   ├── contexts/       # Context (Auth, Theme)
│   ├── hooks/          # 自定义 Hooks
│   ├── lib/            # 工具库 (API, DB, AI)
│   └── types/          # TypeScript 类型定义
├── database/           # SQL schema & migrations
├── nginx/              # Nginx 配置
├── public/             # 静态资源
└── uploads/            # 用户上传文件
```

## 许可证

MIT License
