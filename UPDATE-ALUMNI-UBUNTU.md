# 历届毕业生栏目增量更新

此更新包用于已经部署的网站，只更新程序代码，不包含以下生产数据：

- `database/lab.db`
- `public/uploads`

因此不会覆盖线上已发布的新闻、团队成员、后台设置和上传文件。服务重启时会自动创建 `alumni` 数据表。

## 更新步骤

将 `lab-website-update-alumni-20260728.tar.gz` 上传到服务器用户主目录，然后执行：

```bash
cd /opt/lab-website/current

# 1. 备份数据库和上传文件
sudo tar -czf ~/lab-website-before-alumni-$(date +%F-%H%M).tar.gz \
  database/lab.db public/uploads

# 2. 停止服务
sudo systemctl stop lab-website

# 3. 解压增量更新包（包内不含数据库与 uploads）
sudo tar -xzf ~/lab-website-update-alumni-20260728.tar.gz \
  -C /opt/lab-website/current

# 4. 校正权限并执行自动迁移、自检
sudo chown -R labwebsite:labwebsite /opt/lab-website/current
sudo -u labwebsite env HOME=/var/lib/labwebsite npm ci --omit=dev
sudo -u labwebsite env HOME=/var/lib/labwebsite npm run verify:prod

# 5. 启动并检查
sudo systemctl start lab-website
sudo systemctl status lab-website --no-pager
curl -f http://127.0.0.1:3000/healthz
```

更新完成后：

- 前台栏目：`https://seanapi.com/alumni`
- 可视化后台：`https://seanapi.com/admin`

在可视化后台左侧选择“历届毕业生”，点击“添加内容”即可录入本科生、硕士研究生和博士研究生的毕业去向。
