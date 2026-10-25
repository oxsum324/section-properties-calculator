const assert = require('assert');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'shared', 'report.js');
const reportSource = fs.readFileSync(reportPath, 'utf8');
const context = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, '..', '結構工具箱', 'core', 'ui', 'report-utils.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared', 'report-utils.js'), 'utf8'), context);
vm.runInNewContext(reportSource, context, { filename: reportPath });

const fingerprintApi = context.window.RCReportFingerprint;
assert.ok(fingerprintApi, 'shared report should expose RCReportFingerprint');
assert.strictEqual(typeof fingerprintApi.buildProjectCalculationFingerprint, 'function');
assert.strictEqual(typeof fingerprintApi.withProjectCalculationFingerprint, 'function');
assert.strictEqual(typeof fingerprintApi.validateProjectCalculationSource, 'function');
assert.strictEqual(typeof fingerprintApi.assertProjectCalculationReplay, 'function');

const basePayload = {
  schema: 'rc-beam-project-v1',
  tool: 'rc-beam',
  toolTitle: '梁 Beam 設計／檢核',
  appVersion: 'V3.1',
  savedAt: '2026-07-20T10:00:00.000Z',
  activeTab: 'geom',
  mode: 'check',
  metadata: { projectName: 'A 工程', projectNo: 'A-001', designer: '甲' },
  fields: {
    projName: { kind: 'input', value: 'A 工程' },
    projNo: { kind: 'input', value: 'A-001' },
    projDesigner: { kind: 'input', value: '甲' },
    MuPos: { kind: 'input', value: '88' },
    showSteps: { kind: 'checkbox', checked: true },
  },
  summary: { banner: '主軸彎矩 OK', manualReviewItems: [] },
};
const options = { ignoredKeys: ['activeTab'] };
const base = fingerprintApi.withProjectCalculationFingerprint(basePayload, options);
assert.match(base.calculationFingerprint, /^CF-[A-F0-9]{16}$/);
assert.doesNotThrow(() => fingerprintApi.validateProjectCalculationSource(base, {
  expectedSchema: 'rc-beam-project-v1',
  expectedToolId: 'rc-beam',
  expectedVersion: 'V3.1',
  sourceKey: 'fields',
  fingerprintOptions: options,
}));
assert.throws(() => fingerprintApi.validateProjectCalculationSource({ ...base, appVersion: 'V9.9' }, {
  expectedSchema: 'rc-beam-project-v1', expectedToolId: 'rc-beam', expectedVersion: 'V3.1', sourceKey: 'fields', fingerprintOptions: options,
}), /工具版本不符/);
assert.throws(() => fingerprintApi.validateProjectCalculationSource({ ...base, tool: 'rc-column' }, {
  expectedSchema: 'rc-beam-project-v1', expectedToolId: 'rc-beam', expectedVersion: 'V3.1', sourceKey: 'fields', fingerprintOptions: options,
}), /工具種類不符/);
assert.throws(() => fingerprintApi.validateProjectCalculationSource({ ...base, fields: { ...base.fields, MuPos: { kind: 'input', value: '999' } } }, {
  expectedSchema: 'rc-beam-project-v1', expectedToolId: 'rc-beam', expectedVersion: 'V3.1', sourceKey: 'fields', fingerprintOptions: options,
}), /來源內容與計算指紋不一致/);
assert.doesNotThrow(() => fingerprintApi.assertProjectCalculationReplay(base, { calculationFingerprint: base.calculationFingerprint }));
assert.throws(() => fingerprintApi.assertProjectCalculationReplay(base, { calculationFingerprint: 'CF-0000000000000000' }), /重現失敗/);

const identityOnlyChange = {
  ...basePayload,
  schema: 'rc-beam-project-v2',
  toolTitle: '梁工具新版名稱',
  appVersion: 'V9.9',
  savedAt: '2030-01-01T00:00:00.000Z',
  activeTab: 'summary',
  metadata: { projectName: 'B 工程', projectNo: 'B-999', designer: '乙' },
  fields: {
    ...basePayload.fields,
    projName: { kind: 'input', value: 'B 工程' },
    projNo: { kind: 'input', value: 'B-999' },
    projDesigner: { kind: 'input', value: '乙' },
  },
};
assert.strictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(identityOnlyChange, options),
  base.calculationFingerprint,
  'project identity, save time, version and UI-only tab must not change the calculation fingerprint',
);

const inputChange = {
  ...basePayload,
  fields: { ...basePayload.fields, MuPos: { kind: 'input', value: '89' } },
};
assert.notStrictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(inputChange, options),
  base.calculationFingerprint,
  'calculation input changes must change the calculation fingerprint',
);

const resultChange = {
  ...basePayload,
  summary: { ...basePayload.summary, banner: '主軸彎矩 NG' },
};
assert.notStrictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(resultChange, options),
  base.calculationFingerprint,
  'calculation result changes must change the calculation fingerprint',
);

const otherTool = { ...basePayload, tool: 'rc-column' };
assert.notStrictEqual(
  fingerprintApi.buildProjectCalculationFingerprint(otherTool, options),
  base.calculationFingerprint,
  'tool identity must prevent cross-tool source pairing',
);

const foundationPayload = { ...basePayload, tool: 'rc-foundation' };
const foundationIso = fingerprintApi.buildProjectCalculationFingerprint(foundationPayload, {
  ignoredKeys: ['activeTab'],
  calculationContext: { foundationTab: 'iso' },
});
const foundationPile = fingerprintApi.buildProjectCalculationFingerprint(foundationPayload, {
  ignoredKeys: ['activeTab'],
  calculationContext: { foundationTab: 'pile' },
});
assert.notStrictEqual(foundationIso, foundationPile, 'foundation calculation type must change the calculation fingerprint');

// ── 舊版專案檔遷移（shared/project-replay.js，只由板、牆載入；common.js 提供 RCUI 案件欄位正規化） ──
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared', 'common.js'), 'utf8'), context);
const replayPath = path.join(ROOT, 'shared', 'project-replay.js');
const replaySource = fs.readFileSync(replayPath, 'utf8');
vm.runInNewContext(replaySource, context, { filename: replayPath });
const replayApi = context.window.RCProjectReplay;
for (const name of ['resolveProjectToolVersion', 'validateLegacyProjectSource', 'diffProjectCalculationInputs', 'reconcileProjectCalculationReplay', 'describeProjectCalculationReplay']) {
  assert.strictEqual(typeof replayApi[name], 'function', `RCProjectReplay.${name} should be exposed`);
}
assert.ok(!/fingerprintHash|0x811C9DC5|0x9E3779B9/.test(replaySource), 'project-replay.js must call RCReportFingerprint instead of re-implementing the fingerprint');
assert.ok(zlib.gzipSync(Buffer.from(replaySource, 'utf8')).length <= 3072, 'project-replay.js should stay within 3 KB gzip');

// 版本正規化只用一套：與 report.js normalizeProjectToolVersion 逐值相同（report.js 未匯出，經 vm 全域取用比對）
assert.strictEqual(typeof context.normalizeProjectToolVersion, 'function', 'report.js normalizeProjectToolVersion should be reachable for parity');
for (const value of ['V3.2', '3.2', ' v3.2 ', 'v3', 'V3.2.1', '3.2-beta', 'v3.2+build.7', 'V3.2_rc', 'V 3.2', 'abc', ' ', '', '３.２', 3.2, 0, null, undefined]) {
  assert.strictEqual(replayApi.resolveProjectToolVersion({ appVersion: value }), context.normalizeProjectToolVersion(value), `version parity for ${JSON.stringify(value)}`);
}
for (const [label, variant] of [
  ['canonical', { appVersion: 'V3.2' }],
  ['bare number', { appVersion: '3.2' }],
  ['padded lower-case', { appVersion: ' v3.2 ' }],
  ['tool.pageVersion only', { appVersion: undefined, tool: { id: 'rc-wall', pageVersion: 'V3.2' } }],
  ['pageVersion only', { appVersion: undefined, pageVersion: 'v3.2' }],
]) {
  assert.strictEqual(replayApi.resolveProjectToolVersion({ tool: 'rc-wall', ...variant }), 'V3.2', `${label} resolves to V3.2`);
}
assert.strictEqual(replayApi.resolveProjectToolVersion({ tool: 'rc-wall' }), '', 'missing version resolves to empty');

const migrationOptions = { ignoredKeys: ['activeTab'] };
const legacyWallBase = {
  schema: 'rc-wall-project-v1',
  tool: 'rc-wall',
  toolTitle: '牆 Wall 設計／檢核',
  appVersion: 'V3.2',
  savedAt: '2026-10-20T10:00:00.000Z',
  mode: 'check',
  activeTab: 'summary',
  metadata: { projectName: '牆遷移', projectNo: 'W-1', designer: '甲' },
  fields: {
    projName: { kind: 'input', inputType: 'text', value: '牆遷移' },
    vBar: { kind: 'select', inputType: 'select-one', value: '#6' },
    vSp: { kind: 'input', inputType: 'number', value: '44' },
    seismicMode: { kind: 'checkbox', checked: false },
  },
  aggRows: [],
  summary: { banner: '⚠ 待確認 — 1 項需正式分析確認', reviewWarningCount: 1 },
};
const legacyWall = fingerprintApi.withProjectCalculationFingerprint(legacyWallBase, migrationOptions);
const wallValidation = {
  expectedSchema: 'rc-wall-project-v1', expectedToolId: 'rc-wall', expectedVersion: 'V3.4',
  legacyVersions: ['V3.1', 'V3.2', 'V3.3'], sourceKey: 'fields', fingerprintOptions: migrationOptions,
};
for (const appVersion of ['V3.2', '3.2', ' v3.2 ']) {
  assert.doesNotThrow(() => replayApi.validateLegacyProjectSource({ ...legacyWall, appVersion }, wallValidation), `legacy appVersion ${JSON.stringify(appVersion)} is accepted`);
}
assert.doesNotThrow(() => replayApi.validateLegacyProjectSource({ ...legacyWall, appVersion: undefined, pageVersion: 'V3.2' }, wallValidation), 'pageVersion-only legacy source is accepted');
assert.doesNotThrow(() => replayApi.validateLegacyProjectSource({ ...legacyWall, appVersion: undefined, tool: { id: 'rc-wall', pageVersion: ' v3.2 ' } }, wallValidation), 'tool.pageVersion-only legacy source is accepted');
assert.doesNotThrow(() => replayApi.validateLegacyProjectSource(JSON.stringify({ ...legacyWall, appVersion: '3.2' }), wallValidation), 'legacy JSON text is parsed before version resolution');
assert.throws(() => replayApi.validateLegacyProjectSource({ ...legacyWall, appVersion: 'V3.0' }, wallValidation), /工具版本不符（來源 V3\.0，目前 V3\.4）。/);
assert.throws(() => replayApi.validateLegacyProjectSource({ ...legacyWall, fields: { ...legacyWall.fields, vSp: { kind: 'input', inputType: 'number', value: '40' } } }, wallValidation), /來源內容與計算指紋不一致/, 'legacy integrity is still verified against the saved fingerprint');

const replayAs = (payload, changes = {}) => fingerprintApi.withProjectCalculationFingerprint({ ...payload, appVersion: 'V3.4', savedAt: '2026-10-24T00:00:00.000Z', ...changes }, migrationOptions);
const reconcileOptions = { legacyVersions: ['V3.1', 'V3.2', 'V3.3'], sourceKey: 'fields', fingerprintOptions: migrationOptions };

const sameResult = replayApi.reconcileProjectCalculationReplay(legacyWall, replayAs(legacyWallBase), reconcileOptions);
assert.strictEqual(sameResult.status, 'reproduced');
assert.strictEqual(sameResult.legacy, true);
assert.strictEqual(sameResult.sourceVersion, 'V3.2');
assert.strictEqual(sameResult.currentVersion, 'V3.4');
const sameNotice = replayApi.describeProjectCalculationReplay(sameResult, { sourceLabel: '牆專案檔', applied: 4 });
assert.strictEqual(sameNotice.status, 'ok');
assert.strictEqual(sameNotice.message, `已讀取牆專案檔並重現計算：牆遷移，套用 4 個欄位｜計算指紋 ${legacyWall.calculationFingerprint}｜原為 V3.2 專案檔，已依 V3.4 重新計算，請另存 V3.4 專案檔`);

const flippedReplay = replayAs(legacyWallBase, { activeTab: 'geom', summary: { banner: '✗ NG — 不符合規範', reviewWarningCount: 2 } });
const flipped = replayApi.reconcileProjectCalculationReplay(legacyWall, flippedReplay, reconcileOptions);
assert.strictEqual(flipped.status, 'recalculated', 'legacy result-only change is accepted');
assert.deepStrictEqual([...flipped.resultChange.changedKeys], ['banner', 'reviewWarningCount']);
const flippedNotice = replayApi.describeProjectCalculationReplay(flipped, { sourceLabel: '牆專案檔', applied: 4 });
assert.strictEqual(flippedNotice.status, 'warn');
assert.ok(flippedNotice.message.includes('原為 V3.2 專案檔，已依 V3.4 重新計算；判定由「⚠ 待確認 — 1 項需正式分析確認」改為「✗ NG — 不符合規範」（審查警示 1→2 項），請另存 V3.4 專案檔'), flippedNotice.message);
assert.ok(flippedNotice.message.includes(`計算指紋 ${legacyWall.calculationFingerprint}（V3.2 存檔）→ ${flippedReplay.calculationFingerprint}（V3.4 重算）`), flippedNotice.message);
assert.ok(!flippedNotice.message.includes('並重現計算'), 'recalculated notice must not claim the saved result was reproduced');

const countOnly = replayApi.reconcileProjectCalculationReplay(legacyWall, replayAs(legacyWallBase, { summary: { ...legacyWallBase.summary, reviewWarningCount: 3 } }), reconcileOptions);
assert.ok(replayApi.describeProjectCalculationReplay(countOnly).message.includes('判定維持「⚠ 待確認 — 1 項需正式分析確認」（審查警示 1→3 項）'));

const changedInput = replayAs(legacyWallBase, { fields: { ...legacyWallBase.fields, vSp: { kind: 'input', inputType: 'number', value: '40' } }, summary: { banner: '✓ OK', reviewWarningCount: 0 } });
assert.throws(() => replayApi.reconcileProjectCalculationReplay(legacyWall, changedInput, reconcileOptions),
  /專案 JSON 重現失敗：.*原為 V3\.2 專案檔，下列輸入無法於 V3\.4 逐欄重現，未載入：套用並重算後值不同：vSp（存檔 「44」，套用後 「40」）/);
const legacyWithRetiredField = fingerprintApi.withProjectCalculationFingerprint({ ...legacyWallBase, fields: { ...legacyWallBase.fields, retiredInput: { kind: 'input', inputType: 'number', value: '7' } } }, migrationOptions);
assert.throws(() => replayApi.reconcileProjectCalculationReplay(legacyWithRetiredField, replayAs(legacyWallBase), reconcileOptions),
  /目前版本無此欄位：retiredInput（存檔 「7」）/);
assert.throws(() => replayApi.reconcileProjectCalculationReplay(legacyWall, replayAs(legacyWallBase, { fields: { ...legacyWallBase.fields, newInput: { kind: 'checkbox', checked: true } } }), reconcileOptions),
  /目前版本新增、存檔未記錄：newInput（目前頁面 勾選）/);
assert.throws(() => replayApi.reconcileProjectCalculationReplay(legacyWall, replayAs(legacyWallBase, { mode: 'design' }), reconcileOptions),
  /套用並重算後值不同：mode（存檔 "check"，套用後 "design"）/);
assert.throws(() => replayApi.reconcileProjectCalculationReplay(legacyWall, replayAs(legacyWallBase, { fields: { ...legacyWallBase.fields, projName: { kind: 'input', inputType: 'text', value: '別案' } } }), reconcileOptions),
  /projName（存檔 「牆遷移」，套用後 「別案」）/, 'identity fields must also replay field-by-field');
assert.doesNotThrow(() => replayApi.reconcileProjectCalculationReplay(
  fingerprintApi.withProjectCalculationFingerprint({ ...legacyWallBase, fields: { ...legacyWallBase.fields, projName: { kind: 'input', inputType: 'text', value: '未填' } } }, migrationOptions),
  replayAs(legacyWallBase, { fields: { ...legacyWallBase.fields, projName: { kind: 'input', inputType: 'text', value: '' } } }),
  reconcileOptions,
), 'identity placeholders are normalized before field comparison');

// 現行版：結果不同仍拒收（不放寬），並說明差異
const currentWall = fingerprintApi.withProjectCalculationFingerprint({ ...legacyWallBase, appVersion: 'V3.4' }, migrationOptions);
assert.throws(() => replayApi.reconcileProjectCalculationReplay(currentWall, flippedReplay, reconcileOptions),
  /^Error: 專案 JSON 重現失敗：來源 CF-[0-9A-F]{16}，重算 CF-[0-9A-F]{16}。存檔結果與重算結果不同：判定由「⚠ 待確認 — 1 項需正式分析確認」改為「✗ NG — 不符合規範」/);
assert.throws(() => replayApi.reconcileProjectCalculationReplay(currentWall, { ...flippedReplay, calculationFingerprint: '' }, reconcileOptions), /重算 無法計算/);
assert.strictEqual(replayApi.reconcileProjectCalculationReplay(currentWall, replayAs(legacyWallBase), reconcileOptions).legacy, false);
// 未列入 legacyVersions 的舊版（如 V3.0）即使通過驗證，也只走嚴格比對
assert.throws(() => replayApi.reconcileProjectCalculationReplay({ ...legacyWall, appVersion: 'V3.0' }, flippedReplay, reconcileOptions), /重現失敗/);

const pageContracts = [
  ['beam.html', 'collectBeamProjectData', 'projectSnapshot = collectBeamProjectData()', '梁 Beam 設計／檢核', 'V3.2'],
  ['column.html', 'collectColumnProjectData', 'projectSnapshot = collectColumnProjectData()', '柱 Column 設計／檢核', 'V3.2'],
  ['slab.html', 'collectSlabProjectData', 'projectSnapshot = collectSlabProjectData()', '板 Slab 設計／檢核', 'V3.3'],
  ['wall.html', 'collectWallProjectData', 'projectSnapshot = collectWallProjectData()', '牆 Wall 設計／檢核', 'V3.4'],
  ['shear-wall.html', 'collectShearWallProjectData', 'projectSnapshot = collectShearWallProjectData()', '剪力牆 Shear Wall 設計／檢核', 'V0.5'],
  ['foundation.html', 'collectFoundationProjectData', 'projectSnapshot = collectFoundationProjectData()', '基礎 Foundation 設計／檢核', 'V3.2'],
  ['single-pile-designer.html', 'buildProjectPayload', 'projectSnapshot = buildProjectPayload()', '單樁承載力設計器', 'V3.2'],
];

const sharedProjectStoragePages = new Set(pageContracts.map(([file]) => file));
const sharedFieldProjectStoragePages = new Set(['beam.html', 'column.html', 'slab.html', 'wall.html', 'shear-wall.html', 'foundation.html']);

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 頁面主程式逐字外移（column.html → column.app.js?v=N）：由共用輔助還原到原內嵌位置後檢查，斷言範圍不變。
const { readPageSource: readRepoPageSource } = require('./column-app-source.test.js');
const readPageSource = file => readRepoPageSource(`鋼筋混凝土/tools/${file}`);
// 舊版專案檔「僅結果改變時接受並揭露」只由板、牆另載 project-replay.js；其他頁沿用嚴格的 assertProjectCalculationReplay
const legacyMigrationPages = new Set(['slab.html', 'wall.html']);
for (const [file, collector, snapshotCall, sourceTool, sourceVersion] of pageContracts) {
  const html = readPageSource(file);
  assert.ok(html.includes('shared/report.js?v=10'), `${file} should load the replay-verified shared report`);
  if (sharedProjectStoragePages.has(file)) {
    assert.ok(html.includes('shared/project-storage.js?v=1'), `${file} should load the shared project storage core`);
    assert.ok(html.includes('RCProjectStorage.createManager'), `${file} should create a shared project storage manager`);
    assert.ok(html.includes('ProjectStorage.downloadJson(payload)'), `${file} should download project JSON through the shared core`);
    assert.ok(html.includes('ProjectStorage.readProjectFile(file)'), `${file} should enforce the shared project file read boundary`);
    assert.ok(html.includes('ProjectStorage.writeDraft(payload)'), `${file} should write browser drafts through the shared core`);
    assert.ok(html.includes('ProjectStorage.readDraft()'), `${file} should read browser drafts through the shared core`);
    if (sharedFieldProjectStoragePages.has(file)) {
      assert.ok(html.includes('ProjectStorage.collectFields()'), `${file} should collect project fields through the shared core`);
    }
  }
  assert.ok(html.includes('withProjectCalculationFingerprint(payload'), `${file} should fingerprint its project JSON payload`);
  if (legacyMigrationPages.has(file)) {
    assert.match(html, /<script src="\.\.\/shared\/report\.js\?v=10"><\/script>\s*<script src="\.\.\/shared\/project-replay\.js\?v=1"><\/script>/, `${file} should load project-replay.js right after the shared report`);
    assert.ok(html.includes('RCProjectReplay.validateLegacyProjectSource(raw'), `${file} should validate schema, tool, version, and source fingerprint before applying project JSON`);
    assert.ok(html.includes('RCProjectReplay.reconcileProjectCalculationReplay(payload'), `${file} should recompute and reconcile the fingerprint through the shared migration comparison`);
    assert.ok(html.includes('legacyVersions: LEGACY_REPLAY_VERSIONS'), `${file} should declare its legacy replay versions to the shared validator and comparison`);
    assert.ok(html.includes('RCProjectReplay.describeProjectCalculationReplay(replay'), `${file} should disclose replay outcomes through the shared status text`);
    assert.ok(!/sourceVersion\s*=\s*String\(/.test(html), `${file} should not parse project versions outside the shared resolver`);
  } else {
    assert.ok(html.includes('validateProjectCalculationSource'), `${file} should validate schema, tool, version, and source fingerprint before applying project JSON`);
    assert.ok(html.includes('assertProjectCalculationReplay'), `${file} should recompute and compare the fingerprint after applying project JSON`);
    assert.ok(!html.includes('project-replay.js'), `${file} should not load the slab/wall-only legacy replay comparison`);
  }
  assert.ok(html.includes('skipReplayCheck: true'), `${file} should roll back to the previous state after a replay mismatch`);
  assert.ok(html.includes(snapshotCall), `${file} report should use a fresh ${collector} snapshot`);
  assert.ok(html.includes('calculationFingerprint: projectSnapshot.calculationFingerprint')
    || html.includes('calculationFingerprint:projectSnapshot.calculationFingerprint'), `${file} report should reuse the project JSON calculation fingerprint`);
  const outputSourcePattern = new RegExp(`outputSource\\s*:\\s*\\{\\s*tool\\s*:\\s*['"]${escapeRegExp(sourceTool)}['"]\\s*,\\s*version\\s*:\\s*['"]${escapeRegExp(sourceVersion)}['"]\\s*\\}`);
  assert.match(html, outputSourcePattern, `${file} report source tool and version should match its project JSON provenance`);
}
assert.ok(
  fs.readFileSync(path.join(__dirname, 'single-pile-designer.html'), 'utf8').includes('window.buildProjectPayload = buildProjectPayload'),
  'single pile should expose its project payload for provenance integration checks',
);

const visualTests = [
  'beam-report-visual.test.js',
  'column-report-visual.test.js',
  'slab-report-visual.test.js',
  'wall-report-visual.test.js',
  'shear-wall-report-visual.test.js',
  'foundation-report-visual.test.js',
  'single-pile-report-visual.test.js',
];
for (const file of visualTests) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  assert.ok(source.includes('project JSON matches report calculation fingerprint'), `${file} should verify source/report fingerprint equality`);
  assert.match(source, /assertPortableFormalHtml\([^\n]+sourceSnapshot/, `${file} should submit the real project snapshot and approved HTML to the package checker`);
}

const portablePackageGate = fs.readFileSync(path.join(__dirname, 'report-portable-html-check.js'), 'utf8');
assert.ok(portablePackageGate.includes('AttachmentPackageChecker.checkPackage'), 'portable report gate should execute the real attachment package checker');
assert.ok(portablePackageGate.includes('rejects a tampered project fingerprint'), 'portable report gate should prove fingerprint tampering fails closed');
assert.ok(portablePackageGate.includes('rejects a wrong-version project source'), 'portable report gate should prove wrong-version pairing fails closed');
assert.ok(portablePackageGate.includes('rejects a fully reidentified unrelated project source'), 'portable report gate should prove simultaneous identity, version, and fingerprint tampering fails closed');

console.log('RC project/report calculation fingerprint contract OK');
