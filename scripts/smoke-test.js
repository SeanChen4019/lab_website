const assert = require('node:assert/strict');
const app = require('../server');

const adminUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

async function json(response) {
  const data = await response.json();
  return { response, data };
}

async function main() {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let token = '';
  let createdNewsId = null;
  let createdNoticeId = null;
  let createdMemberId = null;

  try {
    const publicPages = ['/', '/about', '/team', '/platforms', '/achievements', '/resources', '/notices', '/search?q=频谱', '/admin/login'];
    for (const path of publicPages) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, 200, `${path} 应返回 200`);
      const html = await response.text();
      assert.match(html, /<html lang="zh-CN">/, `${path} 应返回中文 HTML 页面`);
      if (!path.startsWith('/admin')) assert.match(html, /class="header-search site-search-form"/, `${path} 应包含可用的顶部搜索框`);
    }

    const legacyRedirects = [
      ['/research', '/about#intro'],
      ['/innovation', '/achievements'],
      ['/education', '/team#students'],
      ['/exchange', '/about'],
      ['/alumni', '/team#alumni'],
      ['/projects', '/achievements#projects'],
      ['/downloads', '/resources']
    ];
    for (const [from, to] of legacyRedirects) {
      const response = await fetch(baseUrl + from, { redirect: 'manual' });
      assert.equal(response.status, 301, `${from} 应 301 永久跳转`);
      assert.equal(response.headers.get('location'), to, `${from} 应跳转到 ${to}`);
    }

    const oldAlumni = await fetch(baseUrl + '/alumni', { redirect: 'manual' });
    assert.equal(oldAlumni.status, 301, '旧毕业生页面应永久跳转到毕业学生去向');
    assert.equal(oldAlumni.headers.get('location'), '/team#alumni');
    const homePage = await (await fetch(baseUrl + '/')).text();
    assert.match(homePage, /电磁频谱认知智能通信实验室/, '主页应显示新的实验室名称');
    assert.match(homePage, /实验室新闻/, '主页应包含实验室新闻板块');
    assert.match(homePage, /媒体关注/, '主页应包含媒体关注板块');
    const teamPage = await (await fetch(baseUrl + '/team')).text();
    assert.match(teamPage, /在读学生/);
    assert.match(teamPage, /毕业学生去向/);
    assert.doesNotMatch(teamPage, /历届毕业生/);

    const missingNews = await fetch(baseUrl + '/news/99999999');
    assert.equal(missingNews.status, 404, '不存在的文章应返回 404');

    const unauthorized = await fetch(baseUrl + '/api/news');
    assert.equal(unauthorized.status, 401, '未登录不能读取后台数据');

    const login = await json(await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPassword })
    }));
    assert.equal(login.response.status, 200, '管理员应能登录');
    assert.equal(login.data.success, true);
    token = login.data.token;
    const authHeaders = { 'content-type': 'application/json', authorization: 'Bearer ' + token };

    const memberMarker = 'QA学生-' + Date.now();
    const createdMember = await json(await fetch(baseUrl + '/api/team', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: memberMarker,
        title: '硕士研究生',
        role: 'member',
        member_type: 'student',
        member_status: 'alumni',
        student_level: 'master',
        enrollment_year: 2023,
        graduation_year: 2026,
        destination: '测试单位 · 算法工程师',
        email: 'qa-student@example.com',
        research_area: '智能通信测试',
        bio: '用于个人主页端到端验收。',
        resume: '2023年，进入实验室学习\n2026年，完成硕士学业',
        recent_updates: '2026-06-01｜完成学位论文答辩',
        photo_url: '',
        sort_order: 999,
        is_active: 1
      })
    }));
    assert.equal(createdMember.response.status, 201, '学生资料应能创建');
    assert.ok(createdMember.data.id, '学生资料应返回个人主页 ID');
    createdMemberId = createdMember.data.id;
    const [memberProfile, memberDirectory, memberSearch] = await Promise.all([
      fetch(baseUrl + createdMember.data.url),
      fetch(baseUrl + '/team'),
      fetch(baseUrl + '/search?q=' + encodeURIComponent(memberMarker))
    ]);
    assert.match(await memberProfile.text(), /测试单位 · 算法工程师/, '个人主页应显示毕业去向');
    assert.match(await memberDirectory.text(), new RegExp(memberMarker), '学生应出现在团队目录');
    assert.match(await memberSearch.text(), new RegExp(memberMarker), '学生个人主页应可被搜索');

    const invalidNews = await json(await fetch(baseUrl + '/api/news', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ category: 'invalid', title: '错误栏目' })
    }));
    assert.equal(invalidNews.response.status, 400, '错误栏目应得到 400 而不是 500');

    const marker = 'QA-PUBLISH-' + Date.now();
    const createdNews = await json(await fetch(baseUrl + '/api/news', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        category: 'research',
        title: marker,
        summary: '后台发布与前台展示自动验收',
        content: '<h2>自动验收</h2><p>正文可以在前台正常显示。</p>',
        image_url: '',
        publish_date: new Date().toISOString().slice(0, 10),
        is_top: 0,
        is_active: 1
      })
    }));
    assert.equal(createdNews.response.status, 201, '新闻发布应返回 201');
    assert.ok(createdNews.data.id, '新闻发布应返回新 ID');
    createdNewsId = createdNews.data.id;

    const [detail, listing, search] = await Promise.all([
      fetch(baseUrl + createdNews.data.url),
      fetch(baseUrl + '/'),
      fetch(baseUrl + '/search?q=' + encodeURIComponent(marker))
    ]);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), new RegExp(marker), '文章详情应显示新内容');
    assert.match(await listing.text(), new RegExp(marker), '首页新闻区应立即显示新内容');
    assert.match(await search.text(), new RegExp(marker), '全站搜索应立即找到新内容');

    const noticeMarker = 'QA-NOTICE-' + Date.now();
    const createdNotice = await json(await fetch(baseUrl + '/api/notices', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: noticeMarker,
        content: '<p>通知发布验收。</p>',
        link_url: '',
        publish_date: new Date().toISOString().slice(0, 10),
        is_top: 0,
        is_active: 1
      })
    }));
    assert.equal(createdNotice.response.status, 201, '通知发布应返回 201');
    assert.ok(createdNotice.data.id, '通知发布应返回新 ID');
    createdNoticeId = createdNotice.data.id;
    const noticesPage = await fetch(baseUrl + '/notices');
    assert.match(await noticesPage.text(), new RegExp(noticeMarker), '通知列表应立即显示新通知');

    console.log(`冒烟测试通过：${publicPages.length} 个页面、搜索、登录、新闻/通知发布与前台展示均正常`);
  } finally {
    if (token && createdNewsId) {
      await fetch(baseUrl + '/api/news/' + createdNewsId, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
    }
    if (token && createdNoticeId) {
      await fetch(baseUrl + '/api/notices/' + createdNoticeId, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
    }
    if (token && createdMemberId) {
      await fetch(baseUrl + '/api/team/' + createdMemberId, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
    }
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error('冒烟测试失败：' + error.message);
  process.exitCode = 1;
});
