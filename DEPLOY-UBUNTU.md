# Ubuntu 部署说明

本部署包包含当前网站源码、`database/lab.db` 现有内容数据库、后台上传文件和全部图片。不要把 Windows 上的 `node_modules` 上传到服务器；部署脚本会在 Ubuntu 上重新安装生产依赖。

## 服务器要求

- Ubuntu 22.04 或 24.04
- Node.js 20 或更高版本
- npm
- Nginx
- OpenSSL
- 一个具有 `sudo` 权限的账号

先在服务器确认：

```bash
node -v
npm -v
nginx -v
```

## 上传和解压

将 `lab-website-ubuntu-20260728.tar.gz` 上传到服务器，例如上传到当前用户主目录，然后运行：

```bash
sudo mkdir -p /opt/lab-website/current
sudo tar -xzf ~/lab-website-ubuntu-20260728.tar.gz -C /opt/lab-website/current
cd /opt/lab-website/current
sudo bash deploy/setup-ubuntu.sh
```

安装脚本会：

1. 创建无登录权限的 `labwebsite` 系统用户。
2. 在 Ubuntu 上安装生产依赖。
3. 自动生成 Session 与 JWT 随机密钥。
4. 注册并启动 systemd 服务。
5. 安装 Nginx 反向代理配置。
6. 执行数据库和关键文件自检。

部署完成后访问：

- 网站：`http://服务器IP/`
- 后台：`http://服务器IP/admin`
- 健康检查：`http://服务器IP/healthz`

## 常用维护命令

```bash
sudo systemctl status lab-website
sudo journalctl -u lab-website -f
sudo systemctl restart lab-website
sudo nginx -t
sudo systemctl reload nginx
```

## 数据备份

网站的可变数据只有两处，升级或迁移前必须同时备份：

```bash
sudo tar -czf ~/lab-website-data-$(date +%F).tar.gz \
  /opt/lab-website/current/database/lab.db \
  /opt/lab-website/current/public/uploads
```

## 域名和 HTTPS

编辑 `/etc/nginx/sites-available/lab-website`，把 `server_name _;` 改成正式域名，然后配置证书。Nginx 已传递 `X-Forwarded-Proto`，应用会自动根据 HTTP/HTTPS 设置会话 Cookie。

## 重要安全事项

1. 首次上线后立即登录后台修改默认管理员密码。
2. 不要公开 `/etc/lab-website/lab-website.env`。
3. 防火墙只开放 SSH、HTTP 和 HTTPS；端口 3000 仅监听本机，不应对公网开放。
4. 不要再次运行 `npm run init-db` 或 `npm run seed`，否则可能覆盖现有内容。
