function normalizeSearchQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(value, fallback = '') {
  const text = plainText(value) || plainText(fallback);
  return text.length > 150 ? text.slice(0, 150) + '…' : text;
}

async function searchSite(db, rawQuery) {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return { query, groups: [], total: 0 };

  const pattern = '%' + escapeLike(query) + '%';
  const like = " LIKE ? ESCAPE '\\'";
  const [news, notices, members, areas, projects, downloads, platforms, patents, papers] = await Promise.all([
    db.all(
      `SELECT id, title, summary, content, category, publish_date FROM news
       WHERE is_active = 1 AND (title${like} OR summary${like} OR content${like})
       ORDER BY is_top DESC, publish_date DESC LIMIT 20`,
      [pattern, pattern, pattern]
    ),
    db.all(
      `SELECT id, title, content, publish_date FROM notices
       WHERE is_active = 1 AND (title${like} OR content${like})
       ORDER BY is_top DESC, publish_date DESC LIMIT 15`,
      [pattern, pattern]
    ),
    db.all(
      `SELECT id, name, title, research_area, bio, member_type, destination FROM team_members
       WHERE is_active = 1 AND (name${like} OR title${like} OR research_area${like} OR bio${like} OR resume${like} OR destination${like})
       ORDER BY member_type ASC, role ASC, sort_order ASC LIMIT 20`,
      [pattern, pattern, pattern, pattern, pattern, pattern]
    ),
    db.all(
      `SELECT id, title, description FROM research_areas
       WHERE is_active = 1 AND (title${like} OR description${like})
       ORDER BY sort_order ASC LIMIT 12`,
      [pattern, pattern]
    ),
    db.all(
      `SELECT id, title, description, funding_source, status FROM projects
       WHERE is_active = 1 AND (title${like} OR description${like} OR funding_source${like})
       ORDER BY start_date DESC LIMIT 15`,
      [pattern, pattern, pattern]
    ),
    db.all(
      `SELECT id, title, description, category, file_url FROM downloads
       WHERE is_active = 1 AND (title${like} OR description${like} OR category${like})
       ORDER BY created_at DESC LIMIT 12`,
      [pattern, pattern, pattern]
    ),
    db.all(
      `SELECT id, name, description, level FROM platforms
       WHERE is_active = 1 AND (name${like} OR description${like})
       ORDER BY sort_order ASC LIMIT 12`,
      [pattern, pattern]
    ),
    db.all(
      `SELECT id, title, patent_no, inventors, status FROM patents
       WHERE is_active = 1 AND (title${like} OR patent_no${like} OR inventors${like})
       ORDER BY grant_date DESC LIMIT 15`,
      [pattern, pattern, pattern]
    ),
    db.all(
      `SELECT id, title, authors, venue, year FROM papers
       WHERE is_active = 1 AND (title${like} OR authors${like} OR venue${like})
       ORDER BY year DESC LIMIT 15`,
      [pattern, pattern, pattern]
    )
  ]);

  const categoryNames = {
    team: '团队动态',
    research: '科研动态',
    teaching: '教学动态',
    exchange: '合作交流',
    education: '人才培养'
  };

  const groups = [
    {
      key: 'news',
      label: '新闻动态',
      items: news.map(item => ({
        title: item.title,
        excerpt: excerpt(item.summary, item.content),
        meta: [categoryNames[item.category] || item.category, item.publish_date].filter(Boolean).join(' · '),
        url: '/news/' + item.id
      }))
    },
    {
      key: 'notices',
      label: '通知公告',
      items: notices.map(item => ({
        title: item.title,
        excerpt: excerpt(item.content),
        meta: item.publish_date || '',
        url: '/notice/' + item.id
      }))
    },
    {
      key: 'members',
      label: '团队成员',
      items: members.map(item => ({
        title: item.name,
        excerpt: excerpt(item.bio, item.destination || item.research_area),
        meta: [item.member_type === 'student' ? '学生' : '教师', item.title, item.research_area].filter(Boolean).join(' · '),
        url: '/team/' + item.id
      }))
    },
    {
      key: 'research',
      label: '研究方向',
      items: areas.map(item => ({
        title: item.title,
        excerpt: excerpt(item.description),
        meta: '实验室简介',
        url: '/about#intro'
      }))
    },
    {
      key: 'platforms',
      label: '实验室平台',
      items: platforms.map(item => ({
        title: item.name,
        excerpt: excerpt(item.description),
        meta: item.level === 'provincial' ? '省部级平台' : '国家级平台',
        url: '/platforms#' + (item.level === 'provincial' ? 'provincial' : 'national')
      }))
    },
    {
      key: 'projects',
      label: '科研项目',
      items: projects.map(item => ({
        title: item.title,
        excerpt: excerpt(item.description),
        meta: [item.funding_source, item.status].filter(Boolean).join(' · '),
        url: '/achievements#projects'
      }))
    },
    {
      key: 'patents',
      label: '专利',
      items: patents.map(item => ({
        title: item.title,
        excerpt: [item.patent_no, item.inventors].filter(Boolean).join(' · '),
        meta: [item.status, '专利'].filter(Boolean).join(' · '),
        url: '/achievements#patents'
      }))
    },
    {
      key: 'papers',
      label: '论文',
      items: papers.map(item => ({
        title: item.title,
        excerpt: [item.authors, item.venue].filter(Boolean).join(' · '),
        meta: [item.venue, item.year].filter(Boolean).join(' · '),
        url: '/achievements#papers'
      }))
    },
    {
      key: 'downloads',
      label: '数据集与资源',
      items: downloads.map(item => ({
        title: item.title,
        excerpt: excerpt(item.description),
        meta: item.category === 'dataset' ? '公开数据集' : (item.category === 'textbook' ? '教材' : '下载资源'),
        url: item.category === 'dataset' ? '/resources#datasets' : (item.category === 'textbook' ? '/resources#textbooks' : '/download/' + item.id)
      }))
    }
  ].filter(group => group.items.length > 0);

  return {
    query,
    groups,
    total: groups.reduce((sum, group) => sum + group.items.length, 0)
  };
}

module.exports = { normalizeSearchQuery, searchSite };
