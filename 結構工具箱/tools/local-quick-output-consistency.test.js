const fs = require('fs');
const path = require('path');
const assert = require('assert');

const toolsRoot = __dirname;
const toolboxRoot = path.resolve(toolsRoot, '..');

function toolboxFile(relativePath) {
  return path.join(toolboxRoot, ...relativePath.split('/'));
}

function readText(relativePath) {
  return fs.readFileSync(toolboxFile(relativePath), 'utf8');
}

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} missing: ${needle}`);
}

function getByPath(value, parts) {
  return parts.reduce((current, part) => current && current[part], value);
}

function assertNonFiniteNumbersSerialized(source, serialized, label, parts = []) {
  let count = 0;
  if (typeof source === 'number') {
    if (!Number.isFinite(source)) {
      assert.equal(getByPath(serialized, parts), String(source), `${label} non-finite value at ${parts.join('.')}`);
      return 1;
    }
    return 0;
  }
  if (!source || typeof source !== 'object') return 0;
  for (const [key, value] of Object.entries(source)) {
    count += assertNonFiniteNumbersSerialized(value, serialized, label, parts.concat(key));
  }
  return count;
}

const manifest = JSON.parse(readText('tools/local-quick-tools.manifest.json'));
const Exporter = require(toolboxFile(manifest.shared.exportHelper));

assert.equal(manifest.family, 'local-quick-tools', 'manifest family');
assert.equal(manifest.shared.outputConsistencyTest, 'tools/local-quick-output-consistency.test.js', 'manifest output consistency test path');

let nonFiniteCount = 0;

for (const tool of manifest.tools) {
  assert.match(tool.pageVersion, /^V0\.\d+$/, `${tool.key} page version`);

  const html = readText(tool.html);
  const core = require(toolboxFile(tool.core));
  const goldenCases = require(toolboxFile(tool.golden));

  assertIncludes(html, `id: '${tool.key}'`, `${tool.key} JSON export tool id`);
  assertIncludes(html, `name: '${tool.label}'`, `${tool.key} JSON export tool name`);
  assertIncludes(html, `pageVersion: '${tool.pageVersion}'`, `${tool.key} JSON export page version`);
  if (tool.key === 'foundation-local') {
    // 正式化：兩段式計算書（詳算式 計算內容 / 簡易結果 設計條件）+ 計算示意圖
    assertIncludes(html, '<h2>計算內容</h2>', `${tool.key} detailed report content section`);
    assertIncludes(html, '<h2>設計條件</h2>', `${tool.key} summary report condition section`);
    assertIncludes(html, '<h2>計算示意圖</h2>', `${tool.key} report diagram section`);
    assert.equal(html.includes('<h2>工具與責任邊界</h2>'), false, `${tool.key} report removes boundary heading`);
    assert.equal(html.includes("['適用範圍'"), false, `${tool.key} report removes fit row`);
    assert.equal(html.includes("['不適用範圍'"), false, `${tool.key} report removes limit row`);
  } else if (tool.key === 'earth-pressure') {
    assertIncludes(html, '<h2>計算依據</h2>', `${tool.key} concise report basis section`);
    assert.equal(html.includes('<h2>工具與責任邊界</h2>'), false, `${tool.key} concise report removes boundary heading`);
    assert.equal(html.includes("['適用範圍'"), false, `${tool.key} concise report removes fit row`);
    assert.equal(html.includes("['不適用範圍'"), false, `${tool.key} concise report removes limit row`);
  } else {
    assertIncludes(html, 'const prov = r.provenance || (Core.provenance ? Core.provenance() : {})', `${tool.key} report provenance source`);
    assertIncludes(html, '輸入格式', `${tool.key} report input schema row`);
    assertIncludes(html, '計算指紋', `${tool.key} report logic signature row`);
  }

  const apiProvenance = core.provenance();
  assert.equal(apiProvenance.core, tool.coreGlobal, `${tool.key} provenance core`);
  assert.equal(apiProvenance.version, core.version, `${tool.key} provenance version`);
  assert.equal(apiProvenance.resultSchemaVersion, core.resultSchemaVersion, `${tool.key} provenance result schema`);

  for (const goldenCase of goldenCases) {
    const errors = core.validateInput(goldenCase.input);
    assert.deepEqual(errors, [], `${tool.key}/${goldenCase.id} golden input validates`);

    const result = core.calculate(goldenCase.input);
    const payload = Exporter.buildPayload({
      tool: {
        id: tool.key,
        name: tool.label,
        pageVersion: tool.pageVersion,
      },
      project: {
        name: '一致性測試',
        no: goldenCase.id,
        designer: 'local-quick-output-consistency',
      },
      generatedAt: '2026-05-20T00:00:00.000Z',
      result,
    });

    assert.equal(payload.tool.id, tool.key, `${tool.key}/${goldenCase.id} payload tool id`);
    assert.equal(payload.tool.name, tool.label, `${tool.key}/${goldenCase.id} payload tool name`);
    assert.equal(payload.tool.pageVersion, tool.pageVersion, `${tool.key}/${goldenCase.id} payload page version`);
    assert.equal(payload.generatedAt, '2026-05-20T00:00:00.000Z', `${tool.key}/${goldenCase.id} payload generatedAt`);
    assert.strictEqual(payload.result, result, `${tool.key}/${goldenCase.id} payload uses core result object`);
    assert.equal(result.resultSchemaVersion, core.resultSchemaVersion, `${tool.key}/${goldenCase.id} result schema`);
    assert.deepEqual(result.provenance, apiProvenance, `${tool.key}/${goldenCase.id} result provenance`);
    assert.equal(result.summary.status, result.overallOk ? 'pass' : 'fail', `${tool.key}/${goldenCase.id} summary status follows overallOk`);
    assert.equal(typeof result.summary.headline, 'string', `${tool.key}/${goldenCase.id} summary headline`);
    assert.ok(result.summary.headline.length > 0, `${tool.key}/${goldenCase.id} summary headline populated`);
    assert.ok(Array.isArray(result.summary.primaryMetrics), `${tool.key}/${goldenCase.id} summary metrics`);
    assert.ok(result.summary.primaryMetrics.length >= 3, `${tool.key}/${goldenCase.id} summary metrics count`);
    assert.ok(Array.isArray(result.checks), `${tool.key}/${goldenCase.id} checks`);
    assert.ok(result.checks.length >= 3, `${tool.key}/${goldenCase.id} checks count`);

    const serialized = JSON.stringify(payload, Exporter.jsonReplacer, 2);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.tool.id, tool.key, `${tool.key}/${goldenCase.id} serialized tool id`);
    assert.equal(parsed.tool.name, tool.label, `${tool.key}/${goldenCase.id} serialized tool name`);
    assert.equal(parsed.tool.pageVersion, tool.pageVersion, `${tool.key}/${goldenCase.id} serialized page version`);
    assert.equal(parsed.result.resultSchemaVersion, core.resultSchemaVersion, `${tool.key}/${goldenCase.id} serialized result schema`);
    assert.deepEqual(parsed.result.provenance, apiProvenance, `${tool.key}/${goldenCase.id} serialized provenance`);
    assert.equal(parsed.result.summary.status, result.summary.status, `${tool.key}/${goldenCase.id} serialized summary status`);
    assert.equal(parsed.result.summary.headline, result.summary.headline, `${tool.key}/${goldenCase.id} serialized summary headline`);
    assert.deepEqual(
      parsed.result.summary.primaryMetrics.map(metric => metric.key),
      result.summary.primaryMetrics.map(metric => metric.key),
      `${tool.key}/${goldenCase.id} serialized summary metric keys`
    );
    assert.deepEqual(
      parsed.result.checks.map(check => check.key),
      result.checks.map(check => check.key),
      `${tool.key}/${goldenCase.id} serialized check keys`
    );
    nonFiniteCount += assertNonFiniteNumbersSerialized(result, parsed.result, `${tool.key}/${goldenCase.id}`);
  }
}

assert.ok(nonFiniteCount >= 1, 'at least one golden result exercises non-finite JSON serialization');
console.log(`local quick output consistency OK (${manifest.tools.length} tools, ${nonFiniteCount} non-finite values)`);
