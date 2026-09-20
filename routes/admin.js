const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nuaa-lab-jwt-secret-2026';

// 管理员认证中间件
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.session.token;

  if (!token) {
    const redirectTo = req.originalUrl !== '/admin' ? '?redirect=' + encodeURIComponent(req.originalUrl) : '';
    return res.redirect('/admin/login' + redirectTo);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    res.locals.user = decoded;
    next();
  } catch (error) {
    return res.redirect('/admin/login');
  }
}

// 登录页面
router.get('/login', (req, res) => {
  res.render('admin/login', { title: '管理登录' });
});

// 默认进入可视化内容工作台
router.get('/', adminAuth, (req, res) => {
  res.redirect('/admin/publish');
});

// 零门槛发布入口
router.get('/publish', adminAuth, (req, res) => {
  res.render('admin/publish', { title: '极速发布' });
});

// 可视化内容工作台
router.get('/visual', adminAuth, (req, res) => {
  const allowedPages = ['/', '/about', '/team', '/platforms', '/achievements', '/resources'];
  const initialPage = allowedPages.includes(req.query.page) ? req.query.page : '/team';
  res.render('admin/visual', {
    title: '可视化内容管理',
    initialPage
  });
});

// 传统数据仪表盘（保留为高级管理入口）
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const db = require('../database/db');

    const [notices, news, members, projects, downloads, platforms, patents, papers, socialPosts] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM notices'),
      db.get('SELECT COUNT(*) as count FROM news'),
      db.get('SELECT COUNT(*) as count FROM team_members'),
      db.get('SELECT COUNT(*) as count FROM projects'),
      db.get('SELECT COUNT(*) as count FROM downloads'),
      db.get('SELECT COUNT(*) as count FROM platforms'),
      db.get('SELECT COUNT(*) as count FROM patents'),
      db.get('SELECT COUNT(*) as count FROM papers'),
      db.get('SELECT COUNT(*) as count FROM social_posts')
    ]);

    res.render('admin/dashboard', {
      title: '管理后台',
      stats: {
        notices: notices.count,
        news: news.count,
        members: members.count,
        projects: projects.count,
        downloads: downloads.count,
        platforms: platforms.count,
        patents: patents.count,
        papers: papers.count,
        socialPosts: socialPosts.count
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '加载失败', code: 500 });
  }
});

// 轮播图管理
router.get('/banners', adminAuth, async (req, res) => {
  res.render('admin/banners', { title: '轮播图管理' });
});

// 通知管理
router.get('/notices', adminAuth, async (req, res) => {
  res.render('admin/notices', { title: '通知公告管理' });
});

// 新闻管理
router.get('/news', adminAuth, async (req, res) => {
  res.render('admin/news', { title: '新闻动态管理' });
});

// 团队管理
router.get('/team', adminAuth, async (req, res) => {
  res.render('admin/team', { title: '团队成员管理' });
});

// 研究方向管理
router.get('/research', adminAuth, async (req, res) => {
  res.render('admin/research', { title: '研究方向管理' });
});

// 项目管理
router.get('/projects', adminAuth, async (req, res) => {
  res.render('admin/projects', { title: '项目管理' });
});

// 平台管理
router.get('/platforms', adminAuth, async (req, res) => {
  res.render('admin/platforms', { title: '平台管理' });
});

// 专利管理
router.get('/patents', adminAuth, async (req, res) => {
  res.render('admin/patents', { title: '专利管理' });
});

// 论文管理
router.get('/papers', adminAuth, async (req, res) => {
  res.render('admin/papers', { title: '论文管理' });
});

// 媒体报道管理
router.get('/media', adminAuth, async (req, res) => {
  res.render('admin/media', { title: '媒体报道管理' });
});

// 下载管理
router.get('/downloads', adminAuth, async (req, res) => {
  res.render('admin/downloads', { title: '下载管理' });
});

// 系统设置
router.get('/settings', adminAuth, async (req, res) => {
  res.render('admin/settings', { title: '系统设置' });
});

module.exports = router;
