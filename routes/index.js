const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { searchSite } = require('../services/site-search');
const achievementItems = require('../services/achievement-items');

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
    const projectRows = await db.all(
      'SELECT * FROM projects WHERE is_active = 1 ORDER BY start_date DESC, id DESC'
    );
    const patentRows = await db.all(
      'SELECT * FROM patents WHERE is_active = 1 ORDER BY grant_date DESC, sort_order ASC, id ASC'
    );
    const paperRows = await db.all(
      'SELECT * FROM papers WHERE is_active = 1 ORDER BY year DESC, sort_order ASC, id ASC'
    );

    // 三类成果统一归一化成同一套条目结构，模板只写一次
    const projects = achievementItems.projectItems(projectRows);
    const patents = achievementItems.patentItems(patentRows);
    const papers = achievementItems.paperItems(paperRows);

    const sections = [
      {
        id: 'projects',
        heading: '项目',
        icon: 'fa-project-diagram',
        unit: '项',
        items: projects,
        groups: achievementItems.groupByYear(projects),
        filters: achievementItems.buildFilters('project', projects),
        emptyText: '暂无项目资料，可在后台“项目”中添加。'
      },
      {
        id: 'patents',
        heading: '专利',
        icon: 'fa-certificate',
        unit: '项',
        items: patents,
        groups: achievementItems.groupByYear(patents),
        filters: achievementItems.buildFilters('patent', patents),
        emptyText: '暂无专利资料，可在后台“专利”中添加。'
      },
      {
        id: 'papers',
        heading: '论文',
        icon: 'fa-book-open',
        unit: '篇',
        items: papers,
        groups: achievementItems.groupByYear(papers),
        filters: achievementItems.buildFilters('paper', papers),
        emptyText: '暂无论文资料，可在后台“论文管理”中添加。'
      }
    ];

    res.render('achievements', { title: '研究成果', sections });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 论文详情
router.get('/paper/:id', async (req, res) => {
  try {
    const paper = await db.get(
      'SELECT * FROM papers WHERE id = ? AND is_active = 1',
      [req.params.id]
    );

    if (!paper) {
      return res.status(404).render('error', { title: '未找到', message: '论文不存在', code: 404 });
    }

    // 同研究方向的其他论文，最多 5 篇
    let related = [];
    if (paper.direction) {
      related = await db.all(
        'SELECT id, title, venue, year, level, pub_type FROM papers WHERE is_active = 1 AND direction = ? AND id != ? ORDER BY year DESC, sort_order ASC, id ASC LIMIT 5',
        [paper.direction, paper.id]
      );
    }
    if (related.length < 3) {
      const more = await db.all(
        'SELECT id, title, venue, year, level, pub_type FROM papers WHERE is_active = 1 AND id != ? ORDER BY year DESC, sort_order ASC, id ASC LIMIT 6',
        [paper.id]
      );
      const seen = new Set(related.map(item => item.id));
      for (const item of more) {
        if (related.length >= 5) break;
        if (!seen.has(item.id)) { related.push(item); seen.add(item.id); }
      }
    }

    res.render('paper-detail', { title: paper.title, paper, related });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 专利详情
router.get('/patent/:id', async (req, res) => {
  try {
    const patent = await db.get(
      'SELECT * FROM patents WHERE id = ? AND is_active = 1',
      [req.params.id]
    );

    if (!patent) {
      return res.status(404).render('error', { title: '未找到', message: '专利不存在', code: 404 });
    }

    // 同类型专利优先，不足 3 条时补上最新的其他专利
    let relatedRows = await db.all(
      'SELECT * FROM patents WHERE is_active = 1 AND kind = ? AND id != ? ORDER BY grant_date DESC, sort_order ASC, id ASC LIMIT 5',
      [patent.kind || '发明专利', patent.id]
    );
    if (relatedRows.length < 3) {
      const more = await db.all(
        'SELECT * FROM patents WHERE is_active = 1 AND id != ? ORDER BY grant_date DESC, sort_order ASC, id ASC LIMIT 6',
        [patent.id]
      );
      const seen = new Set(relatedRows.map(item => item.id));
      for (const row of more) {
        if (relatedRows.length >= 5) break;
        if (!seen.has(row.id)) { relatedRows.push(row); seen.add(row.id); }
      }
    }

    res.render('patent-detail', {
      title: patent.title,
      patent,
      related: achievementItems.patentItems(relatedRows)
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: '错误', message: '页面加载失败', code: 500 });
  }
});

// 项目详情
router.get('/project/:id', async (req, res) => {
  try {
    const project = await db.get(
      'SELECT * FROM projects WHERE id = ? AND is_active = 1',
      [req.params.id]
    );

    if (!project) {
      return res.status(404).render('error', { title: '未找到', message: '项目不存在', code: 404 });
    }

    const relatedRows = await db.all(
      'SELECT * FROM projects WHERE is_active = 1 AND id != ? ORDER BY start_date DESC, id DESC LIMIT 5',
      [project.id]
    );

    res.render('project-detail', {
      title: project.title,
      project,
      related: achievementItems.projectItems(relatedRows)
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
