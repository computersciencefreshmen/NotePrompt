# Note Prompt 安全部署指南

本文档描述当前仓库唯一受支持的生产部署方式。历史部署记录只能作为排障线索，不能证明当前容器运行的是当前 Git 代码。

## 1. 部署约束

- 应用镜像必须以 Git commit SHA 标记，禁止使用 `latest`。
- Node 24 LTS 与 Nginx 1.30 stable 基础镜像均锁定到 manifest digest；升级基础镜像需要单独审查。
- `.env*`、个人 provider 配置、证书、备份和 `_scripts` 不进入 Docker 构建上下文。
- 秘密只在容器启动时从宿主机的受限文件或秘密管理器注入。
- 应用不得使用 MySQL `root`；3306 和 6379 不得暴露到公网。
- 长期运行的应用账号只有 DML 权限；DDL 只由一次性迁移账号执行，两个账号不得相同。
- 生产环境必须使用私网 Redis，且明确禁用内存限流降级。
- `/api/health` 是数据库 readiness；Compose healthcheck 在此基础上还核对 Redis 与 commit version。旧 `/api/v1/health-check` 与数据库检查完全相同，不再是固定成功的假健康检查。
- Nginx 只有在应用 readiness 通过后才启动。

`database/migrations/*.cjs` 是唯一 schema 事实来源。请求处理期间不得建表、改列或回填；生产应用账号不需要且不得持有 DDL 权限。

## 2. 主机与网络准备

生产机需要 Docker Engine 和 Docker Compose v2。防火墙/安全组只开放：

| 端口 | 来源 | 用途 |
|---|---|---|
| 80 | 公网 | HTTP 跳转与 ACME challenge |
| 443 | 公网 | HTTPS |
| 22 | 固定运维 IP | SSH |

### 80/443 均无监听时的只读排障

如果域名可解析、主机可 Ping，但 **80 和 443 均无监听**，先不要反复重启或输出容器环境变量。仓库提供了不会读取运行时密钥、不会输出 Compose 展开配置、也不会抓取容器日志的只读诊断脚本：

```bash
cd /opt/note-prompt
bash scripts/deployment-diagnose.sh
```

按输出依次确认：宿主机监听端口、容器状态、`mysql8_default` 网络、firewalld 活动 zone、TLS 文件存在性与证书有效期。公网仍不可达时，在阿里云 ECS 控制台核对实例安全组入方向是否允许 TCP 80、443；Ping 成功只代表 ICMP 可达，不代表这两个 TCP 端口已放行。

浏览器出现 `NET::ERR_CERT_DATE_INVALID`，或 Certbot 源文件、Docker 证书复制件和公网实际证书不一致时，直接按 [TLS 与入口不可用事故手册](./docs/operations/tls-certificate-incident.md) 处理。ECS 实例“运行中”不代表 Nginx、证书和业务依赖健康。

不要使用 `docker exec ... env`、`docker inspect ...Config.Env`、不带 `--quiet` 的 `docker compose config`，也不要把 `/opt/note-prompt-secrets/runtime.env` 内容贴入工单或聊天。

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

如网络名称不同，在运行时配置中设置 `MYSQL_NETWORK`。Compose 本身不会启动或暴露 MySQL/Redis。`REDIS_URL` 必须指向同一 Docker 私网或 VPC 私网内可达的 Redis；禁止使用公网地址，也不要为 Redis 添加宿主机公网端口映射。

## 3. 分离应用与迁移数据库账号

使用本机管理通道登录 MySQL；管理凭据不得写入项目、Compose 或 shell history。下面只展示权限边界，密码应由秘密管理器生成并注入：

```sql
CREATE USER IF NOT EXISTS 'note_prompt_app'@'%' IDENTIFIED BY '<由秘密管理器生成>';
GRANT SELECT, INSERT, UPDATE, DELETE
  ON agent_report.* TO 'note_prompt_app'@'%';

CREATE USER IF NOT EXISTS 'note_prompt_migrator'@'%' IDENTIFIED BY '<另一份独立秘密>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, CREATE TEMPORARY TABLES, ALTER, INDEX, REFERENCES
  ON agent_report.* TO 'note_prompt_migrator'@'%';

SHOW GRANTS FOR 'note_prompt_app'@'%';
SHOW GRANTS FOR 'note_prompt_migrator'@'%';
FLUSH PRIVILEGES;
```

`'%'` 只适用于 MySQL 已被 Docker/VPC 防火墙严格隔离的场景；能够固定容器网段或来源主机时，应把它收紧为实际来源。迁移 `007` 使用会话级临时表，因此需要 schema 级 `CREATE TEMPORARY TABLES`；它不要求普通表 `DROP` 权限。不要给迁移账号 `GRANT OPTION`、`FILE`、`PROCESS`、`SUPER` 或全局权限。若未来单个已审查迁移确实需要更高权限，应临时授予并在迁移成功后撤销。

MySQL 只应监听宿主机/Docker 私网，安全组不得放行 3306。Compose 会拒绝 `MYSQL_USER=root`、`MYSQL_MIGRATION_USER=root`，也会拒绝两个用户名相同。

## 4. 运行时配置与证书

运行时配置放在项目目录之外，并由执行 Compose 的非 root 运维账号独占读取。例如，以该账号登录后执行：

```bash
DEPLOY_USER="$(id -un)"
DEPLOY_GROUP="$(id -gn)"
test "$(id -u)" -ne 0

sudo install -d -o root -g "$DEPLOY_GROUP" -m 0750 /opt/note-prompt-secrets
sudo install -d -o root -g root -m 0750 /opt/note-prompt-secrets/tls
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
MYSQL_MIGRATION_USER=note_prompt_migrator
MYSQL_MIGRATION_PASSWORD=<独立迁移秘密>

# 必须是私网 Redis；生产不得设置 RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true
REDIS_URL=redis://:<Redis密码>@redis.internal:6379/0
RATE_LIMIT_KEY_PREFIX=note-prompt-prod
AI_GLOBAL_DAILY_LIMIT=1000

JWT_SECRET=<至少32字节的运行时秘密>
PROVIDER_KEY_ENCRYPTION_SECRET=<独立的运行时秘密>
VERIFICATION_CODE_SECRET=<独立的验证码HMAC秘密>
JWT_EXPIRES_IN=2h
NEXTAUTH_URL=https://noteprompt.cn

# 默认关闭自助贡献升级；开启前需完成反滥用与运营审查。
ENABLE_CONTRIBUTION_UPGRADES=false
# 仅接受 1..10000；无效值回退为 100。只有管理员无限额。
PRO_AI_MONTHLY_LIMIT=100

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

运行时文件中不要写 `IMAGE_TAG` 或 `MIGRATION_IMAGE_TAG`：每次发布都必须从已签出的 Git commit 重新导出，避免陈旧标签把旧镜像伪装成当前版本。Redis URI 如果含密码，同样属于秘密；只允许部署账号读取。生产 Compose 固定写入 `RATE_LIMIT_ALLOW_MEMORY_FALLBACK=false` 和 `TRUST_PROXY=true`，无需在文件中覆盖。

`TLS_CERT_DIR` 必须是项目外、root 拥有且不可被组或其他用户写入的受限目录。这样 root 身份运行的 Certbot hook 不会在可被低权限账号替换的目录中操作证书。该目录真实包含：

```text
fullchain.pem
privkey.pem
```

本仓库不包含证书，也不声称证书已续签。首次启动业务 Nginx 前必须完成真实签发和文件安装；后续只允许 deploy hook 在 Certbot 实际续签成功后更新上述文件并 reload。

公网 80 由独立的 `compose.acme.yml` 提供，只服务 HTTP-01 challenge、健康检查和固定 HTTPS 跳转。它不依赖迁移、应用、MySQL 或 Redis；业务 Nginx 只占用 443。首次签发和日常发布前都应确保该边缘容器在运行：

```bash
cd /opt/note-prompt
docker compose \
  -f compose.acme.yml \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up -d --wait
curl -fsS http://127.0.0.1/health
```

安装 Certbot deploy hook。该 hook 只处理覆盖 `noteprompt.cn` 和 `www.noteprompt.cn` 的证书；复制前校验证书剩余时间、SAN 和私钥匹配，复制后用 `nginx -t` 验证并 reload。业务 Nginx 尚未运行时，新证书仍会安全写入 bind mount，并在容器下次启动时加载：

```bash
sudo install -d -o root -g root -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo install -o root -g root -m 0750 scripts/certbot-deploy-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/note-prompt
```

使用独立 webroot 首次签发或修复已过期证书。不要让日常续签继续使用会与 80 端口冲突的 standalone：

```bash
sudo certbot certonly \
  --cert-name noteprompt.cn \
  --webroot --webroot-path /opt/note-prompt-certbot/www \
  -d noteprompt.cn -d www.noteprompt.cn \
  --deploy-hook /etc/letsencrypt/renewal-hooks/deploy/note-prompt

# Certbot >= 2.3.0：测试成功后持久化 webroot 续签配置。
sudo certbot reconfigure \
  --cert-name noteprompt.cn \
  --webroot --webroot-path /opt/note-prompt-certbot/www
sudo certbot renew --cert-name noteprompt.cn --dry-run
```

`deploy.sh` 会启用系统包自带的 Certbot timer；系统没有 timer 时会安装 `ops/systemd` 中的仓库自带 timer。部署后必须看到至少一个已启用的调度器：

```bash
systemctl list-timers --all | grep -i certbot
```

不要把 `--force-renewal` 放进定时任务。续签是否成功和 deploy hook 是否成功都需要监控；Certbot 源文件有效并不等于公网 Nginx 已加载新证书。

证书安装或续签后必须核对私钥与证书公钥匹配、证书尚未过期且覆盖两个域名，再执行 `nginx -t` 与 reload。最后从公网验证实际提供的证书，而不是只检查宿主机文件：

```bash
openssl x509 -in /opt/note-prompt-secrets/tls/fullchain.pem -noout -checkend 604800
openssl x509 -in /opt/note-prompt-secrets/tls/fullchain.pem -pubkey -noout | sha256sum
openssl pkey -in /opt/note-prompt-secrets/tls/privkey.pem -pubout | sha256sum

openssl s_client -connect noteprompt.cn:443 -servername noteprompt.cn </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
curl --fail --show-error --silent --tlsv1.2 https://noteprompt.cn/api/health
```

前两条公钥摘要必须相同，`-checkend 604800` 必须成功。当前仓库无法证明线上证书有效；这些检查必须在真实部署主机和公网链路执行并保存变更记录。

## 5. 以 commit SHA 构建不可变镜像

部署目录示例为 `/opt/note-prompt`。先进入变更窗口，记录当前运行镜像与完整 SHA，并停止写流量。数据库备份必须在项目目录外、权限为 `0600`，且通过完整性检查；仅有“命令成功”而没有备份文件和校验和不算完成。

下面示例假设已用 `mysql_config_editor` 交互式创建受限的 `note_prompt_backup` login-path，因而密码不会出现在命令行或 shell history：

```bash
umask 077
sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0700 /opt/note-prompt-backups
BACKUP_FILE="/opt/note-prompt-backups/agent_report-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

set -o pipefail
mysqldump --login-path=note_prompt_backup \
  --single-transaction --quick --hex-blob --no-tablespaces --set-gtid-purged=OFF \
  agent_report | gzip -9 >"$BACKUP_FILE"
test -s "$BACKUP_FILE"
gzip -t "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" | tee "${BACKUP_FILE}.sha256"
```

备份账号只需读取/备份所需权限，不得复用应用或迁移账号。发布前应已在隔离实例演练恢复并记录 RPO/RTO；不要把第一次恢复测试留到事故发生后。

然后更新部署 checkout，并要求工作树干净：

```bash
cd /opt/note-prompt
git fetch --all --tags --prune
git pull --ff-only
test -z "$(git status --porcelain)"

export IMAGE_TAG="$(git rev-parse HEAD)"
export MIGRATION_IMAGE_TAG="$IMAGE_TAG"
export IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-note-prompt}"
export COMPOSE_PROJECT_NAME="note-prompt"
test "${#IMAGE_TAG}" -eq 40
test "$MIGRATION_IMAGE_TAG" = "$IMAGE_TAG"
test "$(git rev-parse HEAD)" = "$IMAGE_TAG"
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

输出必须与完整 `$IMAGE_TAG` 完全一致。不要使用 `docker build -t note-prompt:latest`，也不要仅执行 `git pull && docker compose up`。

镜像内必须具备本地 PDF/OCR 能力，生产解析不得在首个请求时从外网下载语言包：

```bash
docker run --rm --entrypoint sh "${IMAGE_REPOSITORY:-note-prompt}:${IMAGE_TAG}" -ec '
  command -v pdftotext >/dev/null
  command -v tesseract >/dev/null
  tesseract --list-langs | grep -Fx eng >/dev/null
  tesseract --list-langs | grep -Fx chi_sim >/dev/null
'
```

任一检查失败都应阻止发布；不要用运行时联网下载替代镜像内固定能力。

## 6. 启动与验证

迁移必须是显式发布门禁。先查看镜像内的离线计划与当前数据库状态；然后停止旧应用写流量，强制重建并运行一次迁移容器。只有迁移进程返回 0 且随后 `status` 全部为 `applied` 才能启动新版本：

```bash
docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  run --rm --no-deps note-prompt-migrate node scripts/mysql-migrate.cjs plan

docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  run --rm --no-deps note-prompt-migrate node scripts/mysql-migrate.cjs status

docker compose --env-file /opt/note-prompt-secrets/runtime.env stop nginx note-prompt-app

docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up --no-build --no-deps --force-recreate \
  --abort-on-container-exit --exit-code-from note-prompt-migrate \
  note-prompt-migrate

docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  run --rm --no-deps note-prompt-migrate node scripts/mysql-migrate.cjs status
```

如果迁移失败，保持 `nginx` 和应用停止，不要通过改用 `root`、手工删除 `schema_migrations` 记录或启动旧镜像来绕过。MySQL DDL 可能已经隐式提交；保存迁移日志与数据库状态，确认失败迁移是否可安全续跑。现有迁移均按可重入设计，修正明确原因后可再次运行同一命令；无法证明可续跑时，按已演练流程恢复已校验备份。

迁移成功后，启动阶段仍禁止隐式重建：

```bash
docker compose \
  -f compose.acme.yml \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up -d --wait

docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up -d --no-build --wait --wait-timeout 180 note-prompt-app nginx
```

验证容器、版本、readiness 与安全头：

```bash
docker compose -f compose.acme.yml \
  --env-file /opt/note-prompt-secrets/runtime.env ps
docker compose --env-file /opt/note-prompt-secrets/runtime.env ps

curl -fsS --max-time 15 http://127.0.0.1/health
curl -fsS --max-time 15 https://noteprompt.cn/api/health
curl -fsS --max-time 15 https://noteprompt.cn/api/v1/health-check
curl -fsSI --max-time 15 https://noteprompt.cn/

docker compose --env-file /opt/note-prompt-secrets/runtime.env exec -T note-prompt-app \
  node -e "const Redis=require('ioredis');(async()=>{const r=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1});try{await r.connect();if(await r.ping()!=='PONG')throw new Error()}finally{r.disconnect()}})().catch(()=>{console.error('Redis readiness failed');process.exit(1)})"

APP_CONTAINER_ID="$(docker compose --env-file /opt/note-prompt-secrets/runtime.env ps -q note-prompt-app)"
test -n "$APP_CONTAINER_ID"
docker inspect "$APP_CONTAINER_ID" \
  --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

两个 API 健康地址应返回相同的 `status: ready`、`checks.database: up` 和完整当前 commit `version`。应用容器 healthcheck 同时核对这些字段、`APP_VERSION` 和 Redis `PING`，而非只接受任意 HTTP 200。数据库不可用时 API 必须返回 HTTP 503；数据库或 Redis 不可用、版本不符时 Compose 都会把应用标记为 unhealthy，Nginx 初始启动不会把它当成可用版本。生产限流不允许退回进程内存。

禁止用 `docker exec ... env` 排障，因为它会把全部运行时秘密写入终端或日志。只检查非敏感单项配置，或直接使用 readiness。

## 7. Nginx 与代理信任

当前 Nginx 是公网边缘代理，会用 `$remote_addr` 覆盖客户端提交的 `X-Forwarded-For`，应用不会信任伪造的首段 IP。不要改回 `$proxy_add_x_forwarded_for`。

宿主机 80 与 443 分属两个容器：`compose.acme.yml` 的最小化边缘长期占用 80，业务 Compose 的 `nginx` 只占用 443。不要把 80 重新并回依赖应用 readiness 的业务 Nginx，否则应用或数据库故障会再次破坏 ACME 续签入口。

如果未来在 Nginx 前新增阿里云 SLB/CDN，只能为供应商公布且已核对的精确 CIDR 配置 `set_real_ip_from`，再启用 `real_ip_header`。不得使用 `0.0.0.0/0` 作为可信代理。

AI 路由关闭 Nginx 响应缓冲，连接读写超时为 190 秒，略长于浏览器 180 秒超时。普通 API 仍使用更短的 90 秒限制。

部署后在真实 TLS 文件存在的容器中检查 Nginx：

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env exec nginx nginx -t
```

## 8. 回滚

代码回滚不等于数据库回滚。迁移器只前进且没有 `down` 命令；不得删除 `schema_migrations` 记录来伪造回滚。只有在隔离数据库上证明旧应用与当前 schema 向后兼容，才允许只回滚应用镜像。否则必须进入恢复流程，评估恢复备份导致的数据回退，而不是让 Compose 猜测。

发布记录必须保留“当前 schema 对应的迁移镜像完整 SHA”和至少一个已验证的应用回滚镜像。回滚时继续使用当前迁移镜像核对 schema，只切换应用镜像标签，不修改工作树：

```bash
cd /opt/note-prompt
export MIGRATION_IMAGE_TAG=<当前schema对应的迁移镜像完整SHA>
export IMAGE_TAG=<已验证且兼容当前schema的旧应用完整SHA>

test "${#MIGRATION_IMAGE_TAG}" -eq 40
test "${#IMAGE_TAG}" -eq 40
docker image inspect "${IMAGE_REPOSITORY:-note-prompt}:${MIGRATION_IMAGE_TAG}" >/dev/null
docker image inspect "${IMAGE_REPOSITORY:-note-prompt}:${IMAGE_TAG}" >/dev/null
docker image inspect "${IMAGE_REPOSITORY:-note-prompt}:${IMAGE_TAG}" \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  | grep -Fx "$IMAGE_TAG"

docker compose --env-file /opt/note-prompt-secrets/runtime.env \
  run --rm --no-deps note-prompt-migrate node scripts/mysql-migrate.cjs status

docker compose \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up -d --no-build --wait --wait-timeout 180 note-prompt-app nginx

curl -fsS --max-time 15 http://127.0.0.1/health
```

如果本机没有该镜像，只能从受信任镜像仓库按完整 SHA 拉取并再次核对 OCI revision：

```bash
docker pull "${IMAGE_REPOSITORY}:${IMAGE_TAG}"
docker image inspect "${IMAGE_REPOSITORY}:${IMAGE_TAG}" \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  | grep -Fx "$IMAGE_TAG"
```

仓库中缺少目标镜像不是在生产机临时重建的授权；应由受控 CI 从精确 commit 重建并发布，或判定应用回滚受阻。回滚完成后再次核对镜像 revision、Redis 探测与两个 readiness URL。数据库恢复必须走独立、已演练的恢复流程，不能由 Compose 自动执行。

## 9. 常见故障

### 应用 unhealthy

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env ps
docker compose --env-file /opt/note-prompt-secrets/runtime.env logs --tail 200 note-prompt-app
curl -i --max-time 15 http://127.0.0.1/health
```

HTTP 503 表示应用进程存活但数据库 readiness 失败。检查 MySQL 容器、外部网络连接和专用用户权限，不要切换为 root 规避错误。

### 迁移失败

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env ps -a note-prompt-migrate
docker compose --env-file /opt/note-prompt-secrets/runtime.env logs --no-log-prefix note-prompt-migrate
docker compose --env-file /opt/note-prompt-secrets/runtime.env \
  run --rm --no-deps note-prompt-migrate node scripts/mysql-migrate.cjs status
```

校验和变化、未知 migration、版本断层和 advisory lock 获取失败都会 fail closed。不要编辑已经应用的 migration，也不要手工修记录。先判断是并发发布、权限不足、代码/数据库历史不匹配还是可重入迁移的中断，再按第 6 节处理。

### Redis 不可用

生产环境没有内存降级。检查 Redis 私网 DNS/路由、TLS/密码和服务状态；不要临时把 6379 开到公网，也不要设置 `RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true` 绕过。修复后重新执行第 6 节的无秘密 Redis `PING` 探测。

### Nginx 未启动

```bash
test -s /opt/note-prompt-secrets/tls/fullchain.pem
test -s /opt/note-prompt-secrets/tls/privkey.pem
docker compose -f compose.acme.yml \
  --env-file /opt/note-prompt-secrets/runtime.env ps
docker compose --env-file /opt/note-prompt-secrets/runtime.env logs --tail 200 nginx
```

独立 ACME 边缘正常而业务 Nginx 未启动时，继续检查迁移、应用、MySQL、Redis readiness 和 443 证书。不要生成伪证书绕过启动；完成真实签发或恢复最近一份仍有效且受控的证书。

### 当前网站不是当前代码

比较 Git SHA、镜像标签、OCI revision 与健康响应中的 `version`：

```bash
git rev-parse HEAD
APP_CONTAINER_ID="$(docker compose --env-file /opt/note-prompt-secrets/runtime.env ps -q note-prompt-app)"
test -n "$APP_CONTAINER_ID"
docker inspect "$APP_CONTAINER_ID" \
  --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
curl -fsS https://noteprompt.cn/api/health
```

四处版本必须一致；否则停止发布并重新按第 5、6 节构建部署。

## 10. 凭据轮换与 Git 历史清理

本仓库曾跟踪过真实凭据。删除当前文件或新增一次“清理”提交不会使旧值失效；必须先轮换/撤销，再重写历史。处置过程应建立事件记录，但只记录系统、账号、密钥指纹、发现 commit 和轮换时间，不复制秘密值。

### 10.1 先轮换，不等待历史清理

1. 进入维护窗口，限制公网访问并冻结发布；保存数据库备份、当前镜像 ID、Git SHA 和必要审计日志。
2. 立即撤销或轮换所有可能出现过的 SSH root/运维密钥与密码、MySQL 账号、站点管理员密码、SMTP 密码、AI/provider API key 和第三方 token。证书私钥若可能泄露，重新签发并撤销旧证书。
3. 数据库账号优先创建新用户名、复制最小权限、切换部署并验证，再 `DROP USER` 旧账号，避免在运行容器仍使用旧密码时原地失效。应用与迁移账号继续保持分离。
4. 更换 `JWT_SECRET` 会强制全部用户重新登录；应作为计划内安全动作执行。`VERIFICATION_CODE_SECRET` 必须独立轮换并让未使用验证码失效。
5. `PROVIDER_KEY_ENCRYPTION_SECRET` 当前没有双密钥在线轮换工具。如果该密钥或数据库副本可能泄露，应先撤销底层 provider key，再在维护窗口清除/重新录入受影响配置并切换新加密秘密；不要只换加密秘密导致现有密文永久不可读。
6. 用项目目录外的 `runtime.env` 部署新值，完成数据库、Redis、登录、邮件/AI（若启用）和 readiness 验证后，确认旧凭据在各外部系统均已不可用。

### 10.2 受控重写历史

历史重写会改变所有受影响 commit，破坏开放 PR/本地分支，并且不能清理他人的 clone、fork 或 GitHub 缓存。必须由仓库所有者协调停写窗口并明确批准 force push。按照 [GitHub 官方敏感数据清理指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) 执行：

1. 记录所有受影响路径（包含改名/移动前的旧路径）和需替换的秘密模式；秘密替换清单保存在仓库外受限临时文件中。
2. 创建受控的远端镜像备份并限制访问。该备份仍含已泄露值，只用于灾难恢复，不能成为新的共享仓库。
3. 在全新 clone 中使用 `git-filter-repo >= 2.47`。删除整条历史中的秘密文件时，为每个历史路径重复 `--path`：

   ```bash
   git filter-repo --sensitive-data-removal --invert-paths \
     --path deploy-latest.js \
     --path _scripts/reset-admin-pw.js \
     --path _scripts/test-login.js
   ```

   若秘密也出现在仍需保留的文件中，使用仓库外的替换清单：

   ```bash
   git filter-repo --sensitive-data-removal --replace-text /secure/path/secret-replacements.txt
   ```

   上述路径只是已知代表项，不是完整清单；必须以全历史扫描结果为准。
4. 检查 `.git/filter-repo/changed-refs`、所有 branch/tag、已知 commit 与秘密扫描结果；在重写 clone 上完成构建、测试和部署配置验证。任何命中都必须重新开始，不能 force push 半清理历史。
5. `git-filter-repo` 可能移除 `origin` 作为安全保护。仓库所有者临时协调 branch protection 后，先用 `git remote -v` 核对；若缺失，只把已人工核对的精确仓库 URL 重新添加为 `origin`。随后从唯一受控 clone 执行 `git push --force --mirror origin`。这一步不可逆，执行前再次确认停写、远端地址、changed refs 和备份。
6. 所有协作者删除旧 clone 后重新 clone；禁止把旧 branch merge/rebase 回新历史。协调 fork 所有者清理或删除 fork，并联系 GitHub Support 清除仍可访问的 PR 引用和缓存视图。
7. 恢复 branch protection/ruleset，启用 push protection/secret scanning，并在 CI 中阻止秘密模式和 `.env`/运维脚本再次进入历史。

## 11. 泄露镜像、构建缓存与发布包清理

若旧构建上下文可能含 `.env`、provider 配置或硬编码凭据，则旧镜像、registry layer、BuildKit cache 和离线发布包都按泄露源处理。凭据必须先轮换；清缓存不能替代轮换。

先记录当前容器、回滚镜像和所有待删除对象的精确 ID/digest，完成干净历史上的无缓存重建与替换部署，再删除明确命中的旧对象：

```bash
docker compose --env-file /opt/note-prompt-secrets/runtime.env ps -q \
  | xargs -r docker inspect --format '{{.Id}} {{.Config.Image}} {{.Image}}'
docker image ls --no-trunc --filter 'reference=note-prompt:*'
docker system df -v

# 仅填写已核对的受影响 image ID；不要用模糊标签批量删除。
docker image rm <compromised-image-id> [<compromised-image-id> ...]

# 构建缓存可能保留被 .dockerignore 漏掉的秘密层。
docker builder prune --all --force
# 若实际使用了独立 buildx builder，再执行：docker buildx prune --all --force
```

在镜像仓库中还要按 digest 删除受影响 manifest/layer，检查 registry retention 与复制节点，并重新发布从已清理 commit 构建的 commit-SHA 镜像。检查备份目录、CI artifact、对象存储和其他部署主机上的同名包。严禁使用 `docker system prune --volumes`：它可能删除数据库或其他持久卷。常规发布只清理已确认无引用的旧应用镜像，并始终保留当前版本和至少一个已验证回滚版本。
