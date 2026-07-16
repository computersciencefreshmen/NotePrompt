<div align="center">

# ✨ NotePrompt

### AI Prompt Management Platform

A modern, full-stack AI prompt management platform with multi-model optimization, community prompt library, and professional-grade editing tools.

**[Live Demo](https://noteprompt.cn)** · **[Documentation](#-getting-started)** · **[Report Bug](https://github.com/computersciencefreshmen/NotePrompt/issues)**

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=flat-square&logo=tailwindcss)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

---

## 📖 Overview

**NotePrompt** is an AI prompt management platform built with Next.js 15. It provides a workspace for creating, organizing, optimizing, and sharing AI prompts across multiple AI providers, with a dual-mode editor, community library, and administration tools.

> 🌐 Production endpoint: [noteprompt.cn](https://noteprompt.cn). A release is considered healthy only after the commit-SHA image, migration status, database/Redis readiness, and live TLS checks in [DEPLOY.md](./DEPLOY.md) pass.

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
- **Bounded Attachment Parsing** — Local PDF extraction and Chinese/English OCR in the production image, with a finite OCR work queue

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
| **Frontend** | Next.js 15, React 18, TypeScript, Tailwind CSS 3.4 |
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

- **Node.js** 24 LTS
- **MySQL** >= 8.0
- **Redis** >= 6 (optional only for local development; mandatory in production)
- At least one AI provider API key

### 1. Clone the Repository

```bash
git clone https://github.com/computersciencefreshmen/NotePrompt.git
cd NotePrompt
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# ── Long-running application database account (DML only) ──
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=note_prompt_app
MYSQL_PASSWORD=local_app_password
MYSQL_DATABASE=agent_report

# ── One-shot migration account (DML + reviewed schema DDL) ──
MYSQL_MIGRATION_USER=note_prompt_migrator
MYSQL_MIGRATION_PASSWORD=local_migration_password

# ── Authentication ──────────────────────────
JWT_SECRET=your_jwt_secret_at_least_32_chars
PROVIDER_KEY_ENCRYPTION_SECRET=an_independent_encryption_secret
VERIFICATION_CODE_SECRET=an_independent_verification_hmac_secret
NEXTAUTH_URL=http://localhost:3000
ENABLE_CONTRIBUTION_UPGRADES=false
PRO_AI_MONTHLY_LIMIT=100

# ── Redis (recommended locally, required in production) ──
# REDIS_URL=redis://localhost:6379/0
RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true

# ── AI API Keys (configure at least one) ────
DEEPSEEK_API_KEY=sk-xxx
KIMI_API_KEY=sk-xxx
QWEN_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx.xxx

# ── Email (optional) ────────────────────────
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_password_or_app_token
EMAIL_FROM=your_email@example.com
EMAIL_FROM_NAME=Note Prompt
ENABLE_EMAIL_VERIFICATION=false
```

The application and migration usernames must differ and neither may be `root`. The application account receives only `SELECT`, `INSERT`, `UPDATE`, and `DELETE`; see [DEPLOY.md](./DEPLOY.md) for production grants.

### 4. Apply Versioned Migrations

```bash
npm run db:plan
npm run db:status
npm run db:migrate
npm run db:status
```

`database/migrations/*.cjs` is the only schema source of truth. The server does not perform request-time DDL. Never replace production with a checked-in schema dump; back up first and apply the ordered, checksummed migrations using the dedicated account.

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Docker Deployment

Production is not a one-command `latest` deployment. Follow [DEPLOY.md](./DEPLOY.md) for the required backup, full commit-SHA image build, one-shot migration, readiness, TLS validation, rollback, credential rotation, and cache cleanup workflow.

The Docker Compose stack includes:
- **note-prompt-migrate** — one-shot schema migration using a dedicated DDL account
- **note-prompt-app** — read-only Next.js runtime using a DML-only account
- **nginx** — pinned reverse proxy with TLS termination and readiness dependency

MySQL and Redis are private external dependencies and are deliberately not exposed or bootstrapped by this Compose file.

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
│   ├── migrations/             # Ordered, checksummed CJS migrations
│   ├── schema-requirements.json# Runtime schema contract
│   └── README.md               # Migration lifecycle and recovery rules
├── scripts/
│   └── mysql-migrate.cjs       # plan / status / up migration CLI
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


> 📌 *Screenshots coming soon — visit [noteprompt.cn](https://noteprompt.cn) for the live experience.*

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with ❤️ using Next.js, TypeScript, and Tailwind CSS**

[⬆ Back to Top](#-noteprompt)

</div>
