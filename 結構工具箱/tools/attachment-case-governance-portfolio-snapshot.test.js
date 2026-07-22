'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Chain = require('./attachment-package-upgrade-history-baseline-chain.js');
const Portfolio = require('./attachment-case-governance-portfolio.js');
const Compare = require('./attachment-case-governance-portfolio-compare.js');
const Snapshot = require('./attachment-case-governance-portfolio-snapshot.js');

const TIMES = {
  ready: '2026-07-22T08:00:00.123Z',
  review: '2026-07-22T08:01:00.456Z',
  blocked: '2026-07-22T08:02:00.789Z',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeCase(caseName, status, token) {
  const state = status === 'ready'
    ? { packageStatus: 'ready', chainStatus: 'valid', pendingAdditions: 0, issueCodes: [], nextActionCodes: ['internal-archive-review'] }
    : status === 'review'
      ? { packageStatus: 'ready', chainStatus: 'review', pendingAdditions: 1, issueCodes: ['chain-advancement-pending'], nextActionCodes: ['advance-trusted-baseline'] }
      : { packageStatus: 'blocked', chainStatus: 'blocked', pendingAdditions: 0, issueCodes: ['chain-disconnected'], nextActionCodes: ['repair-trusted-baseline-chain'] };
  return {
    caseName,
    status,
    caseFingerprint: `CAS-${token.repeat(24)}`,
    governanceFingerprint: `GOV-${token.repeat(24)}`,
    packageStatus: state.packageStatus,
    chainStatus: state.chainStatus,
    currentReceiptCount: 2,
    pendingAdditions: state.pendingAdditions,
    issueCodes: state.issueCodes,
    nextActionCodes: state.nextActionCodes,
  };
}

function makeSnapshot(status, token, generatedAt, options = {}) {
  const cases = options.cases || [makeCase('案件甲', status, token)];
  const issues = options.issues || [];
  const summary = {
    readyCases: cases.filter(item => item.status === 'ready').length,
    reviewCases: cases.filter(item => item.status === 'review').length,
    blockedCases: cases.filter(item => item.status === 'blocked').length,
    errors: issues.filter(item => item.level === 'error').length,
    warnings: issues.filter(item => item.level === 'warn').length,
  };
  const resultStatus = summary.errors || summary.blockedCases ? 'blocked' : summary.reviewCases ? 'review' : 'ready';
  return {
    schemaVersion: 1,
    kind: Portfolio.PORTFOLIO_KIND,
    generatedAt,
    status: resultStatus,
    portfolioFingerprint: `POR-${token.repeat(24)}`,
    boundary: {
      classification: 'internal-governance-only',
      attachToFormalReport: false,
      formalAttachmentApproval: false,
      instruction: Portfolio.PORTFOLIO_BOUNDARY_INSTRUCTION,
    },
    discovery: {
      parentName: '案件上層',
      caseCount: cases.length,
      ignoredDirectoryCount: 0,
      ignoredDirectories: [],
    },
    summary,
    triage: Portfolio.buildTriage(cases, issues),
    cases,
    issues,
    nextActions: issues.some(item => item.code === 'portfolio-changed-during-read')
      ? [{ code: 'rerun-after-portfolio-stable', message: '固定來源後重跑。', cases: [] }]
      : [{ code: 'follow-current-status', message: '依目前狀態處理。', cases: cases.map(item => item.caseName) }],
  };
}

function digest(directory) {
  return JSON.stringify(Chain.directorySnapshot(directory, '測試來源'));
}

function cli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'attachment-case-governance-portfolio-snapshot.js'), ...args], { encoding: 'utf8' });
}

function callMain(snapshot, parent, output) {
  const originalInspect = Portfolio.inspectPortfolio;
  const originalLog = console.log;
  const lines = [];
  Portfolio.inspectPortfolio = () => clone(snapshot);
  console.log = value => lines.push(String(value));
  try {
    return { status: Snapshot.main(['--parent', parent, '--output', output, '--json']), stdout: lines.join('\n') };
  } finally {
    Portfolio.inspectPortfolio = originalInspect;
    console.log = originalLog;
  }
}

assert.equal(Snapshot.SNAPSHOT_PUBLICATION_KIND, 'formal-attachment-case-governance-portfolio-snapshot-publication.v1');
assert.match(Snapshot.SNAPSHOT_BOUNDARY_INSTRUCTION, /不得放入計算書、主報告或正式附件包/);
assert.deepEqual(Snapshot.parseArgs(['--parent', 'C:/cases', '--output', 'D:/snapshots', '--json']), {
  json: true,
  parent: 'C:/cases',
  output: 'D:/snapshots',
});
assert.throws(() => Snapshot.parseArgs(['--parent']), /缺少路徑值/);
assert.throws(() => Snapshot.parseArgs(['--unknown']), /未知參數/);
assert.equal(Snapshot.timestampToken(TIMES.ready), '20260722-080000-123Z');
assert.match(Snapshot.usage(), /同名快照永不覆寫/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-portfolio-snapshot-'));
try {
  const parent = path.join(tempRoot, 'cases');
  fs.mkdirSync(parent);
  const sourceBefore = digest(parent);
  const readySnapshot = makeSnapshot('ready', 'A', TIMES.ready);
  Compare.validateSnapshot(readySnapshot, 'ready fixture');

  const storage = path.join(tempRoot, 'internal-snapshots');
  const readyResult = Snapshot.captureSnapshot(parent, storage, {
    now: new Date(TIMES.ready),
    inspectPortfolio: () => clone(readySnapshot),
  });
  assert.equal(readyResult.published, true);
  assert.equal(readyResult.status, 'ready');
  assert.equal(readyResult.snapshotFileName, `portfolio-20260722-080000-123Z-${readySnapshot.portfolioFingerprint}.json`);
  assert.match(readyResult.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(readyResult.storageDirectoryName, 'internal-snapshots');
  assert.equal(readyResult.boundary.pagesPublication, false);
  assert.equal(JSON.stringify(readyResult).includes(tempRoot), false);
  assert.doesNotMatch(JSON.stringify(readyResult), /reviewer|basis|AppData|Desktop/i);
  const savedPath = path.join(storage, readyResult.snapshotFileName);
  assert.equal(fs.existsSync(savedPath), true);
  assert.deepEqual(Compare.readSnapshotFile(savedPath, '已保存測試快照').snapshot, readySnapshot);
  assert.equal(readyResult.snapshotSha256, crypto.createHash('sha256').update(fs.readFileSync(savedPath)).digest('hex'));
  assert.deepEqual(fs.readdirSync(storage), [readyResult.snapshotFileName]);
  assert.match(Snapshot.formatSummary(readyResult), /已安全保存/);
  assert.equal(digest(parent), sourceBefore);
  const savedHash = readyResult.snapshotSha256;
  assert.throws(() => Snapshot.captureSnapshot(parent, storage, {
    now: new Date(TIMES.ready),
    inspectPortfolio: () => clone(readySnapshot),
  }), /不得覆寫/);
  assert.equal(Snapshot.sha256File(savedPath), savedHash);

  const reviewSnapshot = makeSnapshot('review', 'B', TIMES.review);
  const reviewResult = Snapshot.captureSnapshot(parent, path.join(tempRoot, 'review-snapshots'), {
    inspectPortfolio: () => clone(reviewSnapshot),
  });
  assert.equal(reviewResult.published, true);
  assert.equal(reviewResult.status, 'review');

  const blockedSnapshot = makeSnapshot('blocked', 'C', TIMES.blocked);
  const blockedResult = Snapshot.captureSnapshot(parent, path.join(tempRoot, 'blocked-snapshots'), {
    inspectPortfolio: () => clone(blockedSnapshot),
  });
  assert.equal(blockedResult.published, true);
  assert.equal(blockedResult.status, 'blocked');

  const unstableSnapshot = makeSnapshot('ready', 'D', TIMES.blocked, {
    issues: [{ level: 'error', code: 'portfolio-changed-during-read', message: '來源改變。', entries: [] }],
  });
  const unstableStorage = path.join(tempRoot, 'unstable-snapshots');
  const unstableResult = Snapshot.captureSnapshot(parent, unstableStorage, {
    inspectPortfolio: () => clone(unstableSnapshot),
  });
  assert.equal(unstableResult.published, false);
  assert.equal(unstableResult.status, 'blocked');
  assert.equal(fs.existsSync(unstableStorage), false);
  assert.match(Snapshot.formatSummary(unstableResult), /沒有建立快照檔/);

  const changedBeforePublish = path.join(tempRoot, 'changed-before-publish');
  const lateBefore = path.join(parent, 'late-before');
  assert.throws(() => Snapshot.captureSnapshot(parent, changedBeforePublish, {
    inspectPortfolio: () => clone(readySnapshot),
    beforePublish() { fs.mkdirSync(lateBefore); },
  }), /發布前案件來源已改變/);
  assert.equal(fs.existsSync(changedBeforePublish), false);
  fs.rmdirSync(lateBefore);

  const changedAfterPublish = path.join(tempRoot, 'changed-after-publish');
  const lateAfter = path.join(parent, 'late-after');
  assert.throws(() => Snapshot.captureSnapshot(parent, changedAfterPublish, {
    inspectPortfolio: () => clone(readySnapshot),
    afterPublish() { fs.mkdirSync(lateAfter); },
  }), /發布期間案件來源已改變/);
  assert.equal(fs.existsSync(changedAfterPublish), false);
  fs.rmdirSync(lateAfter);

  const invalidStageStorage = path.join(tempRoot, 'invalid-stage');
  assert.throws(() => Snapshot.captureSnapshot(parent, invalidStageStorage, {
    inspectPortfolio: () => clone(readySnapshot),
    beforeValidate({ stagingPath }) { fs.appendFileSync(stagingPath, 'not-json', 'utf8'); },
  }), /JSON|多餘內容/);
  assert.equal(fs.existsSync(invalidStageStorage), false);

  const changedConfirmationStorage = path.join(tempRoot, 'changed-confirmation');
  let inspectionCount = 0;
  assert.throws(() => Snapshot.captureSnapshot(parent, changedConfirmationStorage, {
    inspectPortfolio() {
      inspectionCount += 1;
      return clone(inspectionCount === 1 ? readySnapshot : reviewSnapshot);
    },
  }), /發布前案件狀態已改變/);
  assert.equal(fs.existsSync(changedConfirmationStorage), false);

  const raceStorage = path.join(tempRoot, 'publish-race');
  let raceTarget = '';
  assert.throws(() => Snapshot.captureSnapshot(parent, raceStorage, {
    inspectPortfolio: () => clone(readySnapshot),
    linkSync(source, target) {
      raceTarget = target;
      fs.writeFileSync(target, 'other-writer', 'utf8');
      fs.linkSync(source, target);
    },
  }), /EEXIST|exist/i);
  assert.equal(fs.readFileSync(raceTarget, 'utf8'), 'other-writer');
  assert.equal(fs.readdirSync(raceStorage).some(name => name.includes('.tmp-')), false);

  assert.throws(() => Snapshot.captureSnapshot(parent, path.join(parent, 'snapshots'), {
    inspectPortfolio: () => clone(readySnapshot),
  }), /不得位於案件上層內/);
  assert.equal(fs.existsSync(path.join(parent, 'snapshots')), false);
  assert.throws(() => Snapshot.captureSnapshot(parent, tempRoot, {
    inspectPortfolio: () => clone(readySnapshot),
  }), /不得包住案件上層/);

  const realLinkedStorage = path.join(tempRoot, 'real-linked-storage');
  const linkedStorage = path.join(tempRoot, 'linked-storage');
  fs.mkdirSync(realLinkedStorage);
  try {
    fs.symlinkSync(realLinkedStorage, linkedStorage, 'junction');
    assert.throws(() => Snapshot.captureSnapshot(parent, linkedStorage, {
      inspectPortfolio: () => clone(readySnapshot),
    }), /實體資料夾/);
    fs.unlinkSync(linkedStorage);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }

  const mainReady = callMain(readySnapshot, parent, path.join(tempRoot, 'main-ready'));
  assert.equal(mainReady.status, 0);
  assert.equal(JSON.parse(mainReady.stdout).published, true);
  const mainReview = callMain(reviewSnapshot, parent, path.join(tempRoot, 'main-review'));
  assert.equal(mainReview.status, 1);
  const mainBlocked = callMain(blockedSnapshot, parent, path.join(tempRoot, 'main-blocked'));
  assert.equal(mainBlocked.status, 2);

  const emptyParent = path.join(tempRoot, 'empty-real-parent');
  const emptyOutput = path.join(tempRoot, 'empty-real-output');
  fs.mkdirSync(emptyParent);
  const blockedCli = cli(['--parent', emptyParent, '--output', emptyOutput, '--json']);
  assert.equal(blockedCli.status, 2, blockedCli.stderr || blockedCli.stdout);
  const blockedCliResult = JSON.parse(blockedCli.stdout);
  assert.equal(blockedCliResult.published, true);
  assert.equal(blockedCliResult.status, 'blocked');
  assert.equal(fs.existsSync(path.join(emptyOutput, blockedCliResult.snapshotFileName)), true);

  assert.equal(cli(['--help']).status, 0);
  assert.equal(cli([]).status, 3);
  assert.equal(cli(['--parent', parent]).status, 3);
  assert.equal(cli(['--unknown']).status, 3);
  assert.equal(digest(parent), sourceBefore);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('attachment portfolio snapshot publication OK');
