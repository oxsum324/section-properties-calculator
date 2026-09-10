// Focused survey regression runner; no other toolbox modules are served or tested.
const fs = require('node:fs/promises'), path = require('node:path'), { pathToFileURL } = require('node:url'), { createServer } = require('node:http');
const { chromium } = require('../../.github/pages-smoke/node_modules/playwright');
(async () => {
  const moduleRoot = path.resolve(__dirname, '..'), out = path.resolve(moduleRoot, '../output/field-survey-validation'); await fs.mkdir(out, { recursive: true });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), relative = decodeURIComponent(url.pathname).replace(/^\/field-survey\//, '');
      const file = path.resolve(moduleRoot, relative); if (!file.startsWith(moduleRoot + path.sep)) throw new Error('Outside survey');
      const data = await fs.readFile(file), types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), headless: true });
  try {
    const base = `http://127.0.0.1:${server.address().port}/field-survey/recorder.html`;
    for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['report', 'v010']) {
      const selected = { report: ['report-browser.js', 'verifyReportWorkflow'], v010: ['v010-browser.js', 'verifyV010'], v08: ['field-v08-browser.js', 'verifyFieldV08Workflow'], scale: ['scale-browser.js', 'verifyScale'] }[name];
      if (!selected) throw new Error('Unknown focused workflow: ' + name);
      const workflow = await import(pathToFileURL(path.join(__dirname, selected[0]))); await workflow[selected[1]](browser, base, out);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
