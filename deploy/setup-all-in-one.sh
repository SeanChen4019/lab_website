#!/usr/bin/env bash
#
# 实验室网站 · 一键完整部署脚本（Ubuntu 22.04 / 24.04）
#
# 作用：在一台纯净的 Ubuntu 云服务器上，一条命令完成从「装环境」到「HTTPS 上线」的全部工作。
# 幂等：可以重复运行，已完成的步骤会自动跳过，不会破坏已有数据和密钥。
#
# 用法（在解压后的应用目录里，用 root 或 sudo 运行）：
#   sudo bash deploy/setup-all-in-one.sh
#   sudo bash deploy/setup-all-in-one.sh seanapi.com 2415483828@qq.com
#
# 也可用环境变量覆盖：
#   DOMAIN=seanapi.com EMAIL=you@qq.com ENABLE_HTTPS=true sudo -E bash deploy/setup-all-in-one.sh
#
set -euo pipefail

# ============ 可配置项（命令行参数 > 环境变量 > 默认值）============
DOMAIN="${1:-${DOMAIN:-seanapi.com}}"
EMAIL="${2:-${EMAIL:-2415483828@qq.com}}"
INCLUDE_WWW="${INCLUDE_WWW:-true}"          # 是否同时给 www.域名 签证书
ENABLE_HTTPS="${ENABLE_HTTPS:-true}"        # 设为 false 则只做 HTTP，不签证书
NPM_MIRROR="${NPM_MIRROR:-https://registry.npmmirror.com}"
NODE_MAJOR_WANT="${NODE_MAJOR_WANT:-20}"    # 需要的最低 Node 主版本

# ============ 固定路径 ============
APP_DIR="/opt/lab-website/current"
ENV_DIR="/etc/lab-website"
ENV_FILE="${ENV_DIR}/lab-website.env"
SERVICE_FILE="/etc/systemd/system/lab-website.service"
NGINX_FILE="/etc/nginx/sites-available/lab-website"
APP_USER="labwebsite"
APP_PORT="3000"

# ============ 输出美化 ============
if [[ -t 1 ]]; then
  C_RED=$'\033[0;31m'; C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[1;33m'
  C_BLUE=$'\033[0;34m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""; C_OFF=""
fi
step()  { echo; echo "${C_BLUE}${C_BOLD}==== $* ====${C_OFF}"; }
ok()    { echo "${C_GREEN}✓${C_OFF} $*"; }
warn()  { echo "${C_YELLOW}⚠ $*${C_OFF}"; }
err()   { echo "${C_RED}✗ $*${C_OFF}" >&2; }
die()   { err "$*"; exit 1; }

WWW_DOMAIN="www.${DOMAIN}"

echo "${C_BOLD}"
echo "======================================================"
echo "  实验室网站 · 一键部署"
echo "  域名    : ${DOMAIN} (www: ${INCLUDE_WWW})"
echo "  证书邮箱: ${EMAIL}"
echo "  HTTPS   : ${ENABLE_HTTPS}"
echo "  应用目录: ${APP_DIR}"
echo "======================================================"
echo "${C_OFF}"

# ============ 步骤 0 · 前置检查 ============
step "步骤 0/9 · 前置检查"

[[ "${EUID}" -eq 0 ]] || die "请用 root 或 sudo 运行： sudo bash deploy/setup-all-in-one.sh"
ok "当前是 root 权限"

# 必须在应用目录里运行（脚本所在目录的上一级）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED_APP_DIR="$(dirname "${SCRIPT_DIR}")"
if [[ "${EXPECTED_APP_DIR}" != "${APP_DIR}" ]]; then
  warn "脚本不在 ${APP_DIR}/deploy 下（当前在 ${EXPECTED_APP_DIR}）。"
  echo "  请先把部署包解压到 ${APP_DIR}，例如："
  echo "    sudo mkdir -p ${APP_DIR}"
  echo "    sudo tar -xzf ~/lab-website-ubuntu-*.tar.gz -C ${APP_DIR}"
  echo "    cd ${APP_DIR} && sudo bash deploy/setup-all-in-one.sh"
  die "位置不对，已中止。"
fi
cd "${APP_DIR}"
ok "已在应用目录 ${APP_DIR}"

[[ -f server.js && -f package.json ]] || die "当前目录缺少 server.js / package.json，不是正确的应用目录"
ok "已找到 server.js 和 package.json"

# ============ 步骤 1 · 安装系统依赖 ============
step "步骤 1/9 · 安装系统依赖 (nginx / openssl / ufw / curl)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg nginx openssl ufw
ok "系统依赖安装完成"

# ============ 步骤 2 · 安装 Node.js ============
step "步骤 2/9 · 检查/安装 Node.js ${NODE_MAJOR_WANT}+"
need_node=1
if command -v node >/dev/null 2>&1; then
  cur_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  if [[ "${cur_major}" -ge "${NODE_MAJOR_WANT}" ]]; then
    ok "已安装 Node $(node -v)，满足要求"
    need_node=0
  else
    warn "当前 Node $(node -v) 版本过低，将安装 Node ${NODE_MAJOR_WANT}"
  fi
fi
if [[ "${need_node}" -eq 1 ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR_WANT}.x" | bash -
  apt-get install -y nodejs
  ok "Node $(node -v) 安装完成"
fi
NODE_BIN="$(command -v node)"
ok "node 路径：${NODE_BIN}"

# ============ 步骤 3 · 配置 npm 国内镜像（关键提速）============
step "步骤 3/9 · 配置 npm 国内镜像 (${NPM_MIRROR})"
npm config set registry "${NPM_MIRROR}" --location=global
ok "全局 npm 镜像已设置：$(npm config get registry)"

# ============ 步骤 4 · 创建应用用户和目录权限 ============
step "步骤 4/9 · 创建系统用户与目录"
if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "/var/lib/${APP_USER}" --create-home --shell /usr/sbin/nologin "${APP_USER}"
  ok "已创建系统用户 ${APP_USER}"
else
  ok "用户 ${APP_USER} 已存在，跳过"
fi

install -d -m 0750 -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}/database"
install -d -m 0750 -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}/public/uploads"
install -d -m 0750 -o root -g "${APP_USER}" "${ENV_DIR}"

# 给应用用户的 npm 也设置镜像
runuser -u "${APP_USER}" -- env "HOME=/var/lib/${APP_USER}" npm config set registry "${NPM_MIRROR}" >/dev/null 2>&1 || true
ok "目录与权限就绪"

# ============ 步骤 5 · 生成密钥并安装依赖 ============
step "步骤 5/9 · 生成密钥、安装生产依赖、自检"
if [[ ! -f "${ENV_FILE}" ]]; then
  SESSION_SECRET="$(openssl rand -hex 48)"
  JWT_SECRET="$(openssl rand -hex 48)"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=${APP_PORT}
COOKIE_SECURE=auto
SESSION_SECRET=${SESSION_SECRET}
JWT_SECRET=${JWT_SECRET}
EOF
  chmod 0640 "${ENV_FILE}"
  chown root:"${APP_USER}" "${ENV_FILE}"
  ok "已生成生产密钥：${ENV_FILE}"
else
  ok "密钥文件已存在，保留不覆盖：${ENV_FILE}"
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
echo "  → 正在安装生产依赖 (npm ci --omit=dev)，请稍候..."
runuser -u "${APP_USER}" -- env "HOME=/var/lib/${APP_USER}" npm ci --omit=dev
ok "依赖安装完成"

echo "  → 正在运行生产自检..."
runuser -u "${APP_USER}" -- env "HOME=/var/lib/${APP_USER}" npm run verify:prod
ok "生产自检通过"

# ============ 步骤 6 · 注册 systemd 服务 ============
step "步骤 6/9 · 注册并启动 systemd 服务"
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=NUAA Spectrum Cognition Lab Website
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} server.js
Restart=always
RestartSec=5
TimeoutStopSec=20
KillSignal=SIGTERM
UMask=0027

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${APP_DIR}/database
ReadWritePaths=${APP_DIR}/public/uploads

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable --now lab-website
systemctl restart lab-website
sleep 2
if systemctl is-active --quiet lab-website; then
  ok "网站服务已启动 (lab-website.service)"
else
  err "网站服务启动失败，最近日志："
  journalctl -u lab-website -n 30 --no-pager || true
  die "请检查上面的日志。"
fi

# 本机健康检查
if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then
  ok "本机健康检查通过：http://127.0.0.1:${APP_PORT}/healthz"
else
  warn "本机健康检查未通过，但服务已启动，稍后可手动 curl 复查"
fi

# ============ 步骤 7 · 配置 Nginx 反向代理（带域名）============
step "步骤 7/9 · 配置 Nginx 反向代理"
if [[ "${INCLUDE_WWW}" == "true" ]]; then
  SERVER_NAMES="${DOMAIN} ${WWW_DOMAIN}"
else
  SERVER_NAMES="${DOMAIN}"
fi
cat > "${NGINX_FILE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAMES};

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }

    location = /healthz {
        proxy_pass http://127.0.0.1:${APP_PORT}/healthz;
        access_log off;
    }
}
EOF
ln -sfn "${NGINX_FILE}" /etc/nginx/sites-enabled/lab-website
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx || systemctl restart nginx
ok "Nginx 已配置并重载 (server_name: ${SERVER_NAMES})"

# ============ 步骤 8 · 防火墙 ============
step "步骤 8/9 · 配置服务器防火墙 (ufw)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
# 允许 ufw（若未启用则启用；已放行 SSH，不会锁死）
if ufw status | grep -q "Status: active"; then
  ok "ufw 已在运行，规则已更新"
else
  ufw --force enable >/dev/null
  ok "ufw 已启用（放行 SSH + HTTP + HTTPS）"
fi
warn "别忘了在【云厂商控制台的安全组】也放行 80/443，ufw 管不到那一层！"

# ============ 步骤 9 · HTTPS 证书 ============
step "步骤 9/9 · 申请 HTTPS 证书 (Let's Encrypt)"
if [[ "${ENABLE_HTTPS}" != "true" ]]; then
  warn "ENABLE_HTTPS=false，跳过证书申请。网站将只通过 HTTP 访问。"
else
  # DNS 预检：域名是否解析到本机公网 IP
  echo "  → 检查域名解析..."
  RESOLVED_IP="$(getent hosts "${DOMAIN}" | awk '{print $1}' | head -n1 || true)"
  PUBLIC_IP="$(curl -fsS --max-time 6 https://api.ipify.org 2>/dev/null \
    || curl -fsS --max-time 6 http://100.100.100.200/latest/meta-data/public-ipv4 2>/dev/null \
    || echo '')"
  if [[ -z "${RESOLVED_IP}" ]]; then
    warn "域名 ${DOMAIN} 还没有解析记录，或本机无法解析。证书很可能签不下来。"
  elif [[ -n "${PUBLIC_IP}" && "${RESOLVED_IP}" != "${PUBLIC_IP}" ]]; then
    warn "域名解析到 ${RESOLVED_IP}，但本机公网 IP 是 ${PUBLIC_IP}，两者不一致！"
    warn "请确认 DNS 已指向本服务器，否则 certbot 会失败。"
  else
    ok "域名解析正常：${DOMAIN} → ${RESOLVED_IP}"
  fi

  apt-get install -y certbot python3-certbot-nginx

  CERT_DOMAINS=(-d "${DOMAIN}")
  [[ "${INCLUDE_WWW}" == "true" ]] && CERT_DOMAINS+=(-d "${WWW_DOMAIN}")

  echo "  → 正在申请证书（自动同意条款、自动开启 HTTP→HTTPS 跳转）..."
  set +e
  certbot --nginx "${CERT_DOMAINS[@]}" \
    --non-interactive --agree-tos --redirect \
    -m "${EMAIL}"
  CERT_RC=$?
  set -e

  if [[ "${CERT_RC}" -eq 0 ]]; then
    ok "HTTPS 证书申请并部署成功！"
    certbot renew --dry-run >/dev/null 2>&1 && ok "自动续期测试通过" || warn "自动续期测试未通过，可稍后手动 certbot renew --dry-run 排查"
  else
    err "证书申请失败（certbot 退出码 ${CERT_RC}）。"
    echo "  最常见原因：云厂商【安全组】没放行 80 端口，Let's Encrypt 从公网连不进来。"
    echo "  排查步骤："
    echo "    1) 云控制台安全组入方向放行 80/443（授权对象 0.0.0.0/0）"
    echo "    2) 在你自己电脑上执行  curl -I http://${DOMAIN}  确认返回 200"
    echo "    3) 确认后重跑： certbot --nginx ${CERT_DOMAINS[*]} --non-interactive --agree-tos --redirect -m ${EMAIL}"
    warn "网站已通过 HTTP 正常运行，解决公网访问后重跑本脚本即可补上 HTTPS。"
  fi
fi

# ============ 完成 ============
echo
echo "${C_GREEN}${C_BOLD}======================================================${C_OFF}"
echo "${C_GREEN}${C_BOLD}  部署完成！${C_OFF}"
echo "======================================================"
if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  echo "  网站    : https://${DOMAIN}/"
  echo "  后台    : https://${DOMAIN}/admin"
else
  echo "  网站    : http://${DOMAIN}/"
  echo "  后台    : http://${DOMAIN}/admin"
fi
echo "  健康检查: http://${DOMAIN}/healthz"
echo "------------------------------------------------------"
echo "  ${C_YELLOW}上线后必做：${C_OFF}"
echo "  1. 登录后台立即修改默认管理员密码"
echo "  2. 到云控制台把安全组收紧为只放行 22/80/443"
echo "  3. 常用维护命令："
echo "       sudo systemctl status lab-website"
echo "       sudo journalctl -u lab-website -f"
echo "       sudo systemctl restart lab-website"
echo "======================================================"
