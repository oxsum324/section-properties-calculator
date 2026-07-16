const assert = require('assert');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { inflateRawSync } = require('zlib');
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

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function validateArtifactFamilySummary(runDir, family, expectedKeys) {
  const summaryPath = path.join(runDir, 'rendered-delivery-evidence', family, 'rendered-delivery-evidence-summary.json');
  assert.ok(fs.existsSync(summaryPath), `${family} current-run rendered summary exists`);
  const summary = readJson(summaryPath);
  assert.equal(summary.pass, true, `${family} rendered summary passes`);
  const complete = new Set(summary.complete || summary.records?.map(record => record.key) || []);
  for (const key of expectedKeys) {
    assert.ok(complete.has(key), `${family} rendered summary covers ${key}`);
  }
  return { summary, directory: path.dirname(summaryPath) };
}

function readZipEntries(filePath, label) {
  const zip = fs.readFileSync(filePath);
  let eocdOffset = -1;
  for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1, `${label} ZIP end-of-central-directory exists`);

  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  let centralOffset = zip.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(zip.readUInt32LE(centralOffset), 0x02014b50, `${label} ZIP central-directory entry is valid`);
    const compressionMethod = zip.readUInt16LE(centralOffset + 10);
    const compressedSize = zip.readUInt32LE(centralOffset + 20);
    const fileNameLength = zip.readUInt16LE(centralOffset + 28);
    const extraLength = zip.readUInt16LE(centralOffset + 30);
    const commentLength = zip.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = zip.readUInt32LE(centralOffset + 42);
    const nameStart = centralOffset + 46;
    const name = zip.toString('utf8', nameStart, nameStart + fileNameLength);

    assert.equal(zip.readUInt32LE(localHeaderOffset), 0x04034b50, `${label} ZIP local header is valid: ${name}`);
    const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    if (compressionMethod === 0) {
      entries.set(name, compressed);
    } else if (compressionMethod === 8) {
      entries.set(name, inflateRawSync(compressed));
    } else {
      assert.fail(`${label} ZIP uses unsupported compression method ${compressionMethod}: ${name}`);
    }
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXmlText(xml) {
  return xml
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<\/(?:w:p|t|row)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function decodeHtmlText(html) {
  return decodeXmlText(
    html
      .replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, ' ')
  );
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
const supplementalRecords = [];

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

const stoneSummary = validateFamilySummary(runDir, 'stone-formal', ['stone-fixing']);
const stoneTool = inventory.tools.find(tool => tool.family === 'stone-formal');
const stoneEvidence = stoneSummary.records.find(record => record.key === stoneTool.evidenceKey);
const stoneEvidenceDir = path.join(runDir, 'rendered-delivery-evidence', 'stone-formal');
const stonePdfPath = path.join(stoneEvidenceDir, stoneEvidence.artifact);
const stoneDocxPath = path.join(stoneEvidenceDir, stoneEvidence.document || '');
const stoneAuditPath = path.join(stoneEvidenceDir, stoneEvidence.evidence || '');
const stonePdf = validatePdfFile(stonePdfPath, {
  label: stoneTool.title,
  minTextLength: 8000,
  requiredNeedles: ['結 構 計 算 書', '石材外牆固定構件', 'Auto Word Formal Artifact', '送審速覽', '設計者註記'],
  titleNeedle: '結 構 計 算 書',
  projectNeedle: 'Auto Word Formal Artifact',
  continuationContextLabels: [
    '目 錄',
    'Auto Word Formal Artifact送審速覽',
    'Auto Word Formal Artifact簽章頁',
    'Auto Word Formal Artifact主文（一）',
    'Auto Word Formal Artifact主文（二）',
    'Auto Word Formal Artifact 附件 2 標準板',
    'Auto Word Formal Artifact 附件 2 標準板（續）',
    '附圖 B – 工法實拍照片',
  ],
});
assert.ok(fs.existsSync(stoneDocxPath), 'stone current-run rendered evidence includes DOCX');
assert.equal(fs.readFileSync(stoneDocxPath).subarray(0, 2).toString('ascii'), 'PK', 'stone report artifact has DOCX ZIP signature');
assert.ok(fs.existsSync(stoneAuditPath), 'stone current-run rendered evidence includes audit JSON');
const stoneAudit = readJson(stoneAuditPath);
assert.equal(stoneAudit.mode, 'auto_word', 'stone rendered evidence audit records the formal export path');
assert.equal(stoneAudit.output.size_bytes, fs.statSync(stoneDocxPath).size, 'stone rendered evidence audit matches the preserved DOCX');
records.push({
  href: stoneTool.href,
  title: stoneTool.title,
  family: stoneTool.family,
  evidenceKey: stoneTool.evidenceKey,
  artifact: stoneEvidence.artifact,
  document: stoneEvidence.document,
  evidence: stoneEvidence.evidence,
  pageCount: stonePdf.pageCount,
  textLength: stonePdf.textLength,
});

const anchorTool = inventory.tools.find(tool => tool.family === 'anchor-formal');
assert.ok(anchorTool, 'rendered delivery inventory maps the anchor formal tool');
const { summary: anchorSummary, directory: anchorEvidenceDir } = validateArtifactFamilySummary(
  runDir,
  'anchor-formal',
  ['anchor-review']
);
const anchorEvidence = anchorSummary.records.find(record => record.key === anchorTool.evidenceKey);
assert.ok(anchorEvidence, 'anchor current-run summary resolves the formal artifact record');
const anchorHtmlPath = path.join(anchorEvidenceDir, anchorEvidence.artifact || '');
const anchorDocxPath = path.join(anchorEvidenceDir, anchorEvidence.document || '');
const anchorWorkbookPath = path.join(anchorEvidenceDir, anchorEvidence.workbook || '');
for (const [filePath, label] of [
  [anchorHtmlPath, 'HTML'],
  [anchorDocxPath, 'DOCX'],
  [anchorWorkbookPath, 'XLSX'],
]) {
  assert.ok(fs.existsSync(filePath) && fs.statSync(filePath).size > 1024, `anchor current-run ${label} artifact exists and is non-empty`);
}

const anchorHtml = fs.readFileSync(anchorHtmlPath, 'utf8');
const anchorHtmlText = decodeHtmlText(anchorHtml);
assert.ok(anchorHtmlText.length > 3000, 'anchor HTML artifact contains substantial visible text');
for (const needle of ['錨栓檢討報告', '柱腳基板示例', '載重組合批次檢核', '使用邊界與版本追溯']) {
  assert.ok(anchorHtmlText.includes(needle), `anchor HTML artifact contains ${needle}`);
}

assert.equal(fs.readFileSync(anchorDocxPath).subarray(0, 2).toString('ascii'), 'PK', 'anchor report artifact has DOCX ZIP signature');
const anchorDocxEntries = readZipEntries(anchorDocxPath, 'anchor DOCX');
assert.ok(anchorDocxEntries.has('word/document.xml'), 'anchor DOCX contains word/document.xml');
const anchorDocxText = decodeXmlText(anchorDocxEntries.get('word/document.xml').toString('utf8'));
assert.ok(anchorDocxText.length > 3000, 'anchor DOCX artifact contains substantial visible text');
for (const needle of ['鋼筋混凝土錨栓檢討報告', '柱腳基板示例', '載重組合批次檢核', '逐項檢核明細', '使用邊界與版本']) {
  assert.ok(anchorDocxText.includes(needle), `anchor DOCX artifact contains ${needle}`);
}

assert.equal(fs.readFileSync(anchorWorkbookPath).subarray(0, 2).toString('ascii'), 'PK', 'anchor report artifact has XLSX ZIP signature');
const anchorWorkbookEntries = readZipEntries(anchorWorkbookPath, 'anchor XLSX');
assert.ok(anchorWorkbookEntries.has('xl/workbook.xml'), 'anchor XLSX contains xl/workbook.xml');
const anchorWorkbookXml = anchorWorkbookEntries.get('xl/workbook.xml').toString('utf8');
for (const sheet of ['Summary', 'LoadCases', 'Results', 'Dimensions', 'Factors', 'Candidates', 'Evidence', 'Layouts', 'AuditTrail']) {
  assert.ok(anchorWorkbookXml.includes(`name="${sheet}"`), `anchor XLSX contains ${sheet} sheet`);
}
const anchorWorkbookText = [...anchorWorkbookEntries.entries()]
  .filter(([name]) => name === 'xl/sharedStrings.xml' || name.startsWith('xl/worksheets/'))
  .map(([, value]) => decodeXmlText(value.toString('utf8')))
  .join('\n');
assert.ok(anchorWorkbookText.length > 2000, 'anchor XLSX artifact contains substantial worksheet text');
for (const needle of ['柱腳基板示例', '案例名稱', '控制模式', '使用邊界 / 簽證責任']) {
  assert.ok(anchorWorkbookText.includes(needle), `anchor XLSX artifact contains ${needle}`);
}

const anchorForbiddenNeedles = [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '優先閱讀',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '頁面顯示，不進計算書、列印或 PDF',
];
for (const needle of anchorForbiddenNeedles) {
  assert.equal(anchorHtmlText.includes(needle), false, `anchor HTML excludes page-only status: ${needle}`);
  assert.equal(anchorDocxText.includes(needle), false, `anchor DOCX excludes page-only status: ${needle}`);
  assert.equal(anchorWorkbookText.includes(needle), false, `anchor XLSX excludes page-only status: ${needle}`);
}
assert.equal(anchorEvidence.htmlTextLength, anchorHtml.length, 'anchor summary matches preserved HTML length');
assert.equal(anchorEvidence.documentBytes, fs.statSync(anchorDocxPath).size, 'anchor summary matches preserved DOCX size');
assert.equal(anchorEvidence.workbookBytes, fs.statSync(anchorWorkbookPath).size, 'anchor summary matches preserved XLSX size');
records.push({
  href: anchorTool.href,
  title: anchorTool.title,
  family: anchorTool.family,
  evidenceKey: anchorTool.evidenceKey,
  artifact: anchorEvidence.artifact,
  document: anchorEvidence.document,
  workbook: anchorEvidence.workbook,
  htmlTextLength: anchorHtmlText.length,
  documentTextLength: anchorDocxText.length,
  workbookTextLength: anchorWorkbookText.length,
});

const deckingTool = inventory.tools.find(tool => tool.family === 'decking-formal');
assert.ok(deckingTool, 'rendered delivery inventory maps the decking formal tool');
const { summary: deckingSummary, directory: deckingEvidenceDir } = validateArtifactFamilySummary(
  runDir,
  'decking-formal',
  ['decking-report']
);
const deckingEvidence = deckingSummary.records.find(record => record.key === deckingTool.evidenceKey);
assert.ok(deckingEvidence, 'decking current-run summary resolves the formal artifact record');
const deckingDocxPath = path.join(deckingEvidenceDir, deckingEvidence.document || '');
assert.ok(
  fs.existsSync(deckingDocxPath) && fs.statSync(deckingDocxPath).size > 1024,
  'decking current-run DOCX artifact exists and is non-empty'
);
assert.equal(fs.readFileSync(deckingDocxPath).subarray(0, 2).toString('ascii'), 'PK', 'decking report artifact has DOCX ZIP signature');
const deckingDocxEntries = readZipEntries(deckingDocxPath, 'decking DOCX');
assert.ok(deckingDocxEntries.has('word/document.xml'), 'decking DOCX contains word/document.xml');
const deckingDocumentXml = deckingDocxEntries.get('word/document.xml').toString('utf8');
const deckingRawText = deckingDocumentXml.replace(/<[^>]+>/g, '');
const deckingDocxText = decodeXmlText(deckingDocumentXml);
const deckingParagraphCount = (deckingDocumentXml.match(/<w:p(?:\s|>)/g) || []).length;
const deckingTableCount = (deckingDocumentXml.match(/<w:tbl(?:\s|>)/g) || []).length;
const deckingSectionCount = (deckingDocxText.match(/[一二三四五六七八九十]+、/g) || []).length;
const deckingImageCount = [...deckingDocxEntries.keys()].filter(name => name.startsWith('word/media/')).length;
assert.ok(deckingDocxText.length > 2500, 'decking DOCX artifact contains substantial visible text');
assert.ok(deckingParagraphCount >= 60, 'decking DOCX artifact has populated paragraph structure');
assert.ok(deckingTableCount >= 6, 'decking DOCX artifact has populated table structure');
assert.ok(deckingSectionCount >= 8, 'decking DOCX artifact keeps expected section structure');
const deckingFixture = readJson(path.join(repoRoot, '覆工板', 'test-fixtures', 'report-smoke.json'));
for (const needle of [
  '覆工板系統結構計算書',
  '一、計算結果總表',
  '九、結論與建議',
  deckingFixture.project.name,
  deckingFixture.project.no,
  deckingFixture.project.date,
  '部分項目不通過',
]) {
  assert.ok(deckingDocxText.includes(needle), `decking DOCX artifact contains ${needle}`);
}
assert.equal(deckingDocxText.includes('（未填）'), false, 'decking DOCX does not use missing project placeholders');
for (const needle of [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '優先閱讀',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
  '輸出邊界',
  '頁面顯示，不進計算書、列印或 PDF',
]) {
  assert.equal(deckingDocxText.includes(needle), false, `decking DOCX excludes page-only status: ${needle}`);
}
assert.equal(deckingEvidence.documentBytes, fs.statSync(deckingDocxPath).size, 'decking summary matches preserved DOCX size');
assert.equal(deckingEvidence.documentXmlBytes, Buffer.byteLength(deckingDocumentXml, 'utf8'), 'decking summary matches document.xml size');
assert.equal(deckingEvidence.documentTextLength, deckingRawText.length, 'decking summary matches extracted DOCX text length');
assert.equal(deckingEvidence.paragraphCount, deckingParagraphCount, 'decking summary matches DOCX paragraph count');
assert.equal(deckingEvidence.tableCount, deckingTableCount, 'decking summary matches DOCX table count');
assert.equal(deckingEvidence.sectionCount, deckingSectionCount, 'decking summary matches DOCX section count');
assert.equal(deckingEvidence.imageCount, deckingImageCount, 'decking summary matches DOCX image count');
assert.equal(deckingEvidence.projectName, deckingFixture.project.name, 'decking summary matches smoke project name');
records.push({
  href: deckingTool.href,
  title: deckingTool.title,
  family: deckingTool.family,
  evidenceKey: deckingTool.evidenceKey,
  document: deckingEvidence.document,
  documentBytes: fs.statSync(deckingDocxPath).size,
  documentTextLength: deckingDocxText.length,
  paragraphCount: deckingParagraphCount,
  tableCount: deckingTableCount,
  sectionCount: deckingSectionCount,
  imageCount: deckingImageCount,
});

const { summary: excavationSummary, directory: excavationEvidenceDir } = validateArtifactFamilySummary(
  runDir,
  'excavation-formal',
  ['excavation-report']
);
const excavationEvidence = excavationSummary.records.find(record => record.key === 'excavation-report');
assert.ok(excavationEvidence, 'excavation current-run summary resolves the formal artifact record');
const excavationPdfPath = path.join(excavationEvidenceDir, excavationEvidence.artifact || '');
const excavationDocxPath = path.join(excavationEvidenceDir, excavationEvidence.document || '');
const excavationLatestPdfPath = path.join(excavationEvidenceDir, excavationEvidence.latestArtifact || '');
const excavationLatestDocxPath = path.join(excavationEvidenceDir, excavationEvidence.latestDocument || '');
for (const [filePath, label, signature] of [
  [excavationPdfPath, 'PDF', '%PDF'],
  [excavationDocxPath, 'DOCX', 'PK'],
  [excavationLatestPdfPath, 'latest PDF', '%PDF'],
  [excavationLatestDocxPath, 'latest DOCX', 'PK'],
]) {
  assert.ok(fs.existsSync(filePath) && fs.statSync(filePath).size > 1024, `excavation current-run ${label} artifact exists and is non-empty`);
  assert.equal(fs.readFileSync(filePath).subarray(0, signature.length).toString('ascii'), signature, `excavation ${label} artifact signature`);
}
const excavationPdf = validatePdfFile(excavationPdfPath, {
  label: '開挖擋土支撐正式報告',
  minTextLength: 25000,
  requiredNeedles: [
    '擋土支撐檢核計算書',
    '正式放行擋土支撐範例',
    '一、摘要',
    '二、設計依據',
    '三、結構分析使用之電腦程式',
    '六、結構計算結果',
    '附件一',
    '附件二',
  ],
  titleNeedle: '擋土支撐檢核計算書',
  projectNeedle: '正式放行擋土支撐範例',
  keepWithNextLabels: [
    '一、摘要',
    '二、設計依據',
    '三、結構分析使用之電腦程式',
    '四、材料性質',
    '五、輸入基本資料',
    '六、結構計算結果',
    '附件一',
    '附件二',
  ],
  continuationContextLabels: [
    '擋土支撐檢核計算書',
    '一、摘要',
    '二、設計依據',
    '三、結構分析使用之電腦程式',
    '四、材料性質',
    '五、輸入基本資料',
    '六、結構計算結果',
    '附件一',
    '附件二',
    '主要控制項目彙整',
    '設計規範與檢核依據',
    '附件一型鋼彙整表',
    '附件二型鋼彙整表',
    '本節檢核摘要',
    '已知條件',
    '斷面資料',
    '檢核公式',
    '代入計算',
  ],
});
const excavationDocxEntries = readZipEntries(excavationDocxPath, 'excavation DOCX');
assert.ok(excavationDocxEntries.has('word/document.xml'), 'excavation DOCX contains word/document.xml');
const excavationDocumentXml = excavationDocxEntries.get('word/document.xml').toString('utf8');
const excavationDocumentRawText = excavationDocumentXml.replace(/<[^>]+>/g, '');
const excavationDocxText = decodeXmlText(excavationDocumentXml);
const excavationParagraphCount = (excavationDocumentXml.match(/<w:p(?:\s|>)/g) || []).length;
const excavationTableCount = (excavationDocumentXml.match(/<w:tbl(?:\s|>)/g) || []).length;
const excavationSectionCount = (excavationDocxText.match(/[一二三四五六七八九十]+、/g) || []).length;
const excavationPageBreakCount = (excavationDocumentXml.match(/w:type="page"/g) || []).length;
const excavationDrawingCount = (excavationDocumentXml.match(/<w:drawing(?:\s|>)/g) || []).length;
const excavationMediaCount = [...excavationDocxEntries.keys()].filter(name => name.startsWith('word/media/')).length;
assert.ok(excavationDocxText.length > 25000, 'excavation DOCX artifact contains substantial visible text');
assert.ok(excavationParagraphCount >= 500, 'excavation DOCX artifact has populated paragraph structure');
assert.ok(excavationTableCount >= 10, 'excavation DOCX artifact has populated table structure');
assert.ok(excavationSectionCount >= 8, 'excavation DOCX artifact keeps expected section structure');
assert.ok(excavationPageBreakCount >= 2, 'excavation DOCX artifact keeps appendix page breaks');
assert.ok(excavationDrawingCount >= 1, 'excavation DOCX artifact keeps report drawings');
assert.ok(excavationMediaCount >= 1, 'excavation DOCX artifact keeps embedded media');
for (const needle of [
  '擋土支撐檢核計算書',
  '正式放行擋土支撐範例',
  '一、摘要',
  '二、設計依據',
  '三、結構分析使用之電腦程式',
  '六、結構計算結果',
  '附件一',
  '附件二',
]) {
  assert.ok(excavationDocxText.includes(needle), `excavation DOCX artifact contains ${needle}`);
}
for (const needle of [
  '產報前檢查',
  '附件適用狀態',
  '優先建議報告閱讀狀態',
  '報告閱讀狀態',
  '可作附件',
  '暫勿作附件',
  '頁面輔助',
  '公司內部整理計算附件',
  '不會寫入計算書',
  '不會寫入計算書或列印 PDF',
]) {
  assert.equal(excavationDocxText.includes(needle), false, `excavation DOCX excludes page-only status: ${needle}`);
}
assert.ok(fs.readFileSync(excavationPdfPath).equals(fs.readFileSync(excavationLatestPdfPath)), 'excavation latest PDF matches current generated PDF');
assert.ok(fs.readFileSync(excavationDocxPath).equals(fs.readFileSync(excavationLatestDocxPath)), 'excavation latest DOCX matches current generated DOCX');
assert.equal(excavationEvidence.artifactBytes, fs.statSync(excavationPdfPath).size, 'excavation summary matches preserved PDF size');
assert.equal(excavationEvidence.documentBytes, fs.statSync(excavationDocxPath).size, 'excavation summary matches preserved DOCX size');
assert.equal(excavationEvidence.documentXmlBytes, Buffer.byteLength(excavationDocumentXml, 'utf8'), 'excavation summary matches document.xml size');
assert.equal(excavationEvidence.artifactSha256, sha256File(excavationPdfPath), 'excavation summary matches PDF hash');
assert.equal(excavationEvidence.documentSha256, sha256File(excavationDocxPath), 'excavation summary matches DOCX hash');
assert.equal(excavationEvidence.pdfPageCount, excavationPdf.pageCount, 'excavation summary matches PDF page count');
assert.equal(excavationEvidence.documentXmlTextLength, excavationDocumentRawText.length, 'excavation summary matches extracted DOCX text length');
assert.equal(excavationEvidence.xmlParagraphCount, excavationParagraphCount, 'excavation summary matches DOCX paragraph count');
assert.equal(excavationEvidence.xmlTableCount, excavationTableCount, 'excavation summary matches DOCX table count');
assert.equal(excavationEvidence.xmlSectionCount, excavationSectionCount, 'excavation summary matches DOCX section count');
assert.equal(excavationEvidence.pageBreakCount, excavationPageBreakCount, 'excavation summary matches DOCX page-break count');
assert.equal(excavationEvidence.drawingCount, excavationDrawingCount, 'excavation summary matches DOCX drawing count');
assert.equal(excavationEvidence.mediaCount, excavationMediaCount, 'excavation summary matches DOCX media count');
supplementalRecords.push({
  title: '開挖擋土支撐',
  family: 'excavation-formal',
  evidenceKey: 'excavation-report',
  artifact: excavationEvidence.artifact,
  document: excavationEvidence.document,
  latestArtifact: excavationEvidence.latestArtifact,
  latestDocument: excavationEvidence.latestDocument,
  pageCount: excavationPdf.pageCount,
  pdfTextLength: excavationPdf.textLength,
  documentTextLength: excavationDocxText.length,
  paragraphCount: excavationParagraphCount,
  tableCount: excavationTableCount,
  sectionCount: excavationSectionCount,
});

assert.equal(records.length, inventory.tools.length, 'release rendered evidence resolves every homepage formal tool');
assert.equal(supplementalRecords.length, 1, 'release rendered evidence resolves every supplemental service artifact');
const aggregate = {
  schemaVersion: 1,
  kind: 'release-rendered-delivery-evidence',
  generatedAt: new Date().toISOString(),
  runId: path.basename(runDir),
  required: inventory.tools.length,
  complete: records.length,
  supplementalRequired: 1,
  supplementalComplete: supplementalRecords.length,
  supplementalPass: supplementalRecords.length === 1,
  pass: records.length === inventory.tools.length && supplementalRecords.length === 1,
  records,
  supplementalRecords,
};
const aggregatePath = path.join(runDir, 'rendered-delivery-evidence', 'rendered-delivery-evidence-summary.json');
fs.mkdirSync(path.dirname(aggregatePath), { recursive: true });
fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
console.log(`Rendered delivery evidence contract OK (complete=${records.length}/${inventory.tools.length}, supplemental=${supplementalRecords.length}/1, summary=${aggregatePath})`);
