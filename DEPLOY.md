# Note Prompt 阿里云部署指南

## 服务器信息
| 项目 | 值 |
|------|-----|
| 公网IP | 8.138.176.174 |
| 操作系统 | Alibaba Cloud Linux 3.2104 LTS 64位 |
| CPU | 2核 vCPU |
| 内存 | 2 GiB |
| 带宽 | 3 Mbps |
| 域名 | noteprompt.cn |

---

## 一、域名解析配置

登录阿里云域名控制台 (https://dc.console.aliyun.com)，添加以下DNS记录：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| A | @ | 8.138.176.174 |
| A | www | 8.138.176.174 |

> **重要**：域名需要完成ICP备案才能正常访问。如未备案，请先在阿里云备案系统申请。

---

## 二、服务器环境配置

### 2.1 SSH连接服务器
```bash
ssh root@8.138.176.174
```

### 2.2 安装 Docker
```bash
# 更新系统
yum update -y

# 安装 Docker
yum install -y docker
systemctl start docker
systemctl enable docker

# 验证
docker --version
```

### 2.3 安装 Docker Compose
```bash
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 验证
docker-compose --version
```

### 2.4 安装 MySQL
```bash
yum install -y mysql-server
systemctl start mysqld
systemctl enable mysqld

# 安全初始化（设置root密码）
mysql_secure_installation
```

### 2.5 初始化数据库
```bash
# 登录MySQL
mysql -u root -p

# 创建数据库并导入表结构
CREATE DATABASE IF NOT EXISTS agent_report DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agent_report;
SOURCE /opt/note-prompt/database/mysql-schema-new.sql;

# 退出
EXIT;
```

---

## 三、部署项目

### 3.1 上传项目代码
在本地电脑执行：
```bash
# 方法一：使用 scp
scp -r ./note-prompt root@8.138.176.174:/opt/note-prompt

# 方法二：使用 git（推荐）
ssh root@8.138.176.174
cd /opt
git clone https://github.com/你的用户名/note-prompt.git
```

### 3.2 配置环境变量
```bash
cd /opt/note-prompt

# 复制生产配置
cp .env.production .env

# 编辑配置（重点修改以下项目）
vim .env
```

**必须修改的配置项：**
```env
# MySQL密码（你在2.4步骤设置的）
MYSQL_PASSWORD=你的MySQL密码

# JWT密钥（使用随机字符串）
JWT_SECRET=随意输入一个至少32位的随机字符串

# QQ邮箱配置（用于邮箱验证功能）
ENABLE_EMAIL_VERIFICATION=true
EMAIL_USER=你的QQ邮箱@qq.com
EMAIL_PASS=你的QQ邮箱授权码
EMAIL_FROM=你的QQ邮箱@qq.com
```

### 3.3 获取QQ邮箱授权码
1. 登录 https://mail.qq.com
2. 设置 → 账户 → POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务
3. 开启 **POP3/SMTP服务**
4. 按提示发送短信验证，获取 **16位授权码**
5. 将授权码填入 `EMAIL_PASS`

### 3.4 构建并启动
```bash
cd /opt/note-prompt

# 构建 Docker 镜像
docker build -t note-prompt:latest .

# 启动所有服务
docker-compose up -d

# 查看运行状态
docker-compose ps

# 查看日志
docker-compose logs -f note-prompt-app
```

---

## 四、SSL证书配置

### 4.1 先用HTTP模式启动Nginx
暂时修改 nginx.conf，注释掉 443 server block，只保留 80 端口：

```bash
# 临时使用HTTP测试
curl http://noteprompt.cn
```

### 4.2 申请 Let's Encrypt 免费SSL证书
```bash
# 安装 certbot
yum install -y certbot

# 申请证书（需要先确保80端口的nginx正常运行）
certbot certonly --webroot -w /opt/note-prompt/certbot/www -d noteprompt.cn -d www.noteprompt.cn

# 证书文件位置（自动生成）
# /etc/letsencrypt/live/noteprompt.cn/fullchain.pem
# /etc/letsencrypt/live/noteprompt.cn/privkey.pem
```

### 4.3 配置SSL证书
```bash
# 复制证书到项目目录
cp /etc/letsencrypt/live/noteprompt.cn/fullchain.pem /opt/note-prompt/nginx/ssl/
cp /etc/letsencrypt/live/noteprompt.cn/privkey.pem /opt/note-prompt/nginx/ssl/

# 重启 Nginx
docker-compose restart nginx
```

### 4.4 自动续期
```bash
# 添加 crontab 自动续期
echo "0 3 * * 1 certbot renew --quiet && cp /etc/letsencrypt/live/noteprompt.cn/fullchain.pem /opt/note-prompt/nginx/ssl/ && cp /etc/letsencrypt/live/noteprompt.cn/privkey.pem /opt/note-prompt/nginx/ssl/ && docker-compose -f /opt/note-prompt/docker-compose.yml restart nginx" | crontab -
```

---

## 五、阿里云安全组配置

在阿里云ECS控制台 → 安全组 → 配置规则，添加：

| 协议 | 端口范围 | 授权对象 | 说明 |
|------|---------|---------|------|
| TCP | 80 | 0.0.0.0/0 | HTTP |
| TCP | 443 | 0.0.0.0/0 | HTTPS |
| TCP | 22 | 你的IP/32 | SSH（建议限制IP） |

> **注意**：不要开放 3306/6379 端口到公网！

---

## 六、常用运维命令

```bash
# 查看所有容器状态
docker-compose ps

# 查看应用日志
docker-compose logs -f note-prompt-app

# 重启应用
docker-compose restart note-prompt-app

# 重新构建并部署
docker-compose down
docker build -t note-prompt:latest .
docker-compose up -d

# 进入应用容器
docker exec -it note-prompt-app sh

# 查看MySQL状态
systemctl status mysqld

# 数据库备份
mysqldump -u root -p agent_report > backup_$(date +%Y%m%d).sql
```

---

## 七、问题排查

### 应用无法访问
```bash
# 检查容器是否运行
docker-compose ps

# 查看应用日志
docker-compose logs note-prompt-app

# 检查端口占用
netstat -tlnp | grep -E '80|443|3000'

# 检查安全组
# 登录阿里云控制台检查安全组规则
```

### 邮件发送失败
```bash
# 进入容器测试
docker exec -it note-prompt-app sh
# 检查环境变量是否正确
echo $EMAIL_USER
echo $EMAIL_HOST
```

### 数据库连接失败
```bash
# 检查MySQL是否运行
systemctl status mysqld

# Docker容器访问宿主机MySQL需要使用172.17.0.1
# 确保MySQL允许docker网络访问
mysql -u root -p -e "SELECT user, host FROM mysql.user;"
# 如果需要授权：
# GRANT ALL ON agent_report.* TO 'root'@'172.17.0.%' IDENTIFIED BY '你的密码';
# FLUSH PRIVILEGES;
```

---

## 八、2026-05-25 V2 实际部署记录

### 8.1 本次线上版本

| 项目 | 值 |
|------|-----|
| 线上域名 | https://noteprompt.cn/ |
| 部署分支 | release/noteprompt-v2-local-2026-05-25 |
| 部署提交 | c64954d |
| 服务器目录 | /opt/note-prompt |
| 应用容器 | note-prompt-note-prompt-app-1 |
| Nginx容器 | note-prompt-nginx-1 |
| MySQL容器 | docker_mysql8 |

### 8.2 SSH 连接

本次使用专用部署密钥登录：

```powershell
ssh -i "$env:USERPROFILE\.ssh\noteprompt_deploy_ed25519" root@8.138.176.174
```

如果 SSH 不可用，先通过阿里云云助手检查 `sshd` 是否运行、22 端口是否监听，并确认安全组已放行当前客户端 IP。

### 8.3 部署前备份

本次部署前已创建备份：

```text
/opt/backups/note-prompt/app-files-20260525215422.tgz
/opt/backups/note-prompt/agent_report-20260525215422.sql.gz
```

后续部署建议沿用：

```bash
mkdir -p /opt/backups/note-prompt
tar --exclude='node_modules' --exclude='.next' -czf /opt/backups/note-prompt/app-files-$(date +%Y%m%d%H%M%S).tgz -C /opt note-prompt
docker exec docker_mysql8 sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" agent_report' | gzip > /opt/backups/note-prompt/agent_report-$(date +%Y%m%d%H%M%S).sql.gz
```

### 8.4 标准部署命令

```bash
cd /opt/note-prompt
git fetch origin release/noteprompt-v2-local-2026-05-25
git pull --ff-only origin release/noteprompt-v2-local-2026-05-25
cp -a .env.local .env
sed -i 's/^MYSQL_HOST=.*/MYSQL_HOST=docker_mysql8/' .env .env.local
docker compose up -d note-prompt-app nginx
```

### 8.5 本次关键修复

- `docker-compose.yml` 增加 `HOSTNAME=0.0.0.0`，确保 Next.js standalone 服务监听容器网络地址，Nginx 才能代理到应用。
- `docker-compose.yml` 将 `MYSQL_HOST` 改为 `${MYSQL_HOST:-docker_mysql8}`，并把应用容器接入外部 Docker 网络 `mysql8_default`。
- `nginx/nginx.conf` 移除 `gzip_proxied` 中 nginx alpine 不支持的 `must-revalidate` 值。

### 8.6 验证命令

```bash
cd /opt/note-prompt
docker compose ps
docker run --rm --network note-prompt_note-prompt-network curlimages/curl:8.11.1 -fsS --max-time 15 http://note-prompt-app:3000/api/health
curl -k -fsS --max-time 15 https://127.0.0.1/api/health
curl -I https://noteprompt.cn/
```

本次已验证：

- `https://noteprompt.cn/?lang=en`
- `https://noteprompt.cn/login?lang=en`
- `https://noteprompt.cn/public-prompts?lang=en`
- `https://noteprompt.cn/public-folders?lang=en`
- `https://noteprompt.cn/api/health`
- `https://noteprompt.cn/api/v1/health-check`

### 8.7 安全注意事项

- 安全组只应开放 80、443 和受限来源的 SSH 端口。
- MySQL 3306 不应公网开放；当前线上健康访问依赖 Docker 内网访问 `docker_mysql8`。
- 如再次出现异常进程告警，先停止可疑应用容器、保留日志和镜像信息，再重建容器。

---

## 九、回滚与应急排查

### 9.1 回滚点

| 用途 | Git ref | Commit |
|------|---------|--------|
| 当前 V2 部署分支 | release/noteprompt-v2-local-2026-05-25 | 以 GitHub 最新提交为准 |
| 2026-05-25 Docker/网络修复 | release/noteprompt-v2-local-2026-05-25 | c64954d |
| V2 前线上版本 | noteprompt-prod-before-v2-2026-05-25 | 07a24b9 |

### 9.2 回滚命令

```bash
cd /opt/note-prompt
git fetch origin --tags
git reset --hard noteprompt-prod-before-v2-2026-05-25
docker compose up -d note-prompt-app nginx
curl -k -fsS --max-time 15 https://127.0.0.1/api/v1/health-check
```

如果需要恢复到最新 V2：

```bash
cd /opt/note-prompt
git fetch origin release/noteprompt-v2-local-2026-05-25
git reset --hard origin/release/noteprompt-v2-local-2026-05-25
cp -a .env.local .env
sed -i 's/^MYSQL_HOST=.*/MYSQL_HOST=docker_mysql8/' .env .env.local
docker compose up -d note-prompt-app nginx
```

### 9.3 SSH 不可用

本地先测端口：

```powershell
Test-NetConnection 8.138.176.174 -Port 22
```

如果 22 不通，优先在阿里云 ECS 当前实例已绑定的安全组中临时放行当前公网 IP 的 `TCP 22/22`，不要新建未绑定的安全组。如果安全组已放通仍不通，用云助手执行：

```bash
systemctl status sshd
systemctl restart sshd
ss -tlnp | grep -E ':22|:2233'
```

### 9.4 数据库连接异常

线上应用通过 Docker 网络访问现有 MySQL 容器 `docker_mysql8`。重点检查：

```bash
cd /opt/note-prompt
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}'
docker inspect note-prompt-note-prompt-app-1 --format '{{json .NetworkSettings.Networks}}'
docker inspect docker_mysql8 --format '{{json .NetworkSettings.Networks}}'
docker exec note-prompt-note-prompt-app-1 env | grep '^MYSQL_HOST='
```

预期 `MYSQL_HOST=docker_mysql8`，且应用容器应同时连接 `note-prompt_note-prompt-network` 和 `mysql8_default`。

### 9.5 阿里云异常进程告警

如果安全中心再次出现 `SuspiciousProcess` 告警：

```bash
docker ps
docker logs --tail 200 note-prompt-note-prompt-app-1
ps aux --sort=-%cpu | head -30
last -a | head -20
```

先保留日志和容器信息，再停止可疑容器。不要直接删除现场；确认原因后再重建镜像和容器。
