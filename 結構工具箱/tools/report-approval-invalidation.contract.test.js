const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const toolsDir = __dirname;
const repoRoot = path.resolve(toolsDir, '..', '..');
const catalogPath = path.join(toolsDir, 'report-approval-invalidation.catalog.json');

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function read(relativePath) {
  return fs.readFileSync(repoFile(relativePath), 'utf8');
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label}: missing ${needle}`);
}

function extractFunction(source, name) {
  const signature = `function ${name}(`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing function ${name}`);
  const braceStart = source.indexOf('{', start);
  assert.ok(braceStart >= 0, `missing body for ${name}`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || '';
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function effectBlock(source, anchor, dependency) {
  const anchorIndex = source.indexOf(anchor);
  assert.ok(anchorIndex >= 0, `missing effect anchor: ${anchor}`);
  const start = source.indexOf('useEffect(() => {', anchorIndex);
  const endMarker = `}, [${dependency}])`;
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing ${dependency} invalidation effect`);
  return source.slice(start, end + endMarker.length);
}

function runStoneDynamicProof(source, controlId) {
  const approval = {
    id: controlId,
    checked: true,
    dataset: { approvedAt: '2026-08-15T12:00:00.000Z' },
  };
  const context = {
    document: {
      getElementById(id) {
        return id === controlId ? approval : null;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${extractFunction(source, 'v2AttachmentApprovalNode')}\n${extractFunction(source, 'v2ResetAttachmentApproval')}\nthis.resetApproval = v2ResetAttachmentApproval;`,
    context,
  );
  context.resetApproval();
  assert.equal(approval.checked, false, 'stone input mutation revokes approval');
  assert.equal(approval.dataset.approvedAt, '', 'stone input mutation clears approval time');
}

function runDeckingDynamicProof(source, controlId) {
  function field(id) {
    return {
      id,
      checked: false,
      dataset: {},
      handlers: {},
      addEventListener(type, handler) {
        this.handlers[type] = handler;
      },
    };
  }
  const approval = field(controlId);
  const input = field('d_B');
  let recalculationCount = 0;
  const context = {
    document: {
      querySelectorAll() {
        return [approval, input];
      },
      getElementById(id) {
        return id === controlId ? approval : null;
      },
    },
    recalcAll() {
      recalculationCount += 1;
    },
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(source, 'bindAll')}\nthis.bindApprovalInvalidation = bindAll;`, context);
  context.bindApprovalInvalidation();

  approval.checked = true;
  approval.dataset.approvedAt = '2026/08/15 12:00:00';
  input.handlers.input();
  assert.equal(approval.checked, false, 'decking input mutation revokes approval');
  assert.equal('approvedAt' in approval.dataset, false, 'decking input mutation clears approval time');
  assert.equal(recalculationCount, 1, 'decking input mutation still recalculates');

  approval.checked = true;
  approval.dataset.approvedAt = '2026/08/15 12:01:00';
  approval.handlers.change();
  assert.equal(approval.checked, true, 'decking approval control does not revoke itself');
  assert.equal(approval.dataset.approvedAt, '2026/08/15 12:01:00', 'decking approval control keeps approval time');
  assert.equal(recalculationCount, 2, 'decking approval change keeps the normal recalculation path');
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
assert.equal(catalog.schemaVersion, 1, 'catalog schema version');
assert.equal(catalog.kind, 'report-approval-invalidation-catalog', 'catalog kind');
assert.equal(catalog.policy.defaultDocumentState, '內部審閱', 'default document state');
assert.equal(catalog.policy.approvedDocumentState, '正式附件', 'approved document state');
[
  'approvalControlMustBeExplicit',
  'reportRelevantMutationMustRevokeApproval',
  'approvalTimestampMustBeCleared',
  'staleGeneratedArtifactsMustBeClearedWhenPresent',
  'volatileSaveMetadataMustNotRevokeApproval',
].forEach(key => assert.equal(catalog.policy[key], true, `policy ${key}`));

const expectedKeys = ['anchor-review', 'decking', 'excavation-support', 'stone-fixing'];
assert.deepEqual(
  catalog.tools.map(tool => tool.key).sort(),
  expectedKeys,
  'catalog covers every independent report producer',
);
assert.equal(new Set(catalog.tools.map(tool => tool.key)).size, catalog.tools.length, 'tool keys are unique');

for (const tool of catalog.tools) {
  assert.ok(tool.label, `${tool.key} label`);
  assert.ok(tool.strategy, `${tool.key} strategy`);
  assert.ok(tool.dynamicProof, `${tool.key} dynamic proof`);
  assert.ok(Array.isArray(tool.requiredNeedles) && tool.requiredNeedles.length >= 4, `${tool.key} required needles`);
  const sourcePath = repoFile(tool.source);
  assert.ok(fs.existsSync(sourcePath), `${tool.key} source exists: ${tool.source}`);
  const source = fs.readFileSync(sourcePath, 'utf8');
  tool.requiredNeedles.forEach(needle => assertIncludes(source, needle, tool.key));
  for (const proofFile of tool.proofFiles || []) {
    assert.ok(fs.existsSync(repoFile(proofFile)), `${tool.key} proof exists: ${proofFile}`);
  }

  if (tool.dynamicProof === 'source-reset-function') {
    runStoneDynamicProof(source, tool.approvalControlId);
  } else if (tool.dynamicProof === 'source-bound-listener') {
    runDeckingDynamicProof(source, tool.approvalControlId);
  } else if (tool.dynamicProof === 'unit-key-plus-react-effect') {
    const keySource = read(tool.proofFiles[0]);
    const testSource = read(tool.proofFiles[1]);
    ['delete approvedArtifactState.auditTrail', 'delete approvedArtifactState.snapshot', 'delete approvedArtifactState.updatedAt']
      .forEach(needle => assertIncludes(keySource, needle, `${tool.key} volatile metadata exclusion`));
    ['revokes approval when report artifact field %s changes', 'revokes approval when calculation inputs change']
      .forEach(needle => assertIncludes(testSource, needle, `${tool.key} dynamic key test`));
    const block = effectBlock(source, 'const approvalCalculationKeyRef = useRef(approvalCalculationKey)', 'approvalCalculationKey');
    assertIncludes(block, "setDocumentApproval({ approved: false, approvedAt: '' })", `${tool.key} effect`);
  } else if (tool.dynamicProof === 'artifact-key-plus-react-effect') {
    const block = effectBlock(source, 'const reportApprovalArtifactKeyRef = useRef(reportApprovalArtifactKey);', 'reportApprovalArtifactKey');
    [
      'setReportApproved(false);',
      'setReportUrl("");',
      'setPdfEvidenceUrl("");',
      'setPdfSourceBundleUrl("");',
      'setWordReportUrl("");',
      'setGeneratedPdfDocumentStatus(null);',
      'setGeneratedWordDocumentStatus(null);',
    ].forEach(needle => assertIncludes(block, needle, `${tool.key} effect`));
    const proofSource = read(tool.proofFiles[0]);
    ['revokes formal approval after report-content changes', 'clears stale Word link after report-content changes', 'basic-parameter edits invalidate calculation results']
      .forEach(needle => assertIncludes(proofSource, needle, `${tool.key} dedicated contract`));
  } else {
    assert.fail(`${tool.key} has unsupported dynamic proof ${tool.dynamicProof}`);
  }
  console.log(`PASS | ${tool.key} | ${tool.strategy} | ${tool.dynamicProof}`);
}

const preflight = read('preflight-tools.ps1');
assertIncludes(
  preflight,
  'node 結構工具箱/tools/report-approval-invalidation.contract.test.js',
  'shared preflight wiring',
);
assertIncludes(preflight, 'key = "report-disclosure-contract"', 'shared preflight key');
assertIncludes(preflight, 'key = "anchor-verify"', 'anchor dynamic unit-test gate');
assertIncludes(preflight, 'key = "excavation-report-contract"', 'excavation dedicated report gate');

console.log(`report approval invalidation contract OK (${catalog.tools.length}/${catalog.tools.length} independent report producers)`);
