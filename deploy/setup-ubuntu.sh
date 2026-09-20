#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/lab-website/current"
ENV_DIR="/etc/lab-website"
ENV_FILE="${ENV_DIR}/lab-website.env"
SERVICE_FILE="/etc/systemd/system/lab-website.service"
NGINX_FILE="/etc/nginx/sites-available/lab-website"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 sudo bash deploy/setup-ubuntu.sh 运行"
  exit 1
fi

if [[ "$(pwd)" != "${APP_DIR}" ]]; then
  echo "请先把部署包解压到 ${APP_DIR}，然后在该目录运行本脚本"
  exit 1
fi

for command in node npm nginx openssl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "缺少命令：${command}。请先安装 Node.js 20+、npm、Nginx 和 OpenSSL。"
    exit 1
  fi
done

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js 版本过低：$(node -v)，需要 Node.js 20 或更高版本"
  exit 1
fi

if ! id labwebsite >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/labwebsite --create-home --shell /usr/sbin/nologin labwebsite
fi

install -d -m 0750 -o labwebsite -g labwebsite "${APP_DIR}/database"
install -d -m 0750 -o labwebsite -g labwebsite "${APP_DIR}/public/uploads"
install -d -m 0750 -o root -g labwebsite "${ENV_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  SESSION_SECRET="$(openssl rand -hex 48)"
  JWT_SECRET="$(openssl rand -hex 48)"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
COOKIE_SECURE=auto
SESSION_SECRET=${SESSION_SECRET}
JWT_SECRET=${JWT_SECRET}
EOF
  chmod 0640 "${ENV_FILE}"
  chown root:labwebsite "${ENV_FILE}"
  echo "已生成生产环境密钥：${ENV_FILE}"
fi

chown -R labwebsite:labwebsite "${APP_DIR}"
runuser -u labwebsite -- env HOME=/var/lib/labwebsite npm ci --omit=dev
runuser -u labwebsite -- env HOME=/var/lib/labwebsite npm run verify:prod

install -m 0644 deploy/lab-website.service "${SERVICE_FILE}"
install -m 0644 deploy/nginx-lab-website.conf "${NGINX_FILE}"
ln -sfn "${NGINX_FILE}" /etc/nginx/sites-enabled/lab-website
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now lab-website
nginx -t
systemctl reload nginx

echo
echo "部署完成"
echo "网站地址：http://服务器IP/"
echo "后台地址：http://服务器IP/admin"
echo "健康检查：http://服务器IP/healthz"
echo
echo "请立即登录后台修改默认管理员密码，并根据域名配置 HTTPS。"
