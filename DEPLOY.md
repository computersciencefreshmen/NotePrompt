# Note Prompt 安全部署指南

本文档描述当前仓库唯一受支持的生产部署方式。历史部署记录只能作为排障线索，不能证明当前容器运行的是当前 Git 代码。

## 1. 部署约束

- 应用镜像必须以 Git commit SHA 标记，禁止使用 `latest`。
- Node 24 LTS 与 Nginx 1.30 stable 基础镜像均锁定到 manifest digest；升级基础镜像需要单独审查。
- `.env*`、个人 provider 配置、证书、备份和 `_scripts` 不进入 Docker 构建上下文。
- 秘密只在容器启动时从宿主机的受限文件或秘密管理器注入。
- 应用不得使用 MySQL `root`；3306 和 6379 不得暴露到公网。
- `/api/health` 是数据库 readiness；旧 `/api/v1/health-check` 与它完全相同，不再是固定成功的假健康检查。
- Nginx 只有在应用 readiness 通过后才启动。

当前仍有少量运行时建表逻辑，因此应用专用 MySQL 账号暂时需要目标 schema 内的 `CREATE/ALTER/INDEX/REFERENCES`。完成正式迁移收口后，应撤销这些 DDL 权限，仅保留 DML。

## 2. 主机与网络准备

生产机需要 Docker Engine 和 Docker Compose v2。防火墙/安全组只开放：

| 端口 | 来源 | 用途 |
|---|---|---|
| 80 | 公网 | HTTP 跳转与 ACME challenge |
| 443 | 公网 | HTTPS |
| 22 | 固定运维 IP | SSH |

确认 MySQL/Redis 端口未公开：

```bash
sudo firewall-cmd --permanent --remove-port=3306/tcp || true
sudo firewall-cmd --permanent --remove-port=6379/tcp || true
sudo firewall-cmd --reload
```

Compose 连接既有 MySQL Docker 网络，默认名称为 `mysql8_default`：

```bash
docker network inspect mysql8_default >/dev/null
```

如网络名称不同，在运行时配置中设置 `MYSQL_NETWORK`。Compose 本身不会启动或暴露 MySQL。

## 3. 创建应用专用数据库账号

使用本机管理通道登录 MySQL；管理凭据不得写入项目、Compose 或 shell history。下面只展示权限边界，密码应由秘密管理器生成并注入：

```sql
CREATE USER IF NOT EXISTS 'note_prompt_app'@'%' IDENTIFIED BY '<由秘密管理器生成>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON agent_report.* TO 'note_prompt_app'@'%';
FLUSH PRIVILEGES;
```

MySQL 只应监听宿主机/Docker 私网，安全组不得放行 3306。应用启动命令会在 `MYSQL_USER=root` 时直接拒绝启动。

## 4. 运行时配置与证书

运行时配置放在项目目录之外，并由执行 Compose 的非 root 运维账号独占读取。例如，以该账号登录后执行：

```bash
DEPLOY_USER="$(id -un)"
DEPLOY_GROUP="$(id -gn)"
test "$(id -u)" -ne 0

sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0700 /opt/note-prompt-secrets
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0700 /opt/note-prompt-secrets/tls
sudo install -d -m 0755 /opt/note-prompt-certbot/www
if [ ! -e /opt/note-prompt-secrets/runtime.env ]; then
  sudo install -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0600 /dev/null /opt/note-prompt-secrets/runtime.env
fi
sudo chown "$DEPLOY_USER:$DEPLOY_GROUP" /opt/note-prompt-secrets/runtime.env
sudo chmod 0600 /opt/note-prompt-secrets/runtime.env
sudoedit /opt/note-prompt-secrets/runtime.env
```

模板只列变量名，不要把真实值提交到 Git：

```dotenv
IMAGE_REPOSITORY=note-prompt
COMPOSE_PROJECT_NAME=note-prompt
MYSQL_NETWORK=mysql8_default
MYSQL_HOST=docker_mysql8
MYSQL_PORT=3306
MYSQL_DATABASE=agent_report
MYSQL_USER=note_prompt_app
MYSQL_PASSWORD=<运行时秘密>
JWT_SECRET=<至少32字节的运行时秘密>
PROVIDER_KEY_ENCRYPTION_SECRET=<独立的运行时秘密>

TLS_CERT_DIR=/opt/note-prompt-secrets/tls
CERTBOT_WEBROOT=/opt/note-prompt-certbot/www

# 可选 AI / 邮件配置
DEEPSEEK_API_KEY=
KIMI_API_KEY=
DASHSCOPE_API_KEY=
QWEN_API_KEY=
ZHIPU_API_KEY=
GEMINI_API_KEY=
MINIMAX_API_KEY=
XIAOMI_API_KEY=
XIAOMI_BASE_URL=
ENABLE_EMAIL_VERIFICATION=false
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
EMAIL_FROM_NAME=Note Prompt
```

`TLS_CERT_DIR` 必须是项目外的受限目录，并真实包含：

```text
fullchain.pem
privkey.pem
```

本仓库不包含证书，也不声称证书已续签。首次启动 Nginx 前必须完成真实签发和文件安装。每次 Certbot 实际续签成功后，再原子更新上述两个文件并执行：

首次签发时 Nginx 尚未运行，可在确认 80 端口空闲后使用 Certbot standalone（或改用受控的 DNS-01）：

```bash
sudo certbot certonly --standalone -d noteprompt.cn -d www.noteprompt.cn
sudo install -m 0644 /etc/letsencrypt/live/noteprompt.cn/fullchain.pem \
  /opt/note-prompt-secrets/tls/fullchain.pem
sudo install -m 0600 /etc/letsencrypt/live/noteprompt.cn/privkey.pem \
  /opt/note-prompt-secrets/tls/privkey.pem
```

上述命令只有 Certbot 实际成功后才能执行。后续续签可使用已运行 Nginx 暴露的 webroot challenge；deploy hook 也必须只在续签成功后安装新文件。

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env exec nginx nginx -t
docker compose --env-file /opt/note-prompt-secrets/runtime.env exec nginx nginx -s reload
```

应先运行 `certbot renew --dry-run` 验证续签链路；只有真实成功后才能配置自动 deploy hook。

## 5. 以 commit SHA 构建不可变镜像

部署目录示例为 `/opt/note-prompt`。开始前要求工作树干净，并备份数据库：

```bash
cd /opt/note-prompt
git fetch --all --tags --prune
git pull --ff-only
test -z "$(git status --porcelain)"

export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
export IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-note-prompt}"
export COMPOSE_PROJECT_NAME="note-prompt"
test -n "$IMAGE_TAG"
```

先做静默配置校验；不要运行会把插值后秘密打印到日志的 `docker compose config`：

```bash
docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  config --quiet
```

显式构建并标记当前 commit。构建上下文不含运行时秘密：

```bash
docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  build --pull note-prompt-app
```

核对镜像标签与 OCI revision：

```bash
docker image inspect "${IMAGE_REPOSITORY:-note-prompt}:${IMAGE_TAG}" \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

输出必须与 `$IMAGE_TAG` 完全一致。不要使用 `docker build -t note-prompt:latest`，也不要仅执行 `git pull && docker compose up`。

## 6. 启动与验证

启动阶段禁止隐式重建，确保运行的就是刚核对过的镜像：

```bash
docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up -d --no-build --wait --wait-timeout 180 note-prompt-app nginx
```

验证容器、版本、readiness 与安全头：

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env ps

curl -fsS --max-time 15 http://127.0.0.1/health
curl -fsS --max-time 15 https://noteprompt.cn/api/health
curl -fsS --max-time 15 https://noteprompt.cn/api/v1/health-check
curl -fsSI --max-time 15 https://noteprompt.cn/

APP_CONTAINER_ID="$(docker compose --env-file /opt/note-prompt-secrets/runtime.env ps -q note-prompt-app)"
test -n "$APP_CONTAINER_ID"
docker inspect "$APP_CONTAINER_ID" \
  --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

两个 API 健康地址应返回相同的 `status: ready`、`checks.database: up` 和当前 `version`。数据库不可用时必须返回 HTTP 503，Compose 会将应用标记为 unhealthy，Nginx 不应把它当成可用版本。

禁止用 `docker exec ... env` 排障，因为它会把全部运行时秘密写入终端或日志。只检查非敏感单项配置，或直接使用 readiness。

## 7. Nginx 与代理信任

当前 Nginx 是公网边缘代理，会用 `$remote_addr` 覆盖客户端提交的 `X-Forwarded-For`，应用不会信任伪造的首段 IP。不要改回 `$proxy_add_x_forwarded_for`。

如果未来在 Nginx 前新增阿里云 SLB/CDN，只能为供应商公布且已核对的精确 CIDR 配置 `set_real_ip_from`，再启用 `real_ip_header`。不得使用 `0.0.0.0/0` 作为可信代理。

AI 路由关闭 Nginx 响应缓冲，连接读写超时为 190 秒，略长于浏览器 180 秒超时。普通 API 仍使用更短的 90 秒限制。

部署后在真实 TLS 文件存在的容器中检查 Nginx：

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env exec nginx nginx -t
```

## 8. 回滚

代码回滚不等于数据库回滚。涉及 schema 变化前必须备份并确认向后兼容。

如果目标 SHA 的镜像仍在本机，只切换不可变标签，不修改工作树：

```bash
cd /opt/note-prompt
export IMAGE_TAG=<已验证的旧commit短SHA>

docker image inspect "${IMAGE_REPOSITORY:-note-prompt}:${IMAGE_TAG}" >/dev/null
docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up -d --no-build --wait --wait-timeout 180 note-prompt-app nginx

curl -fsS --max-time 15 http://127.0.0.1/health
```

如果本机没有该镜像，使用临时 Git worktree 构建旧 SHA，避免 `git reset --hard` 破坏当前部署目录：

```bash
export TARGET_SHA=<完整旧commit SHA>
git worktree add "/tmp/note-prompt-${TARGET_SHA}" "${TARGET_SHA}"
cd "/tmp/note-prompt-${TARGET_SHA}"
export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"

docker compose --env-file /opt/note-prompt-secrets/runtime.env build --pull note-prompt-app
docker compose --env-file /opt/note-prompt-secrets/runtime.env up -d --no-build --wait --wait-timeout 180 note-prompt-app nginx
```

回滚完成后再次核对镜像 revision 与两个 readiness URL。数据库恢复必须走独立、已演练的恢复流程，不能由 Compose 自动执行。

## 9. 常见故障

### 应用 unhealthy

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env ps
docker compose --env-file /opt/note-prompt-secrets/runtime.env logs --tail 200 note-prompt-app
curl -i --max-time 15 http://127.0.0.1/health
```

HTTP 503 表示应用进程存活但数据库 readiness 失败。检查 MySQL 容器、外部网络连接和专用用户权限，不要切换为 root 规避错误。

### Nginx 未启动

```bash
test -s /opt/note-prompt-secrets/tls/fullchain.pem
test -s /opt/note-prompt-secrets/tls/privkey.pem
docker compose --env-file /opt/note-prompt-secrets/runtime.env logs --tail 200 nginx
```

不要生成伪证书绕过启动；完成真实签发或恢复最近一份仍有效且受控的证书。

### 当前网站不是当前代码

比较 Git SHA、镜像标签、OCI revision 与健康响应中的 `version`：

```bash
git rev-parse --short=12 HEAD
APP_CONTAINER_ID="$(docker compose --env-file /opt/note-prompt-secrets/runtime.env ps -q note-prompt-app)"
test -n "$APP_CONTAINER_ID"
docker inspect "$APP_CONTAINER_ID" \
  --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
curl -fsS https://noteprompt.cn/api/health
```

四处版本必须一致；否则停止发布并重新按第 5、6 节构建部署。
