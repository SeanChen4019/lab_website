const fs = require('fs');
const path = require('path');
const db = require('../database/db');

const requiredPaths = [
  'server.js',
  'package.json',
  'database/lab.db',
  'public/css/style.css',
  'public/css/admin-visual.css',
  'public/css/admin-publish.css',
  'public/js/main.js',
  'public/js/admin-visual.js',
  'public/js/admin-publish.js',
  'services/site-search.js',
  'views/index.ejs',
  'views/search.ejs',
  'views/notices.ejs',
  'views/team-detail.ejs',
  'views/admin/visual.ejs',
  'views/admin/publish.ejs'
];

async function main() {
  const missing = requiredPaths.filter(item => !fs.existsSync(path.join(__dirname, '..', item)));
  if (missing.length) {
    throw new Error('缺少生产文件：' + missing.join(', '));
  }

  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  const tableNames = new Set(tables.map(item => item.name));
  const requiredTables = ['admins', 'alumni', 'banners', 'downloads', 'news', 'notices', 'projects', 'research_areas', 'settings', 'team_members'];
  const missingTables = requiredTables.filter(name => !tableNames.has(name));
  if (missingTables.length) {
    throw new Error('数据库缺少数据表：' + missingTables.join(', '));
  }

  const counts = {};
  for (const table of ['news', 'team_members', 'alumni', 'projects', 'banners']) {
    const row = await db.get(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = row.count;
  }

  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  const uploads = fs.readdirSync(uploadsDir).filter(name => !name.startsWith('.')).length;

  console.log('生产自检通过');
  console.log(`新闻 ${counts.news} 条，成员 ${counts.team_members} 位，毕业生 ${counts.alumni} 位，项目 ${counts.projects} 项，轮播图 ${counts.banners} 张，上传文件 ${uploads} 个`);
}

main().catch(error => {
  console.error('生产自检失败：' + error.message);
  process.exit(1);
});
