const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { validatePdfFile } = require('./rendered-delivery-evidence');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');
const repoRoot = path.resolve(toolboxRoot, '..');
const inventoryPath = path.join(toolsRoot, 'rendered-delivery-evidence.inventory.json');
const homePath = path.join(toolboxRoot, 'assets', 'home', 'home.js');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const homeSource = fs.readFileSync(homePath, 'utf8');

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
