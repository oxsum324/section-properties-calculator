'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Worker = require('./attachment-package-manager-worker.js');

const toolsDir = __dirname;
const repoRoot = path.resolve(toolsDir, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

const fakeReport = {
  status: 'ready',
  summary: { attachments: 2, errors: 0, warnings: 0 },
  attachments: [
    {
      file: '正式計算書.pdf', type: 'pdf', sourceTool: '測試工具', toolVersion: 'v1.0',
      projectNo: 'CASE-001',
      fingerprints: ['CF-0011223344556677'], readyDocumentNeedles: ['文件狀態：正式附件'],
      draftDocumentNeedles: [], errors: [], contentBoundary: { missingGroups: [] },
    },
    {
      file: '來源.json', type: 'json', sourceTool: '測試工具', toolVersion: 'v1.0',
      projectNo: 'CASE-001',
      fingerprints: ['CF-0011223344556677'], readyDocumentNeedles: [], draftDocumentNeedles: [], errors: [],
    },
  ],
  fingerprintLinks: [{ fingerprint: 'CF-0011223344556677' }],
  issues: [],
};

const fakeChecker = {
  READY_DOCUMENT_CLASS_LABEL: '文件狀態：正式附件',
  CLI_ERROR_EXIT_CODE: 3,
  checkPackage() { return fakeReport; },
  formatSummary(report) { return `CHECK:${report.status}`; },
  exitCodeForStatus(status) { return { ready: 0, review: 1, blocked: 2 }[status] ?? 3; },
  isDocumentClassRequired(record) { return record.type !== 'json'; },
};
const fakeBuilder = {
  defaultOutputDir(input) { return `${input}-正式附件包-suggested`; },
  buildPackage() {
    return {
      status: 'ready', built: true, outputDir: 'C:\\case\\正式附件包',
      formalAttachmentCount: 1, traceabilitySourceCount: 1,
      packageFingerprint: 'PKG-00112233445566778899AABB', report: fakeReport,
      selfVerification: { summary: { htmlDualSealExpected: 1, htmlDualSealVerified: 1, evidenceChainExpected: 1, evidenceChainVerified: 1 } },
    };
  },
};
const fakeVerifier = {
  verifyPackage() {
    return {
      status: 'ready', packageFingerprint: 'PKG-00112233445566778899AABB',
      summary: { expectedFiles: 2, verifiedFiles: 2, htmlDualSealExpected: 1, htmlDualSealVerified: 1, evidenceChainExpected: 1, evidenceChainVerified: 1, errors: 0, warnings: 0 },
      records: [{
        packagedFile: '01_正式附件/正式計算書.html', role: 'formal', status: 'verified',
        htmlDualSeal: { family: 'anchor', contentStatus: 'verified', approvalStatus: 'verified' },
      }],
      issues: [],
    };
  },
  formatSummary(report) { return `VERIFY:${report.status}`; },
};
const dependencies = { Checker: fakeChecker, Builder: fakeBuilder, Verifier: fakeVerifier };

const check = Worker.runAction('check', { input: toolsDir }, dependencies);
assert.equal(check.status, 'ready');
assert.equal(check.canBuild, true);
assert.equal(check.records.length, 2);
assert.equal(check.records[0].state, '正式附件');
assert.equal(check.records[1].role, '內部追溯來源');
assert.equal(check.suggestedProjectNo, 'CASE-001');
assert.equal(check.suggestedOutputDir, '', 'ordinary source folders keep the established safe implicit output default');
assert.equal(check.displayText, 'CHECK:ready');
assert.equal(Worker.suggestedProjectNo({ attachments: [{ projectNo: '' }, {}] }), '', 'blank project metadata stays optional');
assert.equal(Worker.suggestedProjectNo({ attachments: [{ projectNo: 'A' }, { projectNo: 'B' }] }), '', 'conflicting project numbers are never guessed');

const build = Worker.runAction('build', { input: toolsDir, output: path.join(repoRoot, 'never-created') }, dependencies);
assert.equal(build.built, true);
assert.equal(build.packageFingerprint, 'PKG-00112233445566778899AABB');
assert.match(build.displayText, /發布前完整性與工程內容驗證：通過/);
assert.match(build.displayText, /HTML 雙封印複驗 1 \/ 1 份/);
assert.match(build.displayText, /開挖證據鏈複驗 1 \/ 1 組/);
assert.equal(build.counts.htmlDualSealVerified, 1);
assert.equal(build.counts.evidenceChainVerified, 1);

const verify = Worker.runAction('verify', { input: toolsDir }, dependencies);
assert.equal(verify.status, 'ready');
assert.equal(verify.records[0].result, 'verified｜錨栓雙封印已驗證');
assert.equal(verify.counts.htmlDualSealExpected, 1);
assert.equal(verify.counts.htmlDualSealVerified, 1);
assert.equal(verify.counts.evidenceChainExpected, 1);
assert.equal(verify.counts.evidenceChainVerified, 1);
assert.equal(verify.displayText, 'VERIFY:ready');

const smoke = Worker.runAction('smoke');
assert.equal(smoke.status, 'ready');
assert.equal(Worker.exitCodeForResponse(smoke), 0);
assert.throws(() => Worker.runAction('publish', { input: toolsDir }), /不支援的管理器動作/);
assert.throws(() => Worker.runAction('check', { input: '' }), /尚未選擇附件來源/);

const zipFixtureRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'attachment-manager-zip-test-'));
try {
  const zipSource = path.join(zipFixtureRoot, 'source');
  fs.mkdirSync(zipSource);
  const pdfName = '核可計算書.pdf';
  const evidenceName = '核可計算書.canonical-render.evidence.json';
  fs.writeFileSync(path.join(zipSource, pdfName), '%PDF-1.7\nfixture\n', 'utf8');
  fs.writeFileSync(path.join(zipSource, evidenceName), '{"kind":"fixture"}\n', 'utf8');
  const bundlePath = path.join(zipFixtureRoot, '核可計算書.formal-source.zip');
  const archive = childProcess.spawnSync('tar', ['-a', '-cf', bundlePath, '-C', zipSource, pdfName, evidenceName], { encoding: 'utf8' });
  assert.equal(archive.status, 0, archive.stderr || archive.stdout);

  let checkedTemp = '';
  const zipChecker = {
    ...fakeChecker,
    checkPackage(input) {
      checkedTemp = input;
      assert.equal(fs.readFileSync(path.join(input, pdfName), 'utf8'), '%PDF-1.7\nfixture\n');
      assert.equal(fs.readFileSync(path.join(input, evidenceName), 'utf8'), '{"kind":"fixture"}\n');
      assert.deepEqual(fs.readdirSync(input).sort(), [evidenceName, pdfName].sort());
      return fakeReport;
    },
  };
  const zipCheck = Worker.runAction('check', { input: bundlePath }, { ...dependencies, Checker: zipChecker });
  assert.equal(zipCheck.inputKind, 'formal-source-zip');
  assert.equal(zipCheck.suggestedOutputDir, path.join(zipFixtureRoot, '核可計算書-正式附件包-suggested'));
  assert.match(zipCheck.displayText, /隔離暫存區安全讀取/);
  assert.ok(checkedTemp && !fs.existsSync(checkedTemp), 'ZIP check always removes isolated temporary input');

  let builtTemp = '';
  let builtOptions;
  const zipBuilder = {
    defaultOutputDir(input) {
      assert.equal(input, path.join(zipFixtureRoot, '核可計算書'));
      return path.join(zipFixtureRoot, '核可計算書-正式附件包-test');
    },
    buildPackage(input, options) {
      builtTemp = input;
      builtOptions = options;
      assert.deepEqual(fs.readdirSync(input).sort(), [evidenceName, pdfName].sort());
      return fakeBuilder.buildPackage();
    },
  };
  const zipBuild = Worker.runAction('build', { input: bundlePath }, { ...dependencies, Checker: zipChecker, Builder: zipBuilder });
  assert.equal(zipBuild.built, true);
  assert.equal(builtOptions.output, path.join(zipFixtureRoot, '核可計算書-正式附件包-test'));
  assert.ok(builtTemp && !fs.existsSync(builtTemp), 'ZIP build always removes isolated temporary input');

  assert.throws(() => Worker.runAction('verify', { input: bundlePath }, dependencies), /必須選擇資料夾/);
  assert.throws(
    () => Worker.validateBundleEntries(bundlePath, ['../核可計算書.pdf', evidenceName]),
    /依序且只含根目錄兩檔/,
  );
  assert.throws(
    () => Worker.validateBundleEntries(bundlePath, [pdfName, evidenceName, '多餘.txt']),
    /依序且只含根目錄兩檔/,
  );
  const mismatchedBundle = path.join(zipFixtureRoot, '錯配名稱.formal-source.zip');
  fs.copyFileSync(bundlePath, mismatchedBundle);
  assert.throws(() => Worker.extractFormalSourceBundle(mismatchedBundle), /依序且只含根目錄兩檔/);
} finally {
  fs.rmSync(zipFixtureRoot, { recursive: true, force: true });
}

const cli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-package-manager-worker.js'), '--action', 'smoke'], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
const cliPayload = JSON.parse(cli.stdout);
assert.equal(cliPayload.status, 'ready');
assert.equal(cliPayload.counts.modules, 3);

const badCli = childProcess.spawnSync(process.execPath, [path.join(toolsDir, 'attachment-package-manager-worker.js'), '--action', 'unknown'], { encoding: 'utf8' });
assert.equal(badCli.status, 3);
assert.equal(JSON.parse(badCli.stdout).status, 'error');

const managerPs = read('結構工具箱/tools/attachment-package-manager.ps1');
[
  'System.Windows.Forms', 'FolderBrowserDialog', 'OpenFileDialog', 'attachment-package-manager-worker.js',
  "ValidateSet('smoke', 'check', 'build', 'verify')", '檢查附件來源', '建立正式附件包',
  '驗證附件包', '管理畫面與檢查結果僅供內部整理', 'workerExitCode',
  "[string]$InitialPath = ''", "[ValidateSet('source', 'verify')][string]$InitialMode = 'source'", '[switch]$AutoInspect',
  'PDF＋證據來源 ZIP', '*.formal-source.zip', '選擇來源 ZIP…',
].forEach(needle => assert.ok(managerPs.includes(needle), `PowerShell manager includes ${needle}`));
assert.ok(managerPs.charCodeAt(0) === 0xFEFF, 'PowerShell manager keeps UTF-8 BOM for Windows PowerShell 5.1');
assert.doesNotMatch(managerPs, /Invoke-WebRequest|HttpClient|https?:\/\//i, 'manager stays local and does not send case data over network');
assert.match(managerPs, /\$previousOutputEncoding = \[Console\]::OutputEncoding[\s\S]*?UTF8Encoding\(\$false\)[\s\S]*?finally \{\s*\[Console\]::OutputEncoding = \$previousOutputEncoding/, 'manager decodes Node JSON as UTF-8 and restores the prior console encoding');
assert.match(
  managerPs,
  /\$script:BtnCheck\.Add_Click\(\{\s+\$script:LastReadyInput = ''\s+\$script:LastReadyProjectNo = ''/s,
  'every new check clears the prior ready grant before the worker runs',
);
assert.match(
  managerPs,
  /if \(-not \$script:ProjectNo\.Text\.Trim\(\) -and \$suggestedProjectNo\)[\s\S]*?\$script:ProjectNo\.Text = \$suggestedProjectNo[\s\S]*?建立前仍會再次完整檢查/,
  'manager only fills a unique detected project number into an empty field and discloses the rebuild check',
);
assert.doesNotMatch(
  managerPs,
  /if \(\$suggestedProjectNo\)\s*\{\s*\$script:ProjectNo\.Text =/,
  'manager never overwrites a project number already entered by the user',
);
const sourceCheckHandler = managerPs.match(/\$script:BtnCheck\.Add_Click\(\{[\s\S]*?(?=\n\}\)\n\n\$script:BtnBuild\.Add_Click)/)?.[0] || '';
assert.match(
  sourceCheckHandler,
  /\$script:ProjectNo\.Text = \$suggestedProjectNo[\s\S]*?\$response\.status -eq 'ready'[\s\S]*?\$script:LastReadyInput = \$script:SourcePath\.Text\.Trim\(\)[\s\S]*?\$script:LastReadyProjectNo = \$script:ProjectNo\.Text\.Trim\(\)[\s\S]*?\$script:BtnBuild\.Enabled = \$true/,
  'the build grant is recreated only after the suggested value is applied and is bound to that current value',
);
assert.match(
  sourceCheckHandler,
  /\$response\.status -eq 'ready'[\s\S]*?if \(-not \$script:OutputPath\.Text\.Trim\(\) -and \$suggestedOutputDir\)[\s\S]*?\$script:LastSuggestedOutput = \$suggestedOutputDir[\s\S]*?\$script:OutputPath\.Text = \$suggestedOutputDir[\s\S]*?尚未建立任何資料夾/,
  'a ready source ZIP fills only an empty output field and clearly remains a non-writing plan',
);
assert.match(
  managerPs,
  /\$sourceChanged = \{[\s\S]*?LastSuggestedOutput[\s\S]*?OutputPath\.Text\.Trim\(\) -eq \$script:LastSuggestedOutput[\s\S]*?LastSuggestedOutput = ''[\s\S]*?OutputPath\.Clear\(\)/,
  'changing source clears a stale automatic output suggestion only when the field still matches it',
);
assert.match(
  managerPs,
  /\$outputChanged = \{[\s\S]*?OutputPath\.Text\.Trim\(\) -ne \$script:LastSuggestedOutput[\s\S]*?LastSuggestedOutput = ''/,
  'editing the planned output converts it to a user choice that later source changes preserve',
);
assert.match(
  managerPs,
  /\$script:BtnBrowseOutput\.Add_Click\(\{[\s\S]*?if \(\$selected\)[\s\S]*?\$script:LastSuggestedOutput = ''[\s\S]*?\$script:OutputPath\.Text =/,
  'an explicit output-folder selection is always preserved as a user choice even if its text matches a suggestion',
);
assert.match(managerPs, /if \(\$InitialMode -eq 'source'[^\n]+\$script:SourcePath\.Text/, 'manager pre-fills source input only in source mode');
assert.match(managerPs, /if \(\$InitialMode -eq 'verify'[^\n]+\$script:PackagePath\.Text/, 'manager pre-fills package input only in verify mode');
assert.match(managerPs, /Add_Shown\(\{[\s\S]*?\$InitialMode -eq 'verify'[\s\S]*?\$script:BtnVerify\.PerformClick\(\)[\s\S]*?\$script:BtnCheck\.PerformClick\(\)[\s\S]*?\}\)/, 'explicit AutoInspect only triggers the read-only action for the selected mode');
assert.doesNotMatch(managerPs.match(/Add_Shown\(\{[\s\S]*?\}\)/)?.[0] || '', /BtnBuild|build/, 'AutoInspect never triggers package creation');

const launcher = read('結構工具箱/tools/啟動正式附件包管理器.bat');
assert.match(launcher, /powershell\s+-NoProfile\s+-ExecutionPolicy Bypass\s+-STA\s+-File/i);
assert.match(launcher, /attachment-package-manager\.ps1/);

const preflight = read('preflight-tools.ps1');
assert.match(preflight, /attachment-package-manager\.contract\.test\.js/);
assert.match(preflight, /key = "attachment-package-manager"/);

const pagesBuilder = read('結構工具箱/tools/build-pages-artifact.js');
const pagesSmoke = read('結構工具箱/tools/pages-live-smoke.js');
for (const privateFile of [
  'attachment-package-manager-worker.js', 'attachment-package-manager.ps1',
  '啟動正式附件包管理器.bat', 'attachment-package-manager.contract.test.js',
]) {
  assert.ok(pagesSmoke.includes(privateFile), `Pages private-boundary smoke includes ${privateFile}`);
}
assert.ok(pagesBuilder.includes('結構工具箱/tools/attachment-package-manager-worker.js'), 'Pages artifact builder excludes manager worker');

for (const doc of ['README.md', 'TOOL_BOUNDARIES.md', 'STAGING_GROUPS.md']) {
  const source = read(doc);
  assert.ok(source.includes('attachment-package-manager-worker.js'), `${doc} documents manager worker`);
  assert.ok(source.includes('attachment-package-manager.contract.test.js'), `${doc} documents manager contract`);
  assert.ok(source.includes('啟動正式附件包管理器.bat'), `${doc} documents manager launcher`);
}

console.log('attachment package manager contract tests passed');
