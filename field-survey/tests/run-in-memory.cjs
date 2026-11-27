const fs = require('node:fs/promises'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { chromium } = require('../../.github/pages-smoke/node_modules/playwright');
(async () => {
  const root = path.resolve(__dirname, '..'), origin = 'https://survey-test.invalid', base = origin + '/field-survey/recorder.html';
  const sharedAssets = new Set(['/tool-chrome.css', '/tool-nav.manifest.js', '/tool-chrome.js', '/結構工具箱/assets/hy/colors_and_type.css']);
  const out = path.resolve(root, '../output/field-survey-validation'); await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true });
  const create = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await create({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()), pathname = decodeURIComponent(url.pathname);
      const localFile = pathname.slice('/field-survey/'.length);
      const isSurveyFile = pathname.startsWith('/field-survey/') && /^[a-z0-9.-]+$/.test(localFile);
      if (url.origin !== origin || (!isSurveyFile && !sharedAssets.has(pathname))) return route.abort('blockedbyclient');
      const file = isSurveyFile ? path.join(root, localFile) : path.resolve(root, '..', pathname.slice(1));
      try {
        const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
        await route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: await fs.readFile(file) });
      } catch { await route.fulfill({ status: 404, body: '' }); }
    });
    return context;
  };
  try {
    const workflows = { v031: ['v031-browser.js', 'verifyV031'], v030: ['v030-browser.js', 'verifyV030'], v0303: ['v0303-browser.js', 'verifyV0303'] };
    for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['v031']) {
      const selected = workflows[name]; if (!selected) throw new Error('Unsupported source-only workflow: ' + name);
      await (await import(pathToFileURL(path.join(__dirname, selected[0]))))[selected[1]](browser, base, out);
    }
    console.log('Source-only browser run: local file responses, real DOM/IndexedDB/canvas, network and service workers untested.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
