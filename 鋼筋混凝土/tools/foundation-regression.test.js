const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_TEST_PORT || 8123);
const TOOL_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/foundation.html`;
const htmlPath = path.join(__dirname, 'foundation.html');
const commonPath = path.join(__dirname, '..', 'shared', 'common.js');
const casesPath = path.join(__dirname, 'foundation-regression-cases.json');
const toleranceDefault = 0.001;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function serveStatic(rootDir, port = PORT) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  const server = http.createServer((req, res) => {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safePath = path.normalize(path.join(rootDir, reqPath === '/' ? 'index.html' : reqPath));
    if (!safePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(safePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(safePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function nearlyEqual(a, b, tolerance) {
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
  if (a == null && b == null) return true;
  if (!isFinite(a) || !isFinite(b)) return a === b;
  return Math.abs(a - b) <= tolerance;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function toTfMaybe(v) {
  if (v == null || !isFinite(v)) return v;
  return Math.abs(v) > 1000 ? v / 1000 : v;
}

async function exerciseFoundationProjectStorage(page) {
  await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.querySelector('.mode-btn[data-mode="check"]')?.click();
    document.querySelector('#mainTabs button[data-tab="pile"]')?.click();
    setField('projName', '基礎專案存讀檔測試');
    setField('projNo', 'RC-FDTN-001');
    setField('projDesigner', 'QA');
    setField('showSteps', true);
    setField('showAdvanced', true);
    setField('fc', 350);
    setField('fy', 4200);
    setField('pc1', 55);
    setField('pc2', 55);
    setField('pileD', 45);
    setField('pileQa', 82);
    setField('pileQt', 42);
    setField('pileCount', 4);
    setField('pileSpacing', 140);
    setField('pileSoilProfile', '0, 4, 12, 0, 30, 0.95, sand\n4, 16, 32, 0, 36, 1.05, gravel');
    if (typeof window.calcFdtn === 'function') window.calcFdtn();
  });
  await wait(300);

  const saved = await page.evaluate(() => window.collectFoundationProjectData());
  assert(saved.schema === 'rc-foundation-project-v1', 'foundation project schema', saved.schema);
  assert(saved.tool === 'rc-foundation', 'foundation project tool id', saved.tool);
  assert(saved.mode === 'check', 'foundation project stores mode', saved.mode);
  assert(saved.activeTab === 'pile', 'foundation project stores active tab', saved.activeTab);
  assert(saved.metadata.projectName === '基礎專案存讀檔測試', 'foundation project metadata', saved.metadata.projectName);
  assert(saved.fields.pileD.value === '45', 'foundation project stores numeric input as editable value', saved.fields.pileD.value);
  assert(saved.fields.showSteps.checked === true, 'foundation project stores checkbox state', saved.fields.showSteps.checked);
  assert(saved.fields.pileSoilProfile.value.includes('gravel'), 'foundation project stores soil profile textarea', saved.fields.pileSoilProfile.value);
  assert(saved.fields.foundationProjectFile == null, 'foundation project excludes file input', 'file input excluded');

  const restored = await page.evaluate(payload => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setField('projName', '已覆寫');
    setField('pileD', 60);
    setField('showSteps', false);
    setField('pileSoilProfile', '0, 1, 1, 0, 20, 1.0, clay');
    window.applyFoundationProjectData(payload, { silent: true });
    window.saveFoundationProjectDraft();
    setField('projName', '再次覆寫');
    window.loadFoundationProjectDraft();
    return {
      projectName: document.getElementById('projName')?.value,
      pileD: document.getElementById('pileD')?.value,
      showSteps: document.getElementById('showSteps')?.checked,
      soilProfile: document.getElementById('pileSoilProfile')?.value,
      mode: document.querySelector('.mode-btn.active')?.dataset.mode,
      activeTab: document.querySelector('#mainTabs button.active')?.dataset.tab,
      draftRaw: localStorage.getItem('rc.foundation.project.draft'),
      ftLastOk: !!window.ftLast && window.ftLast.tab === 'pile',
    };
  }, saved);
  assert(restored.projectName === '基礎專案存讀檔測試', 'foundation project restores project name', restored.projectName);
  assert(restored.pileD === '45', 'foundation project restores numeric field', restored.pileD);
  assert(restored.showSteps === true, 'foundation project restores checkbox', restored.showSteps);
  assert(restored.soilProfile.includes('gravel'), 'foundation project restores soil profile textarea', restored.soilProfile);
  assert(restored.mode === 'check', 'foundation project restores mode', restored.mode);
  assert(restored.activeTab === 'pile', 'foundation project restores active tab', restored.activeTab);
  assert(!!restored.draftRaw, 'foundation project draft saved to localStorage', 'rc.foundation.project.draft');
  assert(restored.ftLastOk, 'foundation project recalculates after restore', 'ftLast pile present');
}

async function main() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const common = fs.readFileSync(commonPath, 'utf8');
  const pack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const tolerance = pack.tolerance ?? toleranceDefault;
  const reviewHelperUses = (html.match(/RCUI\.buildReviewCheckGroup/g) || []).length;

  assert(html.includes('id="mainTabs"'), 'foundation.html has section tabs', 'multi-foundation tab UI exists');
  assert(html.includes('id="bannerStatus"'), 'foundation.html has banner', 'summary banner exists');
  assert(html.includes('window.ftLast'), 'foundation.html exports ftLast', 'result snapshot exists for regression capture');
  assert(html.includes('id="cHDL"') && html.includes('id="cHE"'), 'combined footing has horizontal force inputs', 'HDL/HE inputs exist');
  assert(html.includes('id="cc-slide"') && html.includes('id="cr-FSslide"'), 'combined footing has sliding checks', 'combined sliding UI exists');
  assert(!html.includes('預留，尚未做抗滑檢核'), 'combined footing sliding input is not stale placeholder text', 'cMu is active');
  assert(!html.includes('未提供 DDM 分析</span><span class="value">✓ OK'), 'mat DDM unavailable state is not shown as OK', 'DDM/EFM gap must stay warning');
  assert(html.includes('待確認 — 本工具未提供'), 'mat DDM unavailable state has warning text', 'runtime label is待確認');
  assert(common.includes('window.RCUI.buildReviewCheckGroup'), 'shared/common.js exposes review check group builder', 'review report rows have shared helper');
  assert(reviewHelperUses >= 3, 'foundation report uses shared review check group builder', 'all foundation warning report branches use shared helper');
  assert(html.includes('const FOUNDATION_PROJECT_SCHEMA = \'rc-foundation-project-v1\''), 'foundation project schema present', 'rc-foundation-project-v1');
  assert(html.includes('id="btnSaveFoundationProject"') && html.includes('id="btnLoadFoundationProject"'), 'foundation project file controls present', 'save/load buttons present');
  assert(html.includes('id="btnSaveFoundationDraft"') && html.includes('id="btnLoadFoundationDraft"'), 'foundation draft controls present', 'draft buttons present');
  assert(html.includes('rc.foundation.project.draft'), 'foundation localStorage draft key present', 'draft key present');
  assert(html.includes('function collectFoundationProjectData()'), 'foundation can collect project payload', 'collect helper exists');
  assert(html.includes('function applyFoundationProjectData(raw'), 'foundation can apply project payload', 'apply helper exists');

  const chromePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  assert(!!chromePath, 'browser executable', 'system Chrome/Edge found for foundation regression test');

  const server = await serveStatic(ROOT, PORT);
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage();
  const pageErrors = [];
  const failedResponses = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('response', res => {
    if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
  });

  try {
    await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
    await wait(300);
    assert(pageErrors.length === 0, 'foundation page boot', 'no page errors during initial load');
    assert(failedResponses.length === 0, 'foundation page resources', 'no missing static resources during initial load');
    await exerciseFoundationProjectStorage(page);
    await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
    await wait(300);

    for (const tc of pack.cases) {
      await page.click(`#mainTabs button[data-tab="${tc.tab}"]`);
      if (tc.values) {
        await page.evaluate(values => {
          Object.entries(values).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = String(value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          if (typeof window.calcFdtn === 'function') window.calcFdtn();
        }, tc.values);
      }
      await wait(300);
      const actual = await page.evaluate(() => {
        const r = window.ftLast || {};
        return {
          tab: r.tab,
          retainType: r.retainType,
          qmax: r.qmax,
          qmin: r.qmin,
          qmax_r: r.qmax_r,
          qmin_r: r.qmin_r,
          H_total: r.H_total,
          N_total: r.N_total,
          FS_slide: r.FS_slide,
          FS_over: r.FS_over,
          okSlide: r.okSlide,
          okOver: r.okOver,
          okQr: r.okQr,
          Mu_tfm: r.Mu_tfm,
          phiMn_tfm: r.phiMn_tfm,
          Mu_wall_tfm: r.Mu_wall_tfm,
          phiMn_wall_tfm: r.phiMn_wall_tfm,
          Vu_stem: r.Vu_stem,
          phiVc_wall_tfm: r.phiVc_wall_tfm,
          Vu1_tf: (r.Vu1 !== undefined) ? r.Vu1 : (r.Vu1_tf !== undefined ? r.Vu1_tf : r.activeCase?.Vu1_tf),
          phiVc1_tf: (r.phiVc1 !== undefined) ? r.phiVc1 : r.phiVc1_tf,
          Vu2_tf: (r.Vu2 !== undefined) ? r.Vu2 : (r.Vu2_tf !== undefined ? r.Vu2_tf : r.activeCase?.Vu2_tf),
          phiVc2_tf: (r.phiVc2 !== undefined) ? r.phiVc2 : r.phiVc2_tf,
          q: r.q,
          qu: r.qu,
          As_per_m: r.As_per_m !== undefined ? r.As_per_m : (r.AsX_per_m !== undefined ? r.AsX_per_m : undefined),
          AsMin_per_m: r.AsMin_per_m,
          okQ: r.okQ,
          okV1: r.okV1,
          okV2: r.okV2,
          okFlex: r.okFlex,
          okShear: r.okShear,
          okAsMin: r.okAsMin,
          okDev: r.okDev,
          okSettle: r.okSettle,
          okAs: r.okAs,
          controlPunchName: r.controlPunch ? r.controlPunch.name : undefined,
          Qs: r.Qs,
          Qb: r.Qb,
          Qult: r.Qult,
          Qall: r.Qall,
          okR: r.okR,
          soilOk: r.soilOk,
          structuralOk: r.structuralOk,
          capApplied: r.capApplied,
          tipLayerLabel: r.tipLayerLabel,
          recommendationDia: r.recommendation ? r.recommendation.dia : undefined,
          recommendationDepth: r.recommendation ? r.recommendation.depth : undefined,
          okSettlement: r.okSettlement,
          okPileStress: r.okPileStress,
          okCapFlex: r.okCapFlex,
          okCapShear: r.okCapShear,
          numericalOk: r.numericalOk,
          summaryOk: r.summaryOk,
          summaryText: r.summaryText,
          reviewWarningCount: r.reviewWarnings?.length ?? 0,
          mcDdmText: document.getElementById('mc-ddm')?.textContent?.replace(/\s+/g, ' ').trim(),
          mcDdmWarn: document.getElementById('mc-ddm')?.classList.contains('warn') && !document.getElementById('mc-ddm')?.classList.contains('ok'),
          banner: document.getElementById('bannerStatus')?.textContent?.replace(/\s+/g, ' ').trim()
        };
      });
      ['Vu1_tf', 'phiVc1_tf', 'Vu2_tf', 'phiVc2_tf'].forEach(key => {
        actual[key] = toTfMaybe(actual[key]);
      });

      Object.entries(tc.expected).forEach(([key, expected]) => {
        const pass = nearlyEqual(actual[key], expected, tolerance);
        assert(pass, `${tc.key} :: ${key}`, `expected=${expected} actual=${actual[key]}`);
      });
    }

    console.log('\nAll foundation regression checks passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
