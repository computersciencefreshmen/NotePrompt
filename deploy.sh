#!/bin/bash
# =============================================================
# Note Prompt 阿里云部署脚本
# 服务器: 8.138.176.174 (Alibaba Cloud Linux 3)
# 域名: noteprompt.cn
# =============================================================

set -e

echo "=========================================="
echo "  Note Prompt 部署脚本"
echo "=========================================="

# ============ 1. 系统基础环境 ============
echo "[1/8] 更新系统包..."
sudo yum update -y
sudo yum install -y yum-utils git wget curl

# ============ 2. 安装 Docker ============
echo "[2/8] 安装 Docker..."
if ! command -v docker &> /dev/null; then
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo "Docker 安装完成"
else
    echo "Docker 已安装，跳过"
fi

# ============ 3. 安装 Docker Compose ============
echo "[3/8] 安装 Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "Docker Compose 安装完成"
else
    echo "Docker Compose 已安装，跳过"
fi

# ============ 4. 安装 MySQL ============
echo "[4/8] 安装 MySQL..."
if ! command -v mysql &> /dev/null; then
    sudo yum install -y mysql-server
    sudo systemctl start mysqld
    sudo systemctl enable mysqld
    echo "MySQL 安装完成，请手动设置root密码"
else
    echo "MySQL 已安装，跳过"
fi

# ============ 5. 创建项目目录 ============
echo "[5/8] 创建项目目录..."
PROJECT_DIR="/opt/note-prompt"
sudo mkdir -p $PROJECT_DIR
sudo chown -R $USER:$USER $PROJECT_DIR

# ============ 6. 初始化数据库 ============
echo "[6/8] 初始化数据库..."
echo "请确保 MySQL 已启动并配置好 root 密码"
echo "然后运行: mysql -u root -p < database/mysql-schema-new.sql"

# ============ 7. SSL证书申请（使用 Let's Encrypt） ============
echo "[7/8] SSL 证书配置..."
if ! command -v certbot &> /dev/null; then
    sudo yum install -y certbot
    echo "Certbot 安装完成"
fi

# 创建 certbot 目录
sudo mkdir -p /opt/note-prompt/certbot/www
sudo mkdir -p /opt/note-prompt/nginx/ssl

echo "SSL证书需要在 Nginx 启动后手动申请："
echo "  sudo certbot certonly --webroot -w /opt/note-prompt/certbot/www -d noteprompt.cn -d www.noteprompt.cn"
echo "  然后将证书复制到 nginx/ssl/ 目录"

# ============ 8. 防火墙配置 ============
echo "[8/8] 防火墙配置..."
sudo firewall-cmd --permanent --add-service=http 2>/dev/null || true
sudo firewall-cmd --permanent --add-service=https 2>/dev/null || true
sudo firewall-cmd --permanent --add-port=3306/tcp 2>/dev/null || true
sudo firewall-cmd --reload 2>/dev/null || true

echo "=========================================="
echo "  基础环境安装完成！"
echo "=========================================="
echo ""
echo "下一步操作："
echo "1. 设置 MySQL root 密码: sudo mysql_secure_installation"
echo "2. 创建数据库: mysql -u root -p < database/mysql-schema-new.sql"
echo "3. 配置 .env 文件: cp .env.example .env && vim .env"
echo "4. 构建并启动: docker-compose up -d --build"
echo "5. 申请SSL证书（见上方说明）"
echo ""
