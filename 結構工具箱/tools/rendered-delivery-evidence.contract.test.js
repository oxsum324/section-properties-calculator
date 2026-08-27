const assert = require('assert');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { inflateRawSync } = require('zlib');
const AttachmentPackageChecker = require('./attachment-package-check');
const AnchorHtmlSealVerifier = require('./anchor-html-seal-verifier');
const { inspectDocxPackage } = require('./docx-package-integrity');
const { inspectXlsxPackage } = require('./xlsx-package-integrity');
const { runXlsxPrintVisualAudit } = require('./xlsx-print-visual');
const AnchorXlsxSealVerifier = require('./xlsx-seal-verifier');
const { verifyHtmlArtifact } = require('../../dev_tools/html-attachment-integrity');
const { captureArtifactIntegrity } = require('../../鋼筋混凝土/tools/report-screenshot-quality');
const {
  CALCULATION_BOOK_CONTENT_BOUNDARY,
  CONTENT_GROUPS,
  CONTENT_PROFILES,
  DEFAULT_FORBIDDEN,
  evaluateCalculationContent,
  findPdfFooterOverlapLines,
  summarizePdfLayoutPages,
  findPdfOrphanPageEndHeadings,
  findPdfUncontextualPageStarts,
  findSparseFinalPage,
  validatePdfFile,
  verifyArtifactIntegrityEntry,
  verifyCanonicalRenderedArtifact,
  verifyRecordedArtifact,
  writeEvidenceSummary,
} = require('./rendered-delivery-evidence');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');
const inventoryPath = path.join(toolsRoot, 'rendered-delivery-evidence.inventory.json');
const homePath = path.join(toolboxRoot, 'assets', 'home', 'home.js');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const homeSource = fs.readFileSync(homePath, 'utf8');

for (const needle of ['計算層級 / 複核邊界', '條文對照 ＆ 方法分級', '規範覆蓋矩陣']) {
  assert.ok(DEFAULT_FORBIDDEN.includes(needle), `rendered delivery evidence shares calculation-book boundary: ${needle}`);
}
assert.equal(CALCULATION_BOOK_CONTENT_BOUNDARY.version, '1.4.0', 'rendered delivery evidence consumes the current calculation-book boundary contract');
assert.deepEqual(
  CONTENT_PROFILES['calculation-summary'],
  ['adoptedInputs', 'engineeringResult', 'engineeringValues'],
  'non-native calculation summaries preserve engineering inputs and results while trace remains a separate package review rule'
);
assert.deepEqual(
  CONTENT_PROFILES['traceable-calculation-book'],
  ['adoptedInputs', 'calculationProcess', 'engineeringResult', 'engineeringValues', 'traceability'],
  'traceable calculation-book profile requires all five positive content groups'
);
assert.deepEqual(
  CONTENT_PROFILES['traceable-calculation-summary'],
  ['adoptedInputs', 'engineeringResult', 'engineeringValues', 'traceability'],
  'traceable summary profile keeps inputs, results, and provenance without requiring repeated detailed equations'
);
assert.ok(CONTENT_GROUPS.engineeringResult.anyOf.includes('檢核結論'), 'engineering result group recognizes an explicit check conclusion');
assert.equal(CONTENT_GROUPS.engineeringValues.minimumPatternMatches, 2, 'engineering value group requires at least two actual values');
assert.deepEqual(
  evaluateCalculationContent(
    '採用材料與荷載資料：fc\'=280 kgf/cm²。計算內容含公式與代入值：Mu=12.5 tf·m。檢核結論：DCR=0.69，通過。產出工具 A，工具版本 v1，輸出時間 2026/07/23，計算指紋 CF-123。',
    { contentBoundaryProfile: 'traceable-calculation-book' }
  ).missingGroups,
  [],
  'positive content gate accepts a complete traceable calculation book'
);
assert.deepEqual(
  evaluateCalculationContent(
    '採用材料與荷載資料：fc\'=280 kgf/cm²。計算內容含公式與代入值：Mu=12.5 tf·m。產出工具 A，工具版本 v1，輸出時間 2026/07/23，計算指紋 CF-123。',
    { contentBoundaryProfile: 'traceable-calculation-book' }
  ).missingGroups,
  ['engineeringResult'],
  'positive content gate rejects a calculation book without an engineering result'
);
assert.deepEqual(
  evaluateCalculationContent(
    '採用材料與荷載資料。計算內容含公式與代入值。檢核結論：通過。工具版本 v3.1，輸出時間 2026/07/23 09:30，計算指紋 CF-123。',
    { contentBoundaryProfile: 'calculation-book' }
  ).missingGroups,
  ['engineeringValues'],
  'headings, status wording, versions, dates, and fingerprints do not count as engineering values'
);
const oneEngineeringValue = evaluateCalculationContent(
  '採用材料與荷載資料。計算內容：Mu=12.5 tf·m。檢核結論：通過。',
  { contentBoundaryProfile: 'calculation-book' }
);
assert.deepEqual(oneEngineeringValue.missingGroups, ['engineeringValues'], 'one engineering value does not satisfy the two-value threshold');
assert.deepEqual(
  oneEngineeringValue.groups.find(group => group.key === 'engineeringValues')?.patternMatches,
  ['Mu=12.5 tf·m'],
  'overlapping named-value and unit patterns count one engineering value only'
);
assert.deepEqual(
  evaluateCalculationContent('此頁是操作介面，不是計算書。', { contentBoundaryProfile: 'direct-print-boundary' }).missingGroups,
  [],
  'direct-print boundary notice is exempt from calculation-book content requirements'
);

function assertCalculationContentProfile(value, profile, label) {
  const result = evaluateCalculationContent(value, { contentBoundaryProfile: profile });
  assert.deepEqual(result.missingGroups, [], `${label} satisfies ${profile}: ${result.missingGroups.join(', ')}`);
  return result;
}

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
    summarizePdfLayoutPages(`前頁內容\f項目 採用值\nCb 1\f3. 合力偏心與中央核\n公式內容\f材料\n混凝土 fc'\f檢核項 公式 代入值 結果 OK?\n檢核列\fP-M 互制曲線 (繞 Y 軸)\n曲線圖\fP-M 互制曲線（灰虛＝原 RC；藍＝Pn-Mn；綠＝φPn-φMn；紅●＝需求點）\n曲線圖\f純彎能力（P=0 參考）\n能力表\f外力\nPu 200 tf\f撓曲檢核 (負彎矩 Mu，頂拉) −\n檢核列\f檢核對比 (使用者輸入 vs. 反算需求)\n對比內容\f內力分析 (各方向、各位置)\n分析內容\f板厚最小值檢核 (規範 8.3.1.2(b) (0.2 < α_fm ≤ 2.0))\n檢核內容\f溫度收縮筋檢核 (規範 24.4.3)\n檢核內容\f撓曲鋼筋設計\n設計內容\f剪力初估\n初估內容\f鋼筋細節\n細節內容\f載重 (φPn / φVn)\n載重內容\f配筋 ＆ 詳細規定\n規定內容\f面外 P-Δ ＆ SBE 延伸\n延伸內容\f面內撓曲 P-M (規範 18.7.5)\n互制內容\f土壓 / 偏心 / 抗滑\n穩定內容\f代表柱控制\n控制內容\f設計建議 (反算)\nAst 需求\f條文對照 ＆ 方法分級\n功能 分級 條文\fℓ\n4. 握裹／搭接說明\f`),
    ['項目 採用值', '3. 合力偏心與中央核']
  ),
  [],
  'rendered delivery evidence accepts known headings, numbered steps, and multi-column headers at continuation page starts'
);
assert.deepEqual(
  findPdfUncontextualPageStarts(
    summarizePdfLayoutPages(`前頁內容\fY 向｜第 9.6.1 節採用接頭面名義彎矩\n計算內容\fX 向｜SRC 柱計算斷面\n斷面圖\f`)
  ),
  [],
  'rendered delivery evidence accepts directional SRC clause and section headings at continuation page starts'
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
  if (['結構工具箱/core/ui/report.js', '鋼構工具/core/ui/report.js', '鋼筋混凝土/shared/report.js'].includes(relativePath)) {
    assert.ok(source.includes("root.querySelectorAll('.rep-window-status')"), `${relativePath} clears transient report-window messages before sealed HTML serialization`);
  }
  const footerSafeMargins = source.match(/@page\s*\{[^}]*margin:\s*18mm\s+14mm\s+18mm\s*;?\s*\}/g) || [];
  const flowingPrintFooters = source.match(/\.rep-footer\s*\{\s*position:static;\s*width:auto;\s*(?:clear:both;\s*)?padding:(?:0|1mm 0 0);\s*margin-top:(?:4|8)mm;\s*break-before:avoid-page;\s*page-break-before:avoid;\s*break-inside:avoid;\s*\}/g) || [];
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
  const hasKeepTogetherMarkup = source.includes("<section class=\"rep-block${g.keepTogether ? ' rep-block--keep' : ''}\">")
    || (
      source.includes('const reportBlockClass = group => [')
      && source.includes("group?.keepTogether ? 'rep-block--keep' : ''")
      && source.includes('<section class="${reportBlockClass(g)}">')
    );
  assert.ok(
    source.includes('function buildCalculationFingerprint')
      && source.includes('<b>輸出時間</b>')
      && source.includes('<b>計算指紋</b>'),
    `${relativePath} includes the shared calculation traceability header`
  );
  assert.ok(
    source.includes('.rep-block h3, .rep-step h4 { break-after:avoid-page; page-break-after:avoid; }')
      && hasKeepTogetherMarkup
      && source.includes('.rep-block--keep { break-inside:avoid-page; page-break-inside:avoid; }')
      && source.includes('tr { break-inside:avoid-page; page-break-inside:avoid; }'),
    `${relativePath} keeps report headings and table rows intact across print pages`
  );
}
assert.ok(
  !fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/shared/report.js'), 'utf8').includes('const symHtml')
    && !fs.readFileSync(path.join(repoRoot, '鋼筋混凝土/shared/report.js'), 'utf8').includes('const notesHtml'),
  'RC shared report excludes standalone symbol dictionaries and explanatory note appendices'
);
for (const relativePath of [
  '結構工具箱/core/ui/report.js',
  '鋼構工具/core/ui/report.js',
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.ok(
    source.includes('CALCULATION_BOOK_PAGE_ONLY_LABELS')
      && !source.includes('<thead><tr><th>符號</th><th>說明</th></tr></thead>')
      && !source.includes('const notesHtml'),
    `${relativePath} keeps UI dictionaries and explanatory note appendices out of formal calculation books`
  );
}
for (const relativePath of [
  '結構工具箱/core/ui/report.js',
  '鋼構工具/core/ui/report.js',
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  for (const needle of [
    "source.dataset.initialApproved = checkbox.checked ? 'true' : 'false'",
    'source.dataset.approvedAt = approvedAtValue',
    "checkbox.setAttribute('checked', 'checked')",
    "checkbox.removeAttribute('checked')",
  ]) {
    assert.ok(
      source.includes(needle),
      `${relativePath} serializes approval state for reload-safe formal attachment rendering: ${needle}`
    );
  }
}
for (const relativePath of [
  '結構工具箱/core/ui/report.js',
  '鋼構工具/core/ui/report.js',
  '鋼筋混凝土/shared/report.js',
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

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalizeJson(value[key])]));
  }
  return value;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(canonicalizeJson(value)), 'utf8').digest('hex');
}

function validateHtmlArtifactRecord(directory, record, label, options = {}) {
  if (options.requireRecordedIntegrity) {
    return verifyHtmlArtifact(directory, record, label);
  }
  assert.ok(record?.htmlArtifact, `${label} names HTML artifact`);
  const htmlArtifactPath = path.join(directory, record.htmlArtifact);
  assert.ok(fs.existsSync(htmlArtifactPath), `${label} HTML artifact exists: ${record.htmlArtifact}`);
  const html = fs.readFileSync(htmlArtifactPath, 'utf8');
  const visibleText = AttachmentPackageChecker.extractHtmlVisibleContent(html).text;
  assert.ok(visibleText.includes('文件狀態：正式附件'), `${label} HTML artifact keeps static formal state: ${record.htmlArtifact}`);
  if (record.calculationFingerprint) {
    assert.ok(visibleText.includes(record.calculationFingerprint), `${label} HTML artifact keeps fingerprint: ${record.htmlArtifact}`);
  }
  return {
    name: record.htmlArtifact,
    bytes: fs.statSync(htmlArtifactPath).size,
    sha256: sha256File(htmlArtifactPath),
    calculationFingerprint: String(record.calculationFingerprint || ''),
  };
}

function integritySetHash(artifacts) {
  return createHash('sha256')
    .update(artifacts
      .map(artifact => `${artifact.name}\u0000${artifact.bytes}\u0000${artifact.sha256}`)
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function scopedIntegritySetHash(artifacts) {
  return createHash('sha256')
    .update(artifacts
      .map(artifact => `${artifact.family || ''}\u0000${artifact.role || ''}\u0000${artifact.name}\u0000${artifact.bytes}\u0000${artifact.sha256}`)
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function formalResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.key,
        record.goldenCaseId,
        record.goldenCaseSha256,
        record.calculationFingerprint,
        record.expectedGoldenCases,
        record.verifiedGoldenCases,
        record.verifiedAssertionCount,
        record.renderedCaseAssertionCount,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function rcResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.href,
        record.key,
        record.sourceSnapshotSha256,
        record.calculationFingerprint,
        record.verifiedAssertionCount,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function rcSourceReportPackageSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.href,
        record.key,
        record.status,
        record.fingerprintLinkCount,
        record.fingerprint,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function rcStandaloneFormalHtmlPrintSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.href,
        record.key,
        record.artifact,
        record.artifactBytes,
        record.artifactSha256,
        record.pageCount,
        record.textLength,
        record.calculationFingerprint,
        record.externalRequestCount,
        record.tamperDetectionStatus,
        record.approvalSealStatus,
        record.approvalSealSha256,
        record.approvalTamperDetectionStatus,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function rcFormalHtmlContentSealSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [record.href, record.key, record.htmlArtifact, record.scope, record.contentSha256].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function rcFormalHtmlApprovalSealSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [record.href, record.key, record.htmlArtifact, record.scope, record.approvalSha256].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function formalHtmlSealSetHash(records, kind) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.key,
        record.htmlArtifact,
        record.htmlArtifactSha256,
        kind === 'approval' ? record.approvalSealScope : record.contentSealScope,
        kind === 'approval' ? record.approvalSha256 : record.contentSha256,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function steelResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.key,
        record.sourcePayloadSha256,
        record.calculationFingerprint,
        record.verifiedAssertionCount,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function localQuickResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.caseId,
        record.sourceJsonSha256,
        record.sourceInputSha256,
        record.sourceResultSha256,
        record.replayResultSha256,
        record.calculationFingerprint,
        record.verifiedAssertionCount,
        record.pdfSha256,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function stoneResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.caseId,
        record.goldenCaseSha256,
        record.goldenInputSha256,
        record.sourcePayloadSha256,
        record.inputHash,
        record.resultHash,
        record.calcSourceHash,
        record.verifiedAssertionCount,
        record.pdfSha256,
        record.docxSha256,
        record.auditSha256,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function anchorResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.caseId,
        record.sourceBackupSha256,
        record.sourceReplayFingerprint,
        record.calculationFingerprint,
        record.verifiedProjectCount,
        record.verifiedAssertionCount,
        record.htmlSha256,
        record.docxSha256,
        record.workbookSha256,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function deckingResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.caseId,
        record.sourceJsonSha256,
        record.calculationFingerprint,
        record.verifiedAssertionCount,
        record.documentSha256,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function excavationResultReconciliationSetHash(records) {
  return createHash('sha256')
    .update(records
      .map(record => [
        record.caseId,
        record.sourceProjectSha256,
        record.resultSha256,
        record.calculationFingerprint,
        record.verifiedCheckCount,
        record.verifiedAssertionCount,
        record.pdfSha256,
        record.docxSha256,
      ].join('\u0000'))
      .sort()
      .join('\n'), 'utf8')
    .digest('hex');
}

function validateDeckingResultReconciliationRecord(record, directory, renderedText, label) {
  const reconciliation = record?.resultReconciliation;
  assert.equal(reconciliation?.schemaVersion, 1, `${label} decking result reconciliation schema`);
  assert.equal(reconciliation?.strategy, 'decking-json-replay-to-docx-hash', `${label} decking result reconciliation strategy`);
  assert.equal(record?.key, 'decking-report', `${label} decking result reconciliation case identity`);
  const sourceJsonName = reconciliation?.sourceJson || '';
  assert.equal(path.basename(sourceJsonName), sourceJsonName, `${label} decking source JSON uses a local artifact name`);
  const sourceJsonPath = path.join(directory, sourceJsonName);
  assert.ok(fs.existsSync(sourceJsonPath), `${label} decking replayed source JSON exists`);
  const sourceJsonSha256 = sha256File(sourceJsonPath);
  assert.equal(reconciliation?.sourceJsonSha256, sourceJsonSha256, `${label} decking source JSON SHA-256 matches producer summary`);
  const sourceJson = readJson(sourceJsonPath);
  assert.equal(sourceJson?.project?.no, 'TEST-001', `${label} decking replayed source keeps case identity`);
  assert.ok(sourceJson?.inputs && Object.keys(sourceJson.inputs).length === 6, `${label} decking replayed source keeps six calculation input groups`);
  assert.ok(sourceJson?.results && Object.keys(sourceJson.results).length === 6, `${label} decking replayed source keeps six calculation result groups`);
  assert.match(String(reconciliation?.calculationFingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} decking calculation fingerprint`);
  assert.equal(sourceJson?.document?.calculationFingerprint, reconciliation?.calculationFingerprint, `${label} decking source JSON fingerprint matches reconciliation`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount >= 31, `${label} decking verified result assertions`);
  assert.equal(reconciliation?.documentSha256, record?.documentSha256, `${label} decking DOCX hash matches producer summary`);
  assert.equal(renderedText.includes(reconciliation?.calculationFingerprint), true, `${label} decking DOCX contains the replayed calculation fingerprint`);
  assert.equal(reconciliation?.pass, true, `${label} decking result reconciliation passes`);
  return { caseId: record.key, ...reconciliation };
}

function validateExcavationResultReconciliationRecord(record, directory, renderedTexts, label) {
  const reconciliation = record?.resultReconciliation;
  assert.equal(reconciliation?.schemaVersion, 1, `${label} excavation result reconciliation schema`);
  assert.equal(
    reconciliation?.strategy,
    'excavation-project-state-replay-to-pdf-docx-hash',
    `${label} excavation result reconciliation strategy`
  );
  assert.equal(record?.key, 'excavation-report', `${label} excavation producer record identity`);
  assert.equal(reconciliation?.caseId, 'release-evidence', `${label} excavation replay case identity`);
  const sourceProjectName = reconciliation?.sourceProject || '';
  assert.equal(path.basename(sourceProjectName), sourceProjectName, `${label} excavation ProjectState uses a local artifact name`);
  const sourceProjectPath = path.join(directory, sourceProjectName);
  assert.ok(fs.existsSync(sourceProjectPath), `${label} excavation ProjectState exists`);
  assert.equal(reconciliation?.sourceProjectSha256, sha256File(sourceProjectPath), `${label} excavation ProjectState SHA-256 matches producer summary`);
  const sourceProject = readJson(sourceProjectPath);
  assert.equal(sourceProject?.metadata?.id, reconciliation?.caseId, `${label} excavation ProjectState keeps case identity`);
  assert.equal(sourceProject?.metadata?.project_code, 'EXCAVATION-RELEASE', `${label} excavation ProjectState keeps project code`);
  assert.equal(sourceProject?.calculation_results, null, `${label} excavation ProjectState preserves inputs without cached results`);
  const expectedGroupCounts = {
    top_supports: 6,
    bottom_supports: 6,
    top_wales: 6,
    bottom_wales: 6,
    top_braces: 6,
    bottom_braces: 6,
    corner_braces: 8,
    columns: 3,
  };
  for (const [group, expected] of Object.entries(expectedGroupCounts)) {
    assert.equal(sourceProject?.[group]?.length, expected, `${label} excavation ProjectState keeps ${group}`);
  }
  assert.match(String(reconciliation?.resultSha256 || ''), /^[0-9a-f]{64}$/i, `${label} excavation result SHA-256`);
  assert.match(String(reconciliation?.calculationFingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} excavation calculation fingerprint`);
  assert.equal(
    reconciliation?.calculationFingerprint,
    `CF-${String(reconciliation?.resultSha256 || '').slice(0, 16).toUpperCase()}`,
    `${label} excavation fingerprint derives from replayed results`
  );
  assert.equal(reconciliation?.verifiedCheckCount, 47, `${label} excavation verifies all 47 component checks`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount >= 618, `${label} excavation verified result assertions`);
  assert.deepEqual(reconciliation?.verifiedGroupCounts, {
    support_checks: 12,
    wale_checks: 12,
    brace_checks: 12,
    corner_brace_checks: 8,
    column_checks: 3,
  }, `${label} excavation verifies every component family`);
  assert.equal(reconciliation?.pdfSha256, record?.artifactSha256, `${label} excavation PDF hash matches producer summary`);
  assert.equal(reconciliation?.docxSha256, record?.documentSha256, `${label} excavation DOCX hash matches producer summary`);
  for (const [format, visibleText] of Object.entries(renderedTexts || {})) {
    assert.ok(String(visibleText || '').includes(reconciliation.calculationFingerprint), `${label} excavation ${format} contains the replay calculation fingerprint`);
  }
  assert.equal(reconciliation?.pass, true, `${label} excavation result reconciliation passes`);
  return { caseId: reconciliation.caseId, ...reconciliation };
}

function uniqueIntegrityArtifacts(artifacts, label) {
  const unique = new Map();
  for (const artifact of artifacts) {
    const key = `${artifact.family || ''}\u0000${artifact.role || ''}\u0000${artifact.name || ''}`;
    const existing = unique.get(key);
    if (existing) {
      assert.equal(existing.bytes, artifact.bytes, `${label} duplicate artifact bytes agree: ${artifact.name}`);
      assert.equal(existing.sha256, artifact.sha256, `${label} duplicate artifact SHA-256 agrees: ${artifact.name}`);
      continue;
    }
    unique.set(key, artifact);
  }
  return [...unique.values()];
}

function buildHtmlIntegrityGroup(tool, artifacts) {
  const expected = Number(tool.htmlExpected);
  assert.ok(Number.isInteger(expected) && expected > 0, `${tool.title} declares a positive HTML attachment expectation`);
  assert.equal(artifacts.length, expected, `${tool.title} physical HTML attachment count`);
  const verified = artifacts.filter(artifact => /^[0-9a-f]{64}$/.test(artifact.sha256) && artifact.bytes > 0).length;
  return {
    href: tool.href,
    title: tool.title,
    family: tool.family,
    expected,
    actual: artifacts.length,
    verified,
    issueCount: Math.max(0, expected - verified),
    pass: artifacts.length === expected && verified === expected,
    setSha256: integritySetHash(artifacts),
    artifacts,
  };
}

function verifyRcVisualArtifactRecord(directory, record, label) {
  const entries = Array.isArray(record?.artifactIntegrity) ? record.artifactIntegrity : [];
  assert.equal(entries.length, 2, `${label} producer audit records PDF and PNG integrity`);
  const byRole = new Map(entries.map(entry => [entry.role, entry]));
  assert.equal(byRole.size, 2, `${label} producer audit uses unique visual artifact roles`);
  const pdfPath = record.pdfPath || record.artifact;
  const screenshotPath = record.screenshotPath || record.screenshot;
  assert.equal(byRole.get('reportPdf')?.name, path.basename(String(pdfPath || '')), `${label} PDF integrity names the audited PDF`);
  assert.equal(byRole.get('reportScreenshot')?.name, path.basename(String(screenshotPath || '')), `${label} PNG integrity names the audited screenshot`);
  return [
    verifyArtifactIntegrityEntry(directory, byRole.get('reportPdf'), `${label} PDF`),
    verifyArtifactIntegrityEntry(directory, byRole.get('reportScreenshot'), `${label} PNG`),
  ];
}

function validateFormalResultReconciliationRecord(record, label) {
  const reconciliation = record?.resultReconciliation;
  assert.equal(reconciliation?.schemaVersion, 1, `${label} result reconciliation schema`);
  assert.equal(reconciliation?.strategy, 'golden-state-to-report-fingerprint', `${label} result reconciliation strategy`);
  assert.match(String(reconciliation?.goldenCaseId || ''), /^[a-z0-9][a-z0-9-]+$/i, `${label} rendered golden case id`);
  assert.match(String(reconciliation?.goldenCaseSha256 || ''), /^[0-9a-f]{64}$/i, `${label} rendered golden case SHA-256`);
  assert.ok(Number.isInteger(reconciliation?.expectedGoldenCases) && reconciliation.expectedGoldenCases > 0, `${label} expected golden cases`);
  assert.equal(reconciliation?.verifiedGoldenCases, reconciliation?.expectedGoldenCases, `${label} verifies every golden case`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount > 0, `${label} verified result assertions`);
  assert.ok(Number.isInteger(reconciliation?.renderedCaseAssertionCount) && reconciliation.renderedCaseAssertionCount > 0, `${label} rendered case result assertions`);
  assert.ok(reconciliation.verifiedAssertionCount >= reconciliation.renderedCaseAssertionCount, `${label} assertion coverage includes rendered case`);
  assert.equal(reconciliation?.calculationFingerprint, record?.calculationFingerprint, `${label} report fingerprint matches reconciliation`);
  assert.equal(reconciliation?.pass, true, `${label} result reconciliation passes`);
  return { key: record.key, ...reconciliation };
}

function validateRcResultReconciliationRecord(record, label) {
  const reconciliation = record?.resultReconciliation;
  assert.equal(reconciliation?.schemaVersion, 1, `${label} RC result reconciliation schema`);
  assert.ok([
    'rc-project-replay-to-report-fingerprint',
    'rc-form-replay-to-report-fingerprint',
  ].includes(reconciliation?.strategy), `${label} RC result reconciliation strategy`);
  assert.equal(reconciliation?.caseId, record?.key, `${label} RC result reconciliation case identity`);
  assert.match(String(reconciliation?.sourceSnapshotSha256 || ''), /^[0-9a-f]{64}$/i, `${label} RC project snapshot SHA-256`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount > 0, `${label} RC verified result assertions`);
  assert.match(String(reconciliation?.calculationFingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} RC reconciliation calculation fingerprint`);
  assert.equal(reconciliation?.calculationFingerprint, record?.metrics?.calculationFingerprint, `${label} RC report fingerprint matches reconciliation`);
  assert.equal(reconciliation?.calculationFingerprint, record?.portableHtml?.calculationFingerprint, `${label} RC formal HTML fingerprint matches reconciliation`);
  assert.equal(reconciliation?.pass, true, `${label} RC result reconciliation passes`);
  const sourceReportPackage = record?.portableHtml?.sourceReportPackage || null;
  if (reconciliation?.strategy === 'rc-project-replay-to-report-fingerprint') {
    assert.equal(sourceReportPackage?.status, 'ready', `${label} RC real source JSON and formal HTML package is ready`);
    assert.equal(sourceReportPackage?.fingerprintLinkCount, 1, `${label} RC source/report package has exactly one traceability link`);
    assert.match(String(sourceReportPackage?.fingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} RC source/report package fingerprint`);
    assert.equal(sourceReportPackage?.fingerprint, reconciliation?.calculationFingerprint, `${label} RC source/report package fingerprint matches reconciliation`);
  }
  return {
    key: record.key,
    ...reconciliation,
    ...(sourceReportPackage ? { sourceReportPackage } : {}),
  };
}

function validateRcStandaloneFormalHtmlPrintRecord(portableHtml, label) {
  const standalonePrint = portableHtml?.standalonePrint;
  assert.equal(standalonePrint?.status, 'ready', `${label} standalone formal HTML print status`);
  assert.match(String(standalonePrint?.artifact || ''), /\.pdf$/i, `${label} standalone formal HTML print PDF artifact`);
  assert.ok(Number.isInteger(standalonePrint?.artifactBytes) && standalonePrint.artifactBytes > 1024, `${label} standalone formal HTML print PDF bytes`);
  assert.match(String(standalonePrint?.artifactSha256 || ''), /^[0-9a-f]{64}$/i, `${label} standalone formal HTML print PDF SHA-256`);
  assert.ok(Number.isInteger(standalonePrint?.pageCount) && standalonePrint.pageCount >= 1, `${label} standalone formal HTML print page count`);
  assert.ok(Number.isInteger(standalonePrint?.textLength) && standalonePrint.textLength >= 500, `${label} standalone formal HTML print text length`);
  assert.equal(standalonePrint?.calculationFingerprint, portableHtml?.calculationFingerprint, `${label} standalone formal HTML print fingerprint matches HTML`);
  assert.equal(standalonePrint?.externalRequestCount, 0, `${label} standalone formal HTML print is offline`);
  assert.equal(standalonePrint?.contentSealStatus, 'verified', `${label} standalone formal HTML verifies its content seal`);
  assert.equal(standalonePrint?.contentSealSha256, portableHtml?.contentSealSha256, `${label} standalone formal HTML seal matches producer`);
  assert.equal(standalonePrint?.tamperDetectionStatus, 'failed', `${label} changed standalone formal HTML is blocked visibly`);
  assert.equal(standalonePrint?.approvalSealStatus, 'verified', `${label} standalone formal HTML verifies its approval seal`);
  assert.equal(standalonePrint?.approvalSealSha256, portableHtml?.approvalSealSha256, `${label} standalone formal HTML approval seal matches producer`);
  assert.equal(standalonePrint?.approvalTamperDetectionStatus, 'failed', `${label} changed standalone approval record is blocked visibly`);
  return standalonePrint;
}

function verifyRcStandaloneFormalHtmlPrintArtifact(directory, portableHtml, label, options = {}) {
  const standalonePrint = validateRcStandaloneFormalHtmlPrintRecord(portableHtml, label);
  const integrity = verifyRecordedArtifact(directory, standalonePrint, {
    nameField: 'artifact',
    bytesField: 'artifactBytes',
    sha256Field: 'artifactSha256',
  }, `${label} standalone formal HTML print`);
  const pdf = validatePdfFile(path.join(directory, integrity.name), {
    label: `${label} standalone formal HTML print`,
    minTextLength: 500,
    contentBoundaryProfile: 'traceable-calculation-book',
    projectNeedle: '__skip_project_order__',
    requiredNeedles: [portableHtml.reportTitle, '文件狀態：正式附件', standalonePrint.calculationFingerprint],
    continuationContextLabels:options.continuationContextLabels || [],
    forbiddenNeedles: [],
  });
  assert.equal(pdf.pageCount, standalonePrint.pageCount, `${label} standalone formal HTML print page count matches producer`);
  return {
    ...standalonePrint,
    artifact: integrity.name,
    artifactBytes: integrity.bytes,
    artifactSha256: integrity.sha256,
  };
}

function verifyRcFormalHtmlContentSealArtifact(directory, portableHtml, label) {
  const htmlArtifact = String(portableHtml?.htmlArtifact || '');
  assert.equal(path.basename(htmlArtifact), htmlArtifact, `${label} sealed RC HTML uses a local artifact name`);
  const htmlPath = path.join(directory, htmlArtifact);
  assert.ok(fs.existsSync(htmlPath), `${label} sealed RC HTML artifact exists`);
  const seal = AttachmentPackageChecker.verifyRcHtmlContentSeal(fs.readFileSync(htmlPath, 'utf8'));
  assert.equal(seal.status, 'verified', `${label} RC HTML content seal verifies from the saved artifact`);
  assert.equal(seal.scope, AttachmentPackageChecker.RC_CONTENT_SEAL_SCOPE, `${label} RC HTML content seal scope`);
  assert.equal(portableHtml?.contentSealStatus, 'verified', `${label} producer records verified RC HTML content seal`);
  assert.equal(portableHtml?.contentSealScope, seal.scope, `${label} producer and aggregate RC HTML seal scope match`);
  assert.equal(portableHtml?.contentSealSha256, seal.actualSha256, `${label} producer and aggregate RC HTML content SHA-256 match`);
  return { htmlArtifact, scope: seal.scope, contentSha256: seal.actualSha256 };
}

function verifyRcFormalHtmlApprovalSealArtifact(directory, portableHtml, label) {
  const htmlArtifact = String(portableHtml?.htmlArtifact || '');
  assert.equal(path.basename(htmlArtifact), htmlArtifact, `${label} approval-sealed RC HTML uses a local artifact name`);
  const htmlPath = path.join(directory, htmlArtifact);
  assert.ok(fs.existsSync(htmlPath), `${label} approval-sealed RC HTML artifact exists`);
  const seal = AttachmentPackageChecker.verifyRcHtmlApprovalSeal(fs.readFileSync(htmlPath, 'utf8'));
  assert.equal(seal.status, 'verified', `${label} RC HTML approval seal verifies from the saved artifact`);
  assert.equal(seal.scope, AttachmentPackageChecker.RC_APPROVAL_SEAL_SCOPE, `${label} RC HTML approval seal scope`);
  assert.equal(portableHtml?.approvalSealStatus, 'verified', `${label} producer records verified RC HTML approval seal`);
  assert.equal(portableHtml?.approvalSealScope, seal.scope, `${label} producer and aggregate RC HTML approval seal scope match`);
  assert.equal(portableHtml?.approvalSealSha256, seal.actualSha256, `${label} producer and aggregate RC HTML approval SHA-256 match`);
  return { htmlArtifact, scope: seal.scope, approvalSha256: seal.actualSha256 };
}

function verifyFormalHtmlDualSealArtifact(directory, record, label) {
  const integrity = verifyRecordedArtifact(directory, record, {
    nameField: 'htmlArtifact',
    bytesField: 'htmlArtifactBytes',
    sha256Field: 'htmlArtifactSha256',
  }, `${label} approved formal HTML`);
  const html = fs.readFileSync(path.join(directory, integrity.name), 'utf8');
  const contentSeal = AttachmentPackageChecker.verifyFormalHtmlContentSeal(html);
  const approvalSeal = AttachmentPackageChecker.verifyFormalHtmlApprovalSeal(html);
  assert.equal(contentSeal.status, 'verified', `${label} formal HTML content seal verifies from the saved artifact`);
  assert.equal(contentSeal.scope, AttachmentPackageChecker.FORMAL_CONTENT_SEAL_SCOPE, `${label} formal HTML content seal scope`);
  assert.equal(record?.contentSealStatus, 'verified', `${label} producer records verified formal HTML content seal`);
  assert.equal(record?.contentSealScope, contentSeal.scope, `${label} producer and aggregate formal content seal scope match`);
  assert.equal(record?.contentSha256, contentSeal.actualSha256, `${label} producer and aggregate formal content SHA-256 match`);
  assert.equal(record?.contentTamperDetectionStatus, 'failed', `${label} producer proves calculation-body tamper detection`);
  assert.equal(approvalSeal.status, 'verified', `${label} formal HTML approval seal verifies from the saved artifact`);
  assert.equal(approvalSeal.scope, AttachmentPackageChecker.FORMAL_APPROVAL_SEAL_SCOPE, `${label} formal HTML approval seal scope`);
  assert.equal(record?.approvalSealStatus, 'verified', `${label} producer records verified formal HTML approval seal`);
  assert.equal(record?.approvalSealScope, approvalSeal.scope, `${label} producer and aggregate formal approval seal scope match`);
  assert.equal(record?.approvalSha256, approvalSeal.actualSha256, `${label} producer and aggregate formal approval SHA-256 match`);
  assert.equal(record?.approvalTamperDetectionStatus, 'failed', `${label} producer proves approval-metadata tamper detection`);
  assert.equal(record?.approvalTamperContentSealStatus, 'verified', `${label} approval-only tamper leaves the calculation-content seal intact`);
  return {
    key: record.key,
    htmlArtifact: integrity.name,
    htmlArtifactBytes: integrity.bytes,
    htmlArtifactSha256: integrity.sha256,
    contentSealScope: contentSeal.scope,
    contentSha256: contentSeal.actualSha256,
    approvalSealScope: approvalSeal.scope,
    approvalSha256: approvalSeal.actualSha256,
  };
}

function validateSteelResultReconciliationRecord(record, label) {
  const reconciliation = record?.resultReconciliation;
  assert.equal(reconciliation?.schemaVersion, 1, `${label} steel result reconciliation schema`);
  assert.equal(reconciliation?.strategy, 'steel-source-replay-to-report-fingerprint', `${label} steel result reconciliation strategy`);
  assert.equal(reconciliation?.caseId, record?.key, `${label} steel result reconciliation case identity`);
  assert.match(String(reconciliation?.sourcePayloadSha256 || ''), /^[0-9a-f]{64}$/i, `${label} steel source payload SHA-256`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount > 0, `${label} steel verified result assertions`);
  assert.match(String(reconciliation?.calculationFingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} steel reconciliation calculation fingerprint`);
  assert.equal(reconciliation?.calculationFingerprint, record?.calculationFingerprint, `${label} steel report fingerprint matches reconciliation`);
  assert.equal(reconciliation?.pass, true, `${label} steel result reconciliation passes`);
  return { key: record.key, ...reconciliation };
}

function validateLocalQuickResultReconciliationRecord(record, directory, label) {
  const reconciliation = record?.resultReconciliation;
  assert.equal(reconciliation?.schemaVersion, 1, `${label} local quick result reconciliation schema`);
  assert.equal(reconciliation?.strategy, 'local-quick-json-replay-to-pdf-hash', `${label} local quick result reconciliation strategy`);
  assert.equal(reconciliation?.caseId, record?.key, `${label} local quick result reconciliation case identity`);
  const sourceJsonName = String(reconciliation?.sourceJson || '');
  assert.equal(path.basename(sourceJsonName), sourceJsonName, `${label} local quick source JSON uses a local artifact name`);
  const sourceJsonPath = path.join(directory, sourceJsonName);
  assert.ok(fs.existsSync(sourceJsonPath), `${label} local quick replay source JSON exists`);
  assert.equal(reconciliation?.sourceJsonSha256, sha256File(sourceJsonPath), `${label} local quick source JSON SHA-256`);
  const sourceJson = readJson(sourceJsonPath);
  assert.equal(sourceJson?.tool?.id, record?.key, `${label} local quick source JSON tool identity`);
  assert.ok(sourceJson?.input && typeof sourceJson.input === 'object', `${label} local quick source JSON keeps inputs`);
  assert.ok(sourceJson?.result && typeof sourceJson.result === 'object', `${label} local quick source JSON keeps results`);
  assert.equal(reconciliation?.sourceInputSha256, sha256Json(sourceJson.input), `${label} local quick source input SHA-256`);
  assert.equal(reconciliation?.sourceInputSha256, reconciliation?.replayInputSha256, `${label} local quick replay input matches source`);
  assert.equal(reconciliation?.sourceResultSha256, sha256Json(sourceJson.result), `${label} local quick source result SHA-256`);
  assert.equal(reconciliation?.sourceResultSha256, reconciliation?.replayResultSha256, `${label} local quick replay result matches source`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount >= 20, `${label} local quick verified result assertions`);
  assert.match(String(reconciliation?.calculationFingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} local quick calculation fingerprint`);
  assert.equal(reconciliation?.calculationFingerprint, record?.calculationFingerprint, `${label} local quick report fingerprint matches reconciliation`);
  assert.equal(reconciliation?.pdfSha256, record?.artifactSha256, `${label} local quick PDF hash matches producer summary`);
  const evidencePath = path.join(directory, String(record?.evidence || ''));
  assert.ok(fs.existsSync(evidencePath), `${label} local quick rendered evidence exists`);
  const renderedText = readJson(evidencePath)?.pdf?.visibleText?.text || '';
  assert.ok(renderedText.includes(reconciliation.calculationFingerprint), `${label} local quick PDF contains replay calculation fingerprint`);
  assert.equal(reconciliation?.pass, true, `${label} local quick result reconciliation passes`);
  return { key: record.key, ...reconciliation };
}

function validateStoneResultReconciliationRecord(record, audit, label) {
  const reconciliation = record?.resultReconciliation;
  const stripPrefix = value => String(value || '').replace(/^sha256:/i, '');
  const goldenCasePath = path.join(repoRoot, '石材固定', 'tests', 'golden', 'case_01_standard_safe.json');
  const goldenInputPath = path.join(repoRoot, '石材固定', 'tests', 'golden', 'inputs', 'case_01_standard_safe.json');
  assert.equal(reconciliation?.schemaVersion, 1, `${label} stone result reconciliation schema`);
  assert.equal(reconciliation?.strategy, 'stone-golden-replay-to-pdf-docx-hash', `${label} stone result reconciliation strategy`);
  assert.equal(reconciliation?.caseId, 'case_01_standard_safe', `${label} stone golden case identity`);
  assert.equal(reconciliation?.goldenCaseSha256, sha256File(goldenCasePath), `${label} stone golden case SHA-256`);
  assert.equal(reconciliation?.goldenInputSha256, sha256File(goldenInputPath), `${label} stone golden input SHA-256`);
  for (const [field, value] of Object.entries({
    sourcePayloadSha256: reconciliation?.sourcePayloadSha256,
    inputHash: reconciliation?.inputHash,
    resultHash: reconciliation?.resultHash,
    calcSourceHash: reconciliation?.calcSourceHash,
    pdfSha256: reconciliation?.pdfSha256,
    docxSha256: reconciliation?.docxSha256,
    auditSha256: reconciliation?.auditSha256,
  })) {
    assert.match(stripPrefix(value), /^[0-9a-f]{64}$/i, `${label} stone ${field}`);
  }
  assert.equal(stripPrefix(reconciliation?.sourcePayloadSha256), stripPrefix(audit?.trace?.payload_sha256), `${label} stone source payload matches export audit`);
  assert.equal(stripPrefix(reconciliation?.inputHash), stripPrefix(audit?.trace?.input_hash), `${label} stone input hash matches export audit`);
  assert.equal(stripPrefix(reconciliation?.resultHash), stripPrefix(audit?.trace?.result_hash), `${label} stone result hash matches export audit`);
  assert.equal(stripPrefix(reconciliation?.calcSourceHash), stripPrefix(audit?.trace?.calc_source_hash), `${label} stone calculator source hash matches export audit`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount >= 6, `${label} stone verified result assertions`);
  assert.equal(reconciliation?.pdfSha256, record?.artifactSha256, `${label} stone PDF hash matches producer summary`);
  assert.equal(reconciliation?.docxSha256, record?.documentSha256, `${label} stone DOCX hash matches producer summary`);
  assert.equal(reconciliation?.auditSha256, record?.evidenceSha256, `${label} stone audit hash matches producer summary`);
  assert.equal(reconciliation?.pass, true, `${label} stone result reconciliation passes`);
  return { key: record.key, ...reconciliation };
}

function validateAnchorResultReconciliationRecord(record, directory, renderedTexts, label) {
  const reconciliation = record?.resultReconciliation;
  assert.equal(reconciliation?.schemaVersion, 1, `${label} anchor result reconciliation schema`);
  assert.equal(reconciliation?.strategy, 'anchor-workspace-replay-to-html-docx-xlsx-hash', `${label} anchor result reconciliation strategy`);
  assert.match(String(reconciliation?.caseId || ''), /^[a-z0-9][a-z0-9_-]+$/i, `${label} anchor replay case identity`);
  for (const [field, value] of Object.entries({
    sourceBackupSha256: reconciliation?.sourceBackupSha256,
    sourceReplayFingerprint: reconciliation?.sourceReplayFingerprint,
    htmlSha256: reconciliation?.htmlSha256,
    docxSha256: reconciliation?.docxSha256,
    workbookSha256: reconciliation?.workbookSha256,
  })) {
    assert.match(String(value || ''), /^[0-9a-f]{64}$/i, `${label} anchor ${field}`);
  }
  assert.match(String(reconciliation?.calculationFingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} anchor calculation fingerprint`);
  assert.equal(reconciliation?.calculationFingerprint, `CF-${String(reconciliation?.sourceReplayFingerprint || '').slice(0, 16).toUpperCase()}`, `${label} anchor report fingerprint derives from source replay`);
  assert.equal(reconciliation?.verifiedProjectCount, 1, `${label} anchor verifies one source project`);
  assert.ok(Number.isInteger(reconciliation?.verifiedAssertionCount) && reconciliation.verifiedAssertionCount >= 7, `${label} anchor verified result assertions`);
  assert.ok(record?.sourceBackup, `${label} anchor preserves the replay source backup`);
  const sourceBackupPath = path.join(directory, record.sourceBackup);
  assert.ok(fs.existsSync(sourceBackupPath), `${label} anchor source backup exists`);
  assert.equal(fs.statSync(sourceBackupPath).size, record.sourceBackupBytes, `${label} anchor source backup bytes match producer summary`);
  assert.equal(sha256File(sourceBackupPath), record.sourceBackupArtifactSha256, `${label} anchor source backup artifact SHA-256 matches producer summary`);
  assert.equal(reconciliation?.sourceBackupSha256, record.sourceBackupArtifactSha256, `${label} anchor replay source hash matches preserved backup`);
  const sourceBackup = readJson(sourceBackupPath);
  assert.equal(sourceBackup.schema, 'bolt-review-tool-backup', `${label} anchor source backup schema`);
  assert.equal(sourceBackup.version, 2, `${label} anchor source backup version`);
  assert.equal(sourceBackup.projects?.length, 1, `${label} anchor source backup project count`);
  assert.equal(sourceBackup.caseReplay?.length, 1, `${label} anchor source backup replay count`);
  assert.equal(sourceBackup.projects[0]?.id, reconciliation?.caseId, `${label} anchor source project identity matches reconciliation`);
  assert.equal(sourceBackup.caseReplay[0]?.projectId, reconciliation?.caseId, `${label} anchor replay project identity matches reconciliation`);
  assert.equal(sourceBackup.caseReplay[0]?.selectedProductId, sourceBackup.projects[0]?.selectedProductId, `${label} anchor replay product identity matches source project`);
  assert.equal(sourceBackup.caseReplay[0]?.fingerprint, reconciliation?.sourceReplayFingerprint, `${label} anchor source replay fingerprint matches preserved backup`);
  assert.equal(reconciliation?.htmlSha256, record?.artifactSha256, `${label} anchor HTML hash matches producer summary`);
  assert.equal(reconciliation?.docxSha256, record?.documentSha256, `${label} anchor DOCX hash matches producer summary`);
  assert.equal(reconciliation?.workbookSha256, record?.workbookSha256, `${label} anchor XLSX hash matches producer summary`);
  for (const [format, visibleText] of Object.entries(renderedTexts || {})) {
    assert.ok(String(visibleText || '').includes(reconciliation.calculationFingerprint), `${label} anchor ${format} contains the replay calculation fingerprint`);
  }
  assert.equal(reconciliation?.pass, true, `${label} anchor result reconciliation passes`);
  return { key: record.key, ...reconciliation };
}

function validateFamilySummary(runDir, family, expectedKeys) {
  const summaryPath = path.join(runDir, 'rendered-delivery-evidence', family, 'rendered-delivery-evidence-summary.json');
  assert.ok(fs.existsSync(summaryPath), `${family} current-run rendered summary exists`);
  const summary = readJson(summaryPath);
  assert.equal(summary.pass, true, `${family} rendered summary passes`);
  const complete = new Set(summary.complete || summary.records?.map(record => record.key) || []);
  const canonicalArtifacts = [];
  const formalResultReconciliations = [];
  const formalHtmlDualSeals = [];
  const steelHtmlDualSeals = [];
  const localQuickResultReconciliations = [];
  const steelResultReconciliations = [];
  for (const key of expectedKeys) {
    assert.ok(complete.has(key), `${family} rendered summary covers ${key}`);
  }
  for (const record of summary.records || []) {
    const artifactPath = record.artifact ? path.join(path.dirname(summaryPath), record.artifact) : '';
    const evidencePath = record.evidence ? path.join(path.dirname(summaryPath), record.evidence) : '';
    const htmlArtifactPath = record.htmlArtifact ? path.join(path.dirname(summaryPath), record.htmlArtifact) : '';
    if (artifactPath) {
      assert.ok(fs.existsSync(artifactPath), `${family} artifact exists: ${record.artifact}`);
      assert.equal(fs.readFileSync(artifactPath).subarray(0, 4).toString('ascii'), '%PDF', `${family} artifact is PDF: ${record.artifact}`);
    }
    if (artifactPath && evidencePath && ['formal-tools', 'local-quick-tools', 'steel-formal', 'src-formal'].includes(family)) {
      const verified = verifyCanonicalRenderedArtifact(path.dirname(summaryPath), record, `${family} ${record.key || record.artifact}`);
      canonicalArtifacts.push(
        { family, role: 'reportPdf', name: record.artifact, bytes: verified.artifactBytes, sha256: verified.artifactSha256 },
        { family, role: 'renderEvidence', name: record.evidence, bytes: verified.evidenceBytes, sha256: verified.evidenceSha256 },
      );
    }
    if (family === 'formal-tools' && record.evidenceRole === 'approved-formal-attachment') {
      formalResultReconciliations.push(validateFormalResultReconciliationRecord(record, `${family} ${record.key}`));
      formalHtmlDualSeals.push(verifyFormalHtmlDualSealArtifact(path.dirname(summaryPath), record, `${family} ${record.key}`));
    }
    if (family === 'local-quick-tools' && expectedKeys.includes(record.key)) {
      localQuickResultReconciliations.push(validateLocalQuickResultReconciliationRecord(
        record,
        path.dirname(summaryPath),
        `${family} ${record.key}`
      ));
    }
    if (family === 'steel-formal') {
      steelResultReconciliations.push(validateSteelResultReconciliationRecord(record, `${family} ${record.key}`));
      if (record.evidenceRole === 'approved-formal-attachment') {
        steelHtmlDualSeals.push(verifyFormalHtmlDualSealArtifact(path.dirname(summaryPath), record, `${family} ${record.key}`));
      }
    }
    if (htmlArtifactPath) {
      validateHtmlArtifactRecord(path.dirname(summaryPath), {
        htmlArtifact: record.htmlArtifact,
        calculationFingerprint: record.portableHtml?.calculationFingerprint || '',
      }, family);
    }
    if (evidencePath) assert.ok(fs.existsSync(evidencePath), `${family} evidence JSON exists: ${record.evidence}`);
  }
  return { summary, canonicalArtifacts, formalResultReconciliations, formalHtmlDualSeals, steelHtmlDualSeals, localQuickResultReconciliations, steelResultReconciliations };
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

function verifyCleanDocxPackage(entries, key, label) {
  const result = inspectDocxPackage(entries, { label });
  assert.equal(
    result.pass,
    true,
    `${label} has a clean OOXML package: ${result.issues.map(item => `${item.code}:${item.part}`).join(', ')}`
  );
  docxPackageIntegrityRecords.push({
    key,
    pass: result.pass,
    issueCount: result.issueCount,
    partCount: result.partCount,
    relationshipCount: result.relationshipCount,
    mediaCount: result.mediaCount,
    referencedMediaCount: result.referencedMediaCount,
    headerCount: result.headerCount,
    referencedHeaderCount: result.referencedHeaderCount,
    footerCount: result.footerCount,
    referencedFooterCount: result.referencedFooterCount,
  });
  return result;
}

function verifyCleanXlsxPackage(entries, key, label) {
  const result = inspectXlsxPackage(entries, { label });
  assert.equal(
    result.pass,
    true,
    `${label} has a clean OOXML package: ${result.issues.map(item => `${item.code}:${item.part}`).join(', ')}`
  );
  xlsxPackageIntegrityRecords.push({
    key,
    pass: result.pass,
    issueCount: result.issueCount,
    partCount: result.partCount,
    relationshipCount: result.relationshipCount,
    sheetCount: result.sheetCount,
    visibleSheetCount: result.visibleSheetCount,
    formulaCount: result.formulaCount,
    cachedFormulaCount: result.cachedFormulaCount,
    mediaCount: result.mediaCount,
    referencedMediaCount: result.referencedMediaCount,
  });
  return result;
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

assert.equal(inventory.version, 2, 'rendered delivery inventory version');
assert.equal(inventory.tools.length, 36, 'rendered delivery inventory covers all homepage formal tools');
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
const rcHtmlInventory = inventory.tools.filter(tool => ['rc-formal', 'rc-retrofit'].includes(tool.family));
assert.equal(rcHtmlInventory.length, 8, 'rendered delivery inventory maps all eight RC HTML attachment families');
assert.equal(rcHtmlInventory.reduce((sum, tool) => sum + tool.htmlExpected, 0), 34, 'rendered delivery inventory declares 34 expected RC HTML attachments');
assert.equal(inventory.rcSupplementalAttachments?.length, 3, 'rendered delivery inventory declares three RC STM dedicated formal-entry attachments');
assert.equal(new Set(inventory.rcSupplementalAttachments.map(item => item.key)).size, 3, 'RC STM dedicated formal-entry attachment identities are unique');
for (const item of inventory.rcSupplementalAttachments) {
  assert.ok(formalRoutes.includes(item.href), `${item.title} has a homepage formal route`);
  assert.ok(item.evidenceFile.endsWith('-formal-evidence.json'), `${item.title} declares a formal evidence manifest`);
  assert.ok(fs.existsSync(path.join(repoRoot, item.sourcePage)), `${item.title} source page exists`);
  assert.ok(item.reportTitle.includes('計算書') && item.requiredNeedles.length >= 3 && item.continuationContextLabels.length >= 1, `${item.title} declares rendered report content requirements`);
}

const canonicalIntegrityFixtureDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'canonical-render-integrity-'));
try {
  const artifactName = 'fixture.pdf';
  const evidenceName = 'fixture.evidence.json';
  const originalArtifact = Buffer.from('%PDF-1.7\noriginal canonical fixture\n%%EOF\n', 'utf8');
  fs.writeFileSync(path.join(canonicalIntegrityFixtureDir, artifactName), originalArtifact);
  fs.writeFileSync(path.join(canonicalIntegrityFixtureDir, evidenceName), `${JSON.stringify({
    kind: 'attachment-canonical-render-evidence.v1',
    artifact: artifactName,
    artifactSha256: createHash('sha256').update(originalArtifact).digest('hex'),
  }, null, 2)}\n`, 'utf8');
  const fixtureSummary = writeEvidenceSummary(canonicalIntegrityFixtureDir, 'fixture-family', [{
    key: 'fixture-report',
    artifact: artifactName,
    evidence: evidenceName,
  }], ['fixture-report']);
  const fixtureRecord = fixtureSummary.payload.records[0];
  assert.match(fixtureRecord.artifactSha256, /^[0-9a-f]{64}$/i, 'family summary records canonical artifact hash');
  assert.match(fixtureRecord.evidenceSha256, /^[0-9a-f]{64}$/i, 'family summary records canonical evidence hash');
  assert.equal(fixtureRecord.artifactBytes, originalArtifact.length, 'family summary records canonical artifact bytes');
  assert.equal(fixtureRecord.evidenceBytes, fs.statSync(path.join(canonicalIntegrityFixtureDir, evidenceName)).size, 'family summary records canonical evidence bytes');
  verifyCanonicalRenderedArtifact(canonicalIntegrityFixtureDir, fixtureRecord, 'canonical fixture');
  const tamperedArtifact = Buffer.from(originalArtifact);
  tamperedArtifact[tamperedArtifact.indexOf('original')] = 'X'.charCodeAt(0);
  assert.equal(tamperedArtifact.length, originalArtifact.length, 'negative fixture preserves artifact byte length');
  fs.writeFileSync(path.join(canonicalIntegrityFixtureDir, artifactName), tamperedArtifact);
  assert.throws(
    () => verifyCanonicalRenderedArtifact(canonicalIntegrityFixtureDir, fixtureRecord, 'tampered canonical fixture'),
    /artifact SHA-256 matches its original render evidence/,
    'same-size canonical PDF replacement is blocked by original evidence hash'
  );
  fs.writeFileSync(path.join(canonicalIntegrityFixtureDir, artifactName), originalArtifact);
  const originalEvidence = fs.readFileSync(path.join(canonicalIntegrityFixtureDir, evidenceName));
  const tamperedEvidence = Buffer.from(originalEvidence);
  tamperedEvidence[tamperedEvidence.indexOf('\n')] = ' '.charCodeAt(0);
  assert.equal(tamperedEvidence.length, originalEvidence.length, 'negative canonical evidence fixture preserves byte length');
  fs.writeFileSync(path.join(canonicalIntegrityFixtureDir, evidenceName), tamperedEvidence);
  assert.throws(
    () => verifyCanonicalRenderedArtifact(canonicalIntegrityFixtureDir, fixtureRecord, 'tampered canonical evidence fixture'),
    /family summary records evidence SHA-256/,
    'same-size canonical evidence replacement is blocked by family summary hash'
  );
} finally {
  fs.rmSync(canonicalIntegrityFixtureDir, { recursive: true, force: true });
}

const mixedIntegrityFixtureDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mixed-artifact-integrity-'));
try {
  const documentName = 'fixture.docx';
  const originalDocument = Buffer.from('PK\u0003\u0004original mixed artifact fixture', 'utf8');
  const fixtureRecord = {
    document: documentName,
    documentBytes: originalDocument.length,
    documentSha256: createHash('sha256').update(originalDocument).digest('hex'),
  };
  fs.writeFileSync(path.join(mixedIntegrityFixtureDir, documentName), originalDocument);
  verifyRecordedArtifact(mixedIntegrityFixtureDir, fixtureRecord, { nameField: 'document' }, 'mixed artifact fixture');
  const tamperedDocument = Buffer.from(originalDocument);
  tamperedDocument[tamperedDocument.indexOf('original')] = 'X'.charCodeAt(0);
  assert.equal(tamperedDocument.length, originalDocument.length, 'negative mixed artifact fixture preserves byte length');
  fs.writeFileSync(path.join(mixedIntegrityFixtureDir, documentName), tamperedDocument);
  assert.throws(
    () => verifyRecordedArtifact(mixedIntegrityFixtureDir, fixtureRecord, { nameField: 'document' }, 'tampered mixed artifact fixture'),
    /artifact SHA-256 matches its producer summary/,
    'same-size Office artifact replacement is blocked by producer summary hash'
  );
} finally {
  fs.rmSync(mixedIntegrityFixtureDir, { recursive: true, force: true });
}

const visualIntegrityFixtureDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'visual-artifact-integrity-'));
try {
  const screenshotPath = path.join(visualIntegrityFixtureDir, 'fixture.png');
  const originalScreenshot = Buffer.from('\x89PNG\r\n\x1a\noriginal visual fixture', 'binary');
  fs.writeFileSync(screenshotPath, originalScreenshot);
  const integrity = captureArtifactIntegrity(screenshotPath, 'reportScreenshot');
  verifyArtifactIntegrityEntry(visualIntegrityFixtureDir, integrity, 'visual artifact fixture');
  const tamperedScreenshot = Buffer.from(originalScreenshot);
  tamperedScreenshot[tamperedScreenshot.indexOf('original')] = 'X'.charCodeAt(0);
  assert.equal(tamperedScreenshot.length, originalScreenshot.length, 'negative visual artifact fixture preserves byte length');
  fs.writeFileSync(screenshotPath, tamperedScreenshot);
  assert.throws(
    () => verifyArtifactIntegrityEntry(visualIntegrityFixtureDir, integrity, 'tampered visual artifact fixture'),
    /artifact SHA-256 matches its producer summary/,
    'same-size RC visual artifact replacement is blocked by producer audit hash'
  );
} finally {
  fs.rmSync(visualIntegrityFixtureDir, { recursive: true, force: true });
}

const formalResultReconciliationFixture = {
  key: 'fixture-formal-report',
  calculationFingerprint: 'CF-1234567890ABCDEF',
  resultReconciliation: {
    schemaVersion: 1,
    strategy: 'golden-state-to-report-fingerprint',
    goldenCaseId: 'fixture-case',
    goldenCaseSha256: 'a'.repeat(64),
    expectedGoldenCases: 2,
    verifiedGoldenCases: 2,
    verifiedAssertionCount: 8,
    renderedCaseAssertionCount: 4,
    calculationFingerprint: 'CF-1234567890ABCDEF',
    pass: true,
  },
};
validateFormalResultReconciliationRecord(formalResultReconciliationFixture, 'formal result reconciliation fixture');
assert.throws(
  () => validateFormalResultReconciliationRecord({
    ...formalResultReconciliationFixture,
    resultReconciliation: {
      ...formalResultReconciliationFixture.resultReconciliation,
      calculationFingerprint: 'CF-FEDCBA0987654321',
    },
  }, 'tampered formal result reconciliation fixture'),
  /report fingerprint matches reconciliation/,
  'formal result reconciliation blocks a report fingerprint detached from the verified golden state'
);

const rcResultReconciliationFixture = {
  key: 'fixture-rc-case',
  metrics: { calculationFingerprint: 'CF-1234567890ABCDEF' },
  portableHtml: {
    calculationFingerprint: 'CF-1234567890ABCDEF',
    contentSealStatus: 'verified',
    contentSealScope: 'rc-calculation-book-content-v1',
    contentSealSha256: 'd'.repeat(64),
    approvalSealStatus: 'verified',
    approvalSealScope: 'rc-calculation-book-approval-v2',
    approvalSealSha256: 'e'.repeat(64),
    sourceReportPackage: {
      status: 'ready',
      fingerprintLinkCount: 1,
      fingerprint: 'CF-1234567890ABCDEF',
    },
    standalonePrint: {
      status: 'ready',
      artifact: 'fixture-formal-html-print.pdf',
      artifactBytes: 4096,
      artifactSha256: 'c'.repeat(64),
      pageCount: 2,
      textLength: 1200,
      calculationFingerprint: 'CF-1234567890ABCDEF',
      externalRequestCount: 0,
      contentSealStatus: 'verified',
      contentSealSha256: 'd'.repeat(64),
      tamperDetectionStatus: 'failed',
      approvalSealStatus: 'verified',
      approvalSealSha256: 'e'.repeat(64),
      approvalTamperDetectionStatus: 'failed',
    },
  },
  resultReconciliation: {
    schemaVersion: 1,
    strategy: 'rc-project-replay-to-report-fingerprint',
    caseId: 'fixture-rc-case',
    sourceSnapshotSha256: 'b'.repeat(64),
    verifiedAssertionCount: 6,
    calculationFingerprint: 'CF-1234567890ABCDEF',
    pass: true,
  },
};
validateRcResultReconciliationRecord(rcResultReconciliationFixture, 'RC result reconciliation fixture');
assert.throws(
  () => validateRcResultReconciliationRecord({
    ...rcResultReconciliationFixture,
    portableHtml: { ...rcResultReconciliationFixture.portableHtml, calculationFingerprint: 'CF-FEDCBA0987654321' },
  }, 'tampered RC result reconciliation fixture'),
  /RC formal HTML fingerprint matches reconciliation/,
  'RC result reconciliation blocks a formal HTML fingerprint detached from the recalculated project snapshot'
);
assert.throws(
  () => validateRcResultReconciliationRecord({
    ...rcResultReconciliationFixture,
    portableHtml: {
      ...rcResultReconciliationFixture.portableHtml,
      sourceReportPackage: { ...rcResultReconciliationFixture.portableHtml.sourceReportPackage, status: 'blocked' },
    },
  }, 'blocked RC source/report package fixture'),
  /RC real source JSON and formal HTML package is ready/,
  'RC result reconciliation blocks a producer record whose real source/report package did not pass'
);
assert.throws(
  () => validateRcResultReconciliationRecord({
    ...rcResultReconciliationFixture,
    portableHtml: {
      ...rcResultReconciliationFixture.portableHtml,
      sourceReportPackage: {
        ...rcResultReconciliationFixture.portableHtml.sourceReportPackage,
        fingerprint: 'CF-FEDCBA0987654321',
      },
    },
  }, 'mismatched RC source/report package fixture'),
  /RC source\/report package fingerprint matches reconciliation/,
  'RC result reconciliation blocks a package whose source/report link is detached from the recalculated result'
);
assert.doesNotThrow(
  () => validateRcStandaloneFormalHtmlPrintRecord(rcResultReconciliationFixture.portableHtml, 'valid RC standalone formal HTML print fixture'),
  'RC standalone formal HTML print accepts complete offline producer evidence'
);
assert.throws(
  () => validateRcStandaloneFormalHtmlPrintRecord({
    ...rcResultReconciliationFixture.portableHtml,
    standalonePrint: { ...rcResultReconciliationFixture.portableHtml.standalonePrint, status: 'blocked' },
  }, 'blocked RC standalone formal HTML print fixture'),
  /standalone formal HTML print status/,
  'RC standalone formal HTML print blocks a producer record that did not render successfully'
);
assert.throws(
  () => validateRcStandaloneFormalHtmlPrintRecord({
    ...rcResultReconciliationFixture.portableHtml,
    standalonePrint: {
      ...rcResultReconciliationFixture.portableHtml.standalonePrint,
      calculationFingerprint: 'CF-FEDCBA0987654321',
    },
  }, 'mismatched RC standalone formal HTML print fixture'),
  /standalone formal HTML print fingerprint matches HTML/,
  'RC standalone formal HTML print blocks a PDF detached from the approved HTML fingerprint'
);
assert.throws(
  () => validateRcStandaloneFormalHtmlPrintRecord({
    ...rcResultReconciliationFixture.portableHtml,
    standalonePrint: { ...rcResultReconciliationFixture.portableHtml.standalonePrint, externalRequestCount: 1 },
  }, 'network-dependent RC standalone formal HTML print fixture'),
  /standalone formal HTML print is offline/,
  'RC standalone formal HTML print blocks a saved attachment that requires an external request'
);
assert.throws(
  () => validateRcStandaloneFormalHtmlPrintRecord({
    ...rcResultReconciliationFixture.portableHtml,
    standalonePrint: { ...rcResultReconciliationFixture.portableHtml.standalonePrint, tamperDetectionStatus: 'verified' },
  }, 'tamper-undetected RC standalone formal HTML print fixture'),
  /changed standalone formal HTML is blocked visibly/,
  'RC standalone formal HTML print blocks producer evidence that did not prove tamper detection'
);
assert.throws(
  () => validateRcStandaloneFormalHtmlPrintRecord({
    ...rcResultReconciliationFixture.portableHtml,
    standalonePrint: { ...rcResultReconciliationFixture.portableHtml.standalonePrint, approvalTamperDetectionStatus: 'verified' },
  }, 'approval-tamper-undetected RC standalone formal HTML print fixture'),
  /changed standalone approval record is blocked visibly/,
  'RC standalone formal HTML print blocks producer evidence that did not prove approval tamper detection'
);

const steelResultReconciliationFixture = {
  key: 'fixture-steel-case',
  calculationFingerprint: 'CF-1234567890ABCDEF',
  resultReconciliation: {
    schemaVersion: 1,
    strategy: 'steel-source-replay-to-report-fingerprint',
    caseId: 'fixture-steel-case',
    sourcePayloadSha256: 'c'.repeat(64),
    verifiedAssertionCount: 8,
    calculationFingerprint: 'CF-1234567890ABCDEF',
    pass: true,
  },
};
validateSteelResultReconciliationRecord(steelResultReconciliationFixture, 'steel result reconciliation fixture');
assert.throws(
  () => validateSteelResultReconciliationRecord({
    ...steelResultReconciliationFixture,
    calculationFingerprint: 'CF-FEDCBA0987654321',
  }, 'tampered steel result reconciliation fixture'),
  /steel report fingerprint matches reconciliation/,
  'steel result reconciliation blocks a rendered report fingerprint detached from the replayed source payload'
);

const stoneFixturePayloadSha = 'd'.repeat(64);
const stoneFixtureInputHash = 'e'.repeat(64);
const stoneFixtureResultHash = `sha256:${'f'.repeat(64)}`;
const stoneFixtureCalcHash = `sha256:${'1'.repeat(64)}`;
const stoneResultReconciliationFixture = {
  key: 'stone-fixing',
  artifactSha256: '2'.repeat(64),
  documentSha256: '3'.repeat(64),
  evidenceSha256: '4'.repeat(64),
  resultReconciliation: {
    schemaVersion: 1,
    strategy: 'stone-golden-replay-to-pdf-docx-hash',
    caseId: 'case_01_standard_safe',
    goldenCaseSha256: sha256File(path.join(repoRoot, '石材固定', 'tests', 'golden', 'case_01_standard_safe.json')),
    goldenInputSha256: sha256File(path.join(repoRoot, '石材固定', 'tests', 'golden', 'inputs', 'case_01_standard_safe.json')),
    sourcePayloadSha256: stoneFixturePayloadSha,
    inputHash: stoneFixtureInputHash,
    resultHash: stoneFixtureResultHash,
    calcSourceHash: stoneFixtureCalcHash,
    verifiedAssertionCount: 6,
    pdfSha256: '2'.repeat(64),
    docxSha256: '3'.repeat(64),
    auditSha256: '4'.repeat(64),
    pass: true,
  },
};
const stoneResultReconciliationAuditFixture = {
  trace: {
    payload_sha256: stoneFixturePayloadSha,
    input_hash: stoneFixtureInputHash,
    result_hash: stoneFixtureResultHash,
    calc_source_hash: stoneFixtureCalcHash,
  },
};
validateStoneResultReconciliationRecord(stoneResultReconciliationFixture, stoneResultReconciliationAuditFixture, 'stone result reconciliation fixture');
assert.throws(
  () => validateStoneResultReconciliationRecord({
    ...stoneResultReconciliationFixture,
    artifactSha256: '5'.repeat(64),
  }, stoneResultReconciliationAuditFixture, 'tampered stone result reconciliation fixture'),
  /stone PDF hash matches producer summary/,
  'stone result reconciliation blocks a PDF detached from the golden replay and audit chain'
);

const anchorResultFixtureDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'anchor-result-reconciliation-'));
try {
  const replayFingerprint = '6'.repeat(64);
  const calculationFingerprint = `CF-${replayFingerprint.slice(0, 16).toUpperCase()}`;
  const sourceBackupName = 'anchor-source-backup.json';
  const sourceBackupPayload = {
    schema: 'bolt-review-tool-backup',
    version: 2,
    products: [{ id: 'fixture-product' }],
    projects: [{ id: 'fixture-anchor-case', selectedProductId: 'fixture-product' }],
    caseReplay: [{ projectId: 'fixture-anchor-case', selectedProductId: 'fixture-product', fingerprint: replayFingerprint }],
  };
  const sourceBackupText = JSON.stringify(sourceBackupPayload);
  fs.writeFileSync(path.join(anchorResultFixtureDir, sourceBackupName), sourceBackupText, 'utf8');
  const sourceBackupSha256 = createHash('sha256').update(sourceBackupText, 'utf8').digest('hex');
  const anchorResultReconciliationFixture = {
    key: 'anchor-review',
    artifactSha256: '7'.repeat(64),
    documentSha256: '8'.repeat(64),
    workbookSha256: '9'.repeat(64),
    sourceBackup: sourceBackupName,
    sourceBackupBytes: Buffer.byteLength(sourceBackupText, 'utf8'),
    sourceBackupArtifactSha256: sourceBackupSha256,
    resultReconciliation: {
      schemaVersion: 1,
      strategy: 'anchor-workspace-replay-to-html-docx-xlsx-hash',
      caseId: 'fixture-anchor-case',
      sourceBackupSha256,
      sourceReplayFingerprint: replayFingerprint,
      calculationFingerprint,
      verifiedProjectCount: 1,
      verifiedAssertionCount: 7,
      htmlSha256: '7'.repeat(64),
      docxSha256: '8'.repeat(64),
      workbookSha256: '9'.repeat(64),
      pass: true,
    },
  };
  const renderedTexts = { HTML: calculationFingerprint, DOCX: calculationFingerprint, XLSX: calculationFingerprint };
  validateAnchorResultReconciliationRecord(anchorResultReconciliationFixture, anchorResultFixtureDir, renderedTexts, 'anchor result reconciliation fixture');
  assert.throws(
    () => validateAnchorResultReconciliationRecord({
      ...anchorResultReconciliationFixture,
      workbookSha256: 'a'.repeat(64),
    }, anchorResultFixtureDir, renderedTexts, 'tampered anchor result reconciliation fixture'),
    /anchor XLSX hash matches producer summary/,
    'anchor result reconciliation blocks a workbook detached from the replayed source backup'
  );
} finally {
  fs.rmSync(anchorResultFixtureDir, { recursive: true, force: true });
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
const canonicalArtifactRecords = [];
const formalResultReconciliationRecords = [];
const formalHtmlDualSealRecords = [];
const steelHtmlDualSealRecords = [];
const anchorHtmlDualSealRecords = [];
const localQuickResultReconciliationRecords = [];
const rcResultReconciliationRecords = [];
const rcStandaloneFormalHtmlPrintRecords = [];
const rcFormalHtmlContentSealRecords = [];
const rcFormalHtmlApprovalSealRecords = [];
const rcStmFormalAttachmentRecords = [];
const steelResultReconciliationRecords = [];
const stoneResultReconciliationRecords = [];
const anchorResultReconciliationRecords = [];
const deckingResultReconciliationRecords = [];
const excavationResultReconciliationRecords = [];
const docxPackageIntegrityRecords = [];
const xlsxPackageIntegrityRecords = [];

for (const family of ['formal-tools', 'local-quick-tools', 'steel-formal', 'src-formal']) {
  const tools = inventory.tools.filter(tool => tool.family === family);
  const expectedKeys = [...new Set(tools.map(tool => tool.evidenceKey))];
  const { summary, canonicalArtifacts, formalResultReconciliations, formalHtmlDualSeals, steelHtmlDualSeals, localQuickResultReconciliations, steelResultReconciliations } = validateFamilySummary(runDir, family, expectedKeys);
  canonicalArtifactRecords.push(...canonicalArtifacts);
  formalResultReconciliationRecords.push(...formalResultReconciliations);
  formalHtmlDualSealRecords.push(...formalHtmlDualSeals);
  steelHtmlDualSealRecords.push(...steelHtmlDualSeals);
  localQuickResultReconciliationRecords.push(...localQuickResultReconciliations);
  steelResultReconciliationRecords.push(...steelResultReconciliations);
  for (const tool of tools) {
    const evidence = summary.records.find(record => record.key === tool.evidenceKey);
    let pdfEvidence = {};
    if (family === 'src-formal') {
      const familyDir = path.join(runDir, 'rendered-delivery-evidence', family);
      const artifactPath = path.join(familyDir, evidence.artifact);
      const isColumn = tool.evidenceKey === 'src-column';
      const pdf = validatePdfFile(artifactPath, isColumn ? {
        label: tool.title,
        minTextLength: 1200,
        titleNeedle: 'SRC 柱 X／Y 雙向耐震核算計算書',
        requiredNeedles: ['SRC 柱 X／Y 雙向耐震核算計算書', '雙向核算索引', 'X 向計算指紋', 'Y 向計算指紋', '計算過程明細', '檢核結論', '計算指紋'],
        contentBoundaryProfile: 'traceable-calculation-book',
        continuationContextLabels: [
          '雙向核算索引',
          'X 向｜規範、構材與分析條件',
          'Y 向｜規範、構材與分析條件',
          'X 向｜構材斷面與軸彎互制',
          'Y 向｜構材斷面與軸彎互制',
          'X 向｜計算過程明細',
          'Y 向｜計算過程明細',
          '檢核結論',
        ],
      } : {
        label: tool.title,
        minTextLength: 500,
        titleNeedle: 'SRC 梁正式規範核算計算書',
        requiredNeedles: ['SRC 梁正式規範核算計算書', '規範與構材條件', '計算過程明細', '檢核結論', '計算指紋'],
        contentBoundaryProfile: 'traceable-calculation-book',
        continuationContextLabels: [
          '規範與構材條件',
          '採用斷面與材料',
          '設計需求',
          '計算線圖與示意圖',
          '寬厚比與撓曲強度',
          '剪力分擔強度',
          '計算過程明細',
          'RC 撓曲內力平衡',
          'SRC 撓曲強度疊加',
          '鋼骨與 RC 剪力容量',
          '剪力需求分擔',
          '檢核結果',
          '檢核結論',
        ],
      });
      const rawEvidence = readJson(path.join(familyDir, evidence.evidence));
      const sourcePath = path.join(familyDir, rawEvidence.sourceArtifact || '');
      assert.ok(fs.existsSync(sourcePath), 'SRC formal source case JSON exists');
      assert.equal(sha256File(sourcePath), rawEvidence.sourceSha256, 'SRC formal source case JSON hash matches evidence');
      assert.match(rawEvidence.calculationFingerprint || '', /^CF-[A-F0-9]{16}$/, 'SRC formal calculation fingerprint is recorded');
      assert.equal(rawEvidence.documentState, 'formal-attachment', 'SRC formal rendered evidence records approved attachment state');
      pdfEvidence = { pageCount: pdf.pageCount, textLength: pdf.textLength, sourceArtifact: rawEvidence.sourceArtifact, calculationFingerprint: rawEvidence.calculationFingerprint };
    }
    records.push({ href: tool.href, title: tool.title, family, evidenceKey: tool.evidenceKey, artifact: evidence?.artifact || '', ...pdfEvidence });
  }
}

const rcDir = path.join(runDir, 'rendered-delivery-evidence', 'rc-formal');
for (const tool of inventory.tools.filter(item => item.family === 'rc-formal')) {
  const artifact = newestMatchingPdf(rcDir, tool.evidenceKey);
  const pdf = validatePdfFile(artifact.path, {
    label: tool.title,
    minTextLength: 500,
    contentBoundaryProfile: 'traceable-calculation-book',
    forbiddenNeedles: [],
  });
  const auditPath = path.join(rcDir, `${tool.evidenceKey}visual-audit.json`);
  assert.ok(fs.existsSync(auditPath), `${tool.title} report audit exists`);
  const auditPayload = readJson(auditPath);
  const auditRecords = Array.isArray(auditPayload) ? auditPayload : auditPayload.results;
  assert.ok(Array.isArray(auditRecords) && auditRecords.length > 0, `${tool.title} report audit has records`);
  const rcReconciliations = auditRecords.map(record => validateRcResultReconciliationRecord(record, `${tool.title} ${record.key || ''}`));
  rcResultReconciliationRecords.push(...rcReconciliations.map(reconciliation => ({ href: tool.href, ...reconciliation })));
  const portableRecords = auditRecords.map(record => record.portableHtml).filter(Boolean);
  assert.equal(portableRecords.length, auditRecords.length, `${tool.title} every report audit record has portable HTML evidence`);
  const standalonePrintArtifacts = auditRecords.map(record => ({
    href: tool.href,
    key: record.key,
    ...verifyRcStandaloneFormalHtmlPrintArtifact(rcDir, record.portableHtml, `${tool.title} ${record.key || ''}`),
  }));
  rcStandaloneFormalHtmlPrintRecords.push(...standalonePrintArtifacts);
  const contentSealArtifacts = auditRecords.map(record => ({
    href: tool.href,
    key: record.key,
    ...verifyRcFormalHtmlContentSealArtifact(rcDir, record.portableHtml, `${tool.title} ${record.key || ''}`),
  }));
  rcFormalHtmlContentSealRecords.push(...contentSealArtifacts);
  const approvalSealArtifacts = auditRecords.map(record => ({
    href: tool.href,
    key: record.key,
    ...verifyRcFormalHtmlApprovalSealArtifact(rcDir, record.portableHtml, `${tool.title} ${record.key || ''}`),
  }));
  rcFormalHtmlApprovalSealRecords.push(...approvalSealArtifacts);
  const htmlIntegrity = portableRecords.map(record => validateHtmlArtifactRecord(rcDir, record, tool.title, { requireRecordedIntegrity: true }));
  const htmlArtifacts = htmlIntegrity.map(item => item.name);
  const integrity = buildHtmlIntegrityGroup(tool, htmlIntegrity);
  const visualArtifactIntegrity = auditRecords.flatMap(record => verifyRcVisualArtifactRecord(rcDir, record, `${tool.title} ${record.key || ''}`));
  assert.equal(visualArtifactIntegrity.length, Number(tool.htmlExpected) * 2, `${tool.title} verifies PDF and PNG for every visual case`);
  assert.ok(visualArtifactIntegrity.some(item => item.name === artifact.name && item.role === 'reportPdf'), `${tool.title} selected PDF is bound to its producer audit`);
  records.push({ href: tool.href, title: tool.title, family: tool.family, evidenceKey: tool.evidenceKey, artifact: artifact.name, htmlArtifacts, standalonePrintArtifacts: standalonePrintArtifacts.map(item => item.artifact), contentSealArtifacts: contentSealArtifacts.map(item => item.htmlArtifact), htmlIntegrity, integrity, visualArtifactIntegrity, pageCount: pdf.pageCount, textLength: pdf.textLength });
}

const { summary: retrofitSummary } = validateFamilySummary(runDir, 'rc-retrofit', ['rc-retrofit-section']);
const retrofitTool = inventory.tools.find(tool => tool.family === 'rc-retrofit');
const retrofitEvidence = retrofitSummary.records.find(record => record.key === retrofitTool.evidenceKey);
const retrofitReconciliations = retrofitSummary.records.map(record => validateRcResultReconciliationRecord(record, `${retrofitTool.title} ${record.key || ''}`));
rcResultReconciliationRecords.push(...retrofitReconciliations.map(reconciliation => ({ href: retrofitTool.href, ...reconciliation })));
const retrofitEvidenceDir = path.join(runDir, 'rendered-delivery-evidence', 'rc-retrofit');
const retrofitStandalonePrintArtifacts = retrofitSummary.records.map(record => ({
  href: retrofitTool.href,
  key: record.key,
  ...verifyRcStandaloneFormalHtmlPrintArtifact(retrofitEvidenceDir, record.portableHtml, `${retrofitTool.title} ${record.key || ''}`),
}));
rcStandaloneFormalHtmlPrintRecords.push(...retrofitStandalonePrintArtifacts);
const retrofitContentSealArtifacts = retrofitSummary.records.map(record => ({
  href: retrofitTool.href,
  key: record.key,
  ...verifyRcFormalHtmlContentSealArtifact(retrofitEvidenceDir, record.portableHtml, `${retrofitTool.title} ${record.key || ''}`),
}));
rcFormalHtmlContentSealRecords.push(...retrofitContentSealArtifacts);
const retrofitApprovalSealArtifacts = retrofitSummary.records.map(record => ({
  href: retrofitTool.href,
  key: record.key,
  ...verifyRcFormalHtmlApprovalSealArtifact(retrofitEvidenceDir, record.portableHtml, `${retrofitTool.title} ${record.key || ''}`),
}));
rcFormalHtmlApprovalSealRecords.push(...retrofitApprovalSealArtifacts);
const retrofitHtmlIntegrity = retrofitSummary.records
  .filter(record => record.htmlArtifact)
  .map(record => validateHtmlArtifactRecord(retrofitEvidenceDir, {
    htmlArtifact: record.htmlArtifact,
    htmlArtifactBytes: record.portableHtml?.htmlArtifactBytes,
    htmlArtifactSha256: record.portableHtml?.htmlArtifactSha256,
    calculationFingerprint: record.portableHtml?.calculationFingerprint || '',
  }, retrofitTool.title, { requireRecordedIntegrity: true }));
const retrofitIntegrity = buildHtmlIntegrityGroup(retrofitTool, retrofitHtmlIntegrity);
const retrofitVisualArtifactIntegrity = verifyRcVisualArtifactRecord(retrofitEvidenceDir, retrofitEvidence, retrofitTool.title);
records.push({
  href: retrofitTool.href,
  title: retrofitTool.title,
  family: retrofitTool.family,
  evidenceKey: retrofitTool.evidenceKey,
  artifact: retrofitEvidence.artifact,
  htmlArtifacts: retrofitHtmlIntegrity.map(item => item.name),
  standalonePrintArtifacts: retrofitStandalonePrintArtifacts.map(item => item.artifact),
  contentSealArtifacts: retrofitContentSealArtifacts.map(item => item.htmlArtifact),
  htmlIntegrity: retrofitHtmlIntegrity,
  integrity: retrofitIntegrity,
  visualArtifactIntegrity: retrofitVisualArtifactIntegrity,
});

const rcStmDir = path.join(runDir, 'rendered-delivery-evidence', 'rc-stm-formal');
assert.ok(fs.existsSync(rcStmDir), 'release rendered evidence contains the RC STM supplemental attachment directory');
for (const item of inventory.rcSupplementalAttachments) {
  const evidencePath = path.join(rcStmDir, item.evidenceFile);
  assert.ok(fs.existsSync(evidencePath), `${item.title} formal evidence manifest exists`);
  const evidence = readJson(evidencePath);
  const label = `${item.title} formal entry attachment`;
  assert.equal(evidence?.schemaVersion, 1, `${label} evidence schema`);
  assert.equal(evidence?.key, item.key, `${label} evidence identity`);
  assert.equal(evidence?.href, item.href, `${label} homepage route`);
  assert.equal(evidence?.title, item.title, `${label} title`);
  assert.equal(evidence?.sourcePage, item.sourcePage, `${label} source page`);
  assert.match(String(evidence?.metrics?.calculationFingerprint || ''), /^CF-[0-9A-F]{16}$/i, `${label} calculation fingerprint`);
  assert.equal(evidence?.portableHtml?.calculationFingerprint, evidence.metrics.calculationFingerprint, `${label} internal and approved reports share one calculation fingerprint`);

  const visualArtifactIntegrity = verifyRcVisualArtifactRecord(rcStmDir, evidence, label);
  const pdfPath = path.join(rcStmDir, String(evidence.pdfPath || ''));
  const pdf = validatePdfFile(pdfPath, {
    label,
    minTextLength: 1200,
    titleNeedle: item.reportTitle,
    requiredNeedles: [...item.requiredNeedles, '文件狀態：內部審閱', evidence.metrics.calculationFingerprint],
    continuationContextLabels:item.continuationContextLabels,
    contentBoundaryProfile: 'traceable-calculation-book',
    forbiddenNeedles: [],
  });
  assert.equal(pdf.pageCount, evidence.metrics.pages, `${label} PDF page count matches producer evidence`);
  assert.ok(Number.isInteger(evidence.metrics.textLength) && evidence.metrics.textLength >= 1200, `${label} producer records substantial extracted PDF text`);

  const htmlIntegrity = validateHtmlArtifactRecord(rcStmDir, evidence.portableHtml, label, { requireRecordedIntegrity:true });
  const standalonePrint = verifyRcStandaloneFormalHtmlPrintArtifact(rcStmDir, evidence.portableHtml, label, {
    continuationContextLabels:item.continuationContextLabels,
  });
  const contentSeal = verifyRcFormalHtmlContentSealArtifact(rcStmDir, evidence.portableHtml, label);
  const approvalSeal = verifyRcFormalHtmlApprovalSealArtifact(rcStmDir, evidence.portableHtml, label);
  rcStmFormalAttachmentRecords.push({
    key:item.key,
    href:item.href,
    title:item.title,
    sourcePage:item.sourcePage,
    calculationFingerprint:evidence.metrics.calculationFingerprint,
    htmlIntegrity,
    standalonePrint,
    contentSeal,
    approvalSeal,
    visualArtifactIntegrity,
  });
  const stmTool = inventory.tools.find(tool => tool.family === 'rc-stm-formal' && tool.evidenceKey === item.key);
  assert.ok(stmTool, `${label} maps to the homepage rendered-delivery inventory`);
  records.push({
    href:stmTool.href,
    title:stmTool.title,
    family:stmTool.family,
    evidenceKey:stmTool.evidenceKey,
    artifact:standalonePrint.artifact,
    htmlArtifacts:[htmlIntegrity.name],
    standalonePrintArtifacts:[standalonePrint.artifact],
    contentSealArtifacts:[contentSeal.htmlArtifact],
    htmlIntegrity:[htmlIntegrity],
    visualArtifactIntegrity,
    pageCount:pdf.pageCount,
    textLength:pdf.textLength,
  });
}

const { summary: stoneSummary } = validateFamilySummary(runDir, 'stone-formal', ['stone-fixing']);
const stoneTool = inventory.tools.find(tool => tool.family === 'stone-formal');
const stoneEvidence = stoneSummary.records.find(record => record.key === stoneTool.evidenceKey);
const stoneEvidenceDir = path.join(runDir, 'rendered-delivery-evidence', 'stone-formal');
const stonePdfPath = path.join(stoneEvidenceDir, stoneEvidence.artifact);
const stoneDocxPath = path.join(stoneEvidenceDir, stoneEvidence.document || '');
const stoneAuditPath = path.join(stoneEvidenceDir, stoneEvidence.evidence || '');
const stonePdf = validatePdfFile(stonePdfPath, {
  label: stoneTool.title,
  contentBoundaryProfile: 'compiled-engineering-report',
  minTextLength: 8000,
  requiredNeedles: ['結 構 計 算 書', '石材外牆固定構件', 'Stone Golden Replay Formal Artifact', '送審速覽', '設計者註記'],
  titleNeedle: '結 構 計 算 書',
  projectNeedle: 'Stone Golden Replay Formal Artifact',
  continuationContextLabels: [
    '目 錄',
    'Stone Golden Replay Formal Artifact送審速覽',
    'Stone Golden Replay Formal Artifact簽章頁',
    'Stone Golden Replay Formal Artifact主文（一）',
    'Stone Golden Replay Formal Artifact主文（二）',
    'Stone Golden Replay Formal Artifact 附件 2 BASELINE_CASE_01',
    'Stone Golden Replay Formal Artifact 附件 2 BASELINE_CASE_01（續）',
    '附圖 B – 工法實拍照片',
  ],
});
assert.ok(fs.existsSync(stoneDocxPath), 'stone current-run rendered evidence includes DOCX');
assert.equal(fs.readFileSync(stoneDocxPath).subarray(0, 2).toString('ascii'), 'PK', 'stone report artifact has DOCX ZIP signature');
const stoneDocxEntries = readZipEntries(stoneDocxPath, 'stone DOCX');
verifyCleanDocxPackage(stoneDocxEntries, 'stone-fixing', 'stone DOCX');
assert.ok(fs.existsSync(stoneAuditPath), 'stone current-run rendered evidence includes audit JSON');
const stoneAudit = readJson(stoneAuditPath);
assert.equal(stoneAudit.mode, 'auto_word', 'stone rendered evidence audit records the formal export path');
assert.equal(stoneAudit.output.size_bytes, fs.statSync(stoneDocxPath).size, 'stone rendered evidence audit matches the preserved DOCX');
stoneResultReconciliationRecords.push(validateStoneResultReconciliationRecord(stoneEvidence, stoneAudit, stoneTool.title));
const stoneArtifactIntegrity = [
  verifyRecordedArtifact(stoneEvidenceDir, stoneEvidence, { nameField: 'artifact' }, 'stone PDF'),
  verifyRecordedArtifact(stoneEvidenceDir, stoneEvidence, { nameField: 'document' }, 'stone DOCX'),
  verifyRecordedArtifact(stoneEvidenceDir, stoneEvidence, { nameField: 'evidence' }, 'stone audit JSON'),
];
records.push({
  href: stoneTool.href,
  title: stoneTool.title,
  family: stoneTool.family,
  evidenceKey: stoneTool.evidenceKey,
  artifact: stoneEvidence.artifact,
  document: stoneEvidence.document,
  evidence: stoneEvidence.evidence,
  artifactIntegrity: stoneArtifactIntegrity,
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
const anchorReviewHtmlPath = path.join(anchorEvidenceDir, anchorEvidence.reviewArtifact || '');
const anchorBlockedHtmlPath = path.join(anchorEvidenceDir, anchorEvidence.blockedArtifact || '');
const anchorArtifactIntegrity = [
  verifyRecordedArtifact(anchorEvidenceDir, anchorEvidence, { nameField: 'artifact' }, 'anchor formal HTML'),
  verifyRecordedArtifact(anchorEvidenceDir, anchorEvidence, { nameField: 'document' }, 'anchor DOCX'),
  verifyRecordedArtifact(anchorEvidenceDir, anchorEvidence, { nameField: 'workbook' }, 'anchor XLSX'),
  verifyRecordedArtifact(anchorEvidenceDir, anchorEvidence, { nameField: 'reviewArtifact' }, 'anchor review HTML'),
  verifyRecordedArtifact(anchorEvidenceDir, anchorEvidence, { nameField: 'blockedArtifact' }, 'anchor blocked HTML'),
];
for (const [filePath, label] of [
  [anchorHtmlPath, 'HTML'],
  [anchorDocxPath, 'DOCX'],
  [anchorWorkbookPath, 'XLSX'],
]) {
  assert.ok(fs.existsSync(filePath) && fs.statSync(filePath).size > 1024, `anchor current-run ${label} artifact exists and is non-empty`);
}
for (const [filePath, label] of [
  [anchorReviewHtmlPath, 'review HTML'],
  [anchorBlockedHtmlPath, 'blocked HTML'],
]) {
  assert.ok(fs.existsSync(filePath) && fs.statSync(filePath).size > 1024, `anchor current-run ${label} artifact exists and is non-empty`);
}

const anchorHtml = fs.readFileSync(anchorHtmlPath, 'utf8');
const anchorHtmlText = decodeHtmlText(anchorHtml);
const anchorHtmlSealVerification = AnchorHtmlSealVerifier.verifyAnchorReportHtmlSeals(anchorHtml);
const anchorContentTamperVerification = AnchorHtmlSealVerifier.verifyAnchorReportHtmlSeals(
  anchorHtml.replace('載重組合批次檢核', '載重組合批次檢核（遭修改）')
);
const anchorApprovalTamperVerification = AnchorHtmlSealVerifier.verifyAnchorReportHtmlSeals(
  anchorHtml.replace(
    /(<[^>]+class=["'][^"']*\banchor-approval-seal-source\b[^"']*["'][^>]*\bdata-approved-at=["'])[^"']*(["'])/i,
    (_match, prefix, suffix) => `${prefix}2026-07-20T10:01:00.000Z${suffix}`
  )
);
const anchorReviewHtml = fs.readFileSync(anchorReviewHtmlPath, 'utf8');
const anchorReviewHtmlText = decodeHtmlText(anchorReviewHtml);
const anchorBlockedHtml = fs.readFileSync(anchorBlockedHtmlPath, 'utf8');
const anchorBlockedHtmlText = decodeHtmlText(anchorBlockedHtml);
assert.ok(anchorHtmlText.length > 3000, 'anchor HTML artifact contains substantial visible text');
for (const needle of ['錨栓檢討報告', '柱腳基板示例', '載重組合批次檢核', '文件追溯與版本', '產出工具', '工具版本', '輸出時間', '計算指紋']) {
  assert.ok(anchorHtmlText.includes(needle), `anchor HTML artifact contains ${needle}`);
}
assert.ok(anchorHtml.includes('data-document-state="formal-attachment"'), 'anchor HTML artifact records formal attachment state');
assert.ok(anchorHtmlText.includes('文件狀態：正式附件'), 'anchor HTML artifact identifies the approved attachment');
assert.equal(anchorHtmlSealVerification.content.status, 'verified', 'anchor HTML content seal verifies from the saved artifact');
assert.equal(anchorHtmlSealVerification.content.scope, AnchorHtmlSealVerifier.ANCHOR_CONTENT_SEAL_SCOPE, 'anchor HTML content seal scope');
assert.equal(anchorEvidence.contentSealStatus, 'verified', 'anchor producer records verified HTML content seal');
assert.equal(anchorEvidence.contentSealScope, anchorHtmlSealVerification.content.scope, 'anchor producer and aggregate content seal scopes match');
assert.equal(anchorEvidence.contentSha256, anchorHtmlSealVerification.content.actualSha256, 'anchor producer and aggregate content SHA-256 match');
assert.equal(anchorEvidence.contentTamperDetectionStatus, 'failed', 'anchor producer proves calculation-body tamper detection');
assert.equal(anchorContentTamperVerification.content.status, 'failed', 'anchor aggregate independently detects calculation-body tamper');
assert.equal(anchorHtmlSealVerification.approval.status, 'verified', 'anchor HTML approval seal verifies from the saved artifact');
assert.equal(anchorHtmlSealVerification.approval.scope, AnchorHtmlSealVerifier.ANCHOR_APPROVAL_SEAL_SCOPE, 'anchor HTML approval seal scope');
assert.equal(anchorEvidence.approvalSealStatus, 'verified', 'anchor producer records verified HTML approval seal');
assert.equal(anchorEvidence.approvalSealScope, anchorHtmlSealVerification.approval.scope, 'anchor producer and aggregate approval seal scopes match');
assert.equal(anchorEvidence.approvalSha256, anchorHtmlSealVerification.approval.actualSha256, 'anchor producer and aggregate approval SHA-256 match');
assert.equal(anchorEvidence.approvalTamperDetectionStatus, 'failed', 'anchor producer proves approval-record tamper detection');
assert.equal(anchorEvidence.approvalTamperContentStatus, 'verified', 'anchor producer keeps content seal valid for approval-only tamper');
assert.equal(anchorApprovalTamperVerification.approval.status, 'failed', 'anchor aggregate independently detects approval-record tamper');
assert.equal(anchorApprovalTamperVerification.content.status, 'verified', 'anchor aggregate keeps content seal valid for approval-only tamper');
anchorHtmlDualSealRecords.push({
  key: anchorEvidence.key,
  htmlArtifact: anchorEvidence.artifact,
  htmlArtifactSha256: anchorEvidence.artifactSha256,
  contentSealScope: anchorHtmlSealVerification.content.scope,
  contentSha256: anchorHtmlSealVerification.content.actualSha256,
  approvalSealScope: anchorHtmlSealVerification.approval.scope,
  approvalSha256: anchorHtmlSealVerification.approval.actualSha256,
});
assert.ok(anchorHtmlText.includes('王設計') && anchorHtmlText.includes('李複核'), 'anchor HTML artifact includes designer and checker');
assertCalculationContentProfile(anchorHtmlText, 'traceable-calculation-book', 'anchor HTML artifact');
assertCalculationContentProfile(anchorReviewHtmlText, 'traceable-calculation-book', 'anchor review HTML artifact');
assertCalculationContentProfile(anchorBlockedHtmlText, 'traceable-calculation-book', 'anchor blocked HTML artifact');

assert.equal(fs.readFileSync(anchorDocxPath).subarray(0, 2).toString('ascii'), 'PK', 'anchor report artifact has DOCX ZIP signature');
const anchorDocxEntries = readZipEntries(anchorDocxPath, 'anchor DOCX');
assert.ok(anchorDocxEntries.has('word/document.xml'), 'anchor DOCX contains word/document.xml');
verifyCleanDocxPackage(anchorDocxEntries, 'anchor-review', 'anchor DOCX');
const anchorDocxTextEntries = [...anchorDocxEntries.entries()]
  .filter(([name]) => name === 'word/document.xml' || /^word\/footer\d+\.xml$/.test(name));
assert.ok(
  anchorDocxTextEntries.some(([name]) => /^word\/footer\d+\.xml$/.test(name)),
  'anchor DOCX contains the attachment identity footer'
);
const anchorDocxText = anchorDocxTextEntries
  .map(([, value]) => decodeXmlText(value.toString('utf8')))
  .join('\n');
assert.ok(anchorDocxText.length > 3000, 'anchor DOCX artifact contains substantial visible text');
for (const needle of ['鋼筋混凝土錨栓檢討報告', '柱腳基板示例', '載重組合批次檢核', '逐項檢核明細', '文件追溯與版本', '產出工具', '工具版本', '輸出時間', '計算指紋']) {
  assert.ok(anchorDocxText.includes(needle), `anchor DOCX artifact contains ${needle}`);
}
assert.ok(anchorDocxText.includes('文件狀態：正式附件'), 'anchor DOCX artifact identifies the approved attachment');
assert.ok(/設計人員\s*王設計/.test(anchorDocxText) && /複核人員\s*李複核/.test(anchorDocxText), 'anchor DOCX artifact includes designer and checker');
assertCalculationContentProfile(anchorDocxText, 'traceable-calculation-book', 'anchor DOCX artifact');

const anchorForbiddenNeedles = [...DEFAULT_FORBIDDEN,
  '本工具計算結果僅供工程判讀、方案比較與報表整理輔助',
  '使用邊界 / 簽證責任',
];

assert.equal(fs.readFileSync(anchorWorkbookPath).subarray(0, 2).toString('ascii'), 'PK', 'anchor report artifact has XLSX ZIP signature');
const anchorWorkbookEntries = readZipEntries(anchorWorkbookPath, 'anchor XLSX');
assert.ok(anchorWorkbookEntries.has('xl/workbook.xml'), 'anchor XLSX contains xl/workbook.xml');
const anchorXlsxPackageIntegrity = verifyCleanXlsxPackage(anchorWorkbookEntries, 'anchor-review', 'anchor XLSX');
const anchorXlsxDualSealVerification = AnchorXlsxSealVerifier.verifyAnchorXlsxSeals(anchorWorkbookEntries);
assert.equal(anchorXlsxDualSealVerification.content.status, 'verified', 'anchor XLSX content seal verifies from actual OOXML');
assert.equal(anchorXlsxDualSealVerification.approval.status, 'verified', 'anchor XLSX approval seal verifies from actual OOXML');
const anchorXlsxSharedStringsEntry = 'xl/sharedStrings.xml';
assert.ok(anchorWorkbookEntries.has(anchorXlsxSharedStringsEntry), 'anchor XLSX dual seal evidence has shared strings');
const anchorXlsxContentTamperedEntries = new Map(anchorWorkbookEntries);
const anchorXlsxSharedStrings = anchorWorkbookEntries.get(anchorXlsxSharedStringsEntry).toString('utf8');
assert.ok(anchorXlsxSharedStrings.includes('鋼材拉力強度'), 'anchor XLSX content tamper target exists');
anchorXlsxContentTamperedEntries.set(
  anchorXlsxSharedStringsEntry,
  Buffer.from(anchorXlsxSharedStrings.replace('鋼材拉力強度', '鋼材拉力強度（遭修改）')),
);
const anchorXlsxContentTamperVerification = AnchorXlsxSealVerifier.verifyAnchorXlsxSeals(anchorXlsxContentTamperedEntries);
assert.equal(anchorXlsxContentTamperVerification.content.status, 'failed', 'anchor XLSX content seal detects changed calculation content');
assert.equal(anchorXlsxContentTamperVerification.approval.status, 'verified', 'anchor XLSX content tamper does not forge approval metadata');
const anchorXlsxApprovalTamperedEntries = new Map(anchorWorkbookEntries);
assert.ok(anchorXlsxSharedStrings.includes('正式附件'), 'anchor XLSX approval tamper target exists');
anchorXlsxApprovalTamperedEntries.set(
  anchorXlsxSharedStringsEntry,
  Buffer.from(anchorXlsxSharedStrings.replace('正式附件', '正式附件（遭修改）')),
);
const anchorXlsxApprovalTamperVerification = AnchorXlsxSealVerifier.verifyAnchorXlsxSeals(anchorXlsxApprovalTamperedEntries);
assert.equal(anchorXlsxApprovalTamperVerification.content.status, 'verified', 'anchor XLSX approval metadata is excluded from the content seal');
assert.equal(anchorXlsxApprovalTamperVerification.approval.status, 'failed', 'anchor XLSX approval seal detects changed approval metadata');
assert.equal(anchorXlsxPackageIntegrity.sheetCount, 9, 'anchor XLSX clean-package gate covers all 9 report sheets');
assert.equal(anchorXlsxPackageIntegrity.visibleSheetCount, anchorXlsxPackageIntegrity.sheetCount, 'anchor XLSX clean-package gate keeps every report sheet visible');
assert.ok(anchorXlsxPackageIntegrity.formulaCount > 0, 'anchor XLSX clean-package gate covers formula-backed recalculation cells');
assert.equal(anchorXlsxPackageIntegrity.cachedFormulaCount, anchorXlsxPackageIntegrity.formulaCount, 'anchor XLSX formula-backed cells all include cached results');
const anchorXlsxPrintVisual = runXlsxPrintVisualAudit({
  key: 'anchor-review',
  label: 'anchor XLSX',
  workbookPath: anchorWorkbookPath,
  outputDir: path.join(anchorEvidenceDir, 'xlsx-print-visual'),
  forbiddenNeedles: anchorForbiddenNeedles,
  expectedSheets: [
    { name: 'Summary', minTextLength: 300, requiredNeedles: ['項目', '案例名稱', '文件狀態', '正式附件'], repeatHeaderNeedle: '項目' },
    { name: 'LoadCases', minTextLength: 80, requiredNeedles: ['組合', '控制組合', '控制DCR'], repeatHeaderNeedle: '組合' },
    { name: 'Results', minTextLength: 800, requiredNeedles: ['組合', '檢核模式', '條文', 'DCR重算'], repeatHeaderNeedle: '組合' },
    { name: 'Dimensions', minTextLength: 250, requiredNeedles: ['組合', '項目', '需求值', '實際值'], repeatHeaderNeedle: '組合' },
    { name: 'Factors', minTextLength: 500, requiredNeedles: ['組合', '檢核模式', '符號', '標籤'], repeatHeaderNeedle: '組合' },
    { name: 'Candidates', minTextLength: 70, requiredNeedles: ['產品', '族群', '控制DCR'], repeatHeaderNeedle: '產品' },
    { name: 'Layouts', minTextLength: 90, requiredNeedles: ['配置', '錨栓數', '控制DCR'], repeatHeaderNeedle: '配置' },
    { name: 'Evidence', minTextLength: 20, requiredNeedles: ['欄位', '目前值', '已核對'], repeatHeaderNeedle: '欄位' },
    { name: 'AuditTrail', minTextLength: 80, requiredNeedles: ['時間', '來源', 'Hash', '控制DCR'], repeatHeaderNeedle: '時間' },
  ],
});
assert.equal(anchorXlsxPrintVisual.sheetCount, 9, 'anchor XLSX Office print visual gate covers all 9 sheets');
assert.equal(anchorXlsxPrintVisual.sheetComplete, anchorXlsxPrintVisual.sheetCount, 'anchor XLSX Office print visual gate validates every sheet');
assert.equal(anchorXlsxPrintVisual.verticalPageBreakCount, 0, 'anchor XLSX Office print visual gate has no horizontal overflow pages');
const anchorWorkbookXml = anchorWorkbookEntries.get('xl/workbook.xml').toString('utf8');
for (const sheet of ['Summary', 'LoadCases', 'Results', 'Dimensions', 'Factors', 'Candidates', 'Evidence', 'Layouts', 'AuditTrail']) {
  assert.ok(anchorWorkbookXml.includes(`name="${sheet}"`), `anchor XLSX contains ${sheet} sheet`);
}
const anchorWorkbookText = [...anchorWorkbookEntries.entries()]
  .filter(([name]) => name === 'xl/sharedStrings.xml' || name.startsWith('xl/worksheets/'))
  .map(([, value]) => decodeXmlText(value.toString('utf8')))
  .join('\n');
assert.ok(anchorWorkbookText.length > 2000, 'anchor XLSX artifact contains substantial worksheet text');
for (const needle of ['柱腳基板示例', '案例名稱', '控制模式', '產出工具', '工具版本', '輸出時間', '計算指紋']) {
  assert.ok(anchorWorkbookText.includes(needle), `anchor XLSX artifact contains ${needle}`);
}
assert.ok(anchorWorkbookText.includes('文件狀態'), 'anchor XLSX artifact includes document status');
assert.ok(anchorWorkbookText.includes('正式附件'), 'anchor XLSX artifact identifies the approved attachment');
assert.ok(anchorWorkbookText.includes('設計人員') && anchorWorkbookText.includes('王設計'), 'anchor XLSX artifact includes designer');
assert.ok(anchorWorkbookText.includes('複核人員') && anchorWorkbookText.includes('李複核'), 'anchor XLSX artifact includes checker');
assertCalculationContentProfile(anchorWorkbookText, 'traceable-calculation-book', 'anchor XLSX artifact');
assert.equal(anchorEvidence.documentState, 'ready', 'anchor summary records ready document state');

for (const needle of anchorForbiddenNeedles) {
  assert.equal(anchorHtmlText.includes(needle), false, `anchor HTML excludes page-only status: ${needle}`);
  assert.equal(anchorDocxText.includes(needle), false, `anchor DOCX excludes page-only status: ${needle}`);
  assert.equal(anchorWorkbookText.includes(needle), false, `anchor XLSX excludes page-only status: ${needle}`);
  assert.equal(anchorReviewHtmlText.includes(needle), false, `anchor review HTML excludes page-only status: ${needle}`);
  assert.equal(anchorBlockedHtmlText.includes(needle), false, `anchor blocked HTML excludes page-only status: ${needle}`);
}
assert.ok(anchorReviewHtml.includes('data-document-state="internal-review"'), 'anchor review HTML records internal-review document state');
assert.ok(anchorReviewHtmlText.includes('文件狀態：內部審閱'), 'anchor review HTML remains printable without a draft banner');
assert.equal(anchorReviewHtmlText.includes('DRAFT'), false, 'anchor review HTML contains no DRAFT label');
assert.ok(anchorBlockedHtml.includes('data-document-state="internal-review"'), 'anchor blocked HTML records internal-review document state');
assert.ok(anchorBlockedHtmlText.includes('文件狀態：內部審閱'), 'anchor blocked HTML keeps engineering failure separate from document identity');
assert.equal(anchorBlockedHtmlText.includes('DRAFT'), false, 'anchor blocked HTML contains no DRAFT label');
assert.equal(anchorEvidence.htmlTextLength, anchorHtml.length, 'anchor summary matches preserved HTML length');
assert.equal(anchorEvidence.reviewDocumentState, 'review', 'anchor summary records review document state');
assert.equal(anchorEvidence.reviewHtmlTextLength, anchorReviewHtml.length, 'anchor summary matches review HTML length');
assert.equal(anchorEvidence.blockedDocumentState, 'blocked', 'anchor summary records blocked document state');
assert.equal(anchorEvidence.blockedHtmlTextLength, anchorBlockedHtml.length, 'anchor summary matches blocked HTML length');
assert.equal(anchorEvidence.documentBytes, fs.statSync(anchorDocxPath).size, 'anchor summary matches preserved DOCX size');
assert.equal(anchorEvidence.workbookBytes, fs.statSync(anchorWorkbookPath).size, 'anchor summary matches preserved XLSX size');
anchorResultReconciliationRecords.push(validateAnchorResultReconciliationRecord(
  anchorEvidence,
  anchorEvidenceDir,
  { HTML: anchorHtmlText, DOCX: anchorDocxText, XLSX: anchorWorkbookText },
  anchorTool.title,
));
records.push({
  href: anchorTool.href,
  title: anchorTool.title,
  family: anchorTool.family,
  evidenceKey: anchorTool.evidenceKey,
  artifact: anchorEvidence.artifact,
  document: anchorEvidence.document,
  workbook: anchorEvidence.workbook,
  artifactIntegrity: anchorArtifactIntegrity,
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
const deckingArtifactIntegrity = [
  verifyRecordedArtifact(deckingEvidenceDir, deckingEvidence, { nameField: 'document' }, 'decking DOCX'),
];
assert.ok(
  fs.existsSync(deckingDocxPath) && fs.statSync(deckingDocxPath).size > 1024,
  'decking current-run DOCX artifact exists and is non-empty'
);
assert.equal(fs.readFileSync(deckingDocxPath).subarray(0, 2).toString('ascii'), 'PK', 'decking report artifact has DOCX ZIP signature');
const deckingDocxEntries = readZipEntries(deckingDocxPath, 'decking DOCX');
assert.ok(deckingDocxEntries.has('word/document.xml'), 'decking DOCX contains word/document.xml');
verifyCleanDocxPackage(deckingDocxEntries, 'decking-report', 'decking DOCX');
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
for (const needle of [...DEFAULT_FORBIDDEN, '輸出邊界']) {
  assert.equal(deckingDocxText.includes(needle), false, `decking DOCX excludes page-only status: ${needle}`);
}
assertCalculationContentProfile(deckingDocxText, 'compiled-engineering-report', 'decking DOCX artifact');
assert.equal(deckingEvidence.documentBytes, fs.statSync(deckingDocxPath).size, 'decking summary matches preserved DOCX size');
assert.equal(deckingEvidence.documentXmlBytes, Buffer.byteLength(deckingDocumentXml, 'utf8'), 'decking summary matches document.xml size');
assert.equal(deckingEvidence.documentTextLength, deckingRawText.length, 'decking summary matches extracted DOCX text length');
assert.equal(deckingEvidence.paragraphCount, deckingParagraphCount, 'decking summary matches DOCX paragraph count');
assert.equal(deckingEvidence.tableCount, deckingTableCount, 'decking summary matches DOCX table count');
assert.equal(deckingEvidence.sectionCount, deckingSectionCount, 'decking summary matches DOCX section count');
assert.equal(deckingEvidence.imageCount, deckingImageCount, 'decking summary matches DOCX image count');
assert.equal(deckingEvidence.projectName, deckingFixture.project.name, 'decking summary matches smoke project name');
deckingResultReconciliationRecords.push(validateDeckingResultReconciliationRecord(
  deckingEvidence,
  deckingEvidenceDir,
  deckingDocxText,
  deckingTool.title
));
records.push({
  href: deckingTool.href,
  title: deckingTool.title,
  family: deckingTool.family,
  evidenceKey: deckingTool.evidenceKey,
  document: deckingEvidence.document,
  artifactIntegrity: deckingArtifactIntegrity,
  documentBytes: fs.statSync(deckingDocxPath).size,
  documentTextLength: deckingDocxText.length,
  paragraphCount: deckingParagraphCount,
  tableCount: deckingTableCount,
  sectionCount: deckingSectionCount,
  imageCount: deckingImageCount,
});

const { summary: formalReportSummary, directory: formalReportEvidenceDir } = validateArtifactFamilySummary(
  runDir,
  'formal-tools',
  ['seismic-dynamic']
);
const seismicDynamicEvidence = formalReportSummary.records.find(record => record.key === 'seismic-dynamic');
assert.ok(seismicDynamicEvidence, 'seismic dynamic current-run summary resolves the report artifact record');
const seismicDynamicPdfPath = path.join(formalReportEvidenceDir, seismicDynamicEvidence.artifact || '');
const seismicDynamicEvidencePath = path.join(formalReportEvidenceDir, seismicDynamicEvidence.evidence || '');
assert.ok(fs.existsSync(seismicDynamicEvidencePath), 'seismic dynamic current-run evidence JSON exists');
const seismicDynamicPdf = validatePdfFile(seismicDynamicPdfPath, {
  label: '反應譜動力分析摘要報告',
  contentBoundaryProfile: 'traceable-calculation-book',
  minTextLength: 2500,
  requiredNeedles: [
    '反應譜動力分析規範整理計算書',
    '正式工具驗證案',
    '第 3.3 節總橫力調整檢核',
    '第 3.2 節反應譜資料表',
    '總橫力比對表',
    '動力模型檢核表',
  ],
  titleNeedle: '反應譜動力分析規範整理計算書',
  projectNeedle: '正式工具驗證案',
  keepWithNextLabels: [
    '第 3.3 節總橫力調整檢核',
    '工址與設計譜參考',
    '第 3.2 節反應譜資料表',
    '反應譜圖形化檢核',
    '總橫力比對表',
    '動力模型檢核表',
    '備註',
  ],
  continuationContextLabels: [
    '第 3.3 節總橫力調整檢核',
    '工址與設計譜參考',
    '第 3.2 節反應譜資料表',
    '反應譜圖形化檢核',
    '總橫力比對表',
    '動力模型檢核表',
    '備註',
    '方向 等值靜力結果 調整要求 動力 / 要求 最低倍率 輸入採用總橫力 採用倍率 判讀',
    'T(sec) 設計地震 SaD 設計輸入譜 中小度下限譜 採用設計輸入譜 控制 最大考量 SaM 最大考量輸入譜',
    '方向 週期 T 動力基底剪力 等值靜力結果 調整要求 動力/要求 最低倍率 輸入採用總橫力 採用倍率 判讀',
    '項目 檢核內容 狀態',
  ],
});
const seismicDynamicEvidenceJson = readJson(seismicDynamicEvidencePath);
assert.equal(seismicDynamicEvidenceJson.artifact, seismicDynamicEvidence.artifact, 'seismic dynamic evidence names the preserved PDF');
assert.equal(seismicDynamicEvidence.renderer, 'formal-attachment-detailed', 'seismic dynamic summary identifies the approved detailed formal-attachment renderer');
assert.equal(seismicDynamicEvidence.evidenceRole, 'approved-formal-attachment', 'seismic dynamic summary identifies approved formal-attachment evidence');
assert.equal(seismicDynamicEvidence.documentClass, 'formal-attachment', 'seismic dynamic summary records the formal-attachment document class');
assert.ok(Number.isFinite(Date.parse(seismicDynamicEvidence.approvalTime || '')), 'seismic dynamic summary records a valid approval time');
assert.match(seismicDynamicEvidence.calculationFingerprint || '', /^CF-[0-9A-F]{16}$/, 'seismic dynamic summary records the approved calculation fingerprint');
assert.equal(seismicDynamicEvidence.internalReviewDocumentClass, 'internal-review', 'seismic dynamic summary confirms the pre-approval internal-review state');
assert.equal(seismicDynamicEvidence.internalReviewStateVerified, true, 'seismic dynamic summary verifies the internal-review to formal-attachment transition');
assert.equal(seismicDynamicEvidenceJson.renderer, seismicDynamicEvidence.renderer, 'seismic dynamic evidence uses the approved renderer named by the current-run summary');
assert.equal(seismicDynamicEvidenceJson.dom.horizontalOverflow, false, 'seismic dynamic report has no horizontal overflow');
assert.ok(seismicDynamicEvidenceJson.dom.tableCount >= 6, 'seismic dynamic report keeps populated tables');
assert.equal(seismicDynamicEvidenceJson.pdf.pageCount, seismicDynamicPdf.pageCount, 'seismic dynamic evidence matches PDF page count');
assert.equal(seismicDynamicEvidenceJson.pdf.textLength, seismicDynamicPdf.textLength, 'seismic dynamic evidence matches PDF text length');
assert.equal(seismicDynamicEvidenceJson.pdf.orphanHeadingCount, 0, 'seismic dynamic report has no orphan headings');
assert.equal(seismicDynamicEvidenceJson.pdf.uncontextualPageStartCount, 0, 'seismic dynamic report continuation pages keep context');
supplementalRecords.push({
  href: '/seismic-dynamic',
  title: '動力分析摘要',
  family: 'seismic-report',
  sourceFamily: 'formal-tools',
  category: 'report',
  evidenceKey: 'seismic-dynamic',
  artifact: seismicDynamicEvidence.artifact,
  evidence: seismicDynamicEvidence.evidence,
  pageCount: seismicDynamicPdf.pageCount,
  textLength: seismicDynamicPdf.textLength,
  tableCount: seismicDynamicEvidenceJson.dom.tableCount,
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
const excavationArtifactIntegrity = [
  verifyRecordedArtifact(excavationEvidenceDir, excavationEvidence, { nameField: 'artifact' }, 'excavation PDF'),
  verifyRecordedArtifact(excavationEvidenceDir, excavationEvidence, { nameField: 'document' }, 'excavation DOCX'),
  verifyRecordedArtifact(excavationEvidenceDir, excavationEvidence, { nameField: 'latestArtifact' }, 'excavation latest PDF'),
  verifyRecordedArtifact(excavationEvidenceDir, excavationEvidence, { nameField: 'latestDocument' }, 'excavation latest DOCX'),
];
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
  contentBoundaryProfile: 'compiled-engineering-report',
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
verifyCleanDocxPackage(excavationDocxEntries, 'excavation-report', 'excavation DOCX');
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
for (const needle of DEFAULT_FORBIDDEN) {
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
const excavationPdfText = fs.readFileSync(excavationPdf.textPath, 'utf8');
excavationResultReconciliationRecords.push(validateExcavationResultReconciliationRecord(
  excavationEvidence,
  excavationEvidenceDir,
  { PDF: excavationPdfText, DOCX: excavationDocxText },
  'excavation-report'
));
supplementalRecords.push({
  title: '開挖擋土支撐',
  family: 'excavation-formal',
  category: 'service',
  evidenceKey: 'excavation-report',
  artifact: excavationEvidence.artifact,
  document: excavationEvidence.document,
  latestArtifact: excavationEvidence.latestArtifact,
  latestDocument: excavationEvidence.latestDocument,
  artifactIntegrity: excavationArtifactIntegrity,
  pageCount: excavationPdf.pageCount,
  pdfTextLength: excavationPdf.textLength,
  documentTextLength: excavationDocxText.length,
  paragraphCount: excavationParagraphCount,
  tableCount: excavationTableCount,
  sectionCount: excavationSectionCount,
});

assert.equal(records.length, inventory.tools.length, 'release rendered evidence resolves every homepage formal tool');
assert.equal(supplementalRecords.length, 2, 'release rendered evidence resolves every supplemental report and service artifact');
const rcStmFormalAttachmentArtifacts = rcStmFormalAttachmentRecords.flatMap(record => [
  ...record.visualArtifactIntegrity.map(artifact => ({ family:'rc-stm-formal', ...artifact })),
  { family:'rc-stm-formal', role:'approvedFormalHtml', ...record.htmlIntegrity },
  {
    family:'rc-stm-formal',
    role:'standaloneFormalHtmlPrintPdf',
    name:record.standalonePrint.artifact,
    bytes:record.standalonePrint.artifactBytes,
    sha256:record.standalonePrint.artifactSha256,
  },
]);
const rcStmFormalAttachment = {
  schemaVersion:1,
  scope:'rc-stm-supplemental-formal-attachments',
  required:inventory.rcSupplementalAttachments.length,
  complete:rcStmFormalAttachmentRecords.length,
  issueCount:Math.max(0, inventory.rcSupplementalAttachments.length - rcStmFormalAttachmentRecords.length),
  pass:rcStmFormalAttachmentRecords.length === inventory.rcSupplementalAttachments.length,
  artifactRequired:inventory.rcSupplementalAttachments.length * 4,
  artifactVerified:rcStmFormalAttachmentArtifacts.length,
  setSha256:scopedIntegritySetHash(rcStmFormalAttachmentArtifacts),
  records:rcStmFormalAttachmentRecords,
};
assert.equal(new Set(rcStmFormalAttachmentRecords.map(record => record.key)).size, rcStmFormalAttachmentRecords.length, 'release rendered evidence RC STM supplemental attachment identities are unique');
assert.equal(rcStmFormalAttachment.complete, rcStmFormalAttachment.required, 'release rendered evidence verifies all three RC STM supplemental formal attachments');
assert.equal(rcStmFormalAttachment.artifactVerified, rcStmFormalAttachment.artifactRequired, 'release rendered evidence verifies PDF, PNG, approved HTML and standalone print for every RC STM attachment');
assert.equal(rcStmFormalAttachment.pass, true, 'release rendered evidence passes RC STM supplemental formal attachment verification');
const attachmentIntegrityGroups = records
  .filter(record => ['rc-formal', 'rc-retrofit'].includes(record.family))
  .map(record => record.integrity);
assert.equal(attachmentIntegrityGroups.length, 8, 'release rendered evidence resolves eight RC attachment integrity groups');
const attachmentIntegrity = {
  schemaVersion: 1,
  scope: 'rc-formal-html',
  required: attachmentIntegrityGroups.reduce((sum, group) => sum + group.expected, 0),
  actual: attachmentIntegrityGroups.reduce((sum, group) => sum + group.actual, 0),
  verified: attachmentIntegrityGroups.reduce((sum, group) => sum + group.verified, 0),
  issueCount: attachmentIntegrityGroups.reduce((sum, group) => sum + group.issueCount, 0),
  pass: attachmentIntegrityGroups.every(group => group.pass),
  setSha256: integritySetHash(attachmentIntegrityGroups.flatMap(group => group.artifacts)),
  groups: attachmentIntegrityGroups,
};
const mixedArtifactRecords = [...records, ...supplementalRecords]
  .flatMap(record => record.artifactIntegrity || []);
const mixedArtifactIntegrity = {
  schemaVersion: 1,
  scope: 'mixed-format-release-artifacts',
  required: 13,
  verified: mixedArtifactRecords.length,
  issueCount: Math.max(0, 13 - mixedArtifactRecords.length),
  pass: mixedArtifactRecords.length === 13,
  setSha256: integritySetHash(mixedArtifactRecords),
  artifacts: mixedArtifactRecords,
};
const rcVisualArtifacts = records
  .filter(record => ['rc-formal', 'rc-retrofit'].includes(record.family))
  .flatMap(record => record.visualArtifactIntegrity || []);
const rcVisualArtifactIntegrity = {
  schemaVersion: 1,
  scope: 'rc-rendered-pdf-png',
  required: 66,
  verified: rcVisualArtifacts.length,
  issueCount: Math.max(0, 66 - rcVisualArtifacts.length),
  pass: rcVisualArtifacts.length === 66,
  setSha256: integritySetHash(rcVisualArtifacts),
  artifacts: rcVisualArtifacts,
};
const canonicalArtifacts = uniqueIntegrityArtifacts(canonicalArtifactRecords, 'canonical rendered artifact integrity');
const canonicalArtifactIntegrity = {
  schemaVersion: 1,
  scope: 'canonical-rendered-pdf-evidence',
  required: 66,
  verified: canonicalArtifacts.length,
  issueCount: Math.max(0, 66 - canonicalArtifacts.length),
  pass: canonicalArtifacts.length === 66,
  setSha256: scopedIntegritySetHash(canonicalArtifacts),
  artifacts: canonicalArtifacts,
};
const formalResultReconciliation = {
  schemaVersion: 1,
  scope: 'formal-golden-result-to-report-fingerprint',
  required: 14,
  complete: formalResultReconciliationRecords.length,
  issueCount: Math.max(0, 14 - formalResultReconciliationRecords.length),
  pass: formalResultReconciliationRecords.length === 14,
  setSha256: formalResultReconciliationSetHash(formalResultReconciliationRecords),
  records: formalResultReconciliationRecords,
};
assert.equal(formalResultReconciliation.complete, formalResultReconciliation.required, 'release rendered evidence reconciles all 14 formal golden results to report fingerprints');
assert.equal(formalResultReconciliation.pass, true, 'release rendered evidence passes formal result reconciliation');
const localQuickResultReconciliation = {
  schemaVersion: 1,
  scope: 'local-quick-json-replay-to-pdf-hash',
  required: 3,
  complete: localQuickResultReconciliationRecords.length,
  issueCount: Math.max(0, 3 - localQuickResultReconciliationRecords.length),
  pass: localQuickResultReconciliationRecords.length === 3,
  setSha256: localQuickResultReconciliationSetHash(localQuickResultReconciliationRecords),
  records: localQuickResultReconciliationRecords,
};
assert.equal(new Set(localQuickResultReconciliationRecords.map(record => record.key)).size, localQuickResultReconciliationRecords.length, 'release rendered evidence local quick result reconciliation identities are unique');
assert.equal(localQuickResultReconciliation.complete, localQuickResultReconciliation.required, 'release rendered evidence reconciles all 3 local quick JSON replays to PDF fingerprints');
assert.equal(localQuickResultReconciliation.pass, true, 'release rendered evidence passes local quick result reconciliation');
const rcResultReconciliation = {
  schemaVersion: 1,
  scope: 'rc-source-replay-to-report-fingerprint',
  required: 34,
  complete: rcResultReconciliationRecords.length,
  issueCount: Math.max(0, 34 - rcResultReconciliationRecords.length),
  pass: rcResultReconciliationRecords.length === 34,
  setSha256: rcResultReconciliationSetHash(rcResultReconciliationRecords),
  records: rcResultReconciliationRecords,
};
assert.equal(new Set(rcResultReconciliationRecords.map(record => `${record.href}\u0000${record.key}`)).size, rcResultReconciliationRecords.length, 'release rendered evidence RC result reconciliation identities are unique');
assert.equal(rcResultReconciliation.complete, rcResultReconciliation.required, 'release rendered evidence reconciles all 34 RC design and retrofit results to report fingerprints');
assert.equal(rcResultReconciliation.pass, true, 'release rendered evidence passes RC result reconciliation');
const rcSourceReportPackageRecords = rcResultReconciliationRecords
  .filter(record => record.strategy === 'rc-project-replay-to-report-fingerprint')
  .map(record => ({ href: record.href, key: record.key, ...record.sourceReportPackage }));
const rcSourceReportPackage = {
  schemaVersion: 1,
  scope: 'rc-real-source-json-to-formal-html-package-check',
  required: 32,
  complete: rcSourceReportPackageRecords.length,
  issueCount: Math.max(0, 32 - rcSourceReportPackageRecords.length),
  pass: rcSourceReportPackageRecords.length === 32,
  setSha256: rcSourceReportPackageSetHash(rcSourceReportPackageRecords),
  records: rcSourceReportPackageRecords,
};
assert.equal(new Set(rcSourceReportPackageRecords.map(record => `${record.href}\u0000${record.key}`)).size, rcSourceReportPackageRecords.length, 'release rendered evidence RC source/report package identities are unique');
assert.equal(rcSourceReportPackage.complete, rcSourceReportPackage.required, 'release rendered evidence verifies all 32 RC project JSON and formal HTML packages');
assert.equal(rcSourceReportPackage.pass, true, 'release rendered evidence passes RC source/report package verification');
const rcStandaloneFormalHtmlPrint = {
  schemaVersion: 1,
  scope: 'rc-approved-standalone-html-to-validated-pdf',
  required: 34,
  complete: rcStandaloneFormalHtmlPrintRecords.length,
  issueCount: Math.max(0, 34 - rcStandaloneFormalHtmlPrintRecords.length),
  pass: rcStandaloneFormalHtmlPrintRecords.length === 34,
  setSha256: rcStandaloneFormalHtmlPrintSetHash(rcStandaloneFormalHtmlPrintRecords),
  records: rcStandaloneFormalHtmlPrintRecords,
};
assert.equal(new Set(rcStandaloneFormalHtmlPrintRecords.map(record => `${record.href}\u0000${record.key}`)).size, rcStandaloneFormalHtmlPrintRecords.length, 'release rendered evidence RC standalone formal HTML print identities are unique');
assert.equal(rcStandaloneFormalHtmlPrint.complete, rcStandaloneFormalHtmlPrint.required, 'release rendered evidence reopens and prints all 34 RC approved standalone HTML reports');
assert.equal(rcStandaloneFormalHtmlPrint.pass, true, 'release rendered evidence passes RC standalone formal HTML print verification');
const rcFormalHtmlContentSeal = {
  schemaVersion: 1,
  scope: 'rc-formal-html-reproducible-content-sha256',
  required: 34,
  complete: rcFormalHtmlContentSealRecords.length,
  issueCount: Math.max(0, 34 - rcFormalHtmlContentSealRecords.length),
  pass: rcFormalHtmlContentSealRecords.length === 34,
  setSha256: rcFormalHtmlContentSealSetHash(rcFormalHtmlContentSealRecords),
  records: rcFormalHtmlContentSealRecords,
};
assert.equal(new Set(rcFormalHtmlContentSealRecords.map(record => `${record.href}\u0000${record.key}`)).size, rcFormalHtmlContentSealRecords.length, 'release rendered evidence RC formal HTML content seal identities are unique');
assert.equal(rcFormalHtmlContentSeal.complete, rcFormalHtmlContentSeal.required, 'release rendered evidence independently verifies all 34 RC formal HTML content seals');
assert.equal(rcFormalHtmlContentSeal.pass, true, 'release rendered evidence passes RC formal HTML content seal verification');
const rcFormalHtmlApprovalSeal = {
  schemaVersion: 1,
  scope: 'rc-formal-html-reproducible-approval-sha256',
  required: 34,
  complete: rcFormalHtmlApprovalSealRecords.length,
  issueCount: Math.max(0, 34 - rcFormalHtmlApprovalSealRecords.length),
  pass: rcFormalHtmlApprovalSealRecords.length === 34,
  setSha256: rcFormalHtmlApprovalSealSetHash(rcFormalHtmlApprovalSealRecords),
  records: rcFormalHtmlApprovalSealRecords,
};
assert.equal(new Set(rcFormalHtmlApprovalSealRecords.map(record => `${record.href}\u0000${record.key}`)).size, rcFormalHtmlApprovalSealRecords.length, 'release rendered evidence RC formal HTML approval seal identities are unique');
assert.equal(rcFormalHtmlApprovalSeal.complete, rcFormalHtmlApprovalSeal.required, 'release rendered evidence independently verifies all 34 RC formal HTML approval seals');
assert.equal(rcFormalHtmlApprovalSeal.pass, true, 'release rendered evidence passes RC formal HTML approval seal verification');
const formalHtmlContentSeal = {
  schemaVersion: 1,
  scope: 'formal-tools-html-reproducible-content-sha256',
  required: 14,
  complete: formalHtmlDualSealRecords.length,
  issueCount: Math.max(0, 14 - formalHtmlDualSealRecords.length),
  pass: formalHtmlDualSealRecords.length === 14,
  setSha256: formalHtmlSealSetHash(formalHtmlDualSealRecords, 'content'),
  records: formalHtmlDualSealRecords.map(record => ({
    key: record.key,
    htmlArtifact: record.htmlArtifact,
    htmlArtifactSha256: record.htmlArtifactSha256,
    scope: record.contentSealScope,
    contentSha256: record.contentSha256,
  })),
};
const formalHtmlApprovalSeal = {
  schemaVersion: 1,
  scope: 'formal-tools-html-reproducible-approval-sha256',
  required: 14,
  complete: formalHtmlDualSealRecords.length,
  issueCount: Math.max(0, 14 - formalHtmlDualSealRecords.length),
  pass: formalHtmlDualSealRecords.length === 14,
  setSha256: formalHtmlSealSetHash(formalHtmlDualSealRecords, 'approval'),
  records: formalHtmlDualSealRecords.map(record => ({
    key: record.key,
    htmlArtifact: record.htmlArtifact,
    htmlArtifactSha256: record.htmlArtifactSha256,
    scope: record.approvalSealScope,
    approvalSha256: record.approvalSha256,
  })),
};
assert.equal(new Set(formalHtmlDualSealRecords.map(record => record.key)).size, formalHtmlDualSealRecords.length, 'release rendered evidence formal-tool HTML seal identities are unique');
assert.equal(formalHtmlContentSeal.complete, formalHtmlContentSeal.required, 'release rendered evidence independently verifies all 14 formal-tool HTML content seals');
assert.equal(formalHtmlApprovalSeal.complete, formalHtmlApprovalSeal.required, 'release rendered evidence independently verifies all 14 formal-tool HTML approval seals');
assert.equal(formalHtmlContentSeal.pass, true, 'release rendered evidence passes formal-tool HTML content seal verification');
assert.equal(formalHtmlApprovalSeal.pass, true, 'release rendered evidence passes formal-tool HTML approval seal verification');
const steelHtmlContentSeal = {
  schemaVersion: 1,
  scope: 'steel-formal-html-reproducible-content-sha256',
  required: 5,
  complete: steelHtmlDualSealRecords.length,
  issueCount: Math.max(0, 5 - steelHtmlDualSealRecords.length),
  pass: steelHtmlDualSealRecords.length === 5,
  setSha256: formalHtmlSealSetHash(steelHtmlDualSealRecords, 'content'),
  records: steelHtmlDualSealRecords.map(record => ({
    key: record.key,
    htmlArtifact: record.htmlArtifact,
    htmlArtifactSha256: record.htmlArtifactSha256,
    scope: record.contentSealScope,
    contentSha256: record.contentSha256,
  })),
};
const steelHtmlApprovalSeal = {
  schemaVersion: 1,
  scope: 'steel-formal-html-reproducible-approval-sha256',
  required: 5,
  complete: steelHtmlDualSealRecords.length,
  issueCount: Math.max(0, 5 - steelHtmlDualSealRecords.length),
  pass: steelHtmlDualSealRecords.length === 5,
  setSha256: formalHtmlSealSetHash(steelHtmlDualSealRecords, 'approval'),
  records: steelHtmlDualSealRecords.map(record => ({
    key: record.key,
    htmlArtifact: record.htmlArtifact,
    htmlArtifactSha256: record.htmlArtifactSha256,
    scope: record.approvalSealScope,
    approvalSha256: record.approvalSha256,
  })),
};
assert.equal(new Set(steelHtmlDualSealRecords.map(record => record.key)).size, steelHtmlDualSealRecords.length, 'release rendered evidence steel formal HTML seal identities are unique');
assert.equal(steelHtmlContentSeal.complete, steelHtmlContentSeal.required, 'release rendered evidence independently verifies all 5 steel formal HTML content seals');
assert.equal(steelHtmlApprovalSeal.complete, steelHtmlApprovalSeal.required, 'release rendered evidence independently verifies all 5 steel formal HTML approval seals');
assert.equal(steelHtmlContentSeal.pass, true, 'release rendered evidence passes steel formal HTML content seal verification');
assert.equal(steelHtmlApprovalSeal.pass, true, 'release rendered evidence passes steel formal HTML approval seal verification');
const anchorHtmlContentSeal = {
  schemaVersion: 1,
  scope: 'anchor-formal-html-reproducible-content-sha256',
  required: 1,
  complete: anchorHtmlDualSealRecords.length,
  issueCount: Math.max(0, 1 - anchorHtmlDualSealRecords.length),
  pass: anchorHtmlDualSealRecords.length === 1,
  setSha256: formalHtmlSealSetHash(anchorHtmlDualSealRecords, 'content'),
  records: anchorHtmlDualSealRecords.map(record => ({
    key: record.key,
    htmlArtifact: record.htmlArtifact,
    htmlArtifactSha256: record.htmlArtifactSha256,
    scope: record.contentSealScope,
    contentSha256: record.contentSha256,
  })),
};
const anchorHtmlApprovalSeal = {
  schemaVersion: 1,
  scope: 'anchor-formal-html-reproducible-approval-sha256',
  required: 1,
  complete: anchorHtmlDualSealRecords.length,
  issueCount: Math.max(0, 1 - anchorHtmlDualSealRecords.length),
  pass: anchorHtmlDualSealRecords.length === 1,
  setSha256: formalHtmlSealSetHash(anchorHtmlDualSealRecords, 'approval'),
  records: anchorHtmlDualSealRecords.map(record => ({
    key: record.key,
    htmlArtifact: record.htmlArtifact,
    htmlArtifactSha256: record.htmlArtifactSha256,
    scope: record.approvalSealScope,
    approvalSha256: record.approvalSha256,
  })),
};
assert.equal(new Set(anchorHtmlDualSealRecords.map(record => record.key)).size, anchorHtmlDualSealRecords.length, 'release rendered evidence anchor formal HTML seal identities are unique');
assert.equal(anchorHtmlContentSeal.complete, anchorHtmlContentSeal.required, 'release rendered evidence independently verifies the anchor formal HTML content seal');
assert.equal(anchorHtmlApprovalSeal.complete, anchorHtmlApprovalSeal.required, 'release rendered evidence independently verifies the anchor formal HTML approval seal');
assert.equal(anchorHtmlContentSeal.pass, true, 'release rendered evidence passes anchor formal HTML content seal verification');
assert.equal(anchorHtmlApprovalSeal.pass, true, 'release rendered evidence passes anchor formal HTML approval seal verification');
const steelResultReconciliation = {
  schemaVersion: 1,
  scope: 'steel-source-replay-to-report-fingerprint',
  required: 5,
  complete: steelResultReconciliationRecords.length,
  issueCount: Math.max(0, 5 - steelResultReconciliationRecords.length),
  pass: steelResultReconciliationRecords.length === 5,
  setSha256: steelResultReconciliationSetHash(steelResultReconciliationRecords),
  records: steelResultReconciliationRecords,
};
assert.equal(new Set(steelResultReconciliationRecords.map(record => record.key)).size, steelResultReconciliationRecords.length, 'release rendered evidence steel result reconciliation identities are unique');
assert.equal(steelResultReconciliation.complete, steelResultReconciliation.required, 'release rendered evidence reconciles all 5 steel source replays to report fingerprints');
assert.equal(steelResultReconciliation.pass, true, 'release rendered evidence passes steel result reconciliation');
const stoneResultReconciliation = {
  schemaVersion: 1,
  scope: 'stone-golden-replay-to-pdf-docx-hash',
  required: 1,
  complete: stoneResultReconciliationRecords.length,
  issueCount: Math.max(0, 1 - stoneResultReconciliationRecords.length),
  pass: stoneResultReconciliationRecords.length === 1,
  setSha256: stoneResultReconciliationSetHash(stoneResultReconciliationRecords),
  records: stoneResultReconciliationRecords,
};
assert.equal(new Set(stoneResultReconciliationRecords.map(record => record.caseId)).size, stoneResultReconciliationRecords.length, 'release rendered evidence stone result reconciliation identities are unique');
assert.equal(stoneResultReconciliation.complete, stoneResultReconciliation.required, 'release rendered evidence reconciles the stone golden replay to PDF, DOCX, and audit hashes');
assert.equal(stoneResultReconciliation.pass, true, 'release rendered evidence passes stone result reconciliation');
const anchorResultReconciliation = {
  schemaVersion: 1,
  scope: 'anchor-workspace-replay-to-html-docx-xlsx-hash',
  required: 1,
  complete: anchorResultReconciliationRecords.length,
  issueCount: Math.max(0, 1 - anchorResultReconciliationRecords.length),
  pass: anchorResultReconciliationRecords.length === 1,
  setSha256: anchorResultReconciliationSetHash(anchorResultReconciliationRecords),
  records: anchorResultReconciliationRecords,
};
assert.equal(new Set(anchorResultReconciliationRecords.map(record => record.caseId)).size, anchorResultReconciliationRecords.length, 'release rendered evidence anchor result reconciliation identities are unique');
assert.equal(anchorResultReconciliation.complete, anchorResultReconciliation.required, 'release rendered evidence reconciles the anchor workspace replay to HTML, DOCX, and XLSX hashes');
assert.equal(anchorResultReconciliation.pass, true, 'release rendered evidence passes anchor result reconciliation');
const deckingResultReconciliation = {
  schemaVersion: 1,
  scope: 'decking-json-replay-to-docx-hash',
  required: 1,
  complete: deckingResultReconciliationRecords.length,
  issueCount: Math.max(0, 1 - deckingResultReconciliationRecords.length),
  pass: deckingResultReconciliationRecords.length === 1,
  setSha256: deckingResultReconciliationSetHash(deckingResultReconciliationRecords),
  records: deckingResultReconciliationRecords,
};
assert.equal(new Set(deckingResultReconciliationRecords.map(record => record.caseId)).size, deckingResultReconciliationRecords.length, 'release rendered evidence decking result reconciliation identities are unique');
assert.equal(deckingResultReconciliation.complete, deckingResultReconciliation.required, 'release rendered evidence reconciles the decking JSON replay to DOCX hash');
assert.equal(deckingResultReconciliation.pass, true, 'release rendered evidence passes decking result reconciliation');
const excavationResultReconciliation = {
  schemaVersion: 1,
  scope: 'excavation-project-state-replay-to-pdf-docx-hash',
  required: 1,
  complete: excavationResultReconciliationRecords.length,
  issueCount: Math.max(0, 1 - excavationResultReconciliationRecords.length),
  pass: excavationResultReconciliationRecords.length === 1,
  setSha256: excavationResultReconciliationSetHash(excavationResultReconciliationRecords),
  records: excavationResultReconciliationRecords,
};
assert.equal(new Set(excavationResultReconciliationRecords.map(record => record.caseId)).size, excavationResultReconciliationRecords.length, 'release rendered evidence excavation result reconciliation identities are unique');
assert.equal(excavationResultReconciliation.complete, excavationResultReconciliation.required, 'release rendered evidence reconciles the excavation ProjectState replay to PDF and DOCX hashes');
assert.equal(excavationResultReconciliation.pass, true, 'release rendered evidence passes excavation result reconciliation');
assert.equal(canonicalArtifactIntegrity.verified, canonicalArtifactIntegrity.required, 'release rendered evidence verifies all 66 canonical PDF and evidence files');
assert.equal(canonicalArtifactIntegrity.pass, true, 'release rendered evidence passes canonical PDF and evidence integrity');
assert.equal(rcVisualArtifactIntegrity.verified, rcVisualArtifactIntegrity.required, 'release rendered evidence verifies all 66 RC PDF and PNG visual artifacts');
assert.equal(rcVisualArtifactIntegrity.pass, true, 'release rendered evidence passes RC PDF and PNG visual artifact integrity');
assert.equal(mixedArtifactIntegrity.verified, mixedArtifactIntegrity.required, 'release rendered evidence verifies all 13 mixed-format artifacts');
assert.equal(mixedArtifactIntegrity.pass, true, 'release rendered evidence passes mixed-format artifact integrity');
assert.equal(attachmentIntegrity.required, 34, 'release rendered evidence expects 34 RC HTML attachments');
assert.equal(attachmentIntegrity.actual, attachmentIntegrity.required, 'release rendered evidence keeps every expected RC HTML attachment');
assert.equal(attachmentIntegrity.verified, attachmentIntegrity.required, 'release rendered evidence verifies every RC HTML attachment');
assert.equal(attachmentIntegrity.issueCount, 0, 'release rendered evidence has no RC HTML attachment integrity issue');
assert.equal(attachmentIntegrity.pass, true, 'release rendered evidence passes RC HTML attachment integrity');
const docxPackageIntegrity = {
  schemaVersion: 1,
  scope: 'formal-docx-clean-ooxml-package',
  required: 4,
  complete: docxPackageIntegrityRecords.length,
  issueCount: docxPackageIntegrityRecords.reduce((sum, record) => sum + record.issueCount, 0),
  pass: docxPackageIntegrityRecords.length === 4 && docxPackageIntegrityRecords.every(record => record.pass),
  records: docxPackageIntegrityRecords,
};
assert.equal(new Set(docxPackageIntegrityRecords.map(record => record.key)).size, docxPackageIntegrityRecords.length, 'release rendered evidence DOCX package identities are unique');
assert.equal(docxPackageIntegrity.complete, docxPackageIntegrity.required, 'release rendered evidence verifies all 4 formal DOCX packages');
assert.equal(docxPackageIntegrity.issueCount, 0, 'release rendered evidence formal DOCX packages contain no hidden package contamination');
assert.equal(docxPackageIntegrity.pass, true, 'release rendered evidence passes formal DOCX package integrity');
const xlsxPackageIntegrity = {
  schemaVersion: 1,
  scope: 'formal-xlsx-clean-ooxml-package-and-formula-cache',
  required: 1,
  complete: xlsxPackageIntegrityRecords.length,
  issueCount: xlsxPackageIntegrityRecords.reduce((sum, record) => sum + record.issueCount, 0),
  pass: xlsxPackageIntegrityRecords.length === 1 && xlsxPackageIntegrityRecords.every(record => record.pass),
  records: xlsxPackageIntegrityRecords,
};
assert.equal(new Set(xlsxPackageIntegrityRecords.map(record => record.key)).size, xlsxPackageIntegrityRecords.length, 'release rendered evidence XLSX package identities are unique');
assert.equal(xlsxPackageIntegrity.complete, xlsxPackageIntegrity.required, 'release rendered evidence verifies the formal XLSX package');
assert.equal(xlsxPackageIntegrity.issueCount, 0, 'release rendered evidence formal XLSX package contains no hidden, external, active, or formula-cache contamination');
assert.equal(xlsxPackageIntegrity.pass, true, 'release rendered evidence passes formal XLSX package integrity');
const xlsxPrintVisual = {
  schemaVersion: 1,
  scope: 'formal-xlsx-microsoft-excel-pdf-visual-print',
  required: 1,
  complete: anchorXlsxPrintVisual.pass ? 1 : 0,
  sheetRequired: 9,
  sheetComplete: anchorXlsxPrintVisual.sheetComplete,
  issueCount: anchorXlsxPrintVisual.issueCount,
  pass: anchorXlsxPrintVisual.pass && anchorXlsxPrintVisual.sheetComplete === 9,
  records: [anchorXlsxPrintVisual],
};
assert.equal(xlsxPrintVisual.complete, xlsxPrintVisual.required, 'release rendered evidence verifies the formal XLSX Office print artifact');
assert.equal(xlsxPrintVisual.sheetComplete, xlsxPrintVisual.sheetRequired, 'release rendered evidence verifies every XLSX worksheet PDF');
assert.equal(xlsxPrintVisual.issueCount, 0, 'release rendered evidence formal XLSX Office print has no clipping, blank-page, or overflow issues');
assert.equal(xlsxPrintVisual.pass, true, 'release rendered evidence passes formal XLSX Office print visual integrity');
const xlsxDualSealRecord = {
  key: 'anchor-review',
  contentSealScope: anchorXlsxDualSealVerification.content.scope,
  contentSealStatus: anchorXlsxDualSealVerification.content.status,
  contentSha256: anchorXlsxDualSealVerification.content.actualSha256,
  approvalSealScope: anchorXlsxDualSealVerification.approval.scope,
  approvalSealStatus: anchorXlsxDualSealVerification.approval.status,
  approvalSha256: anchorXlsxDualSealVerification.approval.actualSha256,
  contentTamperDetectionStatus: anchorXlsxContentTamperVerification.content.status,
  contentTamperApprovalStatus: anchorXlsxContentTamperVerification.approval.status,
  approvalTamperContentStatus: anchorXlsxApprovalTamperVerification.content.status,
  approvalTamperDetectionStatus: anchorXlsxApprovalTamperVerification.approval.status,
};
const xlsxDualSealStatusesPass = xlsxDualSealRecord.contentSealStatus === 'verified'
  && xlsxDualSealRecord.approvalSealStatus === 'verified'
  && xlsxDualSealRecord.contentTamperDetectionStatus === 'failed'
  && xlsxDualSealRecord.contentTamperApprovalStatus === 'verified'
  && xlsxDualSealRecord.approvalTamperContentStatus === 'verified'
  && xlsxDualSealRecord.approvalTamperDetectionStatus === 'failed';
const xlsxDualSeal = {
  schemaVersion: 1,
  scope: 'formal-anchor-xlsx-content-and-approval-dual-seal',
  contentRequired: 1,
  contentComplete: anchorXlsxDualSealVerification.content.status === 'verified' ? 1 : 0,
  approvalRequired: 1,
  approvalComplete: anchorXlsxDualSealVerification.approval.status === 'verified' ? 1 : 0,
  issueCount: xlsxDualSealStatusesPass ? 0 : 1,
  pass: xlsxDualSealStatusesPass,
  records: [xlsxDualSealRecord],
};
assert.equal(xlsxDualSeal.contentComplete, xlsxDualSeal.contentRequired, 'release verifies the formal XLSX content seal');
assert.equal(xlsxDualSeal.approvalComplete, xlsxDualSeal.approvalRequired, 'release verifies the formal XLSX approval seal');
assert.equal(xlsxDualSeal.pass, true, 'release passes formal XLSX dual seal integrity');
const aggregate = {
  schemaVersion: 27,
  kind: 'release-rendered-delivery-evidence',
  generatedAt: new Date().toISOString(),
  runId: path.basename(runDir),
  required: inventory.tools.length,
  complete: records.length,
  supplementalRequired: 2,
  supplementalComplete: supplementalRecords.length,
  supplementalPass: supplementalRecords.length === 2,
  pass: records.length === inventory.tools.length && supplementalRecords.length === 2 && rcStmFormalAttachment.pass && attachmentIntegrity.pass && mixedArtifactIntegrity.pass && rcVisualArtifactIntegrity.pass && canonicalArtifactIntegrity.pass && docxPackageIntegrity.pass && xlsxPackageIntegrity.pass && xlsxPrintVisual.pass && xlsxDualSeal.pass && formalResultReconciliation.pass && formalHtmlContentSeal.pass && formalHtmlApprovalSeal.pass && steelHtmlContentSeal.pass && steelHtmlApprovalSeal.pass && anchorHtmlContentSeal.pass && anchorHtmlApprovalSeal.pass && localQuickResultReconciliation.pass && rcResultReconciliation.pass && rcSourceReportPackage.pass && rcStandaloneFormalHtmlPrint.pass && rcFormalHtmlContentSeal.pass && rcFormalHtmlApprovalSeal.pass && steelResultReconciliation.pass && stoneResultReconciliation.pass && anchorResultReconciliation.pass && deckingResultReconciliation.pass && excavationResultReconciliation.pass,
  rcStmFormalAttachment,
  attachmentIntegrity,
  mixedArtifactIntegrity,
  rcVisualArtifactIntegrity,
  canonicalArtifactIntegrity,
  docxPackageIntegrity,
  xlsxPackageIntegrity,
  xlsxPrintVisual,
  xlsxDualSeal,
  formalResultReconciliation,
  formalHtmlContentSeal,
  formalHtmlApprovalSeal,
  steelHtmlContentSeal,
  steelHtmlApprovalSeal,
  anchorHtmlContentSeal,
  anchorHtmlApprovalSeal,
  localQuickResultReconciliation,
  rcResultReconciliation,
  rcSourceReportPackage,
  rcStandaloneFormalHtmlPrint,
  rcFormalHtmlContentSeal,
  rcFormalHtmlApprovalSeal,
  steelResultReconciliation,
  stoneResultReconciliation,
  anchorResultReconciliation,
  deckingResultReconciliation,
  excavationResultReconciliation,
  records,
  supplementalRecords,
};
const aggregatePath = path.join(runDir, 'rendered-delivery-evidence', 'rendered-delivery-evidence-summary.json');
fs.mkdirSync(path.dirname(aggregatePath), { recursive: true });
fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
console.log(`Rendered delivery evidence contract OK (complete=${records.length}/${inventory.tools.length}, supplemental=${supplementalRecords.length}/2, rcStmFormalAttachment=${rcStmFormalAttachment.complete}/${rcStmFormalAttachment.required}, mixedIntegrity=${mixedArtifactIntegrity.verified}/${mixedArtifactIntegrity.required}, rcVisualIntegrity=${rcVisualArtifactIntegrity.verified}/${rcVisualArtifactIntegrity.required}, canonicalIntegrity=${canonicalArtifactIntegrity.verified}/${canonicalArtifactIntegrity.required}, docxPackageIntegrity=${docxPackageIntegrity.complete}/${docxPackageIntegrity.required}, xlsxPackageIntegrity=${xlsxPackageIntegrity.complete}/${xlsxPackageIntegrity.required}, xlsxPrintVisual=${xlsxPrintVisual.complete}/${xlsxPrintVisual.required}, xlsxContentSeal=${xlsxDualSeal.contentComplete}/${xlsxDualSeal.contentRequired}, xlsxApprovalSeal=${xlsxDualSeal.approvalComplete}/${xlsxDualSeal.approvalRequired}, formalResultReconciliation=${formalResultReconciliation.complete}/${formalResultReconciliation.required}, formalHtmlContentSeal=${formalHtmlContentSeal.complete}/${formalHtmlContentSeal.required}, formalHtmlApprovalSeal=${formalHtmlApprovalSeal.complete}/${formalHtmlApprovalSeal.required}, steelHtmlContentSeal=${steelHtmlContentSeal.complete}/${steelHtmlContentSeal.required}, steelHtmlApprovalSeal=${steelHtmlApprovalSeal.complete}/${steelHtmlApprovalSeal.required}, anchorHtmlContentSeal=${anchorHtmlContentSeal.complete}/${anchorHtmlContentSeal.required}, anchorHtmlApprovalSeal=${anchorHtmlApprovalSeal.complete}/${anchorHtmlApprovalSeal.required}, localQuickResultReconciliation=${localQuickResultReconciliation.complete}/${localQuickResultReconciliation.required}, rcResultReconciliation=${rcResultReconciliation.complete}/${rcResultReconciliation.required}, rcSourceReportPackage=${rcSourceReportPackage.complete}/${rcSourceReportPackage.required}, rcStandaloneFormalHtmlPrint=${rcStandaloneFormalHtmlPrint.complete}/${rcStandaloneFormalHtmlPrint.required}, rcFormalHtmlContentSeal=${rcFormalHtmlContentSeal.complete}/${rcFormalHtmlContentSeal.required}, rcFormalHtmlApprovalSeal=${rcFormalHtmlApprovalSeal.complete}/${rcFormalHtmlApprovalSeal.required}, steelResultReconciliation=${steelResultReconciliation.complete}/${steelResultReconciliation.required}, stoneResultReconciliation=${stoneResultReconciliation.complete}/${stoneResultReconciliation.required}, anchorResultReconciliation=${anchorResultReconciliation.complete}/${anchorResultReconciliation.required}, deckingResultReconciliation=${deckingResultReconciliation.complete}/${deckingResultReconciliation.required}, excavationResultReconciliation=${excavationResultReconciliation.complete}/${excavationResultReconciliation.required}, summary=${aggregatePath})`);
