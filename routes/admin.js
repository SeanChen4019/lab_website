const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nuaa-lab-jwt-secret-2026';

// 管理员认证中间件
async function adminAuth(req,res,next) {
  try {
    req.user=await require('../services/auth').verify(require('../services/auth').bearer(req) || req.session.token);
    res.locals.user=req.user;
    if(req.user.role!=='superadmin' && !['/workspace','/account'].includes(req.path)) return res.redirect('/admin/workspace');
    next();
  } catch(_) { res.redirect('/admin/login'); }
}
router.get('/register',(req,res)=>res.render('admin/register',{title:'申请普通管理员账号'}));
router.get('/workspace',adminAuth,(req,res)=>res.render('admin/collaboration',{title:'我的内容',mode:'workspace'}));
router.get('/accounts',adminAuth,(req,res)=>res.render('admin/collaboration',{title:'账号管理',mode:'accounts'}));
router.get('/reviews',adminAuth,(req,res)=>res.render('admin/collaboration',{title:'内容审核',mode:'reviews'}));
router.get('/account',adminAuth,(req,res)=>res.render('admin/collaboration',{title:'账号安全',mode:'account'}));

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

    const [news, members, projects, downloads, platforms, patents, papers, socialPosts] = await Promise.all([
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

// 新闻管理
router.get('/news', adminAuth, async (req, res) => {
  res.render('admin/news', { title: '新闻动态管理' });
});

// 团队管理
router.get('/team', adminAuth, async (req, res) => {
  res.render('admin/team', { title: '团队成员管理' });
});

// 研究方向管理

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
