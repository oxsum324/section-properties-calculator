'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compareTxtTable, validateSelection } = require('./report-format-parity.core');
const parity = require('./report-format-parity.test');
const browser = require('./report-docx.browser.test');

const cases = ['rc-beam', 'steel-beam-formal', 'wind-force', 'earth-pressure'];
const inputTable = {
  className: 'rep-input',
  headerRows: 1,
  rows: [
    [{ text: '項目' }, { text: '採用值' }],
    [{ text: '梁腹寬 bw' }, { text: '40 cm' }],
    [{ text: '全深 h' }, { text: '70 cm' }],
  ],
};
const checkTable = {
  headerRows: 1,
  rows: [
    ['檢核項', '公式', '代入值', '結果', 'OK?'].map(text => ({ text })),
    ['φVn ≥ Vd', 'φVn=4 tf', 'Vd=2 tf', '4 / 2 tf', '✓ OK'].map(text => ({ text })),
  ],
};

assert.doesNotThrow(() => compareTxtTable('- 梁腹寬 bw：40 cm\n- 全深 h：70 cm', inputTable, 1, 'contract'));
assert.doesNotThrow(() => compareTxtTable('- φVn ≥ Vd\n  公式：φVn=4 tf\n  代入值：Vd=2 tf\n  結果：4 / 2 tf\n  判定：✓ OK', checkTable, 5, 'contract'));
assert.throws(() => compareTxtTable('- 梁腹寬 bw：40 mm\n- 全深 h：70 cm', inputTable, 1, 'unit mutation'), /cell/);
assert.throws(() => compareTxtTable('- 梁腹寬 bw：40 cm or mm\n- 全深 h：70 cm', inputTable, 1, 'unit suffix mutation'), /cell/);
assert.throws(() => compareTxtTable('- φVn ≥ Vd\n  公式：φVn=4 tf\n  代入值：Vd=2 tf\n  結果：4 / 2 tf\n  判定：✗ NG', checkTable, 5, 'verdict mutation'), /cell/);
assert.throws(() => compareTxtTable('- φVn ≥ Vd\n  公式：φVn=4 tf\n  代入值：Vd=2 tf\n  結果：4 / 2 tf\n  判定：✓ OK（另有 ✗ NG）', checkTable, 5, 'verdict suffix mutation'), /cell/);
const blankInput = { className: 'rep-input', headerRows: 1, rows: [[{ text: '項目' }, { text: '採用值' }], [{ text: '附註' }, { text: '' }]] };
assert.throws(() => compareTxtTable('- 附註：不適用', blankInput, 1, 'blank cell filled mutation'), /cell/);
assert.throws(() => compareTxtTable('- 梁腹寬 bw：40 cm、70 cm\n- 全深 h：—', inputTable, 1, 'cell mutation'), /cell|numeric/);
const threeCellTable = { headerRows: 1, rows: [[{ text: '項目' }, { text: '一' }, { text: '二' }], [{ text: '梁寬' }, { text: '40 cm' }, { text: '70 cm' }]] };
assert.throws(() => compareTxtTable('- 項目：梁寬｜一：70 cm｜二：40 cm', threeCellTable, 1, 'same-row cell mutation'), /cell|numeric/);

assert.doesNotThrow(() => validateSelection(cases, cases, cases));
assert.doesNotThrow(() => validateSelection(['rc-beam'], ['rc-beam'], cases));
assert.throws(() => validateSelection(['rc-beam', 'rc-beam'], ['rc-beam', 'rc-beam'], cases), /duplicate/);
assert.throws(() => validateSelection(['rc-beam'], cases, cases), /exactly match/);
assert.throws(() => validateSelection(['unknown'], ['unknown'], cases), /未知/);
assert.throws(() => parity.argumentsFromCli(['node', 'test', '--run-dir']), /--run-dir/);
assert.throws(() => parity.argumentsFromCli(['node', 'test', '--run-dir', '--only', 'rc-beam']), /--run-dir/);
assert.throws(() => parity.argumentsFromCli(['node', 'test', '--run-dir', 'sample', '--only']), /--only/);
assert.throws(() => parity.argumentsFromCli(['node', 'test', '--run-dir', 'sample', '--wat', 'x']), /未知 parity/);
assert.throws(() => parity.argumentsFromCli(['node', 'test', '--run-dir', 'sample', '--only', 'rc-beam,rc-beam']), /重複/);
assert.throws(() => parity.argumentsFromCli(['node', 'test', '--run-dir', 'sample', '--only', 'unknown']), /未知/);
assert.throws(() => browser.parseArgs(['node', 'browser', '--only']), /--only/);
assert.throws(() => browser.parseArgs(['node', 'browser', '--unknown', 'x']), /未知 T5/);
assert.throws(() => browser.parseArgs(['node', 'browser', '--only', 'rc-beam,']), /空案例/);
assert.throws(() => browser.parseArgs(['node', 'browser', '--only', 'rc-beam,rc-beam']), /重複/);
const parsed = parity.argumentsFromCli(['node', 'test', '--run-dir', 'sample-run', '--only', 'rc-beam']);
assert.equal(path.basename(parsed.runDir), 'sample-run');
assert.deepEqual(parsed.requested, ['rc-beam']);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-parity-run-contract-'));
assert.equal(path.dirname(path.resolve(tempRoot)), path.resolve(os.tmpdir()), 'contract temp root must be directly inside OS temp');
assert.ok(path.basename(tempRoot).startsWith('report-parity-run-contract-'), 'contract temp root must have its dedicated prefix');
try {
  const selectedRun = path.join(tempRoot, 'selected-run'), laterRun = path.join(tempRoot, 'newer-unrelated-run');
  fs.mkdirSync(selectedRun); fs.mkdirSync(laterRun);
  fs.writeFileSync(path.join(selectedRun, 'summary.json'), JSON.stringify({ selected: ['rc-beam'], cases: [{ key: 'rc-beam' }], failures: [] }));
  fs.writeFileSync(path.join(laterRun, 'summary.json'), JSON.stringify({ selected: ['rc-beam'], cases: [{ key: 'rc-beam' }], failures: [{ key: 'rc-beam', error: 'unrelated later failure' }] }));
  assert.equal(parity.loadRunSummary(selectedRun, ['rc-beam']).cases[0].key, 'rc-beam', 'summary validation must read the explicitly selected run directory');
  assert.throws(() => parity.loadRunSummary(laterRun, ['rc-beam']), /no failures/);
} finally {
  const resolvedTempRoot = path.resolve(tempRoot);
  assert.equal(path.dirname(resolvedTempRoot), path.resolve(os.tmpdir()), 'recursive cleanup target must remain directly inside OS temp');
  assert.ok(path.basename(resolvedTempRoot).startsWith('report-parity-run-contract-'), 'recursive cleanup target must keep its dedicated prefix');
  fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
}
const wrapperSource = fs.readFileSync(require.resolve('./test-report-docx.ps1'), 'utf8');
const browserSource = fs.readFileSync(require.resolve('./report-docx.browser.test.js'), 'utf8');
assert.match(wrapperSource, /REPORT_DOCX_RUN_DIR=/);
assert.match(wrapperSource, /@\('--run-dir', \$runDir\)/);
assert.match(wrapperSource, /@\('--only', \$Tools\)/);
assert.match(browserSource, /REPORT_DOCX_RUN_DIR=\$\{output\}/);
assert.match(browserSource, /function parseArgs\(argv\)/);
assert.equal(cases.length * 3, 12, 'full suite must retain 12 HTML/TXT/DOCX source outputs');
const heavyRequire = spawnSync(process.execPath, ['-e', "require('./report-format-parity.test')"], { cwd: __dirname, encoding: 'utf8' });
assert.equal(heavyRequire.status, 0, 'importing parity test must not invoke Word/browser/main or load heavyweight dependencies');

console.log('PASS report format parity contract: TXT cells, verdict, units, selection and import safety');
