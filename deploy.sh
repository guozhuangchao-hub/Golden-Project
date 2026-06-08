#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# GP (Golden Project) 一键部署脚本
# 适用于 Alibaba Cloud Linux 8 / CentOS / Rocky Linux
# 使用方式: chmod +x deploy.sh && sudo bash deploy.sh
# ============================================================

REPO_URL="https://github.com/guozhuangchao-hub/Golden-Project.git"
APP_DIR="/opt/golden-project"
NODE_VERSION="20"

echo "========================================"
echo "  1/8 安装 Node.js ${NODE_VERSION}"
echo "========================================"
if ! command -v node &>/dev/null; then
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  dnf install -y nodejs
fi
echo "  Node: $(node --version)"
echo "  NPM:  $(npm --version)"

echo ""
echo "========================================"
echo "  2/8 安装 PostgreSQL 16"
echo "========================================"
if ! command -v psql &>/dev/null; then
  dnf install -y postgresql16-server postgresql16-contrib 2>/dev/null || \
  dnf install -y postgresql-server postgresql-contrib

  # 初始化数据库（首次安装时需要）
  if [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then
    /usr/bin/postgresql-setup --initdb 2>/dev/null || /usr/sbin/postgresql-setup --initdb || true
  fi

  systemctl enable postgresql
  systemctl start postgresql
fi
echo "  PostgreSQL: $(psql --version)"

echo ""
echo "========================================"
echo "  3/8 创建数据库和用户"
echo "========================================"
# 生成随机密码
DB_PASS=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9')
DB_NAME="golden_project"
DB_USER="golden_app"

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\" | grep -q 1 || psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\" | grep -q 1 || psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};\""

# 修改 pg_hba.conf 允许 golden_app 用户用密码登录本地
PG_HBA=$(su - postgres -c "psql -t -c 'SHOW hba_file;'" | tr -d ' ')
if [ -n "$PG_HBA" ]; then
  sed -i 's/local\s\+all\s\+all\s\+peer/local   all             all                                     md5/' "$PG_HBA"
  sed -i 's/local\s\+all\s\+postgres\s\+peer/local   all             postgres                                peer/' "$PG_HBA"
  systemctl reload postgresql
fi

echo "  数据库: ${DB_NAME}"
echo "  用户名: ${DB_USER}"
echo "  密码:   ${DB_PASS}"

echo ""
echo "========================================"
echo "  4/8 克隆项目代码"
echo "========================================"
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git pull
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo ""
echo "========================================"
echo "  5/8 配置环境变量"
echo "========================================"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public"

cat > .env << ENVEOF
DATABASE_URL="${DATABASE_URL}"
PORT=3001
APP_NAME="Golden Project"
GEMINI_API_KEY=""
ENVEOF

echo "  .env 已创建，请手动编辑补充 GEMINI_API_KEY"
echo "  连接字符串: ${DATABASE_URL}"

echo ""
echo "========================================"
echo "  6/8 安装依赖"
echo "========================================"
npm install

echo ""
echo "========================================"
echo "  7/8 数据库迁移"
echo "========================================"
npx prisma generate
npx prisma migrate deploy

echo ""
echo "========================================"
echo "  8/8 构建并启动"
echo "========================================"
npm run build

# 安装 PM2 用于进程管理
npm install -g pm2
pm2 delete golden-project 2>/dev/null || true
pm2 start dist/main.js --name golden-project
pm2 save

# 设置开机自启
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "========================================"
echo "  ✅ 部署完成！"
echo "========================================"
echo "  访问地址: http://120.78.0.232:3001/api"
echo "  测试命令: curl http://127.0.0.1:3001/api/projects"
echo ""
echo "  ⚠️  别忘了编辑 .env 填入 GEMINI_API_KEY"
echo "     vi ${APP_DIR}/.env"
echo ""
echo "  查看日志: pm2 logs golden-project"
echo "  重启应用: pm2 restart golden-project"
echo "========================================"
