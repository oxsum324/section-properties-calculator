const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');

let failed = 0;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function assert(pass, label, detail = '') {
  if (!pass) {
    failed += 1;
    console.error(`FAIL | ${label} :: ${detail}`);
  } else {
    console.log(`PASS | ${label} | ${detail}`);
  }
}

function assertString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, label, value);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value) && value.length > 0, label, Array.isArray(value) ? `count=${value.length}` : typeof value);
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function isSelectorOnly(value) {
  return /^[#.][A-Za-z0-9_-]+$/.test(String(value || '').trim());
}

const contractRelativePath = '結構工具箱/tools/report-disclosure.contract.test.js';
const catalogs = [
  {
    family: 'formal-traceability',
    path: '結構工具箱/tools/formal-traceability.catalog.json',
    minTraces: 17,
  },
  {
    family: 'rc-traceability',
    path: '鋼筋混凝土/tools/rc-traceability.catalog.json',
    minTraces: 26,
  },
  {
    family: 'steel-traceability',
    path: '鋼構工具/steel-traceability.catalog.json',
    minTraces: 11,
  },
  {
    family: 'anchor-traceability',
    path: '螺栓檢討/bolt-review-tool/src/anchor-traceability.catalog.json',
    minTraces: 12,
  },
  {
    family: 'stone-traceability',
    path: '石材固定/stone-traceability.catalog.json',
    minTraces: 8,
  },
  {
    family: 'decking-traceability',
    path: '覆工板/decking-traceability.catalog.json',
    minTraces: 8,
  },
  {
    family: 'excavation-traceability',
    path: '開挖擋土支撐/excavation-traceability.catalog.json',
    minTraces: 10,
  },
];

const sourcePattern = /規範|條文|章|節|表|圖|式|ACI|AISC|CNS|JASS|ETA|ICC|AASHTO|ASD|LRFD|設計依據|公式來源|專案文件|風洞|地工報告|分析模型|評估報告|工程判讀|治理|schema|流程|工作流|設計假設|邊界|資料來源/;
const manualPattern = /人工複核|人工確認|人工判斷|設計者|審查者|使用者|專案負責人|施工圖|專案文件|模型|圖說|正式手算|外部分析|地工報告|試樁|材料資料|產品文件|風洞|設備資料|確認|複核|控管|送審/;
const reportLandingPattern = /[\u4e00-\u9fff]|報告|計算書|檢核|摘要|表|圖|輸出|列印|PDF|DOCX|Word|JSON|下載|落點|結論|採用|控制|欄位|標籤|名稱|說明|路線|status|summary|matrix|report|latest|Cache-Control|Omega|DCR|OK|NG|KL|Fa|Fbx|Fby|SBE|HSS|SMRF|P-M/;
const boundaryPattern = /人工複核|人工確認|人工判斷|待確認|不列為 OK|不提供正式|初步|初篩|簡化|專案文件|施工圖|專案模型|圖說|地工報告|外部分析|風洞|評估報告|產品文件|正式手算|適用範圍|邊界|超出|另行|服務|下載|簽章|確認|複核|判讀|控管|責任/;
const forbiddenAuthorityWording = ['工具內建', '工具建議', '專業版'];

let totalTraces = 0;
let totalHumanReportEntries = 0;
const allTraceIds = new Set();

for (const catalogSpec of catalogs) {
  const catalog = readJson(repoFile(catalogSpec.path));
  assert(catalog.family === catalogSpec.family, `${catalogSpec.family} catalog family`, catalog.family);
  assert(Array.isArray(catalog.tools) && catalog.tools.length > 0, `${catalogSpec.family} tools populated`, `tools=${catalog.tools?.length || 0}`);

  let familyTraceCount = 0;
  const familyReportText = [];
  const familyManualText = [];
  const familyCombinedText = [];

  for (const tool of catalog.tools || []) {
    assertString(tool.key, `${catalogSpec.family} tool key`);
    assertString(tool.scope || tool.label, `${catalogSpec.family} ${tool.key} scope or label`);
    assert(Array.isArray(tool.traces) && tool.traces.length > 0, `${catalogSpec.family} ${tool.key} traces populated`, `traces=${tool.traces?.length || 0}`);

    for (const trace of tool.traces || []) {
      familyTraceCount += 1;
      totalTraces += 1;
      const traceLabel = `${catalogSpec.family}:${tool.key}:${trace.id || 'missing-id'}`;
      assertString(trace.id, `${traceLabel} id`);
      assert(!allTraceIds.has(`${catalogSpec.family}:${trace.id}`), `${traceLabel} unique family trace id`, trace.id);
      allTraceIds.add(`${catalogSpec.family}:${trace.id}`);
      assertString(trace.clause, `${traceLabel} clause`);
      assert(sourcePattern.test(trace.clause), `${traceLabel} clause names source basis`, trace.clause);
      assertString(trace.purpose, `${traceLabel} purpose`);
      assertStringArray(trace.report, `${traceLabel} report`);
      assertStringArray(trace.manualReview, `${traceLabel} manualReview`);

      const reportText = (trace.report || []).join(' / ');
      const manualText = (trace.manualReview || []).join(' / ');
      const combinedText = [trace.clause, trace.purpose, reportText, manualText].join(' / ');
      const humanReportEntries = (trace.report || []).filter(item => !isSelectorOnly(item));
      totalHumanReportEntries += humanReportEntries.length;

      assert(humanReportEntries.length > 0, `${traceLabel} report has human-readable landing`, reportText);
      assert(reportLandingPattern.test(reportText), `${traceLabel} report names output landing`, reportText);
      assert(manualPattern.test(manualText), `${traceLabel} manual review ownership`, manualText);
      assert(boundaryPattern.test(combinedText), `${traceLabel} disclosure boundary`, combinedText);
      for (const forbidden of forbiddenAuthorityWording) {
        assert(!combinedText.includes(forbidden), `${traceLabel} avoids tool-authority wording`, forbidden);
      }

      familyReportText.push(reportText);
      familyManualText.push(manualText);
      familyCombinedText.push(combinedText);
    }
  }

  assert(familyTraceCount >= catalogSpec.minTraces, `${catalogSpec.family} trace volume`, `traces=${familyTraceCount}`);
  assert(reportLandingPattern.test(familyReportText.join(' / ')), `${catalogSpec.family} report disclosure aggregate`, catalogSpec.path);
  assert(manualPattern.test(familyManualText.join(' / ')), `${catalogSpec.family} manual review aggregate`, catalogSpec.path);
  assert(boundaryPattern.test(familyCombinedText.join(' / ')), `${catalogSpec.family} boundary disclosure aggregate`, catalogSpec.path);
}

assert(totalTraces >= 92, 'cross-family report disclosure trace volume', `traces=${totalTraces}`);
assert(totalHumanReportEntries >= totalTraces, 'cross-family human report landing volume', `humanReportEntries=${totalHumanReportEntries}`);

const preflight = readText(repoFile('preflight-tools.ps1'));
[
  'report-disclosure-contract',
  'node 結構工具箱/tools/report-disclosure.contract.test.js',
  'Cross-family report disclosure contract',
].forEach(needle => assert(preflight.includes(needle), 'platform preflight runs report disclosure contract', needle));

const readme = readText(repoFile('README.md'));
const boundaries = readText(repoFile('TOOL_BOUNDARIES.md'));
const staging = readText(repoFile('STAGING_GROUPS.md'));
const reportGuide = readText(repoFile('TOOL_REPORT_GUIDE.md'));

[
  readme,
  boundaries,
  staging,
  reportGuide,
].forEach((docText, index) => {
  const label = ['README', 'TOOL_BOUNDARIES', 'STAGING_GROUPS', 'TOOL_REPORT_GUIDE'][index];
  assert(docText.includes(contractRelativePath), `${label} documents report disclosure contract`, contractRelativePath);
  assert(docText.includes('report-disclosure-contract'), `${label} documents report disclosure preflight key`, 'report-disclosure-contract');
});

assert(reportGuide.includes('規範判定') && reportGuide.includes('初估 / 簡化') && reportGuide.includes('人工複核'), 'TOOL_REPORT_GUIDE keeps report disclosure vocabulary', '規範判定 / 初估 / 簡化 / 人工複核');

if (failed) {
  console.error(`\n${failed} report disclosure contract checks failed.`);
  process.exit(1);
}

console.log(`\nAll report disclosure contract checks passed (${totalTraces} traces).`);
