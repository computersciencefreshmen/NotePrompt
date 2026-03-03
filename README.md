<div align="center">

# ✨ NotePrompt

### AI Prompt Management Platform

A modern, full-stack AI prompt management platform with multi-model optimization, community prompt library, and professional-grade editing tools.

**[Live Demo](https://noteprompt.cn)** · **[Documentation](#-getting-started)** · **[Report Bug](https://github.com/computersciencefreshmen/NotePrompt/issues)**

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

---

## 📖 Overview

**NotePrompt** is a production-ready AI prompt management platform built with Next.js 15. It provides a comprehensive workspace for creating, organizing, optimizing, and sharing AI prompts across multiple AI providers. Designed for both individual users and teams, it features a dual-mode editor, 17+ AI model integrations, a community-driven public prompt library with 15 curated categories, and a full admin dashboard.

> 🌐 **Live at [noteprompt.cn](https://noteprompt.cn)** — Deployed on Alibaba Cloud with Docker, Nginx reverse proxy, and SSL.

---

## 🎯 Key Features

### Prompt Management
- **Dual-Mode Editor** — Switch between Standard and Professional editing modes with real-time preview
- **Folder Organization** — Hierarchical folder system with drag-and-drop, custom descriptions, and nested structure
- **Version History** — Automatic edit tracking with one-click rollback to any previous version
- **Global Search** — `Ctrl+K` instant search across all prompts and folders
- **Tags & Categories** — Organize prompts with 15 built-in categories and custom tagging

### AI-Powered Optimization
- **17+ AI Models** — Integrated with DeepSeek (V3.2, R1), Kimi (K2.5, K2 Thinking), Qwen (3.5 Plus, 3 Max, Coder Plus), Zhipu GLM (5, 4.7, 4.6, 4.5)
- **Multi-Turn Optimization** — Iterative prompt refinement through AI-guided conversations
- **Model Presets** — Creative / Balanced / Precise temperature presets for different use cases
- **Auto-Fallback** — Seamless failover between providers if one is unavailable

### Community & Sharing
- **Public Prompt Library** — Browse, search, and collect community-shared prompts
- **15 Curated Categories** — Writing, Programming, Education, Marketing, Creative Design, Data Analysis, Life Assistant, Translation, Productivity, AI Art, Academic Research, Social Media, Role-Playing, Content Creation, and more
- **Favorites & Likes** — Save and engage with the best community prompts
- **One-Click Publish** — Share your prompts to the public library instantly

### Platform Features
- **Dark Mode** — Light / Dark / System-following theme with smooth transitions
- **Admin Dashboard** — Full platform management: user management, content moderation, usage statistics, featured content curation
- **JWT Authentication** — Secure registration/login with bcrypt password hashing (12 rounds)
- **Email Verification** — Optional email verification with rate-limited, brute-force-protected verification codes
- **Rate Limiting** — Redis-backed rate limiting on all sensitive endpoints
- **Responsive Design** — Fully optimized for desktop, tablet, and mobile

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 18, TypeScript, Tailwind CSS 4 |
| **UI Components** | shadcn/ui, Radix UI, Lucide Icons |
| **Backend** | Next.js App Router API Routes (Node.js) |
| **Database** | MySQL 8.0 |
| **Caching** | Redis 7 |
| **Authentication** | JWT + bcrypt |
| **Email** | Nodemailer |
| **AI Providers** | DeepSeek, Kimi (Moonshot), Qwen (DashScope), Zhipu GLM |
| **Deployment** | Docker Compose + Nginx + SSL |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18
- **MySQL** >= 8.0
- **Redis** >= 6 (optional, for rate limiting)
- At least one AI provider API key

### 1. Clone the Repository

```bash
git clone https://github.com/computersciencefreshmen/NotePrompt.git
cd NotePrompt
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# ── Database ─────────────────────────────────
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=agent_report

# ── Authentication ───────────────────────────
JWT_SECRET=your_jwt_secret_at_least_32_chars

# ── Redis (optional) ────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ── AI API Keys (configure at least one) ────
DEEPSEEK_API_KEY=sk-xxx
KIMI_API_KEY=sk-xxx
QWEN_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx.xxx

# ── Email (optional) ────────────────────────
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=your_email@example.com
SMTP_PASS=your_password
ENABLE_EMAIL_VERIFICATION=false
```

### 4. Initialize Database

```bash
mysql -u root -p agent_report < database/mysql-schema-new.sql
```

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Docker Deployment

Deploy the full stack (App + MySQL + Redis + Nginx) with a single command:

```bash
# 1. Configure production environment
cp .env.example .env.production

# 2. Launch all services
docker-compose up -d

# 3. Access the application
# → http://localhost (or your domain)
```

The Docker Compose stack includes:
- **note-prompt-app** — Next.js application (port 3001)
- **docker_mysql8** — MySQL 8.0 with persistent volume
- **note-prompt-redis** — Redis 7 for caching and rate limiting
- **note-prompt-nginx** — Nginx reverse proxy with SSL termination

---

## 📁 Project Structure

```
NotePrompt/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            #   Landing page
│   │   ├── admin/              #   Admin dashboard
│   │   ├── api/v1/             #   RESTful API routes
│   │   │   ├── auth/           #     Authentication (register, login, verify-email)
│   │   │   ├── ai/             #     AI optimization endpoints
│   │   │   ├── prompts/        #     User prompts CRUD
│   │   │   ├── public-prompts/ #     Public prompt library
│   │   │   ├── folders/        #     Folder management
│   │   │   ├── favorites/      #     Favorites system
│   │   │   ├── search/         #     Global search
│   │   │   └── tags/           #     Tag management
│   │   ├── prompts/            #   Prompt workspace pages
│   │   ├── public-prompts/     #   Public library pages
│   │   ├── folders/            #   Folder view pages
│   │   └── settings/           #   User settings
│   ├── components/             # Reusable React components
│   │   ├── ui/                 #   shadcn/ui base components
│   │   ├── AIOptimizeDialog.tsx #   AI optimization dialog
│   │   ├── Header.tsx          #   Navigation header
│   │   └── ...                 #   40+ components
│   ├── config/
│   │   └── ai.ts               # AI provider & model configuration
│   ├── contexts/               # React Context providers
│   │   ├── AuthContext.tsx      #   JWT authentication state
│   │   └── ThemeContext.tsx     #   Theme management
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities & services
│   │   ├── mysql-database.ts   #   Database access layer
│   │   ├── rate-limit.ts       #   Rate limiting
│   │   └── email-service.ts    #   Email service
│   └── types/                  # TypeScript type definitions
├── database/
│   ├── mysql-schema-new.sql    # Full database schema
│   └── migrations/             # SQL migrations
├── nginx/
│   └── nginx.conf              # Nginx config (Cloudflare-ready)
├── docker-compose.yml          # Docker Compose orchestration
├── Dockerfile                  # Multi-stage production build
└── package.json
```

---

## 🔌 API Reference

All API endpoints are prefixed with `/api/v1/`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new account |
| `POST` | `/auth/login` | Login and receive JWT token |
| `POST` | `/auth/verify-email` | Verify email with 6-digit code |
| `GET` | `/prompts` | List user's prompts |
| `POST` | `/prompts` | Create a new prompt |
| `PUT` | `/prompts/:id` | Update a prompt |
| `DELETE` | `/prompts/:id` | Delete a prompt |
| `GET` | `/public-prompts` | Browse public prompt library |
| `POST` | `/public-prompts` | Publish a prompt |
| `GET` | `/folders` | List user's folders |
| `POST` | `/folders` | Create a new folder |
| `POST` | `/ai/optimize` | AI-powered prompt optimization |
| `GET` | `/search` | Global search |
| `GET` | `/favorites` | List favorites |
| `POST` | `/favorites` | Add to favorites |
| `GET` | `/categories` | List all categories |
| `GET` | `/tags` | List all tags |

---

## 🤖 Supported AI Models

| Provider | Models | Highlights |
|----------|--------|------------|
| **DeepSeek** | V3.2 Chat, R1 (Reasoner) | Top-tier reasoning capability |
| **Kimi (Moonshot)** | K2.5, K2 Thinking, Moonshot V1 (32K/128K) | 128K context window |
| **Qwen (Alibaba)** | 3.5 Plus, 3 Max, Coder Plus, Long, 3.5 Flash | Best Chinese language support |
| **Zhipu GLM** | GLM-5, GLM-4.7, GLM-4.7-Flash, GLM-4.6, GLM-4.5 | 128K context, up to 131072 tokens |

---

## 🔒 Security

- **Password Hashing** — bcrypt with 12 salt rounds (OWASP recommended)
- **JWT Authentication** — Secure token-based auth with httpOnly cookies
- **Rate Limiting** — Redis-backed rate limiting on auth and API endpoints
- **Input Validation** — Server-side validation on all user inputs
- **CSRF Protection** — SameSite cookie policy
- **Brute Force Protection** — Lockout after 5 failed verification attempts
- **Timing-Safe Comparison** — `crypto.timingSafeEqual` for verification codes

---

## 📸 Screenshots

<div align="center">
<table>
<tr>
<td><b>Landing Page</b></td>
<td><b>Prompt Workspace</b></td>
</tr>
<tr>
<td><img src="public/screenshots/landing.png" alt="Landing Page" width="400"/></td>
<td><img src="public/screenshots/workspace.png" alt="Prompt Workspace" width="400"/></td>
</tr>
<tr>
<td><b>AI Optimization</b></td>
<td><b>Admin Dashboard</b></td>
</tr>
<tr>
<td><img src="public/screenshots/ai-optimize.png" alt="AI Optimization" width="400"/></td>
<td><img src="public/screenshots/admin.png" alt="Admin Dashboard" width="400"/></td>
</tr>
</table>
</div>

> 📌 *Screenshots coming soon — visit [noteprompt.cn](https://noteprompt.cn) for the live experience.*

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with ❤️ using Next.js, TypeScript, and Tailwind CSS**

[⬆ Back to Top](#-noteprompt)

</div>
