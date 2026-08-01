'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Profile = require('./project-meta-profile.js');

class FakeEvent {
  constructor(type) { this.type = type; }
}

class FakeElement {
  constructor(value = '') {
    this.value = value;
    this.events = [];
  }
  dispatchEvent(event) { this.events.push(event.type); }
}

function fakeDocument(elements) {
  return {
    defaultView: { Event: FakeEvent },
    getElementById(id) { return elements[id] || null; },
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const profile = Profile.buildProfile({
  projName: ' 共用工程 ',
  projNo: 'CASE-001',
  projDesigner: ' 設計者 ',
}, { toolId: 'source-tool', toolName: '來源工具', toolVersion: 'V1' });
assert.equal(profile.schema, 'tool-project-meta-profile.v1');
assert.equal(profile.profileVersion, '1.1');
assert.equal(profile.project.name, '共用工程');
assert.equal(profile.project.no, 'CASE-001');
assert.equal(profile.project.designer, '設計者');
assert.equal(profile.source.toolId, 'source-tool');

const storage = memoryStorage();
Profile.save(profile, storage);
assert.deepEqual(Profile.load(storage), profile);
assert.equal(Profile.hasProjectValues(Profile.buildProfile({ projName: '未填' })), false, 'placeholder text is a legal blank, not shared data');
assert.throws(
  () => Profile.save(Profile.buildProfile({}), storage),
  /沒有可帶入其他工具的資料/,
  'all-blank fields do not replace an existing shared profile'
);
assert.deepEqual(Profile.load(storage), profile, 'failed blank save preserves the previous shared profile');

const elements = {
  projName: new FakeElement('既有案名'),
  projNo: new FakeElement('OLD-001'),
  projDesigner: new FakeElement('既有設計者'),
};
const conflictDocument = fakeDocument(elements);
const preview = Profile.applyToDocument(conflictDocument, profile);
assert.equal(preview.requiresConfirmation, true, 'different nonblank project metadata requires confirmation');
assert.equal(preview.conflicts.length, 3);
assert.equal(preview.applied.length, 0, 'conflicting metadata is not partially applied before confirmation');
assert.equal(elements.projName.value, '既有案名');
assert.equal(elements.projNo.value, 'OLD-001');
assert.equal(elements.projDesigner.value, '既有設計者');
assert.deepEqual(elements.projName.events, []);

const signatureBefore = Profile.applicationSignature(conflictDocument, profile);
elements.projNo.value = 'CHANGED-BEFORE-CONFIRM';
assert.notEqual(
  Profile.applicationSignature(conflictDocument, profile),
  signatureBefore,
  'editing target metadata invalidates a pending confirmation'
);
elements.projNo.value = 'OLD-001';

const applied = Profile.applyToDocument(conflictDocument, profile, { allowConflicts: true });
assert.equal(applied.requiresConfirmation, false);
assert.equal(applied.applied.length, 3);
assert.equal(elements.projName.value, '共用工程');
assert.equal(elements.projNo.value, 'CASE-001');
assert.equal(elements.projDesigner.value, '設計者');
assert.deepEqual(elements.projName.events, ['input', 'change']);

const partialElements = {
  projName: new FakeElement('保留既有案名'),
  projNo: new FakeElement('OLD-002'),
  projDesigner: new FakeElement('保留既有設計者'),
};
const partial = Profile.applyToDocument(
  fakeDocument(partialElements),
  Profile.buildProfile({ projNo: 'NEW-002' }),
  { allowConflicts: true }
);
assert.equal(partial.applied.length, 1);
assert.equal(partialElements.projName.value, '保留既有案名', 'blank shared project name must not erase the target page');
assert.equal(partialElements.projNo.value, 'NEW-002');
assert.equal(partialElements.projDesigner.value, '保留既有設計者', 'blank shared designer must not erase the target page');

const blankTargetElements = {
  projName: new FakeElement(''),
  projNo: new FakeElement(''),
  projDesigner: new FakeElement(''),
};
const blankTargetApply = Profile.applyToDocument(fakeDocument(blankTargetElements), profile);
assert.equal(blankTargetApply.requiresConfirmation, false, 'blank targets can be populated without a redundant confirmation');
assert.equal(blankTargetApply.applied.length, 3);
assert.equal(blankTargetElements.projName.value, '共用工程');

Profile.clear(storage);
assert.equal(Profile.load(storage), null);
assert.throws(() => Profile.normalizeProfile({ schema: 'unknown.v1' }), /不支援的共用表頭格式/);

const repoRoot = path.resolve(__dirname, '..', '..');
const excludedDirectories = new Set(['.git', '.claude', '.codex', 'node_modules', 'output', 'testdeps', 'app_data']);
function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (entry.isFile() && /\.html$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const standardizedPages = walk(repoRoot).filter(filePath => {
  const html = fs.readFileSync(filePath, 'utf8');
  return ['projName', 'projNo', 'projDesigner'].every(id => new RegExp(`\\bid=["']${id}["']`).test(html));
});
assert.ok(standardizedPages.length >= 34, `expected at least 34 standardized project-header pages, found ${standardizedPages.length}`);
for (const filePath of standardizedPages) {
  const html = fs.readFileSync(filePath, 'utf8');
  assert.match(html, /project-meta-profile\.js/, `${path.relative(repoRoot, filePath)} loads the shared project-header profile`);
  const scriptIndex = html.lastIndexOf('project-meta-profile.js');
  const bodyIndex = html.lastIndexOf('</body>');
  assert.ok(
    scriptIndex >= 0 && bodyIndex > scriptIndex && bodyIndex - scriptIndex < 200,
    `${path.relative(repoRoot, filePath)} loads the shared project-header profile in the work page, not an embedded report template`
  );
  assert.equal(
    (html.match(/project-meta-profile\.js/g) || []).length,
    1,
    `${path.relative(repoRoot, filePath)} loads the shared project-header profile exactly once`
  );
}

const source = fs.readFileSync(require.resolve('./project-meta-profile.js'), 'utf8');
assert.ok(
  source.includes("'@media print{.' + CONTROL_CLASS + '{display:none!important}}'"),
  'shared project-header controls have an explicit print boundary'
);
assert.match(source, /空白可由主文承接/, 'shared project-header UI states that blank metadata remains valid');
assert.doesNotMatch(source, /自動套用/, 'shared project metadata requires an explicit apply action');
assert.match(source, /目前頁面尚未變更/, 'conflict preview clearly states that the first click is non-mutating');
assert.match(source, /data-project-meta-confirming/, 'conflicting nonblank metadata requires a distinct confirmation state');

console.log(`project meta profile tests passed (${standardizedPages.length} pages)`);
