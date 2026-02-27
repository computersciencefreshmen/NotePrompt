#
# 第一个阶段: 构建
#
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖配置文件。
COPY package.json package-lock.json ./

# 安装所有依赖
RUN npm install

# 复制项目源代码和配置文件。
COPY . .

# 如果你的 next.config.mjs 包含了 output: 'standalone'，
# Next.js 会将所有生产文件（包括 node_modules）移动到 .next/standalone。
# 因此，我们不需要单独复制 node_modules，这能进一步减小镜像大小。
RUN npm run build

#
# 第二个阶段: 运行
#
# 我们使用 Next.js 推荐的 standalone 模式。
# 这里的基础镜像可以使用更轻量级的 `node:18-alpine`，
# 因为 standalone 模式会将所有依赖打包进去。
FROM node:18-alpine AS runner

# 设置工作目录
WORKDIR /app

# 复制 standalone 模式生成的整个目录
# 这将把所有必要的代码、依赖和配置文件一次性复制过来
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/.env.local ./.env.local
COPY --from=builder /app/package.json ./package.json

# 同样，设置非 root 用户以提高安全性
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
RUN chown -R nextjs:nextjs /app

USER nextjs

# 暴露应用运行的端口
EXPOSE 3000

# 启动命令: 使用 Next.js standalone 模式的正确启动命令
CMD ["node", "server.js"]