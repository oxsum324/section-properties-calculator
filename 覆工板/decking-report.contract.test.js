const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const toolRoot = __dirname;
const repoRoot = path.resolve(toolRoot, '..');

function assert(pass, title, detail) {
  if (!pass) throw new Error(`${title} :: ${detail}`);
  console.log(`PASS | ${title} | ${detail}`);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPrintHidesSelectors(text, selectors, label) {
  selectors.forEach((selector) => {
    const pattern = new RegExp(`@media\\s+print[\\s\\S]*${escapeRegex(selector)}[\\s\\S]*display:\\s*none\\s*!important`);
    assert(pattern.test(text), `${label} print hides ${selector}`, selector);
  });
}

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(toolRoot, relativePath), 'utf8');
}

function runPython(args, title, options = {}) {
  const result = spawnSync('python', args, {
    cwd: options.cwd || toolRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      ...options.env,
    },
  });
  const detail = (result.stderr || result.stdout || `exit=${result.status}`).trim();
  assert(result.status === 0, title, detail);
  return result.stdout || '';
}

function readDocxPayload(docxPath) {
  const script = `
import sys, json, zipfile, re
with zipfile.ZipFile(sys.argv[1]) as z:
    data = z.read('word/document.xml').decode('utf-8')
    names = z.namelist()
text = re.sub(r'<[^>]+>', '', data)
print(json.dumps({
    "xml": data,
    "text": text,
    "paragraphCount": len(re.findall(r'<w:p(?:\\s|>)', data)),
    "tableCount": len(re.findall(r'<w:tbl(?:\\s|>)', data)),
    "sectionCount": len(re.findall(r'[一二三四五六七八九十]+、', text)),
    "imageCount": len([n for n in names if n.startswith('word/media/')]),
}, ensure_ascii=False))
`;
  const stdout = runPython(['-c', script, docxPath], 'decking report document.xml extraction');
  return JSON.parse(stdout);
}

const fixturePath = path.join(toolRoot, 'test-fixtures', 'report-smoke.json');
const releaseEvidenceDir = process.env.DECKING_RENDERED_EVIDENCE_DIR
  ? path.resolve(process.env.DECKING_RENDERED_EVIDENCE_DIR)
  : process.env.PREFLIGHT_RELEASE === '1' && process.env.PREFLIGHT_RUN_DIR
    ? path.join(path.resolve(process.env.PREFLIGHT_RUN_DIR), 'rendered-delivery-evidence', 'decking-formal')
    : '';
const outDir = releaseEvidenceDir || path.join(repoRoot, 'output', 'preflight');
const outFileName = releaseEvidenceDir ? 'decking-report.docx' : 'cover-slab-report-contract.docx';
const outPath = path.join(outDir, outFileName);
const html = readUtf8('index.html');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const pageOnlyReportStatusNeedles = [
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
];

assert(fs.existsSync(fixturePath), 'decking report fixture exists', 'test-fixtures/report-smoke.json');
assert(html.includes('id="report-readiness"'), 'decking report readiness outlet exists', 'report-readiness');
assert(html.includes('function reportReadinessModel'), 'decking report readiness model exists', 'reportReadinessModel');
assert(html.includes('page-only-report-status'), 'decking report readiness uses page-only boundary class', 'page-only-report-status');
assert(html.includes('產報前檢查'), 'decking report readiness copy exists', '產報前檢查');
assert(html.includes('優先閱讀'), 'decking report readiness priority copy exists', '優先閱讀');
assert(html.includes('此面板僅供公司內部整理計算附件前檢查，不會寫入計算書或列印 PDF。'), 'decking report readiness boundary note exists', 'page-only note');
assertPrintHidesSelectors(html, ['.page-only-report-status'], 'decking report readiness');

runPython(['-m', 'py_compile', 'dump_xls.py', path.join('report', 'gen_report.py')], 'decking report python compile');

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

runPython(
  [path.join('report', 'gen_report.py'), fixturePath, outPath],
  'decking report generation',
  { env: { COVER_SLAB_NO_OPEN: '1' } }
);

assert(fs.existsSync(outPath), 'decking report output exists', outPath);
assert(fs.statSync(outPath).size > 0, 'decking report output is non-empty', String(fs.statSync(outPath).size));

const docxPayload = readDocxPayload(outPath);
assert(docxPayload.text.length > 2500, 'decking docx has substantial report text', `${docxPayload.text.length} chars`);
assert(docxPayload.paragraphCount >= 60, 'decking docx paragraph structure is populated', `${docxPayload.paragraphCount} paragraphs`);
assert(docxPayload.tableCount >= 6, 'decking docx table structure is populated', `${docxPayload.tableCount} tables`);
assert(docxPayload.sectionCount >= 8, 'decking docx keeps expected section structure', `${docxPayload.sectionCount} sections`);
assert(docxPayload.xml.includes('覆工板系統結構計算書'), 'decking docx keeps report title in XML', '覆工板系統結構計算書');
assert(docxPayload.text.includes('覆工板系統結構計算書'), 'decking docx report title', '覆工板系統結構計算書');
assert(docxPayload.text.includes('一、計算結果總表'), 'decking docx summary section', '一、計算結果總表');
assert(docxPayload.text.includes('九、結論與建議'), 'decking docx conclusion section', '九、結論與建議');
assert(docxPayload.text.includes(fixture.project.name), 'decking docx project name', fixture.project.name);
assert(docxPayload.text.includes(fixture.project.no), 'decking docx project number', fixture.project.no);
assert(docxPayload.text.includes(fixture.project.date), 'decking docx project date', fixture.project.date);
assert(docxPayload.text.includes('部分項目不通過'), 'decking docx keeps live NG conclusion', '部分項目不通過');
assert(!docxPayload.text.includes('（未填）'), 'decking docx does not fall back to missing project placeholders for smoke fixture', '（未填）');

pageOnlyReportStatusNeedles.forEach((needle) => {
  assert(!docxPayload.xml.includes(needle), 'decking docx excludes page-only readiness wording from XML', needle);
  assert(!docxPayload.text.includes(needle), 'decking docx excludes page-only readiness wording from text', needle);
});

if (releaseEvidenceDir) {
  const summary = {
    schemaVersion: 1,
    family: 'decking-formal',
    generatedAt: new Date().toISOString(),
    required: 1,
    complete: ['decking-report'],
    pass: true,
    records: [{
      key: 'decking-report',
      document: outFileName,
      documentBytes: fs.statSync(outPath).size,
      documentXmlBytes: Buffer.byteLength(docxPayload.xml, 'utf8'),
      documentTextLength: docxPayload.text.length,
      paragraphCount: docxPayload.paragraphCount,
      tableCount: docxPayload.tableCount,
      sectionCount: docxPayload.sectionCount,
      imageCount: docxPayload.imageCount,
      projectName: fixture.project.name,
    }],
  };
  fs.writeFileSync(
    path.join(releaseEvidenceDir, 'rendered-delivery-evidence-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
}

console.log('\nDecking report contract checks passed.');
