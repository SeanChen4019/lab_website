const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const app = require('../server');

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate));
}

async function main() {
  const browserPath = findBrowser();
  if (!browserPath) throw new Error('未找到 Chrome/Edge，请通过 CHROME_PATH 指定浏览器');

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const browserErrors = [];
  let publishedId = null;

  page.on('pageerror', error => browserErrors.push('页面脚本错误: ' + error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseUrl)) browserErrors.push('站内请求失败: ' + request.url());
  });

  try {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const pages = ['/', '/about', '/team', '/platforms', '/achievements', '/resources', '/notices'];
    for (const pathname of pages) {
      const response = await page.goto(baseUrl + pathname, { waitUntil: 'networkidle0' });
      assert.equal(response.status(), 200, `${pathname} 浏览器访问应返回 200`);
    }
    await page.goto(baseUrl + '/research', { waitUntil: 'networkidle0' });
    assert.match(page.url(), /\/about#intro$/, '旧研究页面应跳转到实验室简介');

    await page.goto(baseUrl + '/team', { waitUntil: 'networkidle0' });
    assert.ok((await page.content()).includes('在读学生'), '团队页应展示在读学生');
    assert.ok((await page.content()).includes('毕业学生去向'), '团队页应展示毕业学生去向');
    assert.ok(await page.$('#peopleSearchInput'), '团队页应提供成员即时筛选');
    await page.type('#peopleSearchInput', '吴启晖');
    await page.waitForFunction(() => document.querySelectorAll('[data-people-search]:not([hidden])').length === 1);
    assert.ok((await page.$eval('#peopleSearchResult', element => element.textContent)).includes('1'), '成员筛选应显示准确结果数');
    await page.click('#peopleSearchClear');
    await page.waitForFunction(() => document.querySelectorAll('[data-people-search]:not([hidden])').length > 1);
    assert.ok(await page.$('#alumni'), '团队页应包含毕业学生去向板块');
    assert.ok(await page.$('.alumni-destination-card'), '毕业学生应按去向展示');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-team-directory.png'), fullPage: true });
    const firstProfile = await page.$eval('.people-card', element => element.getAttribute('href'));
    const studentProfile = await page.$eval('.alumni-destination-card', element => element.getAttribute('href'));
    await page.goto(baseUrl + firstProfile, { waitUntil: 'networkidle0' });
    assert.ok(await page.$('.member-profile-page'), '点击成员应进入个人主页');
    assert.ok((await page.content()).includes('个人履历'), '个人主页应包含履历');
    assert.ok((await page.content()).includes('近期动态'), '个人主页应包含近期动态');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-member-profile.png'), fullPage: true });

    await page.goto(baseUrl + studentProfile, { waitUntil: 'networkidle0' });
    assert.ok((await page.content()).includes('毕业去向'), '毕业学生个人主页应显示毕业去向');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-student-profile.png'), fullPage: true });

    await page.goto(baseUrl + '/alumni', { waitUntil: 'networkidle0' });
    assert.match(page.url(), /\/team#alumni$/, '旧毕业生入口应跳转到毕业学生去向');

    await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
    assert.ok((await page.content()).includes('电磁频谱认知智能通信实验室'), '主页标题应使用新名称');
    await page.type('#headerSearchInput', '频谱');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('.header-search button')
    ]);
    assert.match(page.url(), /\/search\?q=/, '顶部搜索应跳转到搜索结果页');
    assert.ok(await page.$('.search-result-item'), '搜索结果页应展示结果');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-search-working.png'), fullPage: true });

    await page.goto(baseUrl + '/admin/login', { waitUntil: 'networkidle0' });
    await page.type('#username', process.env.TEST_ADMIN_USERNAME || 'admin');
    await page.type('#password', process.env.TEST_ADMIN_PASSWORD || 'admin123');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('#loginForm button[type="submit"]')
    ]);
    assert.match(page.url(), /\/admin\/publish$/, '登录后应进入极速发布');
    assert.ok(await page.$('#easyPublishForm'), '极速发布表单应显示');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-easy-publish-form.png'), fullPage: true });

    await page.goto(baseUrl + '/admin/team', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#teamTable tr');
    await page.evaluate(() => showAddModal());
    await page.select('#memberType', 'student');
    assert.ok(await page.$('.member-editor-guide'), '成员后台应提供傻瓜式填写说明');
    assert.equal(await page.$eval('.student-field', element => getComputedStyle(element).display !== 'none'), true, '选择学生后应显示学生专属字段');
    assert.ok(await page.$('#memberResume'), '成员后台应支持填写履历');
    assert.ok(await page.$('#memberUpdates'), '成员后台应支持填写近期动态');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-admin-team-editor.png'), fullPage: true });
    await page.evaluate(() => closeModal());
    await page.goto(baseUrl + '/admin/publish', { waitUntil: 'networkidle0' });
    assert.ok(await page.$('#easyPublishForm'), '返回极速发布后表单应正常显示');

    const marker = '浏览器发布验收-' + Date.now();
    await page.type('#publishTitle', marker);
    await page.evaluate(() => {
      const canvas = document.querySelector('.publisher-canvas');
      canvas.innerHTML = '<h2>浏览器端到端验收</h2><p>这条内容用于检查发布后的前台展示。</p>';
      canvas.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '验收' }));
    });
    await page.click('#publishPreview');
    await page.waitForSelector('#publisherPreview.active');
    await page.click('#publisherPreview [data-close]');
    await page.click('#publishSubmit');
    await page.waitForSelector('#publishSuccess:not([hidden])', { timeout: 10000 });
    const published = await page.evaluate(() => ({
      id: document.getElementById('publishSuccess').dataset.publishedId,
      href: document.getElementById('publishViewLink').getAttribute('href'),
      title: document.getElementById('publishSuccessTitle').textContent
    }));
    publishedId = published.id;
    assert.equal(published.title, marker, '成功提示应显示刚发布的标题');
    assert.match(published.href, /^\/news\/\d+$/, '成功提示应提供准确的前台链接');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-easy-publish-success.png'), fullPage: true });

    await page.goto(baseUrl + published.href, { waitUntil: 'networkidle0' });
    assert.ok((await page.content()).includes(marker), '新发布文章应能在详情页看到');

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(baseUrl + '/team', { waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, '手机团队目录不应横向溢出');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-team-mobile.png'), fullPage: true });
    await page.goto(baseUrl + studentProfile, { waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, '手机个人主页不应横向溢出');
    await page.screenshot({ path: path.join(__dirname, '..', 'qa-member-mobile.png'), fullPage: true });

    await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
    await page.click('#mobileMenuBtn');
    assert.ok(await page.$('.main-nav.active .mobile-nav-search'), '手机菜单应提供搜索入口');
    await page.type('#mobileSearchInput', '招生');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('.mobile-nav-search button')
    ]);
    assert.match(page.url(), /\/search\?q=/, '手机搜索应跳转到结果页');

    assert.deepEqual(browserErrors, [], browserErrors.join('\n'));
    console.log(`浏览器测试通过：桌面/手机搜索、后台登录、预览、发布和前台详情均正常；发布测试 ID ${publishedId}`);
  } finally {
    if (publishedId) {
      try {
        await page.goto(baseUrl + '/admin/publish', { waitUntil: 'domcontentloaded' });
        await page.evaluate(async id => {
          const token = localStorage.getItem('token');
          await fetch('/api/news/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
        }, publishedId);
      } catch (error) {
        console.error('清理浏览器测试内容失败：' + error.message);
      }
    }
    await page.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error('浏览器测试失败：' + error.message);
  process.exitCode = 1;
});
