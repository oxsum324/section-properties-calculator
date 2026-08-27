const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.RC_TEST_PORT || 8123);
const TOOL_URL = `http://127.0.0.1:${PORT}/%E9%8B%BC%E7%AD%8B%E6%B7%B7%E5%87%9D%E5%9C%9F/tools/foundation.html`;
const htmlPath = path.join(__dirname, 'foundation.html');
const commonPath = path.join(__dirname, '..', 'shared', 'common.js');
const casesPath = path.join(__dirname, 'foundation-regression-cases.json');
const jointReactionFixturePath = path.join(__dirname, '..', 'shared', 'fixtures', 'joint-reactions', 'etabs-like-quoted-preamble.csv');
const jointReactionObservedIntakePath = path.join(__dirname, '..', 'shared', 'joint-reaction-observed-intake.js');
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

async function exerciseJointReactionExportChecklist(page) {
  await page.click('#mainTabs button[data-tab="pile"]');
  const state = await page.evaluate(() => {
    const componentPanel = document.getElementById('pileCap3DSTMComponentPanel');
    const adapter = document.getElementById('jointReactionAdapterPanel');
    const checklist = document.getElementById('jointReactionExportChecklist');
    if (componentPanel) componentPanel.open = true;
    if (adapter) adapter.open = true;
    if (checklist) checklist.open = true;
    const text = checklist?.innerText?.replace(/\s+/g, ' ').trim() || '';
    return {
      visible: !!checklist && getComputedStyle(checklist).display !== 'none' && checklist.getClientRects().length > 0,
      pageOnly: checklist?.classList.contains('page-only-case-tools') || false,
      text,
    };
  });
  assert(state.visible, 'joint reaction export checklist is visible in pile workflow', state.text || 'missing');
  assert(state.pageOnly, 'joint reaction export checklist is marked page-only', 'page-only-case-tools');
  for (const fragment of ['實際匯出檔準備清單', 'Point／Joint', 'OutputCase', 'CaseType', 'F1', 'M3', 'Linear Static／LinStatic', 'Response Spectrum', '不要匯出載重組合', '不會進入計算書或列印 PDF']) {
    assert(state.text.includes(fragment), 'joint reaction export checklist guidance', fragment);
  }
}

async function exerciseJointReactionObservedPackage(page) {
  assert(await page.locator('#btnDownloadJointReactionObservedPackage').isDisabled(), 'joint reaction anonymized package starts disabled', 'a parsed table is required');
  await page.setInputFiles('#jointReactionTableFile', jointReactionFixturePath);
  await page.waitForFunction(() => document.getElementById('jointReactionAdapterStatus')?.textContent?.startsWith('已讀取'));
  assert(!(await page.locator('#btnDownloadJointReactionObservedPackage').isDisabled()), 'joint reaction anonymized package enables after parse', 'valid CSV/TSV/TXT loaded');
  await page.fill('#jointReactionSoftwareVersion', '23.0.0-browser-regression');
  await page.fill('#jointReactionTableName', 'Joint Reactions');
  await page.check('#jointReactionObservedOriginConfirmed');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#btnDownloadJointReactionObservedPackage');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const packageText = fs.readFileSync(downloadPath, 'utf8');
  const packageData = JSON.parse(packageText);
  assert(packageData.schemaVersion === 'rc-joint-reaction-browser-intake-package.v1', 'joint reaction anonymized package schema', packageData.schemaVersion);
  assert(packageData.status === 'manual-review-required' && packageData.privacy?.manualReviewRequired === true, 'joint reaction anonymized package stays pending', packageData.status);
  assert(download.suggestedFilename().endsWith('-intake-package.json'), 'joint reaction anonymized package filename', download.suggestedFilename());
  assert(packageData.candidate.sha256 === packageData.evidence.data.output.sha256, 'joint reaction anonymized candidate hash is linked', packageData.candidate.sha256);
  assert(packageData.candidate.file.includes(packageData.candidate.sha256.slice(0, 12)), 'joint reaction anonymized filename uses output hash', packageData.candidate.file);
  assert(!packageData.candidate.file.includes(packageData.evidence.data.source.sha256.slice(0, 12)), 'joint reaction anonymized filename excludes source hash prefix', packageData.candidate.file);
  assert(!JSON.stringify(packageData.receipt.data).includes(packageData.evidence.data.source.sha256.slice(0, 12)), 'joint reaction receipt excludes partial source hash', 'source hash remains local evidence only');
  assert(Object.values(packageData.review.data.assertions).every(value => value === false), 'joint reaction anonymized review cannot be preapproved', 'all assertions false');
  for (const secret of ['Synthetic compatibility data; not an engineering export', 'Base', 'P1', '101', 'DEAD', '980.665', 'etabs-like-quoted-preamble.csv']) {
    assert(!packageData.candidate.content.includes(secret), 'joint reaction anonymized candidate removes source data', secret);
    assert(!JSON.stringify(packageData.receipt.data).includes(secret), 'joint reaction receipt removes source identity', secret);
  }
  const handoffRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-reaction-browser-handoff-'));
  try {
    const browserPackagePath = path.join(handoffRoot, download.suggestedFilename());
    const outputDir = path.join(handoffRoot, 'node-import');
    fs.copyFileSync(downloadPath, browserPackagePath);
    const imported = spawnSync(process.execPath, [
      jointReactionObservedIntakePath,
      '--package', browserPackagePath,
      '--output-dir', outputDir,
    ], { encoding:'utf8' });
    assert(imported.status === 0, 'browser download imports through Node CLI without editing', imported.stderr || imported.stdout);
    const importResult = JSON.parse(imported.stdout);
    const outputFiles = fs.readdirSync(outputDir).sort();
    const expectedFiles = [importResult.candidatePath, importResult.evidencePath, importResult.reviewPath, importResult.receiptPath]
      .map(filePath => path.basename(filePath)).sort();
    assert(importResult.packageSchemaVersion === packageData.schemaVersion
      && importResult.status === 'manual-review-required'
      && importResult.manualReviewRequired === true
      && importResult.sourceStored === false,
    'browser-to-Node handoff preserves pending-review boundary', `${importResult.packageSchemaVersion} / ${importResult.status}`);
    assert(JSON.stringify(outputFiles) === JSON.stringify(expectedFiles) && outputFiles.length === 4,
      'browser-to-Node handoff writes exactly four controlled files', outputFiles.join(' | '));
    assert(!outputFiles.includes(path.basename(browserPackagePath)), 'Node import does not copy the browser package into controlled output', path.basename(browserPackagePath));
    const importedCandidate = fs.readFileSync(importResult.candidatePath, 'utf8');
    const importedEvidence = JSON.parse(fs.readFileSync(importResult.evidencePath, 'utf8'));
    const importedReview = JSON.parse(fs.readFileSync(importResult.reviewPath, 'utf8'));
    const importedReceiptText = fs.readFileSync(importResult.receiptPath, 'utf8');
    const importedReceipt = JSON.parse(importedReceiptText);
    assert(importedCandidate === packageData.candidate.content
      && importedEvidence.output.sha256 === packageData.candidate.sha256
      && importedReceipt.candidateSha256 === packageData.candidate.sha256,
    'browser-to-Node handoff preserves candidate bytes and hash links', packageData.candidate.sha256);
    assert(importedReview.reviewer === ''
      && importedReview.reviewedAt === ''
      && Object.values(importedReview.assertions).every(value => value === false),
    'browser-to-Node handoff cannot manufacture approval', 'reviewer blank; eight assertions false');
    assert(!importedReceiptText.includes(packageData.evidence.data.source.sha256)
      && !importedReceiptText.includes(packageData.evidence.data.source.sha256.slice(0, 12)),
    'browser-to-Node receipt excludes complete and partial source hash', 'source fingerprint retained only in local evidence');
    for (const secret of ['Synthetic compatibility data; not an engineering export', 'Base', 'P1', '101', 'DEAD', '980.665', 'etabs-like-quoted-preamble.csv']) {
      assert(!importedCandidate.includes(secret) && !importedReceiptText.includes(secret), 'browser-to-Node handoff remains anonymized', secret);
    }
    const manifestDir = path.join(handoffRoot, 'fixture-library');
    const manifestPath = path.join(manifestDir, 'observed-manifest.json');
    fs.mkdirSync(manifestDir, { recursive:true });
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      schemaVersion:'rc-joint-reaction-observed-fixtures.v1',
      fixturePolicy:'anonymized-observed-exports-only',
      fixtures:[],
    }, null, 2)}\n`, 'utf8');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    const pendingAssessment = spawnSync(process.execPath, [
      jointReactionObservedIntakePath,
      '--receipt', importResult.receiptPath,
      '--manifest', manifestPath,
    ], { encoding:'utf8' });
    assert(pendingAssessment.status === 2, 'browser package cannot advance before manual review', pendingAssessment.stderr || pendingAssessment.stdout);
    const pending = JSON.parse(pendingAssessment.stdout);
    assert(pending.ready === false
      && pending.intakeStatus === 'manual-review-required'
      && pending.issues.some(issue => issue.code === 'reviewer-missing')
      && pending.issues.some(issue => issue.code === 'review-assertion-incomplete'),
    'browser package pending assessment explains missing approval', pending.issues.map(issue => issue.code).join(' | '));
    assert(fs.readFileSync(manifestPath, 'utf8') === manifestBefore
      && !fs.existsSync(path.join(manifestDir, 'observed')),
    'pending browser package assessment is strictly read-only', 'manifest unchanged; observed directory absent');

    fs.writeFileSync(importResult.reviewPath, `${JSON.stringify({
      ...importedReview,
      reviewedAt:new Date(Date.parse(importedEvidence.generatedAt) + 1000).toISOString(),
      reviewer:'browser-package-independent-reviewer',
      assertions:Object.fromEntries(Object.keys(importedReview.assertions).map(key => [key, true])),
    }, null, 2)}\n`, 'utf8');
    const readyAssessment = spawnSync(process.execPath, [
      jointReactionObservedIntakePath,
      '--receipt', importResult.receiptPath,
      '--manifest', manifestPath,
    ], { encoding:'utf8' });
    assert(readyAssessment.status === 0, 'fully reviewed browser package passes read-only assessment', readyAssessment.stderr || readyAssessment.stdout);
    const ready = JSON.parse(readyAssessment.stdout);
    assert(ready.ready === true && ready.intakeStatus === 'ready-to-promote' && ready.issueCount === 0,
      'fully reviewed browser package becomes ready without auto-promotion', `${ready.intakeStatus} / issues=${ready.issueCount}`);
    assert(fs.readFileSync(manifestPath, 'utf8') === manifestBefore
      && !fs.existsSync(path.join(manifestDir, 'observed')),
    'ready browser package assessment remains read-only', 'manifest unchanged; observed directory absent');

    const ambiguousPromotion = spawnSync(process.execPath, [
      jointReactionObservedIntakePath,
      '--receipt', importResult.receiptPath,
      '--manifest', manifestPath,
      '--promote', 'true',
    ], { encoding:'utf8' });
    assert(ambiguousPromotion.status === 1
      && ambiguousPromotion.stderr.includes('--promote 只接受明確值 yes')
      && !fs.existsSync(path.join(manifestDir, 'observed')),
    'browser package promotion rejects ambiguous confirmation', ambiguousPromotion.stderr.trim());

    const explicitPromotion = spawnSync(process.execPath, [
      jointReactionObservedIntakePath,
      '--receipt', importResult.receiptPath,
      '--manifest', manifestPath,
      '--promote', 'yes',
    ], { encoding:'utf8' });
    assert(explicitPromotion.status === 0, 'explicitly reviewed browser package promotes through Node CLI', explicitPromotion.stderr || explicitPromotion.stdout);
    const promoted = JSON.parse(explicitPromotion.stdout);
    const promotedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const promotedFixturePath = path.join(manifestDir, promoted.fixtureFile);
    const promotedProvenancePath = path.join(manifestDir, promoted.provenanceFile);
    const promotedProvenanceText = fs.readFileSync(promotedProvenancePath, 'utf8');
    const promotedProvenance = JSON.parse(promotedProvenanceText);
    assert(promoted.status === 'promoted'
      && promoted.sourceFileStored === false
      && promoted.sourceHashCommitted === false
      && promotedManifest.fixtures.length === 1
      && promotedManifest.fixtures[0].id === importResult.fixtureId,
    'explicit browser package promotion writes one governed manifest entry', promotedManifest.fixtures.map(item => item.id).join(' | '));
    assert(fs.readFileSync(promotedFixturePath, 'utf8') === importedCandidate
      && promotedProvenance.output.sha256 === packageData.candidate.sha256
      && promotedProvenance.review.reviewer === 'browser-package-independent-reviewer'
      && Object.values(promotedProvenance.review.assertions).every(value => value === true),
    'promoted browser fixture preserves reviewed candidate and approval evidence', promotedProvenance.output.sha256);
    assert(promotedProvenance.privacy.sourceFileStored === false
      && promotedProvenance.privacy.sourcePathStored === false
      && promotedProvenance.privacy.sourceNameStored === false
      && promotedProvenance.privacy.sourceHashCommitted === false
      && promotedProvenance.privacy.originalNumbersStored === false
      && !promotedProvenanceText.includes(packageData.evidence.data.source.sha256)
      && !promotedProvenanceText.includes(packageData.evidence.data.source.sha256.slice(0, 12)),
    'promoted browser provenance excludes source identity and fingerprint', JSON.stringify(promotedProvenance.privacy));
    for (const secret of ['Synthetic compatibility data; not an engineering export', 'Base', 'P1', '101', 'DEAD', '980.665', 'etabs-like-quoted-preamble.csv']) {
      assert(!promotedProvenanceText.includes(secret), 'promoted browser provenance remains anonymized', secret);
    }
    const promotedFixtureBefore = fs.readFileSync(promotedFixturePath, 'utf8');
    const duplicatePromotion = spawnSync(process.execPath, [
      jointReactionObservedIntakePath,
      '--receipt', importResult.receiptPath,
      '--manifest', manifestPath,
      '--promote', 'yes',
    ], { encoding:'utf8' });
    assert(duplicatePromotion.status === 1
      && /已有 fixture ID|拒絕覆寫/.test(duplicatePromotion.stderr)
      && JSON.parse(fs.readFileSync(manifestPath, 'utf8')).fixtures.length === 1
      && fs.readFileSync(promotedFixturePath, 'utf8') === promotedFixtureBefore,
    'duplicate browser package promotion fails closed without overwrite', duplicatePromotion.stderr.trim());
    assert(fs.readFileSync(browserPackagePath, 'utf8') === packageText,
      'browser intake package remains byte-identical through review and promotion', path.basename(browserPackagePath));
  } finally {
    fs.rmSync(handoffRoot, { recursive:true, force:true });
  }
  const status = await page.locator('#jointReactionObservedPackageStatus').innerText();
  assert(status.startsWith('已產生') && status.includes('未保存原始檔名、路徑或原始數值'), 'joint reaction anonymized package reports privacy boundary', status);
}

async function exerciseJointReactionTablePreflight(page) {
  await page.setInputFiles('#jointReactionTableFile', jointReactionFixturePath);
  await page.waitForFunction(() => document.getElementById('jointReactionAdapterStatus')?.textContent?.startsWith('已讀取'));
  const state = await page.evaluate(() => {
    const summary = document.getElementById('jointReactionPreflightSummary');
    return {
      visible: !!summary && !summary.hidden && getComputedStyle(summary).display !== 'none' && summary.getClientRects().length > 0,
      text: summary?.innerText?.replace(/\s+/g, ' ').trim() || '',
      pointOptions: [...(document.getElementById('jointReactionPoint')?.options || [])].map(option => option.textContent),
    };
  });
  assert(state.visible, 'joint reaction table preflight is visible after file import', state.text || 'missing');
  for (const fragment of ['表格預檢（僅限畫面）', '第 3 列', '分隔符：逗號', '資料：5 列', '2 個節點', '4 個案例名稱', 'Story + Point／Joint + Unique Name', '單列基本案例候選：5 組', '缺少 CaseType 0 列', '載重組合 0 列', '其他 CaseType 0 列', '多步驟／重複 0 組']) {
    assert(state.text.includes(fragment), 'joint reaction table preflight diagnosis', fragment);
  }
  assert(state.pointOptions.includes('Base / P1') && state.pointOptions.includes('Roof / P9'), 'joint reaction table preflight keeps selectable point identities', state.pointOptions.join(' | '));

  const importRiskFixture = async (fileName) => {
    const filePath = path.join(__dirname, '..', 'shared', 'fixtures', 'joint-reactions', fileName);
    await page.setInputFiles('#jointReactionTableFile', filePath);
    await page.waitForFunction(name => document.getElementById('jointReactionAdapterStatus')?.textContent?.includes(name), fileName);
    return page.locator('#jointReactionPreflightSummary').innerText();
  };
  const riskFixtures = [
    ['reject-missing-case-type.csv', ['缺少 CaseType 1 列', '單列基本案例候選：0 組']],
    ['reject-load-combination.csv', ['載重組合 1 列', '單列基本案例候選：0 組']],
    ['reject-response-spectrum.csv', ['其他 CaseType 1 列', '單列基本案例候選：0 組']],
    ['reject-multi-step.tsv', ['其他 CaseType 2 列', '多步驟／重複 1 組', '單列基本案例候選：0 組']],
  ];
  for (const [fileName, fragments] of riskFixtures) {
    const diagnosis = await importRiskFixture(fileName);
    for (const fragment of fragments) {
      assert(diagnosis.includes(fragment), `joint reaction risk preflight :: ${fileName}`, fragment);
    }
  }
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

  const placeholderSaved = await page.evaluate(() => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ((el.type || '').toLowerCase() === 'checkbox') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setField('projName', '未填');
    setField('projNo', 'RC-FDTN-PLACEHOLDER');
    setField('projDesigner', '未填');
    return window.collectFoundationProjectData();
  });
  assert(placeholderSaved.metadata.projectName === '', 'foundation placeholder project name is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.projectNo === 'RC-FDTN-PLACEHOLDER', 'foundation placeholder project number remains editable metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.metadata.designer === '', 'foundation placeholder designer is scrubbed from metadata', JSON.stringify(placeholderSaved.metadata));
  assert(placeholderSaved.fields.projName.value === '', 'foundation placeholder project name is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projName));
  assert(placeholderSaved.fields.projDesigner.value === '', 'foundation placeholder designer is scrubbed from fields payload', JSON.stringify(placeholderSaved.fields.projDesigner));

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

async function exerciseEarthPressureBridge(page) {
  const state = await page.evaluate(() => {
    const input = {
      designReference: 'taiwanFoundation2023', wallType: 'cantilever', wallCondition: 'manual',
      H: 2.5, gammaSoil: 1.8, phiDeg: 30, mode: 'active', surcharge: 1,
      waterModel: 'hydrostatic', waterDepth: 0, gammaWater: 1,
      baseB: 1.8, verticalLoad: 16, qa: 15, mu: 0.45,
      passiveMode: 'ignore', passiveReductionFactor: 0.5, passive: 0,
      fsSlideReq: 1.5, fsOverReq: 1.5,
      pressureTheory: 'rankine', deltaDeg: 0, betaDeg: 0, thetaDeg: 0,
      seismicEnable: false, kh: 0, kv: 0,
      fsSlideReqSeismic: 1.2, fsOverReqSeismic: 1.2,
      layeredMode: false, layers: []
    };
    const result = window.EarthPressureCore.calculate(input);
    const source = window.applyEarthPressurePayload({
      tool: { id: 'earth-pressure', name: '擋土土壓局部快算', pageVersion: 'V0.6' },
      project: { name: '土壓銜接測試', no: 'EARTH-RC-001', designer: 'QA' },
      generatedAt: '2026-08-04T01:00:00.000Z', input, result
    }, { silent: true });
    const saved = window.collectFoundationProjectData();
    window.clearEarthPressureSource({ silent: true });
    window.applyFoundationProjectData(saved, { silent: true });
    const replay = window.readImportedEarthPressureSource();
    return {
      activeTab: document.querySelector('#mainTabs button.active')?.dataset.tab,
      retainedHeight: document.getElementById('rHw')?.value,
      hiddenSourceStored: !!saved.fields.retainEarthPressureSource?.value,
      sourceSchema: source.schema,
      replaySchema: replay.schema,
      loadSourceLabel: window.ftLast?.loadSourceLabel,
      Pa: window.ftLast?.Pa,
      Mo: window.ftLast?.Mo,
      Mu: window.ftLast?.Mu_wall_tfm,
      Vu: window.ftLast?.Vu_stem,
      expectedForce: result.totalForce,
      expectedMoment: result.overturningMoment,
      statusText: document.getElementById('earthPressureImportStatus')?.textContent || ''
    };
  });
  assert(state.activeTab === 'retain', 'earth pressure bridge opens retaining wall tab', state.activeTab);
  assert(state.retainedHeight === '250', 'earth pressure bridge maps retained height to RC wall', state.retainedHeight);
  assert(state.hiddenSourceStored, 'earth pressure bridge persists in RC project fields', 'retainEarthPressureSource stored');
  assert(state.sourceSchema === 'earth-pressure-to-rc-foundation.v1' && state.replaySchema === state.sourceSchema, 'earth pressure bridge replays with RC project fingerprint', state.replaySchema);
  assert(state.loadSourceLabel.includes('外部土壓 JSON'), 'earth pressure bridge identifies adopted load source', state.loadSourceLabel);
  assert(nearlyEqual(state.Pa, state.expectedForce, toleranceDefault), 'earth pressure bridge adopts verified lateral force', `${state.Pa} / ${state.expectedForce}`);
  assert(nearlyEqual(state.Mo, state.expectedMoment, toleranceDefault), 'earth pressure bridge adopts verified overturning moment', `${state.Mo} / ${state.expectedMoment}`);
  assert(nearlyEqual(state.Mu, 1.6 * state.expectedMoment, toleranceDefault), 'earth pressure bridge factors imported moment for stem strength', `${state.Mu}`);
  assert(nearlyEqual(state.Vu, 1.6 * state.expectedForce, toleranceDefault), 'earth pressure bridge factors imported force for stem shear', `${state.Vu}`);
  assert(state.statusText.includes('同版核心') || state.statusText.includes('已採用外部土壓'), 'earth pressure bridge renders page-only source status', state.statusText);
}

async function exercisePilePyBridge(page) {
  const state = await page.evaluate(async () => {
    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    document.querySelector('#mainTabs button[data-tab="pile"]')?.click();
    setField('pileNL', 3);
    setField('pileNB', 3);
    setField('pileSL', 180);
    setField('pileSB', 180);
    setField('pileD', 60);
    setField('pileLength', 18);
    setField('pHX', 90);
    setField('pHY', 45);
    window.calcFdtn();
    const template = window.createPilePyJsonTemplate();
    const payload = {
      schema: 'rc-pile-py-result.v1',
      generatedAt: new Date().toISOString(),
      analysis: {
        analysisId: 'PY-REG-001',
        software: 'LPile-compatible solver',
        version: '2025.1',
        caseName: 'SERVICE-X-Y',
        analyst: '',
        capacityBasis: '專案核定樁身斷面容量'
      },
      units: { length: 'cm', force: 'tf', moment: 'tf·m' },
      source: {
        pileNL: 3, pileNB: 3, spacingLCm: 180, spacingBCm: 180,
        pileDiameterCm: 60, pileLengthM: 18, horizontalXTf: 90, horizontalYTf: 45
      },
      results: {
        x: { headDisplacementCm: 0.82, allowableHeadDisplacementCm: 2.5, maxShearTf: 15.2, shearCapacityTf: 28, maxMomentTfm: 18.6, momentCapacityTfm: 31 },
        y: { headDisplacementCm: 0.41, allowableHeadDisplacementCm: 2.5, maxShearTf: 7.8, shearCapacityTf: 28, maxMomentTfm: 9.4, momentCapacityTfm: 31 }
      }
    };
    const oversizedJsonRejected = await window.loadPilePyJsonFile(new File(['x'.repeat(1024 * 1024 + 1)], 'oversized-pile-py.json', { type: 'application/json' })) == null;
    await window.loadPilePyJsonFile(new File([JSON.stringify(payload)], 'pile-py-regression.json', { type: 'application/json' }));
    const candidateVisible = !document.getElementById('pilePyCandidate')?.hidden;
    const candidateStatus = document.getElementById('pilePyImportStatus')?.textContent || '';
    const blockedWithoutReview = window.adoptPilePyCandidate() == null;
    document.getElementById('pilePyReview').checked = true;
    const adopted = window.adoptPilePyCandidate();
    const saved = window.collectFoundationProjectData();
    window.clearPilePySource({ silent: true });
    window.applyFoundationProjectData(saved, { silent: true });
    const replayPass = window.ftLast?.pilePyResponse?.pass === true && window.ftLast?.lateralResponseOk === true;
    const replayStatus = document.getElementById('pilePyImportStatus')?.textContent || '';
    const adoptedArtifact = await window.downloadAdoptedPilePySourceJson();
    const adoptedRaw = document.getElementById('pilePyAdoptedSource')?.value || '';
    const storedAdoption = JSON.parse(adoptedRaw);
    const legacyState = JSON.parse(adoptedRaw);
    legacyState.stateSchema = 'rc-pile-py-adoption.v1';
    delete legacyState.sourceArtifact;
    document.getElementById('pilePyAdoptedSource').value = JSON.stringify(legacyState);
    window.calcFdtn();
    const legacyReplayPass = window.ftLast?.pilePyResponse?.valid === true;
    const legacyDownloadBlocked = await window.downloadAdoptedPilePySourceJson() == null;
    const tamperedState = JSON.parse(adoptedRaw);
    tamperedState.sourceArtifact.text = tamperedState.sourceArtifact.text.replace('PY-REG-001', 'PY-REG-999');
    document.getElementById('pilePyAdoptedSource').value = JSON.stringify(tamperedState);
    window.calcFdtn();
    const tamperedArtifactRejected = window.ftLast?.pilePyResponse?.valid === false
      && await window.downloadAdoptedPilePySourceJson() == null;
    document.getElementById('pilePyAdoptedSource').value = adoptedRaw;
    window.calcFdtn();
    setField('pHX', 80);
    window.calcFdtn();
    const mismatchRejected = window.ftLast?.pilePyResponse?.valid === false && window.ftLast?.lateralResponseOk === false;
    const mismatchStatus = document.getElementById('pilePyImportStatus')?.textContent || '';
    setField('pHX', 90);
    window.clearPilePySource({ silent: true });
    setField('pilePyAdapterSoftware', 'LPile');
    setField('pilePyAdapterVersion', '2026');
    setField('pilePyAdapterAnalysisId', 'LP-REG-001');
    setField('pilePyAdapterCaseName', 'SERVICE-X-Y-TABLE');
    setField('pilePyAdapterScope', 'representative-pile');
    setField('pilePyAdapterUnits', 'si-kn-m-mm');
    setField('pilePyAdapterCapacityBasis', '專案核定樁身斷面容量');
    setField('pilePyAdapterAllow', 2.5);
    setField('pilePyAdapterShearCap', 28);
    setField('pilePyAdapterMomentCap', 31);
    const xTable = 'depth_m,deflection_mm,shear_kN,moment_kN_m\n0,8.2,149.06,-182.40\n3,5.1,-132,165\n9,-1.2,41,-80';
    const yTable = 'depth_m,deflection_mm,shear_kN,moment_kN_m\n0,4.1,76.49,-92.18\n3,2.4,-65,81\n9,-0.8,20,-30';
    const loadedX = await window.loadPilePyTableFile(new File([xTable], 'lpile-reg-x.csv', { type: 'text/csv' }), 'x');
    const loadedY = await window.loadPilePyTableFile(new File([yTable], 'lpile-reg-y.tsv', { type: 'text/tab-separated-values' }), 'y');
    let tableCandidate = await window.buildPilePyCandidateFromTable();
    const downloadedArtifact = await window.downloadPilePyCandidateJson();
    setField('pHX', 80);
    const staleDownloadBlocked = await window.downloadPilePyCandidateJson() == null;
    document.getElementById('pilePyReview').checked = true;
    const staleTableBlocked = window.adoptPilePyCandidate() == null;
    setField('pHX', 90);
    tableCandidate = await window.buildPilePyCandidateFromTable();
    const tableStatus = document.getElementById('pilePyAdapterStatus')?.textContent || '';
    const archivedArtifact = await window.preparePilePyCandidateArtifact();
    const archivedPayload = JSON.parse(archivedArtifact.sourceText);
    await window.loadPilePyJsonFile(new File([archivedArtifact.sourceText], archivedArtifact.filename, { type: 'application/json' }));
    const archiveRoundTripVisible = !document.getElementById('pilePyCandidate')?.hidden;
    document.getElementById('pilePyReview').checked = true;
    const tableAdopted = window.adoptPilePyCandidate();
    const savedAfterTable = window.collectFoundationProjectData();
    window.clearPilePySource({ silent: true });
    window.applyFoundationProjectData(savedAfterTable, { silent: true });
    const tableResponse = window.ftLast?.pilePyResponse;
    const restoredTableArtifact = await window.prepareAdoptedPilePyArtifact();
    const transientAdapterIds = [
      'pilePyAdapterSoftware', 'pilePyAdapterVersion', 'pilePyAdapterAnalysisId',
      'pilePyAdapterCaseName', 'pilePyAdapterScope', 'pilePyAdapterUnits',
      'pilePyAdapterAnalyst', 'pilePyAdapterCapacityBasis', 'pilePyAdapterAllow',
      'pilePyAdapterShearCap', 'pilePyAdapterMomentCap', 'pilePyAdapterXTable', 'pilePyAdapterYTable',
      'pilePyAdapterXFile', 'pilePyAdapterYFile'
    ];
    const adapterFieldsExcluded = transientAdapterIds.every(id => savedAfterTable.fields[id] == null);
    window.clearPilePySource({ silent: true });
    return {
      candidateVisible,
      oversizedJsonRejected,
      templateMatchesModel: template.schema === 'rc-pile-py-result.v1'
        && template.source.horizontalXTf === 90
        && template.source.horizontalYTf === 45
        && template.results.x?.headDisplacementCm === '請填入分析值',
      candidateStatus,
      blockedWithoutReview,
      adoptedStateSchema: adopted?.stateSchema,
      adoptedPass: adopted?.payload?.pass,
      adoptedArtifactMatches: adoptedArtifact?.sourceText === JSON.stringify(payload)
        && adoptedArtifact?.sourceSha256 === adopted?.sourceSha256,
      embeddedSourceStored: storedAdoption?.sourceArtifact?.text === JSON.stringify(payload),
      savedSource: saved.fields.pilePyAdoptedSource?.value || '',
      excludedFile: saved.fields.pilePyJsonFile == null,
      excludedReview: saved.fields.pilePyReview == null,
      replayPass,
      replayStatus,
      legacyReplayPass,
      legacyDownloadBlocked,
      tamperedArtifactRejected,
      mismatchRejected,
      mismatchStatus,
      tableCandidateScope: tableCandidate?.source?.analysisScope,
      tableCandidateHX: tableCandidate?.source?.analysisHorizontalXTf,
      tableCandidateHY: tableCandidate?.source?.analysisHorizontalYTf,
      tableStatus,
      sampleTemplateOk: window.pilePyTableSample('us-kip-ft-in').startsWith('depth_ft,deflection_in,shear_kip,moment_kip_ft\r\n'),
      loadedX: loadedX?.sourceFilename,
      loadedY: loadedY?.sourceFilename,
      downloadedCandidateOk: downloadedArtifact?.sourceSha256?.length === 64 && downloadedArtifact?.sourceText?.endsWith('\n'),
      staleDownloadBlocked,
      staleTableBlocked,
      archivedFilename: archivedArtifact?.filename,
      archivedAnalysisId: archivedPayload?.analysis?.analysisId,
      archiveRoundTripVisible,
      archiveHashMatchesAdoption: archivedArtifact?.sourceSha256 === tableAdopted?.sourceSha256,
      restoredArchiveMatches: restoredTableArtifact?.sourceText === archivedArtifact?.sourceText
        && restoredTableArtifact?.sourceSha256 === tableAdopted?.sourceSha256,
      tableAdoptedSchema: tableAdopted?.payload?.adapterEvidence?.schema,
      tableAdoptedProfile: tableAdopted?.payload?.adapterEvidence?.unitProfile,
      tableAdoptedXFile: tableAdopted?.payload?.adapterEvidence?.x?.sourceFilename,
      tableAdoptedYFile: tableAdopted?.payload?.adapterEvidence?.y?.sourceFilename,
      tableResultX: tableAdopted?.payload?.results?.x?.headDisplacementCm,
      tableResultY: tableAdopted?.payload?.results?.y?.headDisplacementCm,
      tableReplayValid: tableResponse?.valid === true,
      tableReplayReason: tableResponse?.reason || '',
      adapterFieldsExcluded
    };
  });
  assert(state.templateMatchesModel, 'p-y downloadable template binds current pile model and stays intentionally incomplete', 'current model template');
  assert(state.oversizedJsonRejected, 'p-y JSON import rejects files over the 1 MiB boundary', 'oversized JSON rejected');
  assert(state.candidateVisible, 'p-y import exposes verified candidate review', state.candidateStatus);
  assert(state.candidateStatus.includes('候選結果已通過') && !state.candidateStatus.includes('已採用 p-y 結果'), 'p-y candidate does not auto-adopt', state.candidateStatus);
  assert(state.blockedWithoutReview, 'p-y adoption requires explicit engineer review checkbox', 'adoption blocked before review');
  assert(state.adoptedStateSchema === 'rc-pile-py-adoption.v2' && state.adoptedPass === true, 'p-y reviewed candidate becomes source-complete adopted result', state.adoptedStateSchema);
  assert(state.adoptedArtifactMatches && state.embeddedSourceStored, 'p-y adopted result preserves exact source JSON bytes and SHA-256', 'source artifact stored');
  assert(state.savedSource.includes('PY-REG-001') && state.savedSource.includes('sourceSha256') && state.savedSource.includes('sourceArtifact'), 'p-y adopted result persists source artifact in foundation project', 'adopted source stored');
  assert(state.excludedFile && state.excludedReview, 'p-y transient file and review controls stay out of project payload', 'transient controls excluded');
  assert(state.replayPass && state.replayStatus.includes('已採用 p-y 結果') && state.replayStatus.includes('來源 JSON 已隨專案保存'), 'p-y adopted result replays with downloadable source artifact', state.replayStatus);
  assert(state.legacyReplayPass && state.legacyDownloadBlocked, 'legacy p-y adoption remains usable without inventing missing source bytes', 'v1 compatible, archive unavailable');
  assert(state.tamperedArtifactRejected, 'tampered adopted source artifact fails closed for calculation and download', 'tampered source rejected');
  assert(state.mismatchRejected && state.mismatchStatus.includes('目前模型不相容'), 'p-y adopted result fails closed after source model changes', state.mismatchStatus);
  assert(state.tableCandidateScope === 'representative-pile' && nearlyEqual(state.tableCandidateHX, 16, toleranceDefault) && nearlyEqual(state.tableCandidateHY, 8, toleranceDefault), 'LPile table adapter binds representative pile p-multiplier loads', `${state.tableCandidateScope} ${state.tableCandidateHX}/${state.tableCandidateHY}`);
  assert(state.tableStatus.includes('X / Y 列數 = 3 / 3') && state.tableStatus.includes('尚未採用'), 'p-y table adapter reports verified candidate without auto-adoption', state.tableStatus);
  assert(state.loadedX === 'lpile-reg-x.csv' && state.loadedY === 'lpile-reg-y.tsv', 'p-y table adapter reads named CSV and TSV files', `${state.loadedX}/${state.loadedY}`);
  assert(state.sampleTemplateOk, 'p-y table sample follows selected unit profile headers', 'US CSV template');
  assert(state.downloadedCandidateOk, 'p-y verified candidate downloads the hashed source JSON bytes', 'downloaded candidate artifact');
  assert(state.staleDownloadBlocked, 'p-y candidate download fails closed after pile model changes', 'stale candidate download rejected');
  assert(state.staleTableBlocked, 'p-y candidate cannot be adopted after pile model changes', 'stale candidate rejected at adoption');
  assert(state.archivedFilename === 'lpile-table-adapter.json' && state.archivedAnalysisId === 'LP-REG-001', 'p-y candidate archive keeps a stable JSON identity', `${state.archivedFilename} ${state.archivedAnalysisId}`);
  assert(state.archiveRoundTripVisible && state.archiveHashMatchesAdoption, 'p-y archived candidate reimports with the same adoption SHA-256', 'same-byte archive round trip');
  assert(state.restoredArchiveMatches, 'p-y adopted source remains exactly downloadable after project save and reload', 'persisted source artifact round trip');
  assert(state.tableAdoptedSchema === 'rc-pile-py-table-adapter.v1' && state.tableAdoptedProfile === 'si-kn-m-mm', 'p-y table adoption preserves conversion provenance', `${state.tableAdoptedSchema} ${state.tableAdoptedProfile}`);
  assert(state.tableAdoptedXFile === 'lpile-reg-x.csv' && state.tableAdoptedYFile === 'lpile-reg-y.tsv', 'p-y table adoption preserves source filenames', `${state.tableAdoptedXFile}/${state.tableAdoptedYFile}`);
  assert(nearlyEqual(state.tableResultX, 0.82, toleranceDefault) && nearlyEqual(state.tableResultY, 0.41, toleranceDefault), 'p-y table adapter uses head row displacement in project units', `${state.tableResultX}/${state.tableResultY}`);
  assert(state.tableReplayValid, 'p-y table adoption revalidates against current model', state.tableReplayReason);
  assert(state.adapterFieldsExcluded, 'p-y table work fields stay out of foundation project payload', 'adapter page-only fields excluded');
}

async function main() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const pileCore = fs.readFileSync(path.join(__dirname, '..', 'shared', 'foundation-pile.js'), 'utf8');
  const common = fs.readFileSync(commonPath, 'utf8');
  const pack = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const tolerance = pack.tolerance ?? toleranceDefault;
  const reportSrc = html.slice(html.indexOf('function buildFtReport'), html.indexOf('// ============================================================\n  //  事件綁定'));

  assert(html.includes('id="mainTabs"'), 'foundation.html has section tabs', 'multi-foundation tab UI exists');
  assert(html.includes('id="bannerStatus"'), 'foundation.html has banner', 'summary banner exists');
  assert(html.includes('window.ftLast'), 'foundation.html exports ftLast', 'result snapshot exists for regression capture');
  assert(html.includes('../shared/foundation-isolated.js?v=1') && html.includes('FoundationIsolated.calculateStrength'), 'foundation isolated footing uses the shared production strength core', 'shared core is loaded and called');
  assert(html.includes('../shared/foundation-pile.js?v=1') && html.includes('FoundationPile.calculateGroupAndCap'), 'foundation pile group and pile cap use the shared production core', 'shared pile core is loaded and called');
  assert(html.includes('FoundationPile.integrateSkinFriction') && html.includes('FoundationPile.calculateTipResistance'), 'foundation pile axial capacity uses the shared production core', 'skin friction and tip resistance delegate to the shared core');
  assert(!/designAsRect\(\{[^\n}]*\bMu\s*:/.test(html), 'foundation flexural design uses the Mu_kgcm interface', 'no obsolete Mu key remains');
  assert(html.includes('Mu_kgcm:Mu_long_tfm * 1e5') && pileCore.includes('Mu_kgcm:capMuTfm * 1e5'), 'combined footing and pile cap read finite reinforcement demand', 'designAsRect result uses .As');
  assert(html.includes('id="cHDL"') && html.includes('id="cHE"'), 'combined footing has horizontal force inputs', 'HDL/HE inputs exist');
  assert(html.includes('id="cc-slide"') && html.includes('id="cr-FSslide"'), 'combined footing has sliding checks', 'combined sliding UI exists');
  assert(!html.includes('預留，尚未做抗滑檢核'), 'combined footing sliding input is not stale placeholder text', 'cMu is active');
  assert(!html.includes('未提供 DDM 分析</span><span class="value">✓ OK'), 'mat DDM unavailable state is not shown as OK', 'DDM/EFM gap must stay warning');
  assert(html.includes('待確認 — 本工具未提供'), 'mat DDM unavailable state has warning text', 'runtime label is待確認');
  assert(common.includes('window.RCUI.renderAttachmentReadiness'), 'shared/common.js exposes attachment readiness renderer', 'page-only readiness helper exists');
  assert(html.includes('function updateFoundationAttachmentReadiness'), 'foundation page renders attachment readiness', 'readiness helper present');
  assert(html.includes('id="foundationAttachmentReadiness"'), 'foundation page has attachment readiness target', 'readiness target present');
  assert(html.includes('page-only-case-tools'), 'foundation site preset workflow page-only group', 'page-only-case-tools exists');
  assert(reportSrc.includes('summary: false'), 'foundation report disables top status summary', 'attachment status is not printed');
  assert(!reportSrc.includes('RCUI.buildReviewCheckGroup'), 'foundation report excludes review overview helper', 'review overview stays page-only');
  assert(!reportSrc.includes('待確認 / 正式'), 'foundation report excludes formal-analysis overview groups', 'report has no page-only review group');
  assert(!reportSrc.includes('作業模式：') && !reportSrc.includes('RC 工具箱 ·'), 'foundation report excludes page operation identity', 'mode and tool branding stay on tool page');
  assert(!reportSrc.includes('僅供初步設計參考'), 'foundation report excludes generic preliminary disclaimer', 'report carries calculation content only');
  assert(html.includes('const FOUNDATION_PROJECT_SCHEMA = \'rc-foundation-project-v1\''), 'foundation project schema present', 'rc-foundation-project-v1');
  assert(html.includes('id="btnSaveFoundationProject"') && html.includes('id="btnLoadFoundationProject"'), 'foundation project file controls present', 'save/load buttons present');
  assert(html.includes('id="btnSaveFoundationDraft"') && html.includes('id="btnLoadFoundationDraft"'), 'foundation draft controls present', 'draft buttons present');
  assert(html.includes('rc.foundation.project.draft'), 'foundation localStorage draft key present', 'draft key present');
  assert(common.includes('window.RCUI.normalizeProjectFieldValue'), 'shared/common.js exposes project metadata normalizer', 'placeholder project text can be scrubbed once');
  assert(html.includes('function collectFoundationProjectData()'), 'foundation can collect project payload', 'collect helper exists');
  assert(html.includes("projectName: window.RCUI.normalizeProjectFieldValue($('projName')?.value)"), 'foundation project payload normalizes placeholder project name', 'project storage metadata uses shared normalizer');
  assert(!reportSrc.includes("$('projName').value.trim()"), 'foundation report no longer uses raw trim on project name', 'shared normalizer handles placeholder cleanup');
  assert(html.includes('function applyFoundationProjectData(raw'), 'foundation can apply project payload', 'apply helper exists');
  assert(html.includes('id="btnImportEarthPressure"'), 'foundation has earth pressure JSON import', 'cross-tool import button exists');
  assert(html.includes('earth-pressure-rc-bridge.js'), 'foundation loads earth pressure bridge', 'versioned bridge module exists');
  assert(html.includes('EARTH_PRESSURE_BRIDGE.importPayload'), 'foundation validates earth pressure payload before use', 'same-core recalculation gate exists');
  assert(html.includes('id="btnDownloadPilePyTemplate"') && html.includes('id="btnImportPilePy"') && html.includes('id="btnAdoptPilePy"'), 'foundation has p-y template, import and explicit adoption controls', 'candidate review workflow exists');
  assert(html.includes('pile-py-result-bridge.js'), 'foundation loads p-y result bridge', 'versioned p-y bridge module exists');
  assert(html.includes('pile-py-table-adapter.js') && html.includes('id="btnBuildPilePyFromTable"'), 'foundation loads p-y table adapter with explicit candidate action', 'table adapter workflow exists');
  assert(html.includes('id="btnLoadPilePyXTable"') && html.includes('id="btnLoadPilePyYTable"') && html.includes('id="btnDownloadPilePyTableSample"'), 'foundation exposes direct table file loading and sample download', 'CSV/TSV/TXT workflow exists');
  assert(html.includes('id="btnDownloadPilePyCandidate"') && html.includes('preparePilePyCandidateArtifact'), 'foundation exposes same-byte verified candidate JSON archive', 'candidate archive workflow exists');
  assert(html.includes('id="btnDownloadAdoptedPilePy"') && html.includes('prepareAdoptedPilePyArtifact'), 'foundation exposes adopted source JSON after project reload', 'adopted archive workflow exists');
  assert(html.includes('PILE_PY_BRIDGE.inspectState'), 'foundation revalidates adopted p-y source against current model', 'fail-closed replay gate exists');
  assert(reportSrc.includes("group:'專項 p-y 分析結果'"), 'foundation report includes adopted p-y calculation results', 'formal report result group exists');
  assert(reportSrc.includes("label:'分析範圍 / Hx / Hy'") && reportSrc.includes("label:'來源表格換算'"), 'foundation report identifies p-y analysis scope and table provenance', 'formal report provenance exists');
  assert(html.includes('pile-cap-3d-stm-bridge.js?v=2') && html.includes('id="btnOpenPileCap3DSTM"') && html.includes('id="btnDownloadPileCap3DSTM"'), 'foundation exposes versioned pile-cap 3D STM bridge', 'one-click and JSON fallback controls exist');
  assert(html.includes('pile-cap-load-combinations.js?v=1') && html.includes('id="pileCap3DSTMCaseMode"') && html.includes('id="btnPreviewPileCap3DSTMCombos"'), 'foundation exposes automatic LRFD component-to-combination workflow', 'shared LoadCombo adapter, source mode and preview controls exist');
  assert(html.includes('PILE_CAP_LOAD_COMBINATIONS.generate') && html.includes("method:'LRFD'") && html.includes('loadCombinationSource = generated'), 'foundation generates traceable LRFD pile-cap cases from the shared load-combination core', 'automatic cases preserve component and schema provenance');
  assert(html.includes('loadcombo-components-v1') && html.includes('id="btnImportPileCapLoadComponents"') && html.includes('id="btnAdoptPileCapLoadComponents"') && html.includes('forces-receive.js'), 'foundation accepts common D/L/W/E component packages as review candidates', 'analysis JSON and ForcePicker candidates require explicit adoption');
  assert(html.includes('joint-reaction-load-adapter.js?v=2') && html.includes('id="btnLoadJointReactionTable"') && html.includes('id="btnBuildJointReactionCandidate"'), 'foundation exposes ETABS/SAP2000 Joint Reactions table adapter', 'CSV source remains a candidate until explicit adoption');
  assert(html.includes('joint-reaction-fixture-sanitizer-core.js?v=1') && html.includes('id="btnDownloadJointReactionObservedPackage"'), 'foundation exposes browser-safe Joint Reactions anonymized intake', 'actual exports can become a pending review package without copy/paste');
  assert(html.includes('id="jointReactionObservedOriginConfirmed"') && html.includes('不會自動核可或進入正式計算書'), 'foundation requires explicit observed-origin declaration', 'browser package remains manual-review-only');
  assert(html.includes('isLinearStaticCaseType') && html.includes('其他 CaseType'), 'foundation preflight uses the adapter linear-static case gate', 'dynamic and nonlinear cases are diagnosed before mapping');
  assert(html.includes('id="jointReactionExportChecklist"') && html.includes('實際匯出檔準備清單（僅畫面顯示）'), 'foundation exposes page-only Joint Reactions export checklist', 'operator guidance exists outside the calculation book');
  assert(html.includes('id="jointReactionPreflightSummary"') && html.includes('summarizeJointReactionTablePreflight'), 'foundation exposes deterministic Joint Reactions table preflight', 'parsed structure risks are visible before adoption');
  assert(!reportSrc.includes('jointReactionExportChecklist') && !reportSrc.includes('實際匯出檔準備清單'), 'foundation report excludes Joint Reactions export workflow', 'export checklist stays page-only');
  assert(!reportSrc.includes('jointReactionPreflightSummary') && !reportSrc.includes('表格預檢（僅限畫面）'), 'foundation report excludes Joint Reactions table diagnostics', 'table preflight stays page-only');
  assert(html.includes('JOINT_REACTION_LOAD_ADAPTER.buildPackage') && html.includes('CaseType') && html.includes("contentSha256:loadedJointReactionTable.contentSha256"), 'joint reaction adapter preserves strict case and source evidence gates', 'basic cases, explicit axes and original table SHA-256 are required');
  assert(html.includes('inspectPileCapLoadComponentSource') && html.includes('基本載重來源追溯已失效') && html.includes('contentSha256'), 'foundation fails closed when adopted component provenance no longer matches fields', 'report generation cannot retain stale imported-source claims');
  assert(html.includes('PILE_CAP_3D_STM_BRIDGE.buildPayload') && html.includes('projectPayload.calculationFingerprint') && html.includes('id="pileCap3DSTMAdditionalCases"'), 'foundation 3D STM bridge carries validated calculation provenance and batch cases', 'bridge payload is built from current pile result, project fingerprint and optional load cases');
  assert(html.includes('parsePileCap3DSTMAdditionalCases') && html.includes('FoundationPile.calculateGroupAndCap'), 'foundation recomputes each 3D STM load-case reaction set', 'batch cases use the same pile-group calculation core');
  assert(html.includes('xs, ys, pileReactions'), 'foundation pile result snapshot preserves per-pile coordinates and reactions', '3D STM bridge source data present');

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
    await exerciseJointReactionExportChecklist(page);
    await exerciseJointReactionObservedPackage(page);
    await exerciseJointReactionTablePreflight(page);
    await exerciseFoundationProjectStorage(page);
    await exerciseEarthPressureBridge(page);
    await exercisePilePyBridge(page);
    await page.goto(TOOL_URL, { waitUntil: 'networkidle' });
    await wait(300);

    for (const tc of pack.cases) {
      await page.evaluate(() => window.clearEarthPressureSource?.({ silent: true }));
      await page.click(`#mainTabs button[data-tab="${tc.tab}"]`);
      if (tc.earthPressureInput) {
        await page.evaluate(input => {
          const result = window.EarthPressureCore.calculate(input);
          window.applyEarthPressurePayload({
            tool: { id: 'earth-pressure', name: '擋土土壓局部快算', pageVersion: 'V0.6' },
            project: { name: '土壓銜接回歸', no: 'EARTH-RC-REG', designer: 'QA' },
            generatedAt: '2026-08-04T01:00:00.000Z', input, result
          }, { silent: true });
        }, tc.earthPressureInput);
      }
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
          okContact: r.okContact,
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
          AsReq: r.AsReq,
          AsReqX: r.AsReqX,
          AsReqY: r.AsReqY,
          capAsReq: r.capAsReq,
          okQ: r.okQ,
          okV1: r.okV1,
          okV2: r.okV2,
          okFlex: r.okFlex,
          okShear: r.okShear,
          toeMu: r.baseDemand?.toe?.moment,
          toeVu: r.baseDemand?.toe?.shear,
          toeAsProv: r.toeAsProv,
          toeAsReq: r.toeAsReq,
          toePhiMn: r.toePhiMn,
          toePhiVc: r.toePhiVc,
          okToeFlex: r.okToeFlex,
          okToeShear: r.okToeShear,
          heelMu: r.baseDemand?.heel?.moment,
          heelVu: r.baseDemand?.heel?.shear,
          heelAsProv: r.heelAsProv,
          heelAsReq: r.heelAsReq,
          heelPhiMn: r.heelPhiMn,
          heelPhiVc: r.heelPhiVc,
          okHeelFlex: r.okHeelFlex,
          okHeelShear: r.okHeelShear,
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
          lateralRequired: r.lateralRequired,
          lateralSupported: r.lateralGroup?.supported,
          lateralMaxX: r.lateralGroup?.x?.maxPerPile,
          lateralMaxY: r.lateralGroup?.y?.maxPerPile,
          lateralResponseOk: r.lateralResponseOk,
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
      if (tc.tab === 'iso') {
        assert(Number.isFinite(actual.AsReqX) && Number.isFinite(actual.AsReqY), `${tc.key} :: isolated footing reinforcement demand is finite`, JSON.stringify({ AsReqX:actual.AsReqX, AsReqY:actual.AsReqY }));
      }
      if (tc.tab === 'combined') {
        assert(Number.isFinite(actual.AsReq), `${tc.key} :: combined footing reinforcement demand is finite`, String(actual.AsReq));
      }
      if (tc.tab === 'pile') {
        assert(Number.isFinite(actual.capAsReq), `${tc.key} :: pile-cap reinforcement demand is finite`, String(actual.capAsReq));
      }

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
