'use strict';
// 真瀏覽器、九份來源 JSON/核可 HTML/PDF 證據鏈；委由共用重型測試席執行。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = __dirname;
const keys = ['steel-main-plate', 'steel-main-shear-tab', 'steel-main-column-splice', 'steel-main-gusset', 'steel-main-moment', 'steel-main-tension', 'steel-standalone-plate', 'steel-beam-formal', 'steel-column-formal'];
const fixedFiles = ['結構工具箱/core/ui/report.js', '鋼構工具/core/ui/report.js', '鋼構工具/app.js', '鋼構工具/core/ui/report-utils.js', '鋼構工具/calculator.js', '鋼構工具/steel-beam-formal.js', '鋼構工具/steel-column-formal.js'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  if (process.argv.includes('--list')) { console.log(keys.join('\n')); return; }
  const runnerSource = fs.readFileSync(path.join(root, '鋼構工具/steel-audit-browser-runner.js'), 'utf8');
  assert.match(runnerSource, /for \(const scenario of activeScenarios\)/, '定向案例選擇必須接到實際迴圈');
  assert.match(runnerSource, /for \(const viewport of activeViewports\)/);
  assert.equal((runnerSource.match(/^      internalHtml,\r?$/gm) || []).length, 2, '兩種既有報告都須保留真實未核可 HTML');
  assert.match(runnerSource, /const packageContract = verifySteelReportPackage/);
  const start = Date.now(), run = new Date(start).toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8);
  const output = path.join(root, 'output/playwright/steel-report-presentation', run);
  fs.mkdirSync(output, { recursive: true });
  const fixed = fixedFiles.map(file => ({ file, sha256: hash(fs.readFileSync(path.join(root, file))) }));
  const summary = { run, startedAt: new Date(start).toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    fixed, keys, browserExecuted: false, failures: [], scope: '9 actual source replay/report/seal/PDF/package chains; 2 ineligible presets; 4 direct-print boundaries; no Word or physical-device test' };
  const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  let server;
  try {
    server = spawn(process.execPath, [path.join(root, 'serve-local.js'), '--no-open'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const serverLog = fs.createWriteStream(path.join(output, 'server.log'));
    let serverText = '';
    server.stdout.on('data', bytes => { serverText += bytes; serverLog.write(bytes); });
    server.stderr.on('data', bytes => serverLog.write(bytes));
    server.once('close', () => serverLog.end());
    const base = await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        const match = serverText.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearInterval(timer); resolve(match[1]); }
        else if (server.exitCode !== null || Date.now() - start > 20000) { clearInterval(timer); reject(Error('測試服務啟動失敗')); }
      }, 100);
      server.once('error', error => { clearInterval(timer); reject(error); });
    });
    const runnerOutput = path.join(output, 'runner');
    fs.mkdirSync(runnerOutput);
    const runner = spawn(process.execPath, [path.join(root, '鋼構工具/steel-audit-browser-runner.js'), '--base-url', base + '/鋼構工具',
      '--output-dir', runnerOutput, '--history-dir', runnerOutput, '--summary-json', path.join(runnerOutput, 'summary.json'), '--report-presentation-only', '--quiet'],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = fs.createWriteStream(path.join(output, 'stdout.log')), stderr = fs.createWriteStream(path.join(output, 'stderr.log'));
    runner.stdout.pipe(stdout); runner.stderr.pipe(stderr);
    summary.browserExecuted = true; save();
    summary.runnerExit = await new Promise((resolve, reject) => { runner.once('error', reject); runner.once('close', resolve); });
    assert.equal(summary.runnerExit, 0, '既有鋼構真瀏覽器 runner 必須完整通過；檢查 stderr.log/runner/summary.json');
    const evidenceDir = path.join(root, 'output/rendered-delivery-evidence/steel-formal');
    const evidence = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'rendered-delivery-evidence-summary.json'), 'utf8'));
    assert.ok(Date.parse(evidence.generatedAt) >= start, '不得用前次證據當本次通過');
    assert.deepEqual(evidence.expected, keys); assert.deepEqual(evidence.complete, keys);
    assert.equal(evidence.records.length, 9);
    const reportsDir = path.join(output, 'reports'); fs.mkdirSync(reportsDir);
    for (const record of evidence.records) {
      assert.equal(record.resultReconciliation.pass, true, record.key);
      assert.equal(record.packageContract.passed, true, record.key);
      assert.equal(record.packageContract.records.length, 6);
      assert.equal(record.packageContract.records.filter(item => item.ready).length, 1);
      assert.equal(record.contentSealStatus, 'verified'); assert.equal(record.approvalSealStatus, 'verified');
      assert.equal(record.contentTamperDetectionStatus, 'failed'); assert.equal(record.approvalTamperDetectionStatus, 'failed');
      const sourceBytes = fs.readFileSync(path.join(evidenceDir, record.sourceArtifact));
      assert.equal(hash(sourceBytes), record.sourceArtifactSha256);
      const source = JSON.parse(sourceBytes);
      assert.equal(source.calculationFingerprint, record.calculationFingerprint);
      assert.equal(hash(JSON.stringify(source)), record.resultReconciliation.sourcePayloadSha256);
      for (const file of [record.sourceArtifact, record.htmlArtifact, record.artifact, record.evidence]) fs.copyFileSync(path.join(evidenceDir, file), path.join(reportsDir, file));
    }
    fs.writeFileSync(path.join(reportsDir, 'evidence-summary.json'), JSON.stringify(evidence, null, 2));
    summary.verifiedChains = evidence.records.map(record => ({ key: record.key, fingerprint: record.calculationFingerprint, packageContract: record.packageContract }));
    for (const item of fixed) assert.equal(hash(fs.readFileSync(path.join(root, item.file))), item.sha256, '測試途中來源變更：' + item.file);
  } catch (error) { summary.failures.push(String(error.stack || error)); process.exitCode = 1; }
  finally { if (server && server.exitCode === null) server.kill(); summary.finishedAt = new Date().toISOString(); summary.elapsedMs = Date.now() - start; save(); console.log(JSON.stringify({ output, failures: summary.failures, verifiedChains: summary.verifiedChains?.length || 0 })); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
