const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { searchSite } = require('../services/site-search');

function parseMemberUpdates(value) {
  return String(value || '').split(/\r?\n/).map((line, index) => {
    const parts = line.split(/[|｜]/).map(part => part.trim());
    if (!parts.some(Boolean)) return null;
    const hasDate = /^\d{4}(?:-\d{1,2}(?:-\d{1,2})?)?$/.test(parts[0] || '');
    const date = hasDate ? parts.shift() : '';
    const title = parts.shift() || line.trim();
    const candidateUrl = parts.shift() || '';
    const url = (candidateUrl.startsWith('/') && !candidateUrl.startsWith('//')) || /^https?:\/\//i.test(candidateUrl)
      ? candidateUrl
      : '';
    return { key: 'manual-' + index, date, title, url, source: '个人动态' };
  }).filter(Boolean);
}

// 首页
router.get('/', async (req, res) => {
  try {
    // 获取轮播图
    const banners = await db.all(
      'SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC'
    );

    // 获取实验室新闻
    const news = await db.all(
      'SELECT * FROM news WHERE is_active = 1 ORDER BY is_top DESC, publish_date DESC, id DESC LIMIT 20'
    );

    // 获取社媒动态
    const socialPosts = await db.all(
      'SELECT * FROM social_posts WHERE is_active = 1 ORDER BY sort_order ASC, publish_date DESC LIMIT 20'
    );

    res.render('index', {
      title: '首页',
      banners,
      news,
      socialPosts
    });
  } catch (error) {
    console.error('首页加载错误:', error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 全站搜索
router.get('/search', async (req, res) => {
  try {
    const search = await searchSite(db, req.query.q);
    res.render('search', {
      title: search.query ? `搜索：${search.query}` : '全站搜索',
      searchQuery: search.query,
      searchGroups: search.groups,
      searchTotal: search.total
    });
  } catch (error) {
    console.error('搜索失败:', error);
    res.status(500).render('error', { title: '搜索失败', message: '暂时无法完成搜索，请稍后再试。', code: 500 });
  }
});

// 通知公告列表
router.get('/notices', async (req, res) => {
  try {
    const notices = await db.all(
      'SELECT * FROM notices WHERE is_active = 1 ORDER BY is_top DESC, publish_date DESC, id DESC'
    );
    res.render('notices', { title: '通知公告', notices });
  } catch (error) {
    console.error('通知公告加载失败:', error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 实验室概况
router.get('/about', async (req, res) => {
  try {
    const leader = await db.get(
      `SELECT * FROM team_members
       WHERE member_type = 'teacher' AND role = 'leader' AND is_active = 1
       ORDER BY sort_order ASC, id ASC LIMIT 1`
    );
    const leaderTeam = await db.all(
      `SELECT * FROM team_members
       WHERE member_type = 'teacher' AND role = 'leader' AND is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );
    res.render('about', { title: '实验室概况', leader, leaderTeam });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 团队建设
router.get('/team', async (req, res) => {
  try {
    const teachers = await db.all(
      `SELECT * FROM team_members
       WHERE member_type = 'teacher' AND is_active = 1
       ORDER BY CASE role WHEN 'leader' THEN 0 ELSE 1 END, sort_order ASC, id ASC`
    );
    const currentStudents = await db.all(
      `SELECT * FROM team_members
       WHERE member_type = 'student' AND member_status = 'current' AND is_active = 1
       ORDER BY CASE student_level WHEN 'doctor' THEN 0 WHEN 'master' THEN 1 ELSE 2 END,
                enrollment_year ASC, sort_order ASC, id ASC`
    );
    const alumniStudents = await db.all(
      `SELECT * FROM team_members
       WHERE member_type = 'student' AND member_status = 'alumni' AND is_active = 1
       ORDER BY graduation_year DESC, sort_order ASC, id ASC`
    );

    res.render('team', {
      title: '团队建设',
      teachers,
      currentStudents,
      alumniStudents
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 成员个人主页
router.get('/team/:id', async (req, res) => {
  try {
    const member = await db.get('SELECT * FROM team_members WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!member) return res.status(404).render('error', { title: '未找到', message: '成员主页不存在', code: 404 });

    const escapedName = String(member.name || '').replace(/[\\%_]/g, '\\$&');
    const pattern = '%' + escapedName + '%';
    const relatedNews = await db.all(
      `SELECT id, title, summary, publish_date, category FROM news
       WHERE is_active = 1 AND (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
       ORDER BY publish_date DESC, id DESC LIMIT 8`,
      [pattern, pattern, pattern]
    );
    const manualUpdates = parseMemberUpdates(member.recent_updates);
    const newsUpdates = relatedNews.map(item => ({
      key: 'news-' + item.id,
      date: item.publish_date,
      title: item.title,
      url: '/news/' + item.id,
      source: '实验室新闻'
    }));

    res.render('team-detail', {
      title: member.name,
      member,
      updates: manualUpdates.concat(newsUpdates)
    });
  } catch (error) {
    console.error('成员主页加载失败:', error);
    res.status(500).render('error', { title: '错误', message: '成员主页加载失败', code: 500 });
  }
});

// 兼容旧链接：已并入新导航结构
router.get('/research', (req, res) => {
  res.redirect(301, '/about#intro');
});
router.get('/innovation', (req, res) => {
  res.redirect(301, '/achievements');
});
router.get('/education', (req, res) => {
  res.redirect(301, '/team#students');
});
router.get('/exchange', (req, res) => {
  res.redirect(301, '/about');
});
router.get('/alumni', (req, res) => {
  res.redirect(301, '/team#alumni');
});

// 重大项目（旧链接 → 研究成果·项目）
router.get('/projects', (req, res) => {
  res.redirect(301, '/achievements#projects');
});

// 实验室平台
router.get('/platforms', async (req, res) => {
  try {
    const platforms = await db.all(
      'SELECT * FROM platforms WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    );
    res.render('platforms', {
      title: '平台',
      nationalPlatforms: platforms.filter(item => (item.level || 'national') === 'national'),
      provincialPlatforms: platforms.filter(item => item.level === 'provincial')
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 研究成果
router.get('/achievements', async (req, res) => {
  try {
    const projects = await db.all(
      'SELECT * FROM projects WHERE is_active = 1 ORDER BY start_date DESC'
    );
    const patents = await db.all(
      'SELECT * FROM patents WHERE is_active = 1 ORDER BY grant_date DESC, sort_order ASC, id ASC'
    );
    const papers = await db.all(
      'SELECT * FROM papers WHERE is_active = 1 ORDER BY year DESC, sort_order ASC, id ASC'
    );
    res.render('achievements', {
      title: '研究成果',
      projects,
      patents,
      papers,
      journalPapers: papers.filter(item => (item.pub_type || 'journal') === 'journal'),
      conferencePapers: papers.filter(item => item.pub_type === 'conference')
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 资源服务
router.get('/resources', async (req, res) => {
  try {
    const datasets = await db.all(
      "SELECT * FROM downloads WHERE is_active = 1 AND category = 'dataset' ORDER BY created_at DESC, id DESC"
    );
    const textbooks = await db.all(
      "SELECT * FROM downloads WHERE is_active = 1 AND category = 'textbook' ORDER BY created_at DESC, id DESC"
    );
    res.render('resources', {
      title: '资源服务',
      datasets,
      textbooks
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 相关下载（旧链接 → 资源服务）
router.get('/downloads', (req, res) => {
  res.redirect(301, '/resources');
});

// 下载跳转并记录次数
router.get('/download/:id', async (req, res) => {
  try {
    const item = await db.get('SELECT id, file_url FROM downloads WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!item) {
      return res.status(404).render('error', { title: '未找到', message: '下载资源不存在或已下架', code: 404 });
    }
    const fileUrl = String(item.file_url || '').trim();
    const isLocal = fileUrl.startsWith('/') && !fileUrl.startsWith('//');
    const isWeb = /^https?:\/\//i.test(fileUrl);
    if (!isLocal && !isWeb) {
      return res.status(400).render('error', { title: '下载地址无效', message: '这个资源的下载地址配置不正确', code: 400 });
    }
    await db.run('UPDATE downloads SET download_count = download_count + 1 WHERE id = ?', [item.id]);
    res.redirect(fileUrl);
  } catch (error) {
    console.error('下载资源失败:', error);
    res.status(500).render('error', { title: '下载失败', message: '暂时无法下载，请稍后再试', code: 500 });
  }
});

// 新闻详情
router.get('/news/:id', async (req, res) => {
  try {
    const news = await db.get(
      'SELECT * FROM news WHERE id = ? AND is_active = 1',
      [req.params.id]
    );

    if (!news) {
      return res.status(404).render('error', { title: '未找到', message: '文章不存在', code: 404 });
    }

    res.render('news-detail', { title: news.title, news });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 通知详情
router.get('/notice/:id', async (req, res) => {
  try {
    const notice = await db.get(
      'SELECT * FROM notices WHERE id = ? AND is_active = 1',
      [req.params.id]
    );

    if (!notice) {
      return res.status(404).render('error', { title: '未找到', message: '通知不存在', code: 404 });
    }

    res.render('notice-detail', { title: notice.title, notice });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

module.exports = router;
