const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  findPdfFooterOverlapLines,
  summarizePdfLayoutPages,
  findPdfOrphanPageEndHeadings,
  findPdfUncontextualPageStarts,
  findSparseFinalPage,
  validatePdfFile,
} = require('./rendered-delivery-evidence');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');
const inventoryPath = path.join(toolsRoot, 'rendered-delivery-evidence.inventory.json');
const homePath = path.join(toolboxRoot, 'assets', 'home', 'home.js');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const homeSource = fs.readFileSync(homePath, 'utf8');

assert.deepEqual(
  findPdfFooterOverlapLines('資料列內容   版權所有 弘一工程顧問有限公司').overlaps,
  [{ line: 1, footer: '版權所有 弘一工程顧問有限公司', text: '資料列內容 版權所有 弘一工程顧問有限公司' }],
  'rendered delivery evidence detects footer/content overlap'
);
assert.deepEqual(
  findPdfFooterOverlapLines('版權所有 弘一工程顧問有限公司').overlaps,
  [],
  'rendered delivery evidence accepts a standalone footer line'
);

const sparsePageText = summarizePdfLayoutPages(
  `${'第一頁完整內容'.repeat(30)}\f備註\n僅一行\n版權所有 弘一工程顧問有限公司\f`
);
assert.equal(sparsePageText.length, 2, 'rendered delivery evidence preserves PDF text page boundaries');
assert.equal(sparsePageText[1].lines, 2, 'rendered delivery evidence excludes the standalone footer from page density');
assert.ok(
  findSparseFinalPage(sparsePageText, [{ inkRatio: 0.2 }, { inkRatio: 0.02 }]),
  'rendered delivery evidence detects a low-text low-ink final page'
);
assert.equal(
  findSparseFinalPage(sparsePageText, [{ inkRatio: 0.2 }, { inkRatio: 0.1 }]),
  null,
  'rendered delivery evidence accepts a low-text final page with substantial visual content'
);

const orphanPageText = summarizePdfLayoutPages(
  `前段內容\n⑧ VD — 最小設計水平總橫力 (式 2-3)\fSaD/Fu = 0.2151\n後續公式\f`
);
assert.deepEqual(
  findPdfOrphanPageEndHeadings(orphanPageText),
  [{ page: 1, heading: '⑧ VD — 最小設計水平總橫力 (式 2-3)' }],
  'rendered delivery evidence detects a section heading orphaned at a page end'
);
assert.deepEqual(
  findPdfOrphanPageEndHeadings(
    summarizePdfLayoutPages(`前頁完整說明。\f下一頁內容\f`)
  ),
  [],
  'rendered delivery evidence does not treat a completed sentence as an orphaned heading'
);
assert.deepEqual(
  findPdfOrphanPageEndHeadings(
    summarizePdfLayoutPages(`表格內容\n強制檢核\f下一頁內容\f`),
    ['幾何規範']
  ),
  [],
  'rendered delivery evidence does not treat a table-cell phrase as an orphan when DOM headings are available'
);
assert.deepEqual(
  findPdfOrphanPageEndHeadings(summarizePdfLayoutPages(`表格內容\n強制檢核\f下一頁內容\f`)),
  [],
  'rendered delivery evidence does not infer a generic check-status cell as a section heading'
);

const continuationPageText = summarizePdfLayoutPages(
  `前頁內容\fCb 1\n設計需求\f|ex|/B + |ey|/L = 0.0728 ≤ 1/6\n4. 角點線性底壓\f`
);
assert.deepEqual(
  findPdfUncontextualPageStarts(continuationPageText, ['設計需求']),
  [
    { page: 2, text: 'Cb 1' },
    { page: 3, text: '|ex|/B + |ey|/L = 0.0728 ≤ 1/6' },
  ],
  'rendered delivery evidence detects continuation pages that start with an unlabeled row or formula fragment'
);
assert.deepEqual(
  findPdfUncontextualPageStarts(
    summarizePdfLayoutPages(`前頁內容\f項目 採用值\nCb 1\f3. 合力偏心與中央核\n公式內容\f材料\n混凝土 fc'\f檢核項 公式 代入值 結果 OK?\n檢核列\fP-M 互制曲線 (繞 Y 軸)\n曲線圖\f外力\nPu 200 tf\f撓曲檢核 (負彎矩 Mu，頂拉) −\n檢核列\f檢核對比 (使用者輸入 vs. 反算需求)\n對比內容\f內力分析 (各方向、各位置)\n分析內容\f板厚最小值檢核 (規範 8.3.1.2(b) (0.2 < α_fm ≤ 2.0))\n檢核內容\f溫度收縮筋檢核 (規範 24.4.3)\n檢核內容\f撓曲鋼筋設計\n設計內容\f剪力初估\n初估內容\f鋼筋細節\n細節內容\f載重 (φPn / φVn)\n載重內容\f配筋 ＆ 詳細規定\n規定內容\f面外 P-Δ ＆ SBE 延伸\n延伸內容\f面內撓曲 P-M (規範 18.7.5)\n互制內容\f土壓 / 偏心 / 抗滑\n穩定內容\f代表柱控制\n控制內容\f設計建議 (反算)\nAst 需求\f條文對照 ＆ 方法分級\n功能 分級 條文\fℓ\n4. 握裹／搭接說明\f`),
    ['項目 採用值', '3. 合力偏心與中央核']
  ),
  [],
  'rendered delivery evidence accepts known headings, numbered steps, and multi-column headers at continuation page starts'
);
assert.deepEqual(
  findPdfUncontextualPageStarts(summarizePdfLayoutPages(`前頁內容\fℓ\n= 172.6 cm\f`)),
  [{ page: 2, text: 'ℓ' }],
  'rendered delivery evidence only skips an isolated extracted symbol when a contextual line follows it'
);

for (const [relativePath, expectedPrintLayouts] of [
  ['結構工具箱/core/ui/report.js', 1],
  ['鋼構工具/core/ui/report.js', 1],
  ['鋼筋混凝土/shared/report.js', 1],
  ['結構工具箱/core/wind-report.js', 2],
  ['結構工具箱/tools/風力/wind-fence-sign.html', 1],
  ['結構工具箱/tools/風力/wind-object-frame.html', 1],
  ['結構工具箱/tools/風力/wind-lattice-tower.html', 1],
  ['結構工具箱/tools/風力/wind-object-tower.html', 1],
  ['結構工具箱/tools/風力/wind-object-solid.html', 1],
  ['結構工具箱/tools/地震力/seismic-appendage.html', 1],
  ['結構工具箱/tools/地震力/seismic-dynamic.html', 1],
  ['結構工具箱/tools/地震力/seismic-force.html', 1],
  ['結構工具箱/tools/地震力/seismic-misc.html', 1],
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const footerSafeMargins = source.match(/@page\s*\{[^}]*margin:\s*18mm\s+14mm\s+18mm\s*;?\s*\}/g) || [];
  const flowingPrintFooters = source.match(/\.rep-footer\s*\{\s*position:static;\s*width:auto;\s*padding:0;\s*margin-top:4mm;\s*break-before:avoid-page;\s*page-break-before:avoid;\s*break-inside:avoid;\s*\}/g) || [];
  assert.ok(footerSafeMargins.length >= expectedPrintLayouts, `${relativePath} reserves footer-safe A4 bottom margin`);
  assert.ok(flowingPrintFooters.length >= expectedPrintLayouts, `${relativePath} keeps the print footer in document flow`);
}

for (const relativePath of [
  '鋼筋混凝土/tools/beam-report-visual.test.js',
  '鋼筋混凝土/tools/column-report-visual.test.js',
  '鋼筋混凝土/tools/foundation-report-visual.test.js',
  '鋼筋混凝土/tools/retrofit-report-visual.test.js',
  '鋼筋混凝土/tools/shear-wall-report-visual.test.js',
  '鋼筋混凝土/tools/single-pile-report-visual.test.js',
  '鋼筋混凝土/tools/slab-report-visual.test.js',
  '鋼筋混凝土/tools/wall-report-visual.test.js',
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.ok(source.includes("bottom: '18mm'"), `${relativePath} renders with footer-safe bottom margin`);
  assert.equal(source.includes("bottom: '24mm'"), false, `${relativePath} rejects oversized bottom margin that can create footer-only pages`);
}

const windReportSource = fs.readFileSync(path.join(repoRoot, '結構工具箱/core/wind-report.js'), 'utf8');
assert.equal(
  (windReportSource.match(/\.rep-step \{ margin:6px 0 8px; \}/g) || []).length,
  2,
  'shared wind report keeps compact print-only step spacing in both report layouts'
);
assert.equal(
  (windReportSource.match(/\.rep-step-body \{ line-height:1\.45; padding:6px 8px; \}/g) || []).length,
  2,
  'shared wind report keeps compact print-only formula blocks in both report layouts'
);
assert.equal(
  (windReportSource.match(/\.rep-block h3, \.rep-step h4 \{ break-after:avoid-page; page-break-after:avoid; \}/g) || []).length,
  2,
  'shared wind report keeps section headings with their following content in both report layouts'
);
const appendageSource = fs.readFileSync(path.join(repoRoot, '結構工具箱/tools/地震力/seismic-appendage.html'), 'utf8');
assert.ok(
  appendageSource.includes('.block { margin:8px 0 10px; }')
    && appendageSource.includes('.step-title { margin-bottom:3px; padding:3px 8px; } .step-body { line-height:1.55; }'),
  'appendage report compacts print-only calculation spacing so notes do not create a sparse final page'
);
assert.ok(
  appendageSource.includes('<section class="block calc-block">')
    && appendageSource.includes('.block.calc-block { break-inside:auto; page-break-inside:auto; }'),
  'appendage report lets the long calculation block fill the remaining first-page space before continuing'
);
const seismicForceSource = fs.readFileSync(path.join(repoRoot, '結構工具箱/tools/地震力/seismic-force.html'), 'utf8');
assert.ok(
  seismicForceSource.includes('.rep-step { break-inside:avoid-page; page-break-inside:avoid; }'),
  'seismic force report keeps each print calculation heading with its formula body'
);
for (const relativePath of [
  '結構工具箱/core/ui/report.js',
  '鋼構工具/core/ui/report.js',
  '鋼筋混凝土/shared/report.js',
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.ok(
    source.includes('function buildCalculationFingerprint')
      && source.includes('<b>輸出時間</b>')
      && source.includes('<b>計算指紋</b>'),
    `${relativePath} includes the shared calculation traceability header`
  );
  assert.ok(
    source.includes('.rep-block h3, .rep-step h4 { break-after:avoid-page; page-break-after:avoid; }')
      && source.includes("<section class=\"rep-block${g.keepTogether ? ' rep-block--keep' : ''}\">")
      && source.includes('.rep-block--keep { break-inside:avoid-page; page-break-inside:avoid; }')
      && source.includes('tr { break-inside:avoid-page; page-break-inside:avoid; }')
      && source.includes('<thead><tr><th>符號</th><th>說明</th></tr></thead>'),
    `${relativePath} keeps report headings and table rows intact across print pages`
  );
}
for (const relativePath of [
  '結構工具箱/core/ui/report.js',
  '鋼構工具/core/ui/report.js',
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.ok(
    source.includes('<thead><tr><th>項目</th><th>採用值</th></tr></thead>'),
    `${relativePath} gives formal input tables a repeatable continuation header`
  );
}
const rcColumnSource = fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/tools/column.html'), 'utf8');
assert.ok(
  rcColumnSource.includes("{ group:'外力', keepTogether:true, items:["),
  'RC column report keeps the compact external-load input group together on one page'
);
const rcBeamSource = fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/tools/beam.html'), 'utf8');
assert.ok(
  rcBeamSource.includes("{ group: '材料', keepTogether: true, items: ["),
  'RC beam report keeps the compact material input group together on one page'
);
const rcSlabSource = fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/tools/slab.html'), 'utf8');
assert.ok(
  rcSlabSource.includes("{ group:'材料', keepTogether:true, items:["),
  'RC slab report keeps the compact material input group together on one page'
);
const rcShearWallSource = fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/tools/shear-wall.html'), 'utf8');
assert.ok(
  rcShearWallSource.includes("{ group:'幾何 ＆ 材料', keepTogether:true, items:["),
  'RC shear-wall report keeps the compact geometry and material input group together on one page'
);
const rcSinglePileSource = fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/tools/single-pile-designer.html'), 'utf8');
assert.ok(
  rcSinglePileSource.includes("{ group: r.bestCandidate ? '採用方案' : '最接近控制方案', keepTogether: true, items: ["),
  'RC single-pile report keeps the compact adopted-scheme input group together on one page'
);
const foundationLocalSource = fs.readFileSync(path.join(repoRoot, '結構工具箱/tools/foundation/foundation-local.html'), 'utf8');
assert.ok(
  (foundationLocalSource.match(/<section class="rpt-step"><h3>/g) || []).length >= 5
    && foundationLocalSource.includes('.rpt-step{break-inside:avoid-page;page-break-inside:avoid}')
    && foundationLocalSource.includes('<table><thead><tr><th>角點</th><th>q (tf/m²)</th></tr></thead>'),
  'foundation local report keeps short calculation steps intact and exposes a repeatable pressure-table header'
);
const rcVisualQualitySource = fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/tools/report-screenshot-quality.js'), 'utf8');
assert.ok(
  rcVisualQualitySource.includes("require('../../結構工具箱/tools/rendered-delivery-evidence')")
    && rcVisualQualitySource.includes('PDF rendered pagination quality'),
  'every RC report visual PDF uses the shared rendered pagination validator'
);

function extractConstLiteral(source, name) {
  const prefix = `const ${name} = `;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `home.js missing ${name}`);
  const valueStart = start + prefix.length;
  const opening = source[valueStart];
  const closing = opening === '[' ? ']' : '}';
  let depth = 0;
  let quote = '';
  let inString = false;
  let escaped = false;
  for (let index = valueStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (["'", '"', '`'].includes(char)) {
      inString = true;
      quote = char;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing && --depth === 0) return source.slice(valueStart, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateFamilySummary(runDir, family, expectedKeys) {
  const summaryPath = path.join(runDir, 'rendered-delivery-evidence', family, 'rendered-delivery-evidence-summary.json');
  assert.ok(fs.existsSync(summaryPath), `${family} current-run rendered summary exists`);
  const summary = readJson(summaryPath);
  assert.equal(summary.pass, true, `${family} rendered summary passes`);
  const complete = new Set(summary.complete || summary.records?.map(record => record.key) || []);
  for (const key of expectedKeys) {
    assert.ok(complete.has(key), `${family} rendered summary covers ${key}`);
  }
  for (const record of summary.records || []) {
    if (!record.artifact) continue;
    const artifactPath = path.join(path.dirname(summaryPath), record.artifact);
    const evidencePath = record.evidence ? path.join(path.dirname(summaryPath), record.evidence) : '';
    assert.ok(fs.existsSync(artifactPath), `${family} artifact exists: ${record.artifact}`);
    assert.equal(fs.readFileSync(artifactPath).subarray(0, 4).toString('ascii'), '%PDF', `${family} artifact is PDF: ${record.artifact}`);
    if (evidencePath) assert.ok(fs.existsSync(evidencePath), `${family} evidence JSON exists: ${record.evidence}`);
  }
  return summary;
}

function newestMatchingPdf(directory, prefix) {
  assert.ok(fs.existsSync(directory), `RC rendered evidence directory exists: ${directory}`);
  const matches = fs.readdirSync(directory)
    .filter(name => name.startsWith(prefix) && name.endsWith('.pdf'))
    .map(name => ({ name, path: path.join(directory, name), mtimeMs: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  assert.ok(matches.length > 0, `RC rendered evidence contains ${prefix}*.pdf`);
  return matches[0];
}

function validateCurrentLog(runDir, key, marker) {
  const logPath = path.join(runDir, `${key}.txt`);
  assert.ok(fs.existsSync(logPath), `current-run ${key} log exists`);
  const text = fs.readFileSync(logPath, 'utf8');
  assert.ok(text.includes(marker), `current-run ${key} confirms actual artifact test`);
  return path.basename(logPath);
}

assert.equal(inventory.version, 1, 'rendered delivery inventory version');
assert.equal(inventory.tools.length, 31, 'rendered delivery inventory covers all homepage formal tools');
const homeTools = vm.runInNewContext(`(${extractConstLiteral(homeSource, 'tools')})`);
const formalHomeTools = homeTools.filter(tool => tool.state === 'formal');
const formalRoutes = formalHomeTools.map(tool => tool.href).sort();
const inventoryRoutes = inventory.tools.map(tool => tool.href).sort();
assert.deepEqual(inventoryRoutes, formalRoutes, 'rendered delivery inventory matches every homepage formal route');
for (const tool of inventory.tools) {
  const homeTool = formalHomeTools.find(item => item.href === tool.href);
  assert.equal(tool.title, homeTool.title, `rendered delivery inventory title matches ${tool.href}`);
  assert.ok(tool.family && tool.evidenceKey, `rendered delivery inventory maps ${tool.href}`);
}

const strictRelease = process.env.PREFLIGHT_RELEASE === '1';
if (!strictRelease) {
  console.log(`Rendered delivery evidence contract OK (inventory=${inventory.tools.length}, current-run artifact verification skipped outside release mode)`);
  process.exit(0);
}

const runDir = path.resolve(process.env.PREFLIGHT_RUN_DIR || '');
assert.ok(process.env.PREFLIGHT_RUN_DIR && fs.existsSync(runDir), 'release rendered evidence receives PREFLIGHT_RUN_DIR');
const records = [];

for (const family of ['formal-tools', 'local-quick-tools', 'steel-formal']) {
  const tools = inventory.tools.filter(tool => tool.family === family);
  const expectedKeys = [...new Set(tools.map(tool => tool.evidenceKey))];
  const summary = validateFamilySummary(runDir, family, expectedKeys);
  for (const tool of tools) {
    const evidence = summary.records.find(record => record.key === tool.evidenceKey);
    records.push({ href: tool.href, title: tool.title, family, evidenceKey: tool.evidenceKey, artifact: evidence?.artifact || '' });
  }
}

const rcDir = path.join(runDir, 'rendered-delivery-evidence', 'rc-formal');
for (const tool of inventory.tools.filter(item => item.family === 'rc-formal')) {
  const artifact = newestMatchingPdf(rcDir, tool.evidenceKey);
  const pdf = validatePdfFile(artifact.path, {
    label: tool.title,
    minTextLength: 500,
    forbiddenNeedles: [],
  });
  records.push({ href: tool.href, title: tool.title, family: tool.family, evidenceKey: tool.evidenceKey, artifact: artifact.name, pageCount: pdf.pageCount, textLength: pdf.textLength });
}

const retrofitSummary = validateFamilySummary(runDir, 'rc-retrofit', ['rc-retrofit-section']);
const retrofitTool = inventory.tools.find(tool => tool.family === 'rc-retrofit');
const retrofitEvidence = retrofitSummary.records.find(record => record.key === retrofitTool.evidenceKey);
records.push({ href: retrofitTool.href, title: retrofitTool.title, family: retrofitTool.family, evidenceKey: retrofitTool.evidenceKey, artifact: retrofitEvidence.artifact });

const officeMarkers = {
  'anchor-report-contract': 'Anchor report contract checks passed.',
  'stone-report-contract': 'Stone report contract checks passed.',
  'decking-report-contract': 'Decking report contract checks passed.',
};
for (const tool of inventory.tools.filter(item => item.family === 'office-artifacts')) {
  const log = validateCurrentLog(runDir, tool.evidenceKey, officeMarkers[tool.evidenceKey]);
  records.push({ href: tool.href, title: tool.title, family: tool.family, evidenceKey: tool.evidenceKey, artifact: log });
}
const deckingDocx = path.join(repoRoot, 'output', 'preflight', 'cover-slab-report-contract.docx');
assert.ok(fs.existsSync(deckingDocx) && fs.statSync(deckingDocx).size > 1024, 'decking current report contract produced a non-empty DOCX');
assert.equal(fs.readFileSync(deckingDocx).subarray(0, 2).toString('ascii'), 'PK', 'decking report artifact has DOCX ZIP signature');

assert.equal(records.length, inventory.tools.length, 'release rendered evidence resolves every homepage formal tool');
const aggregate = {
  schemaVersion: 1,
  kind: 'release-rendered-delivery-evidence',
  generatedAt: new Date().toISOString(),
  runId: path.basename(runDir),
  required: inventory.tools.length,
  complete: records.length,
  pass: records.length === inventory.tools.length,
  records,
};
const aggregatePath = path.join(runDir, 'rendered-delivery-evidence', 'rendered-delivery-evidence-summary.json');
fs.mkdirSync(path.dirname(aggregatePath), { recursive: true });
fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
console.log(`Rendered delivery evidence contract OK (complete=${records.length}/${inventory.tools.length}, summary=${aggregatePath})`);
