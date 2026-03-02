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
