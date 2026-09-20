#!/usr/bin/env bash
#
# 实验室网站 · Windows 端一键「更新已部署网站」脚本
#
# 适用场景：服务器上已经跑着旧版本，现在要把最新代码更新上去。
# 它会自动完成：
#   1) 用最新代码打一个干净的部署包（排除 node_modules）
#   2) scp 上传到服务器
#   3) ssh 登录服务器：先备份数据库和已上传文件 → 只更新代码（不动数据库和上传文件）
#      → 安装依赖 → 填充新板块演示内容 → 重启服务 → 健康检查
#
# 用法：在 Git Bash 里进入项目目录，运行：  bash deploy/update-from-windows.sh
# 过程中会提示输入服务器密码（scp 一次、ssh 一次），输入即可（屏幕不显示是正常的）。
#
set -euo pipefail

# ===================== 配置区（改我）=====================
SERVER_USER="root"                 # SSH 登录用户名，和首次部署时一致
SERVER_IP="121.199.37.30"          # 服务器公网 IP
# ========================================================

step() { echo; echo "==== $* ===="; }
ok()   { echo "✓ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
cd "${PROJECT_ROOT}"

for cmd in tar scp ssh; do
  command -v "${cmd}" >/dev/null 2>&1 || die "缺少命令 ${cmd}。请在 Git Bash 里运行本脚本。"
done

PKG_NAME="lab-website-update-$(date +%Y%m%d-%H%M%S).tar.gz"
PKG_PATH="dist/${PKG_NAME}"
REMOTE_APP_DIR="/opt/lab-website/current"

echo "======================================================"
echo "  一键更新服务器上的实验室网站"
echo "  服务器  : ${SERVER_USER}@${SERVER_IP}"
echo "  项目目录: ${PROJECT_ROOT}"
echo "======================================================"

# ---------- 步骤 1 · 本地打包 ----------
step "步骤 1/3 · 用最新代码打更新包"
mkdir -p dist
tar -czf "${PKG_PATH}" \
  --exclude='node_modules' \
  --exclude='.git' \
  server.js package.json package-lock.json \
  DEPLOY-UBUNTU.md UPDATE-ALUMNI-UBUNTU.md \
  database deploy public routes scripts services views
ok "已生成：${PKG_PATH}"

# ---------- 步骤 2 · 上传 ----------
step "步骤 2/3 · 上传到服务器（会提示输入密码）"
scp "${PKG_PATH}" "${SERVER_USER}@${SERVER_IP}:~/"
ok "上传完成"

# ---------- 步骤 3 · 远程更新 ----------
step "步骤 3/3 · 远程更新（会再次提示输入密码）"
warn "服务器网站会中断约 1 分钟，属正常现象。"

ssh -t "${SERVER_USER}@${SERVER_IP}" "
  set -e
  APP='${REMOTE_APP_DIR}'
  echo '→ 1/6 备份数据库和已上传文件 ...'
  sudo tar -czf ~/lab-website-backup-\$(date +%F-%H%M).tar.gz -C \${APP} database/lab.db public/uploads
  ls -lh ~/lab-website-backup-*.tar.gz | tail -1

  echo '→ 2/6 解压新版本代码（不动数据库和已上传文件）...'
  tar -xzf ~/'${PKG_NAME}' -C \${APP} --exclude='database/lab.db' --exclude='public/uploads'

  echo '→ 3/6 安装依赖（依赖没变化时很快）...'
  cd \${APP}
  sudo -u labwebsite npm install --omit=dev --no-audit --no-fund --loglevel=error

  echo '→ 4/6 停服务并填充新板块内容（平台/专利/论文/媒体报道/学生/数据集/教材）...'
  sudo systemctl stop lab-website
  sudo -u labwebsite node database/seed-nav-content.js

  echo '→ 5/6 重新启动网站服务 ...'
  sudo systemctl start lab-website
  sleep 3
  sudo systemctl is-active lab-website

  echo '→ 6/6 健康检查 ...'
  curl -fsS http://127.0.0.1:3000/healthz
  echo
  echo '→ 清理上传的更新包 ...'
  rm -f ~/'${PKG_NAME}'
"

echo
ok "更新完成！现在可以做最后确认："
echo "  1. 浏览器打开  https://你的域名/          首页应显示「实验室新闻 + 媒体关注」滚动"
echo "  2. 打开        https://你的域名/platforms  平台页应有 4 个平台"
echo "  3. 打开        https://你的域名/team       团队页有 教师 / 在读学生 / 毕业学生去向"
echo "  4. 打开        https://你的域名/admin      后台侧栏多了 专利/论文/平台/媒体报道 管理"
echo
echo "说明："
echo "  · 服务器上的数据库没有被覆盖，你在后台发过的通知/新闻、改过的密码都还在；"
echo "    新板块（平台/专利/论文/媒体报道/学生）填的是演示内容，可在后台逐条改成真实资料。"
echo "  · 更新前已自动备份到服务器 ~/lab-website-backup-*.tar.gz，"
echo "    万一有问题，把这一行发给我会告诉你怎么恢复。"
