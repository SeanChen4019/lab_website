const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'nuaa-lab-website-secret-key-2026';

if (process.env.NODE_ENV === 'production') {
  const jwtSecret = process.env.JWT_SECRET || '';
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || jwtSecret.length < 32) {
    throw new Error('生产环境必须配置至少32位的 SESSION_SECRET 和 JWT_SECRET');
  }
}

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const cookieSecure = process.env.COOKIE_SECURE === 'true'
  ? true
  : process.env.COOKIE_SECURE === 'false'
    ? false
    : 'auto';

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- 安全中间件 ----
app.use(helmet({
  frameguard: { action: 'sameorigin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
    secure: cookieSecure
  }
}));

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// Content-derived public asset versions prevent mixed releases in browser caches.
const crypto = require('crypto');
app.locals.assetUrl = function(assetPath) {
  const file = path.join(__dirname, 'public', assetPath);
  const version = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  return assetPath + '?v=' + version;
};

// 全局变量中间件
const db = require('./database/db');
app.use(async (req, res, next) => {
  try {
    const settings = await db.all('SELECT key, value FROM settings');
    res.locals.siteSettings = {};
    settings.forEach(s => {
      res.locals.siteSettings[s.key] = s.value;
    });

    res.locals.navItems = [
      { name: '首页', url: '/' },
      {
        name: '实验室概况',
        url: '/about',
        children: [
          { name: '实验室简介', url: '/about#intro' },
          { name: '实验室负责人', url: '/about#leader' }
        ]
      },
      {
        name: '团队建设',
        url: '/team',
        children: [
          { name: '教师', url: '/team#teachers' },
          { name: '在读学生', url: '/team#students' },
          { name: '毕业学生去向', url: '/team#alumni' }
        ]
      },
      {
        name: '平台',
        url: '/platforms',
        children: [
          { name: '国家级平台', url: '/platforms#national' },
          { name: '省部级平台', url: '/platforms#provincial' }
        ]
      },
      {
        name: '研究成果',
        url: '/achievements',
        children: [
          { name: '项目', url: '/achievements#projects' },
          { name: '专利', url: '/achievements#patents' },
          { name: '论文', url: '/achievements#papers' }
        ]
      },
      {
        name: '资源服务',
        url: '/resources',
        children: [
          { name: '公开数据集', url: '/resources#datasets' },
          { name: '教材', url: '/resources#textbooks' }
        ]
      }
    ];

    res.locals.currentPath = req.path;
    res.locals.cmsPreview = req.query.cms === '1' && Boolean(req.session && req.session.token);
    next();
  } catch (error) {
    console.error('Global middleware error:', error);
    // 设置错误标志，让模板可以显示维护提示
    res.locals.siteSettings = {};
    res.locals.navItems = [];
    res.locals.currentPath = req.path;
    res.locals.cmsPreview = false;
    res.locals.dbError = true;
    next();
  }
});

// 路由
const indexRoutes = require('./routes/index');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.get('/healthz', async (req, res) => {
  try {
    await db.get('SELECT 1 AS ok');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'error' });
  }
});

app.use('/', indexRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// 404处理
app.use((req, res) => {
  res.status(404).render('error', {
    title: '页面未找到',
    message: '抱歉，您访问的页面不存在。',
    code: 404
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: '服务器错误',
    message: '抱歉，服务器出现错误，请稍后再试。',
    code: 500
  });
});

// 直接运行时启动服务器；测试代码 require 本文件时只取得 Express 应用。
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log('==========================================');
    console.log('  电磁频谱认知智能通信实验室网站');
    console.log('  服务器已启动: http://' + HOST + ':' + PORT);
    console.log('  管理后台: http://' + HOST + ':' + PORT + '/admin');
    console.log('==========================================');
  });
}

module.exports = app;
