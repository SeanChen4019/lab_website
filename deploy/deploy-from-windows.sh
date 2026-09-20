#!/usr/bin/env bash
#
# 实验室网站 · Windows 端一键部署脚本
#
# 在你自己电脑的 Git Bash 里运行，它会自动完成：
#   1) 用最新代码打一个干净的部署包（排除 node_modules / 截图 / 日志 / .git）
#   2) scp 上传到云服务器
#   3) ssh 登录服务器，解压并运行服务器端一键部署脚本（装环境→依赖→服务→Nginx→HTTPS→防火墙）
#
# 用法：
#   1. 先改下面【配置区】的 4 个值
#   2. 在 Git Bash 里： bash deploy/deploy-from-windows.sh
#   3. 过程中会提示输入服务器密码（scp 一次、ssh 一次），输入即可（屏幕不显示是正常的）
#
set -euo pipefail

# ===================== 配置区（改我）=====================
SERVER_USER="root"                 # SSH 登录用户名，阿里云 Ubuntu 一般是 root 或 ubuntu
SERVER_IP="121.199.37.30"          # 服务器公网 IP
DOMAIN="seanapi.com"               # 你的域名
EMAIL="2415483828@qq.com"          # certbot 证书通知邮箱
INCLUDE_WWW="true"                 # 是否同时给 www.域名 签证书 (true/false)
# ========================================================

# 颜色输出
if [[ -t 1 ]]; then
  C_RED=$'\033[0;31m'; C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[1;33m'
  C_BLUE=$'\033[0;34m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""; C_OFF=""
fi
step() { echo; echo "${C_BLUE}${C_BOLD}==== $* ====${C_OFF}"; }
ok()   { echo "${C_GREEN}✓${C_OFF} $*"; }
warn() { echo "${C_YELLOW}⚠ $*${C_OFF}"; }
die()  { echo "${C_RED}✗ $*${C_OFF}" >&2; exit 1; }

# 定位项目根目录（本脚本在 deploy/ 下）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
cd "${PROJECT_ROOT}"

# 检查必备命令
for cmd in tar scp ssh; do
  command -v "${cmd}" >/dev/null 2>&1 || die "缺少命令 ${cmd}。请在 Git Bash（自带 tar/scp/ssh）里运行本脚本。"
done

PKG_NAME="lab-website-ubuntu-$(date +%Y%m%d-%H%M%S).tar.gz"
PKG_PATH="dist/${PKG_NAME}"
REMOTE_APP_DIR="/opt/lab-website/current"

echo "${C_BOLD}"
echo "======================================================"
echo "  Windows 端一键部署"
echo "  服务器  : ${SERVER_USER}@${SERVER_IP}"
echo "  域名    : ${DOMAIN}"
echo "  项目目录: ${PROJECT_ROOT}"
echo "======================================================"
echo "${C_OFF}"

# ---------- 步骤 1 · 本地打包 ----------
step "步骤 1/3 · 用最新代码打部署包"
mkdir -p dist
tar -czf "${PKG_PATH}" \
  --exclude='node_modules' \
  --exclude='.git' \
  server.js package.json package-lock.json \
  DEPLOY-UBUNTU.md UPDATE-ALUMNI-UBUNTU.md \
  database deploy public routes scripts services views
ok "已生成：${PKG_PATH}"
ls -lh "${PKG_PATH}"

# ---------- 步骤 2 · 上传 ----------
step "步骤 2/3 · 上传到服务器 (会提示输入密码)"
scp "${PKG_PATH}" "${SERVER_USER}@${SERVER_IP}:~/"
ok "上传完成：~/${PKG_NAME}"

# ---------- 步骤 3 · 远程解压并一键部署 ----------
step "步骤 3/3 · 远程解压并运行一键部署脚本"
warn "接下来会再次提示输入服务器密码；远程部署过程约 5~15 分钟，请耐心等待，中途不要关闭。"

ssh -t "${SERVER_USER}@${SERVER_IP}" "
  set -e
  echo '→ 解压部署包到 ${REMOTE_APP_DIR} ...'
  mkdir -p '${REMOTE_APP_DIR}'
  tar -xzf ~/'${PKG_NAME}' -C '${REMOTE_APP_DIR}'
  cd '${REMOTE_APP_DIR}'
  echo '→ 运行一键部署脚本 ...'
  INCLUDE_WWW='${INCLUDE_WWW}' bash deploy/setup-all-in-one.sh '${DOMAIN}' '${EMAIL}'
  echo '→ 清理上传的部署包 ...'
  rm -f ~/'${PKG_NAME}'
"

echo
ok "远程部署命令执行结束。请查看上方服务器输出确认是否成功。"
echo
echo "${C_GREEN}${C_BOLD}======================================================${C_OFF}"
echo "  如果上方显示「部署完成」，现在可以访问："
echo "    https://${DOMAIN}/"
echo "    后台 https://${DOMAIN}/admin  （首次登录请立即改密码）"
echo "------------------------------------------------------"
echo "  ${C_YELLOW}收尾提醒：${C_OFF}"
echo "  1. 若证书那步失败，多半是【阿里云安全组】没放行 80/443，去控制台加上后，"
echo "     SSH 登录服务器重跑： cd ${REMOTE_APP_DIR} && sudo bash deploy/setup-all-in-one.sh"
echo "  2. 上线后把安全组收紧为只放行 22/80/443。"
echo "======================================================"
