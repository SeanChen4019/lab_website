const { spawnSync } = require('child_process');
const path = require('path');
const suites = [
  'recent-changes-test.js', 'smoke-test.js', 'all-content-test.js', 'reliability-test.js',
  'browser-test.js', 'legacy-forms-test.js', 'collaboration-browser-test.js', 'frontend-sweep.js'
];
(async () => {
  const requested = process.argv.slice(2);
  if (requested.some(name => !suites.includes(name))) throw new Error('未知的测试套件');
  const { env, dir } = await require('./test-environment')();
  console.log('Testing isolated database:', dir);
  for (const script of requested.length ? requested : suites) {
    const child = spawnSync(process.execPath, [path.join(__dirname, script)], { env, stdio: 'inherit' });
    if (child.status !== 0) process.exit(child.status || 1);
  }
  console.log('All isolated suites passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
