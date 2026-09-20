const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate));
}

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3210';
const pages = ['/', '/about', '/team', '/platforms', '/achievements', '/resources'];

(async () => {
  const browserPath = findBrowser();
  if (!browserPath) throw new Error('未找到 Chrome/Edge');
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const outDir = path.join(__dirname, '..', 'qa-newnav');
  fs.mkdirSync(outDir, { recursive: true });
  for (const pathname of pages) {
    const name = pathname === '/' ? 'home' : pathname.slice(1);
    await page.goto(BASE + pathname, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    if (pathname === '/team') {
      await page.evaluate(() => document.getElementById('alumni').scrollIntoView());
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({ path: path.join(outDir, 'team-alumni.png') });
    }
    console.log('captured', pathname);
  }
  await browser.close();
})();
