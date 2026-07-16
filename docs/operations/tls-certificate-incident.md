# noteprompt.cn TLS 与入口不可用事故手册

最后更新：2026-07-16（Asia/Shanghai）

## 1. 结论与证据边界

这次故障至少包含两层现象，不能只用“云服务器没欠费、实例在运行”来排除：

1. 用户截图明确显示 Chrome `NET::ERR_CERT_DATE_INVALID`。这说明浏览器曾从 443 端口收到一个在当前时间下无效的证书；常见原因是证书已过期、尚未生效，或客户端/服务器时钟明显错误。
2. 2026-07-16 的外部探测中，`noteprompt.cn` 解析到 `8.138.176.174`，主机可 Ping，但 TCP 80、443 均无法建立连接。ECS 实例“运行中”只证明虚拟机开机，不证明安全组、宿主机防火墙、Docker 容器、业务依赖和 Nginx 监听均正常。
3. 仓库检查确认了一个高概率的长期失效点：Certbot 更新 `/etc/letsencrypt/live/noteprompt.cn`，而 Docker Nginx 读取 `/opt/note-prompt-secrets/tls` 中的复制件。旧部署流程只有手工复制示例，没有真正安装续签成功后的 deploy hook，因此 Certbot 即使续签成功，Nginx 也可能继续提供旧证书。
4. 旧架构把公网 80 端口放在业务 Nginx 上，而业务 Nginx 要等待迁移、应用、MySQL 和 Redis 全部健康后才启动。任一上游故障都会同时拿走 HTTP-01 challenge 入口，使自动续签更脆弱。

当前无法从公网读取线上证书，因此不能负责任地声称具体过期时间，也不能仅凭仓库断定服务器内是“Certbot 未续签”还是“已续签但复制件陈旧”。必须执行下面的服务器侧只读检查来区分。

## 2. 本次仓库修正

- `compose.acme.yml` 提供独立的 80 端口边缘容器，只服务 ACME challenge、健康检查和固定 HTTPS 跳转，不依赖应用、数据库或 Redis。
- 主 `docker-compose.yml` 的业务 Nginx 只占用 443，避免与独立 ACME 边缘冲突。
- `scripts/certbot-deploy-hook.sh` 只接受覆盖 `noteprompt.cn` 与 `www.noteprompt.cn` 的证书；安装前校验证书有效期、SAN 和私钥公钥匹配，安装后运行 `nginx -t` 并发送 HUP reload。Nginx 拒绝新文件时会恢复上一份证书。
- `deploy.sh` 安装 deploy hook，并启用系统自带 Certbot timer；系统没有 timer 时安装仓库自带的 systemd timer。
- `scripts/deployment-diagnose.sh` 对比 Certbot 源证书、Docker 复制件和 443 实际提供的证书，同时检查系统时钟、续签方式和 timer。

## 3. 先做只读诊断

通过阿里云 ECS Workbench、VNC 或已有 SSH 通道登录实例。不要把 `runtime.env`、容器环境变量、数据库密码或私钥内容粘贴到聊天中。

```bash
cd /opt/note-prompt
bash scripts/deployment-diagnose.sh
```

重点判断：

| 输出 | 解释 | 下一步 |
|---|---|---|
| `notAfter` 已早于当前 UTC | 证书确已过期 | 启动独立 ACME 边缘并重新签发 |
| Certbot 源证书有效，但出现 `STALE COPY` | 续签成功、Docker 复制件未更新 | 执行 deploy hook，再 reload |
| 复制件有效，但 443 实际证书仍旧 | Nginx 未 reload 或流量落到另一台入口 | reload，并核对 DNS、SLB/CDN/EIP |
| 80/443 无监听 | 容器未启动、端口冲突或宿主机策略问题 | 先看 `docker ps -a`、`ss -lntp`、firewalld |
| 本机监听正常但公网不通 | 阿里云安全组、EIP/NAT 或上游网络策略问题 | 检查安全组入方向 TCP 80/443 |
| `NTPSynchronized=no` 或 UTC 时间错误 | 时钟可导致证书被判定未生效/过期 | 修复 NTP 后重新判断证书 |
| `authenticator=standalone` 且 80 已被占用 | 后续续签会因无法绑定 80 失败 | 改为 webroot |

若只需要单独核对时钟和证书，可执行：

```bash
date -u
timedatectl status
sudo certbot certificates
sudo openssl x509 \
  -in /etc/letsencrypt/live/noteprompt.cn/fullchain.pem \
  -noout -subject -issuer -dates -ext subjectAltName
sudo openssl x509 \
  -in /opt/note-prompt-secrets/tls/fullchain.pem \
  -noout -subject -issuer -dates -ext subjectAltName
```

## 4. 恢复步骤

### 4.1 修正时钟和公网规则

如果时钟异常：

```bash
sudo timedatectl set-ntp true
timedatectl status
date -u
```

在阿里云 ECS 安全组中确认入方向只按需要放行：

- TCP 80：公网，用于 HTTP 跳转和 ACME HTTP-01；
- TCP 443：公网，用于 HTTPS；
- TCP 22：仅固定运维来源；
- 不得向公网开放 3306、6379。

同时确认没有更高优先级的拒绝规则。安全组正确后，宿主机 firewalld 也必须允许 `http`、`https`。

### 4.2 启动与业务解耦的 ACME 入口

先更新到包含本手册和 `compose.acme.yml` 的已审核版本。若旧业务 Nginx 仍占用宿主机 80，先在变更窗口停止该容器；不要停止整台 ECS，也不要删除容器或卷。

```bash
cd /opt/note-prompt
sudo install -d -m 0755 /opt/note-prompt-certbot/www/.well-known/acme-challenge
docker compose \
  -f compose.acme.yml \
  --env-file /opt/note-prompt-secrets/runtime.env \
  up -d --wait

curl -fsS http://127.0.0.1/health
```

验证 challenge 路径确实来自挂载目录：

```bash
CHALLENGE_NAME="health-$(date +%s)"
printf 'acme-ready\n' | sudo tee \
  "/opt/note-prompt-certbot/www/.well-known/acme-challenge/${CHALLENGE_NAME}" >/dev/null
curl -fsS -H 'Host: noteprompt.cn' \
  "http://127.0.0.1/.well-known/acme-challenge/${CHALLENGE_NAME}"
sudo unlink "/opt/note-prompt-certbot/www/.well-known/acme-challenge/${CHALLENGE_NAME}"
```

本机验证通过后，还要从外部网络访问同一路径；否则 Let’s Encrypt 仍可能被安全组、DNS 或 CDN 挡住。

### 4.3 安装续签发布钩子与调度

重新运行最新 `deploy.sh` 会完成安装。若不希望重复宿主机 bootstrap，可只安装相关文件：

```bash
cd /opt/note-prompt
DEPLOY_GROUP="$(id -gn)"
sudo install -d -o root -g "${DEPLOY_GROUP}" -m 0750 /opt/note-prompt-secrets
sudo install -d -o root -g root -m 0750 /opt/note-prompt-secrets/tls
sudo install -d -o root -g root -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo install -o root -g root -m 0750 scripts/certbot-deploy-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/note-prompt
```

确认系统至少有一个自动调度器：

```bash
systemctl list-timers --all | grep -i certbot
```

若系统包没有 `certbot.timer` 或 `certbot-renew.timer`，安装仓库自带 timer：

```bash
sudo install -o root -g root -m 0644 \
  ops/systemd/note-prompt-certbot-renew.service \
  /etc/systemd/system/note-prompt-certbot-renew.service
sudo install -o root -g root -m 0644 \
  ops/systemd/note-prompt-certbot-renew.timer \
  /etc/systemd/system/note-prompt-certbot-renew.timer
sudo systemctl daemon-reload
sudo systemctl enable --now note-prompt-certbot-renew.timer
```

### 4.4 重新签发并固定为 webroot 续签

独立 80 入口和外网 challenge 均通过后执行：

```bash
sudo certbot certonly \
  --cert-name noteprompt.cn \
  --webroot --webroot-path /opt/note-prompt-certbot/www \
  -d noteprompt.cn -d www.noteprompt.cn \
  --deploy-hook /etc/letsencrypt/renewal-hooks/deploy/note-prompt
```

Certbot 2.3.0 及以上可显式把旧的 standalone 配置改为 webroot，并先用 staging 测试后保存：

```bash
sudo certbot reconfigure \
  --cert-name noteprompt.cn \
  --webroot --webroot-path /opt/note-prompt-certbot/www
sudo certbot renew --cert-name noteprompt.cn --dry-run
```

不要日常使用 `--force-renewal`；反复强制签发会触发 CA 频率限制。旧版 Certbot 不支持 `reconfigure` 时，按 Certbot 官方旧版流程先 dry-run，再仅执行一次带新 webroot 参数的真实续签以保存配置。

### 4.5 启动业务入口并验收

按 `DEPLOY.md` 的 commit-SHA 发布流程恢复迁移、应用和业务 Nginx。新架构中独立 ACME 容器继续占用 80，业务 Nginx 只占用 443，两者应同时运行。

```bash
sudo openssl x509 \
  -in /opt/note-prompt-secrets/tls/fullchain.pem \
  -noout -checkend 604800 -subject -issuer -dates -ext subjectAltName

openssl s_client -connect noteprompt.cn:443 -servername noteprompt.cn </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName

curl -fsS --max-time 15 http://noteprompt.cn/.well-known/acme-challenge/nonexistent \
  -o /dev/null -w '%{http_code}\n'
curl -fsS --max-time 15 https://noteprompt.cn/api/live
APP_CONTAINER_IDS="$(docker ps --filter label=com.docker.compose.service=note-prompt-app --format '{{.ID}}')"
test "$(printf '%s\n' "$APP_CONTAINER_IDS" | sed '/^$/d' | wc -l)" -eq 1
APP_CONTAINER_ID="$APP_CONTAINER_IDS"
docker exec "$APP_CONTAINER_ID" \
  node -e "fetch('http://127.0.0.1:3000/api/health',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok||b.status!=='ready')process.exitCode=1})"
test "$(curl -sS -o /dev/null -w '%{http_code}' https://noteprompt.cn/api/health)" = "404"
```

最后一组验收标准：

- 浏览器不再出现证书日期错误；
- 公网 80 能返回跳转，ACME 路径不会被错误跳转；
- 公网 443 提供的证书覆盖两个域名，且至少 7 天后仍有效；
- Certbot 源证书、Docker 复制件和公网实际证书指纹一致；
- `certbot renew --dry-run` 成功；
- timer 已启用且下次运行时间可见；
- 公网 `/api/live` 返回 alive，公网 `/api/health` 返回 404；应用容器内 `/api/health` 返回 ready，并报告预期 commit SHA。

## 5. 若证书修好但 443 仍无监听

这说明证书不是当前唯一故障。主 Compose 明确要求迁移成功、应用数据库 readiness 成功、Redis `PING` 成功且应用版本匹配后，业务 Nginx 才启动。依次检查：

```bash
cd /opt/note-prompt
bash scripts/deployment-diagnose.sh
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker network inspect mysql8_default --format '{{.Name}}'
```

只有在受控终端内才查看相关容器的最后少量日志；日志不得复制运行时环境和密钥。迁移失败时不要改用 MySQL root 绕过，Redis 失败时不要把 6379 开到公网，也不要启用生产内存限流降级。

## 6. 预防与监控

- 每 12 小时执行 `certbot renew --quiet`，仅在真实续签成功后运行 deploy hook。
- 对公网 443 证书剩余天数设置 30/14/7 天告警；监控必须检查“实际提供的证书”，不能只检查磁盘文件。
- 公网同时监控 TCP 80、TCP 443、ACME challenge 和 `/api/live`；在受信任内网单独监控 `/api/health` 及其 commit version。不得为了公网监控重新开放 readiness。
- 每月执行一次 `certbot renew --dry-run`，变更 DNS、安全组、CDN、Nginx 或证书目录后立即补测。
- 保留续签、hook 校验、Nginx reload 与验收时间，不记录私钥、密码或完整运行时环境。

## 7. 回滚

deploy hook 在 `nginx -t` 失败时自动恢复上一份证书。若新证书本身需要人工回退，只能恢复一份仍有效、私钥匹配、来源受控且覆盖两个域名的证书，再运行 `nginx -t` 和 reload；不得生成自签名证书冒充恢复。独立 ACME 边缘应继续运行，以免回滚再次破坏后续签发入口。

## 8. 2026-07-16 实际事故记录

### 8.1 现场证据

服务器侧检查排除了“ECS 时钟错误”和“Certbot 没有续签”：

- 2026-07-16 05:21 UTC，服务器时钟正确；
- `certbot-renew.timer` 已启用并正常调度；
- Certbot 源证书在 2026-07-06 签发，覆盖 `noteprompt.cn`、`www.noteprompt.cn`，有效至 2026-10-04；
- Nginx 实际提供的仍是 2026-03-02 签发、2026-05-31 已过期的旧证书；
- 旧 Compose 把 `/opt/note-prompt/nginx/ssl` 挂载到 `/etc/nginx/ssl`，并未使用新部署规范中的 `/opt/note-prompt-secrets/tls`；
- Certbot 源证书成功更新后，没有 deploy hook 把它同步到旧挂载目录并 reload Nginx；
- 业务应用容器从 2026-05-28 起处于 `Exited (0)`，重启策略为 `no`，镜像仍是可变标签 `note-prompt:latest`；
- Nginx 一直运行，因此 HTTP 返回 301，但 HTTPS 转发到已停止的应用时返回 502；
- MySQL 3306 被发布到 `0.0.0.0`/`::`，属于必须单独处置的公网暴露风险。

根因因此确定为两个独立但同时存在的问题：

1. **证书发布链断裂**：Certbot 续签成功，但旧 Nginx 证书复制件没有更新和 reload；
2. **业务进程没有自愈**：应用被正常停止后，由于 `restart=no`，六周内没有自动恢复。

### 8.2 恢复动作与结果

2026-07-16 05:28 UTC 执行了受控恢复：

1. 启动原有应用容器，不重建镜像、不修改数据库；
2. 校验 Certbot 源证书至少七天有效、覆盖两个域名，并验证证书公钥与私钥公钥一致；
3. 将旧证书备份到 `/root/note-prompt-tls-backup-20260716T052818Z`；
4. 把新证书成对暂存并安装到旧 Nginx 的真实挂载目录；
5. `nginx -t` 成功，仅报告旧版 `listen ... http2` 指令弃用警告；
6. 向 Nginx 发送 HUP，重新加载证书；
7. 本机 SNI 验证确认 Nginx 已提供有效至 2026-10-04 的新证书；
8. 应用容器保持 `running`，本机 HTTPS 从 502 恢复为 HTTP 200。

这是**事故恢复**，不是新版本发布。恢复后的实例仍运行旧 `latest` 镜像和旧 Compose。必须在单独变更窗口完成本仓库的 commit-SHA 部署、迁移检查、独立 ACME 边缘、deploy hook、`unless-stopped` 重启策略和公网验收，不能把本次手工恢复当作长期完成状态。

### 8.3 待关闭事项

- 从用户浏览器或独立公网探针确认 HTTPS 200 与新证书；仅本机回环验证不能证明阿里云安全组、EIP、CDN/WAF 和公网路由均正常；
- 部署 `5918a00` 或其后续已审核 commit，迁移到本文档描述的独立 ACME/TLS 架构；
- 完成 `certbot renew --dry-run`，并验证真实续签后 deploy hook 会更新实际提供的证书；
- 用完整 Git SHA 镜像替换 `note-prompt:latest`，将应用重启策略改为 `unless-stopped`；
- 在确认应用通过 Docker/VPC 私网访问 MySQL 后，移除宿主机 3306 公网发布并关闭安全组/防火墙规则；
- 在数据库备份、回滚方案和维护窗口就绪后安装 ECS 安全更新，不在网站恢复过程中直接执行系统级升级。
