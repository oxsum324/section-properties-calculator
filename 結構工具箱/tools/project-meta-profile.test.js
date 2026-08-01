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
assert.equal(profile.profileVersion, '1.5');
assert.equal(profile.project.name, '共用工程');
assert.equal(profile.project.no, 'CASE-001');
assert.equal(profile.project.designer, '設計者');
assert.equal(profile.source.toolId, 'source-tool');
assert.match(Profile.describeProfileSource(profile), /來源工具 V1/, 'selected-profile detail identifies the source tool and version');
assert.doesNotMatch(Profile.describeProfileSource(profile), /Invalid Date/, 'selected-profile detail safely formats its saved time');

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

Profile.save(profile, storage);
const migratedLibrary = Profile.loadLibrary(storage);
assert.equal(migratedLibrary.schema, 'tool-project-meta-profile-library.v1');
assert.equal(migratedLibrary.libraryVersion, '1.0');
assert.equal(migratedLibrary.profiles.length, 1, 'legacy latest profile is available through the multi-project library');
assert.equal(Profile.selectedProfile(migratedLibrary).project.no, 'CASE-001');

const secondProfile = Profile.buildProfile({
  projName: '第二工程',
  projNo: 'CASE-002',
  projDesigner: '第二設計者',
  savedAt: '2026-08-01T12:00:00.000Z',
});
const addedSecond = Profile.saveToLibrary(secondProfile, storage);
assert.equal(addedSecond.replaced, false);
assert.equal(addedSecond.library.profiles.length, 2);
assert.equal(addedSecond.profile.project.no, 'CASE-002');
assert.equal(Profile.load(storage).project.no, 'CASE-002', 'selected library profile remains compatible with the legacy latest key');
const deleteSignatureSecond = Profile.deleteConfirmationSignature(addedSecond.id, addedSecond.library);
assert.equal(
  Profile.deleteConfirmationSignature(addedSecond.id, addedSecond.library),
  deleteSignatureSecond,
  'unchanged selection and library retain the same permanent-delete confirmation'
);
assert.notEqual(
  Profile.deleteConfirmationSignature(Profile.profileId(profile), addedSecond.library),
  deleteSignatureSecond,
  'changing the selected project invalidates permanent-delete confirmation'
);

const selectedFirst = Profile.selectFromLibrary(Profile.profileId(profile), storage);
assert.equal(selectedFirst.profile.project.no, 'CASE-001');
assert.equal(Profile.load(storage).project.no, 'CASE-001');

const updatedFirstProfile = Profile.buildProfile({
  projName: '共用工程修訂',
  projNo: 'case-001',
  projDesigner: '新設計者',
  savedAt: '2026-08-01T12:30:00.000Z',
});
assert.equal(Profile.profileId(updatedFirstProfile), Profile.profileId(profile), 'project number identity is case-insensitive');
const updatedFirst = Profile.saveToLibrary(updatedFirstProfile, storage);
assert.equal(updatedFirst.replaced, true, 'saving the same project number updates instead of duplicating it');
assert.equal(updatedFirst.library.profiles.length, 2);
assert.equal(updatedFirst.library.profiles[0].project.name, '共用工程修訂');
assert.equal(updatedFirst.library.profiles[0].project.designer, '新設計者');
assert.notEqual(
  Profile.deleteConfirmationSignature(addedSecond.id, updatedFirst.library),
  deleteSignatureSecond,
  'changing the library invalidates permanent-delete confirmation'
);

const viewAfterSaves = Profile.loadViewState(storage, updatedFirst.library);
assert.equal(viewAfterSaves.schema, 'tool-project-meta-profile-view.v1');
assert.deepEqual(viewAfterSaves.archivedIds, [], 'newly saved projects are active');
assert.deepEqual(viewAfterSaves.lastUsedAt, {}, 'saving alone does not count as a successful apply');
assert.equal(
  Profile.listLibraryProfiles(updatedFirst.library, viewAfterSaves)[0].project.no,
  'case-001',
  'active projects default to most recently saved or used order'
);
Profile.markProfileUsed(Profile.profileId(secondProfile), storage, '2026-08-01T15:00:00.000Z');
const recentlyUsedView = Profile.loadViewState(storage, updatedFirst.library);
assert.equal(
  Profile.listLibraryProfiles(updatedFirst.library, recentlyUsedView)[0].project.no,
  'CASE-002',
  'successful use can move a project to the top without rewriting the library'
);
Profile.archiveProfile(Profile.profileId(secondProfile), storage);
const archivedView = Profile.loadViewState(storage, updatedFirst.library);
assert.equal(Profile.isProfileArchived(archivedView, Profile.profileId(secondProfile)), true);
assert.equal(Profile.load(storage).project.no, 'case-001', 'archiving the selected project advances the active compatibility selection');
assert.deepEqual(
  Profile.listLibraryProfiles(updatedFirst.library, archivedView).map(item => item.project.no),
  ['case-001'],
  'archived projects are hidden from the active list without deletion'
);
const withArchived = Profile.listLibraryProfiles(updatedFirst.library, archivedView, { includeArchived: true });
assert.equal(withArchived.length, 2);
assert.equal(withArchived[0].project.no, 'CASE-002', 'archived projects keep their recent-use order when explicitly shown');
assert.equal(withArchived[0].archived, true);
assert.deepEqual(
  Profile.listLibraryProfiles(updatedFirst.library, archivedView, { query: '新設計者' }).map(item => item.project.no),
  ['case-001'],
  'search matches the designer field'
);
assert.equal(
  Profile.listLibraryProfiles(updatedFirst.library, archivedView, { query: 'case-002' }).length,
  0,
  'default search does not surface archived projects'
);
assert.equal(
  Profile.listLibraryProfiles(updatedFirst.library, archivedView, { query: 'CASE-002', includeArchived: true }).length,
  1,
  'search is case-insensitive and can include archived projects explicitly'
);
Profile.restoreProfile(Profile.profileId(secondProfile), storage);
assert.equal(Profile.isProfileArchived(Profile.loadViewState(storage, updatedFirst.library), Profile.profileId(secondProfile)), false);

const removedFirst = Profile.removeFromLibrary(updatedFirst.id, storage);
assert.equal(removedFirst.removed.project.no, 'case-001');
assert.equal(removedFirst.library.profiles.length, 1);
assert.equal(removedFirst.profile.project.no, 'CASE-002');
assert.equal(Profile.load(storage).project.no, 'CASE-002', 'removing the selected profile safely selects the remaining project');

const capacityStorage = memoryStorage();
let capacityResult = null;
for (let index = 0; index <= Profile.MAX_PROFILES; index += 1) {
  capacityResult = Profile.saveToLibrary(Profile.buildProfile({
    projName: `容量工程 ${index}`,
    projNo: `CAP-${String(index).padStart(2, '0')}`,
    savedAt: `2026-08-01T13:${String(index).padStart(2, '0')}:00.000Z`,
  }), capacityStorage);
}
assert.equal(capacityResult.library.profiles.length, Profile.MAX_PROFILES);
assert.equal(capacityResult.evictedCount, 1);
assert.equal(capacityResult.profile.project.no, 'CAP-20');
assert.equal(capacityResult.library.profiles.some(item => item.project.no === 'CAP-00'), false, 'oldest project is evicted at capacity');
assert.throws(
  () => Profile.saveToLibrary(Profile.buildProfile({}), capacityStorage),
  /沒有可儲存的案件表頭/,
  'blank project cannot replace or expand the library'
);
assert.equal(Profile.loadLibrary(capacityStorage).profiles.length, Profile.MAX_PROFILES);

const backup = Profile.buildBackup(addedSecond.library, '2026-08-01T14:00:00.000Z');
assert.equal(backup.schema, 'tool-project-meta-profile-backup.v1');
assert.equal(backup.backupVersion, '1.0');
assert.equal(backup.profileCount, 2);
assert.deepEqual(backup.boundary.fields, ['name', 'no', 'designer']);
assert.equal(backup.boundary.includesEngineeringInputs, false);
assert.equal(backup.boundary.includesApprovalState, false);
assert.equal(JSON.stringify(backup).includes('archivedIds'), false, 'local archive state is excluded from the portable backup');
assert.equal(JSON.stringify(backup).includes('lastUsedAt'), false, 'local recent-use state is excluded from the portable backup');
const backupText = Profile.serializeBackup(addedSecond.library, '2026-08-01T14:00:00.000Z');
const parsedBackup = Profile.parseBackupText(backupText);
assert.equal(parsedBackup.profileCount, 2);
assert.equal(parsedBackup.library.profiles[0].project.no, 'CASE-002');
assert.equal(Profile.backupFileName('2026-08-01T14:05:06.000Z'), 'project-header-library-20260801-140506.json');

const extraFieldBackup = JSON.parse(backupText);
extraFieldBackup.engineeringInputs = { Mu: 99 };
assert.throws(() => Profile.normalizeBackup(extraFieldBackup), /欄位不符合備份格式/, 'unknown top-level fields are rejected');
const forbiddenBoundaryBackup = JSON.parse(backupText);
forbiddenBoundaryBackup.boundary.includesApprovalState = true;
assert.throws(() => Profile.normalizeBackup(forbiddenBoundaryBackup), /包含禁止資料/);
const extraProfileFieldBackup = JSON.parse(backupText);
extraProfileFieldBackup.library.profiles[0].material = { fc: 280 };
assert.throws(() => Profile.normalizeBackup(extraProfileFieldBackup), /案件表頭欄位不符合備份格式/);
const duplicateBackup = JSON.parse(backupText);
duplicateBackup.library.profiles.push(JSON.parse(JSON.stringify(duplicateBackup.library.profiles[0])));
duplicateBackup.profileCount += 1;
assert.throws(() => Profile.normalizeBackup(duplicateBackup), /重複案件識別/);
assert.throws(() => Profile.parseBackupText('x'.repeat(Profile.MAX_BACKUP_BYTES + 1)), /超過 256 KiB/);

const importStorage = memoryStorage();
Profile.saveToLibrary(Profile.buildProfile({ projName: '本機優先案名', projNo: 'CASE-001', projDesigner: '本機設計者' }), importStorage);
Profile.saveToLibrary(Profile.buildProfile({ projName: '本機第三案', projNo: 'LOCAL-003' }), importStorage);
const importPreview = Profile.prepareLibraryImport(backup, importStorage);
assert.equal(importPreview.status, 'ready');
assert.equal(importPreview.additions.length, 1);
assert.equal(importPreview.additions[0].project.no, 'CASE-002');
assert.equal(importPreview.preserved.length, 1, 'same project identity keeps the local version');
assert.equal(Profile.loadLibrary(importStorage).profiles.length, 2, 'preview is non-mutating');
const importedLibrary = Profile.commitLibraryImport(importPreview, importStorage);
assert.equal(importedLibrary.profiles.length, 3);
assert.equal(importedLibrary.profiles.find(item => item.id === Profile.profileId(profile)).project.name, '本機優先案名');
assert.equal(importedLibrary.profiles.some(item => item.project.no === 'CASE-002'), true);

const noChangePreview = Profile.prepareLibraryImport(Profile.buildBackup(importedLibrary, '2026-08-01T14:10:00.000Z'), importStorage);
assert.equal(noChangePreview.status, 'no-change');
assert.equal(noChangePreview.additions.length, 0);
assert.throws(() => Profile.commitLibraryImport(noChangePreview, importStorage), /尚未可執行/);

const changingImportStorage = memoryStorage();
Profile.saveToLibrary(Profile.buildProfile({ projNo: 'LOCAL-010' }), changingImportStorage);
const changingPreview = Profile.prepareLibraryImport(backup, changingImportStorage);
Profile.saveToLibrary(Profile.buildProfile({ projNo: 'LOCAL-011' }), changingImportStorage);
assert.throws(
  () => Profile.commitLibraryImport(changingPreview, changingImportStorage),
  /本機案件表頭清單已變更/,
  'a preview cannot overwrite a library that changed before confirmation'
);

const capacityBackup = Profile.buildBackup(Profile.buildLibrary([
  Profile.buildProfile({ projNo: 'OVER-CAPACITY-001' }),
]), '2026-08-01T14:15:00.000Z');
const capacityPreview = Profile.prepareLibraryImport(capacityBackup, capacityStorage);
assert.equal(capacityPreview.status, 'blocked');
assert.equal(capacityPreview.reason, 'capacity-exceeded');
assert.equal(Profile.loadLibrary(capacityStorage).profiles.length, Profile.MAX_PROFILES, 'blocked import does not evict local projects');

Profile.clearLibrary(storage);
assert.equal(Profile.load(storage), null);
assert.equal(Profile.loadLibrary(storage).profiles.length, 0);
assert.equal(storage.getItem(Profile.VIEW_STORAGE_KEY), null, 'clearing the project library also clears local list-management state');
assert.throws(() => Profile.normalizeLibrary({ schema: 'unknown-library.v1' }), /不支援的案件表頭清單格式/);

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
assert.match(source, /data-project-meta-select/, 'multi-project library requires an explicit profile selector');
assert.match(source, /可保存多個案件/, 'shared header UI explains the multi-project capability');
assert.match(source, /data-project-meta-delete-confirming/, 'permanent project removal requires a distinct confirmation state');
assert.match(source, /確認永久刪除/, 'permanent project removal requires a second explicit click');
assert.match(source, /建議不再使用但仍需保留的案件改用封存/, 'permanent removal directs retainable projects to the reversible archive path');
assert.match(source, /data-project-meta-detail/, 'selected project exposes saved-time and source details in the HTML work view');
assert.match(source, /data-project-meta-export/, 'multi-project library exposes an explicit backup export');
assert.match(source, /data-project-meta-import-confirming/, 'backup import requires an explicit preview confirmation state');
assert.match(source, /目前清單與頁面尚未變更/, 'import preview states its non-mutating boundary');
assert.match(source, /data-project-meta-search/, 'multi-project library exposes a header-only search control');
assert.match(source, /data-project-meta-archive/, 'multi-project library exposes reversible archive management');
assert.match(source, /依最近使用排序/, 'multi-project library states its recent-use ordering');
assert.match(source, /封存案件須先解除封存才可套用/, 'archived projects cannot be applied accidentally');

console.log(`project meta profile tests passed (${standardizedPages.length} pages)`);
