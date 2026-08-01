(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ToolProjectMetaProfile = api;
  if (root && root.document) {
    const bind = function () { api.autoBind(root); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCHEMA = 'tool-project-meta-profile.v1';
  const PROFILE_VERSION = '1.3';
  const STORAGE_KEY = 'toolProjectMetaProfile:latest.v1';
  const LIBRARY_SCHEMA = 'tool-project-meta-profile-library.v1';
  const LIBRARY_VERSION = '1.0';
  const LIBRARY_STORAGE_KEY = 'toolProjectMetaProfile:library.v1';
  const MAX_PROFILES = 20;
  const BACKUP_SCHEMA = 'tool-project-meta-profile-backup.v1';
  const BACKUP_VERSION = '1.0';
  const MAX_BACKUP_BYTES = 256 * 1024;
  const CONTROL_CLASS = 'project-meta-profile-bar';
  const FIELD_SPECS = Object.freeze([
    { id: 'projName', key: 'name', label: '計畫名稱' },
    { id: 'projNo', key: 'no', label: '計畫編號' },
    { id: 'projDesigner', key: 'designer', label: '設計者' },
  ]);

  function normalizeText(value) {
    const text = String(value == null ? '' : value).trim();
    return text === '未填' ? '' : text;
  }

  function buildProfile(source, meta) {
    const input = source || {};
    const project = input.project || input;
    const sourceMeta = meta || input.source || {};
    return {
      schema: SCHEMA,
      profileVersion: PROFILE_VERSION,
      savedAt: normalizeText(input.savedAt) || new Date().toISOString(),
      source: {
        toolId: normalizeText(sourceMeta.toolId),
        toolName: normalizeText(sourceMeta.toolName),
        toolVersion: normalizeText(sourceMeta.toolVersion),
      },
      project: {
        name: normalizeText(project.name ?? project.projName),
        no: normalizeText(project.no ?? project.projNo),
        designer: normalizeText(project.designer ?? project.projDesigner),
      },
    };
  }

  function normalizeProfile(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('共用表頭資料格式不正確。');
    if (payload.schema !== SCHEMA) throw new Error(`不支援的共用表頭格式：${payload.schema || '未標示'}`);
    return buildProfile({
      savedAt: payload.savedAt,
      source: payload.source,
      project: payload.project,
    });
  }

  function hasProjectValues(payload) {
    const profile = payload?.schema === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    return FIELD_SPECS.some(spec => !!profile.project[spec.key]);
  }

  function collectFromDocument(doc, meta) {
    const project = {};
    FIELD_SPECS.forEach(spec => {
      project[spec.key] = normalizeText(doc?.getElementById?.(spec.id)?.value);
    });
    return buildProfile({ project }, meta);
  }

  function save(payload, storage) {
    const profile = payload?.schema === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    if (!hasProjectValues(profile)) throw new Error('目前三個表頭欄位皆為空白，沒有可帶入其他工具的資料。');
    target.setItem(STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  function load(storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return null;
    const raw = target.getItem(STORAGE_KEY);
    return raw ? normalizeProfile(JSON.parse(raw)) : null;
  }

  function clear(storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return false;
    target.removeItem(STORAGE_KEY);
    return true;
  }

  function identityText(value) {
    return normalizeText(value).normalize('NFC').toLowerCase();
  }

  function profileIdentity(payload) {
    const profile = payload?.schema === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    if (profile.project.no) return `no:${identityText(profile.project.no)}`;
    if (profile.project.name) return `name:${identityText(profile.project.name)}`;
    if (profile.project.designer) return `designer:${identityText(profile.project.designer)}`;
    throw new Error('空白表頭不能建立案件識別。');
  }

  function profileId(payload) {
    return `project:${profileIdentity(payload)}`;
  }

  function profileRecord(payload) {
    const profile = payload?.schema === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    return { id: profileId(profile), ...profile };
  }

  function buildLibrary(profiles, selectedId, updatedAt) {
    const records = [];
    const seen = new Set();
    for (const payload of Array.isArray(profiles) ? profiles : []) {
      const record = profileRecord(payload);
      if (!hasProjectValues(record) || seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
      if (records.length >= MAX_PROFILES) break;
    }
    const requestedId = normalizeText(selectedId);
    return {
      schema: LIBRARY_SCHEMA,
      libraryVersion: LIBRARY_VERSION,
      updatedAt: normalizeText(updatedAt) || new Date().toISOString(),
      selectedId: records.some(record => record.id === requestedId) ? requestedId : (records[0]?.id || ''),
      profiles: records,
    };
  }

  function normalizeLibrary(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('案件表頭清單格式不正確。');
    if (payload.schema !== LIBRARY_SCHEMA) throw new Error(`不支援的案件表頭清單格式：${payload.schema || '未標示'}`);
    return buildLibrary(payload.profiles, payload.selectedId, payload.updatedAt);
  }

  function selectedProfile(library) {
    const normalized = library?.schema === LIBRARY_SCHEMA ? normalizeLibrary(library) : buildLibrary([]);
    const record = normalized.profiles.find(item => item.id === normalized.selectedId);
    return record ? normalizeProfile(record) : null;
  }

  function mergeLegacyProfile(library, legacyProfile) {
    if (!legacyProfile || !hasProjectValues(legacyProfile)) return library;
    const legacyRecord = profileRecord(legacyProfile);
    const selectedRecord = library.profiles.find(record => record.id === library.selectedId);
    const selectedMatches = selectedRecord
      && selectedRecord.id === legacyRecord.id
      && selectedRecord.savedAt === legacyRecord.savedAt
      && JSON.stringify(selectedRecord.project) === JSON.stringify(legacyRecord.project);
    if (selectedMatches) return library;
    return buildLibrary(
      [legacyRecord, ...library.profiles.filter(record => record.id !== legacyRecord.id)],
      legacyRecord.id,
      library.updatedAt
    );
  }

  function loadLibrary(storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return buildLibrary([]);
    const raw = target.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) {
      const legacy = load(target);
      return buildLibrary(legacy ? [legacy] : [], legacy ? profileId(legacy) : '');
    }
    const library = normalizeLibrary(JSON.parse(raw));
    let legacy = null;
    try { legacy = load(target); } catch (_) { legacy = null; }
    return mergeLegacyProfile(library, legacy);
  }

  function writeLibrary(payload, storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    const library = payload?.schema === LIBRARY_SCHEMA ? normalizeLibrary(payload) : buildLibrary([]);
    target.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
    const selected = selectedProfile(library);
    if (selected) target.setItem(STORAGE_KEY, JSON.stringify(selected));
    else target.removeItem(STORAGE_KEY);
    return library;
  }

  function saveToLibrary(payload, storage) {
    const profile = payload?.schema === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    if (!hasProjectValues(profile)) throw new Error('目前三個表頭欄位皆為空白，沒有可儲存的案件表頭。');
    const current = loadLibrary(storage);
    const record = profileRecord(profile);
    const replaced = current.profiles.some(item => item.id === record.id);
    const candidates = [record, ...current.profiles.filter(item => item.id !== record.id)];
    const evictedCount = Math.max(0, candidates.length - MAX_PROFILES);
    const library = writeLibrary(buildLibrary(candidates, record.id), storage);
    return { library, profile: selectedProfile(library), id: record.id, replaced, evictedCount };
  }

  function selectFromLibrary(id, storage) {
    const current = loadLibrary(storage);
    const selectedId = normalizeText(id);
    if (!current.profiles.some(record => record.id === selectedId)) throw new Error('找不到所選案件表頭。');
    const library = writeLibrary(buildLibrary(current.profiles, selectedId), storage);
    return { library, profile: selectedProfile(library) };
  }

  function removeFromLibrary(id, storage) {
    const current = loadLibrary(storage);
    const removedId = normalizeText(id || current.selectedId);
    const removed = current.profiles.find(record => record.id === removedId) || null;
    if (!removed) return { library: current, removed: null, profile: selectedProfile(current) };
    const profiles = current.profiles.filter(record => record.id !== removedId);
    const library = writeLibrary(buildLibrary(profiles, profiles[0]?.id || ''), storage);
    return { library, removed: normalizeProfile(removed), profile: selectedProfile(library) };
  }

  function clearLibrary(storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return false;
    target.removeItem(LIBRARY_STORAGE_KEY);
    target.removeItem(STORAGE_KEY);
    return true;
  }

  function assertExactKeys(value, expectedKeys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正確。`);
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}欄位不符合備份格式。`);
  }

  function assertPortableProfileRecord(record) {
    assertExactKeys(record, ['id', 'schema', 'profileVersion', 'savedAt', 'source', 'project'], '案件表頭');
    assertExactKeys(record.source, ['toolId', 'toolName', 'toolVersion'], '案件表頭來源');
    assertExactKeys(record.project, ['name', 'no', 'designer'], '案件表頭內容');
    const normalized = profileRecord(record);
    if (record.id !== normalized.id) throw new Error('案件表頭識別與內容不一致。');
    if (!hasProjectValues(normalized)) throw new Error('備份不得包含全空白案件表頭。');
    return normalized;
  }

  function buildBackup(libraryPayload, exportedAt) {
    const library = libraryPayload?.schema === LIBRARY_SCHEMA
      ? normalizeLibrary(libraryPayload)
      : buildLibrary([]);
    return {
      schema: BACKUP_SCHEMA,
      backupVersion: BACKUP_VERSION,
      exportedAt: normalizeText(exportedAt) || new Date().toISOString(),
      profileCount: library.profiles.length,
      boundary: {
        fields: ['name', 'no', 'designer'],
        includesEngineeringInputs: false,
        includesApprovalState: false,
      },
      library,
    };
  }

  function normalizeBackup(payload) {
    assertExactKeys(payload, ['schema', 'backupVersion', 'exportedAt', 'profileCount', 'boundary', 'library'], '案件表頭備份');
    if (payload.schema !== BACKUP_SCHEMA) throw new Error(`不支援的案件表頭備份格式：${payload.schema || '未標示'}`);
    if (payload.backupVersion !== BACKUP_VERSION) throw new Error(`不支援的案件表頭備份版本：${payload.backupVersion || '未標示'}`);
    const exportedAt = normalizeText(payload.exportedAt);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(exportedAt) || !Number.isFinite(Date.parse(exportedAt))) {
      throw new Error('案件表頭備份時間無效。');
    }
    assertExactKeys(payload.boundary, ['fields', 'includesEngineeringInputs', 'includesApprovalState'], '案件表頭備份邊界');
    if (JSON.stringify(payload.boundary.fields) !== JSON.stringify(['name', 'no', 'designer'])
      || payload.boundary.includesEngineeringInputs !== false
      || payload.boundary.includesApprovalState !== false) {
      throw new Error('案件表頭備份超出允許欄位或包含禁止資料。');
    }
    assertExactKeys(payload.library, ['schema', 'libraryVersion', 'updatedAt', 'selectedId', 'profiles'], '案件表頭清單');
    if (!Array.isArray(payload.library.profiles)) throw new Error('案件表頭清單內容格式不正確。');
    if (payload.library.profiles.length > MAX_PROFILES) throw new Error(`案件表頭備份超過 ${MAX_PROFILES} 筆上限。`);
    const records = payload.library.profiles.map(assertPortableProfileRecord);
    const library = buildLibrary(records, payload.library.selectedId, payload.library.updatedAt);
    if (library.profiles.length !== records.length) throw new Error('案件表頭備份包含重複案件識別。');
    if (!Number.isInteger(payload.profileCount) || payload.profileCount !== library.profiles.length) {
      throw new Error('案件表頭備份筆數與內容不一致。');
    }
    return buildBackup(library, exportedAt);
  }

  function utf8ByteLength(value) {
    const text = String(value == null ? '' : value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
    if (typeof Blob !== 'undefined') return new Blob([text]).size;
    return text.length;
  }

  function serializeBackup(library, exportedAt) {
    return `${JSON.stringify(buildBackup(library, exportedAt), null, 2)}\n`;
  }

  function parseBackupText(text) {
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) throw new Error('案件表頭備份檔是空白的。');
    if (utf8ByteLength(raw) > MAX_BACKUP_BYTES) throw new Error('案件表頭備份檔超過 256 KiB 上限。');
    let payload;
    try { payload = JSON.parse(raw); } catch (_) { throw new Error('案件表頭備份不是有效的 JSON。'); }
    return normalizeBackup(payload);
  }

  function librarySignature(libraryPayload) {
    const library = libraryPayload?.schema === LIBRARY_SCHEMA ? normalizeLibrary(libraryPayload) : buildLibrary([]);
    return JSON.stringify({
      selectedId: library.selectedId,
      profiles: library.profiles.map(record => ({
        id: record.id,
        savedAt: record.savedAt,
        source: record.source,
        project: record.project,
      })),
    });
  }

  function prepareLibraryImport(backupPayload, storage) {
    const backup = normalizeBackup(backupPayload);
    const current = loadLibrary(storage);
    const currentIds = new Set(current.profiles.map(record => record.id));
    const additions = backup.library.profiles.filter(record => !currentIds.has(record.id));
    const preserved = backup.library.profiles.filter(record => currentIds.has(record.id));
    const projectedCount = current.profiles.length + additions.length;
    if (projectedCount > MAX_PROFILES) {
      return {
        status: 'blocked',
        reason: 'capacity-exceeded',
        backup,
        currentSignature: librarySignature(current),
        additions,
        preserved,
        projectedCount,
        library: null,
      };
    }
    const selectedId = current.profiles.length ? current.selectedId : backup.library.selectedId;
    const library = buildLibrary([...current.profiles, ...additions], selectedId);
    return {
      status: additions.length ? 'ready' : 'no-change',
      reason: additions.length ? '' : 'all-projects-exist',
      backup,
      currentSignature: librarySignature(current),
      additions,
      preserved,
      projectedCount,
      library,
    };
  }

  function commitLibraryImport(preview, storage) {
    if (!preview || preview.status !== 'ready' || !preview.library) throw new Error('案件表頭匯入預覽尚未可執行。');
    const current = loadLibrary(storage);
    if (librarySignature(current) !== preview.currentSignature) throw new Error('本機案件表頭清單已變更，請重新選擇匯入檔。');
    return writeLibrary(preview.library, storage);
  }

  function backupFileName(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    const iso = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
    return `project-header-library-${iso.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}.json`;
  }

  function downloadLibraryBackup(rootWindow, library) {
    const doc = rootWindow?.document;
    const URLApi = rootWindow?.URL;
    const BlobCtor = rootWindow?.Blob;
    if (!doc || !URLApi?.createObjectURL || !BlobCtor) throw new Error('目前瀏覽器不支援案件表頭備份下載。');
    const backup = buildBackup(library);
    if (!backup.profileCount) throw new Error('尚無案件表頭可供匯出。');
    const blob = new BlobCtor([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URLApi.createObjectURL(blob);
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = backupFileName(backup.exportedAt);
    anchor.style.display = 'none';
    doc.body.appendChild(anchor);
    try { anchor.click(); } finally {
      anchor.remove();
      rootWindow.setTimeout(() => URLApi.revokeObjectURL(url), 0);
    }
    return { backup, fileName: anchor.download, bytes: blob.size };
  }

  function dispatchFieldEvents(doc, element) {
    const EventCtor = doc?.defaultView?.Event || (typeof Event !== 'undefined' ? Event : null);
    if (!EventCtor) return;
    element.dispatchEvent(new EventCtor('input', { bubbles: true }));
    element.dispatchEvent(new EventCtor('change', { bubbles: true }));
  }

  function analyzeApplication(doc, payload) {
    const profile = normalizeProfile(payload);
    const applicable = [];
    const conflicts = [];
    const skipped = [];
    FIELD_SPECS.forEach(spec => {
      const element = doc?.getElementById?.(spec.id);
      const value = profile.project[spec.key];
      if (!element) {
        skipped.push({ ...spec, reason: 'target-missing' });
        return;
      }
      if (!value) {
        skipped.push({ ...spec, reason: 'value-blank' });
        return;
      }
      const currentValue = normalizeText(element.value);
      const item = { id: spec.id, key: spec.key, label: spec.label, value, currentValue };
      applicable.push(item);
      if (currentValue && currentValue !== value) conflicts.push(item);
    });
    return { profile, applicable, conflicts, skipped };
  }

  function applyToDocument(doc, payload, options) {
    const analysis = analyzeApplication(doc, payload);
    const allowConflicts = options?.allowConflicts === true;
    if (analysis.conflicts.length && !allowConflicts) {
      return { ...analysis, applied: [], requiresConfirmation: true };
    }
    const applied = [];
    analysis.applicable.forEach(item => {
      const element = doc?.getElementById?.(item.id);
      if (!element) return;
      element.value = item.value;
      dispatchFieldEvents(doc, element);
      applied.push(item);
    });
    return { ...analysis, applied, requiresConfirmation: false };
  }

  function applicationSignature(doc, payload) {
    const analysis = analyzeApplication(doc, payload);
    return JSON.stringify({
      savedAt: analysis.profile.savedAt,
      project: analysis.profile.project,
      target: FIELD_SPECS.map(spec => normalizeText(doc?.getElementById?.(spec.id)?.value)),
    });
  }

  function resetApplyConfirmation(button, state) {
    state.signature = '';
    button.textContent = '套用共用表頭';
    button.removeAttribute('data-project-meta-confirming');
  }

  function resetImportConfirmation(button, state) {
    state.preview = null;
    button.textContent = '匯入清單';
    button.removeAttribute('data-project-meta-import-confirming');
  }

  function conflictLabels(conflicts) {
    return conflicts.map(item => item.label).join('、');
  }

  function safeToolId(text) {
    return normalizeText(text)
      .replace(/\.html?$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  function findScript(doc) {
    return doc?.currentScript || Array.from(doc?.scripts || []).find(script => /project-meta-profile\.js(?:\?|$)/.test(script.src || ''));
  }

  function getToolMeta(rootWindow, script) {
    const pathname = String(rootWindow?.location?.pathname || '');
    const filename = pathname.split('/').pop() || '';
    return {
      toolId: normalizeText(script?.dataset?.projectMetaToolId) || safeToolId(filename || rootWindow?.document?.title || 'tool'),
      toolName: normalizeText(script?.dataset?.projectMetaToolName) || normalizeText(rootWindow?.document?.title),
      toolVersion: normalizeText(script?.dataset?.projectMetaToolVersion),
    };
  }

  function describeProfile(profile) {
    if (!profile) return '尚無共用表頭；可在任一工具儲存後再套用。空白可由主文承接。';
    const values = FIELD_SPECS
      .filter(spec => !!profile.project[spec.key])
      .map(spec => `${spec.label}：${profile.project[spec.key]}`);
    return values.length ? `已有共用表頭（${values.join('；')}）。` : '共用表頭沒有可套用的內容。';
  }

  function profileOptionLabel(payload) {
    const profile = normalizeProfile(payload);
    const parts = [profile.project.no, profile.project.name, profile.project.designer].filter(Boolean);
    const label = parts.join('｜') || '未命名案件';
    return label.length > 80 ? `${label.slice(0, 79)}…` : label;
  }

  function refreshLibrarySelect(doc, select, storage) {
    const library = loadLibrary(storage);
    while (select.firstChild) select.removeChild(select.firstChild);
    if (!library.profiles.length) {
      const option = doc.createElement('option');
      option.value = '';
      option.textContent = '尚無已存案件';
      select.appendChild(option);
      select.disabled = true;
      return library;
    }
    library.profiles.forEach(record => {
      const option = doc.createElement('option');
      option.value = record.id;
      option.textContent = profileOptionLabel(record);
      select.appendChild(option);
    });
    select.disabled = false;
    select.value = library.selectedId;
    return library;
  }

  function setStatus(bar, message, tone) {
    const node = bar?.querySelector?.('[data-project-meta-status]');
    if (!node) return;
    node.textContent = message || '';
    node.dataset.tone = tone || 'ok';
  }

  function createBar(rootWindow, meta) {
    const doc = rootWindow.document;
    const bar = doc.createElement('div');
    bar.className = CONTROL_CLASS;
    bar.innerHTML = [
      '<strong>跨工具共用表頭</strong>',
      '<span>可保存多個案件；選用，不影響計算。</span>',
      '<select data-project-meta-select aria-label="選擇已儲存的案件表頭"></select>',
      '<button type="button" data-project-meta-save>儲存目前表頭</button>',
      '<button type="button" data-project-meta-apply>套用共用表頭</button>',
      '<button type="button" data-project-meta-clear>刪除所選</button>',
      '<button type="button" data-project-meta-export>匯出清單</button>',
      '<button type="button" data-project-meta-import>匯入清單</button>',
      '<input type="file" accept="application/json,.json" data-project-meta-import-file hidden>',
      '<span class="project-meta-profile-status" data-project-meta-status aria-live="polite"></span>',
    ].join('');

    const style = doc.createElement('style');
    style.id = 'projectMetaProfileStyle';
    style.textContent = [
      '.' + CONTROL_CLASS + '{max-width:1200px;margin:10px auto 0;padding:9px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f0f9ff;border:1px solid #bae6fd;border-left:4px solid #0284c7;border-radius:8px;color:#0c4a6e;font-size:.84em;line-height:1.55}',
      '.' + CONTROL_CLASS + ' strong{font-size:1em}',
      '.' + CONTROL_CLASS + ' button,.' + CONTROL_CLASS + ' select{border:0;border-radius:7px;padding:7px 10px;background:#e0f2fe;color:#075985;font-weight:700}',
      '.' + CONTROL_CLASS + ' select{max-width:min(100%,360px)}',
      '.' + CONTROL_CLASS + ' button{cursor:pointer}',
      '.' + CONTROL_CLASS + ' button:hover{filter:brightness(.96)}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status{flex:1 1 280px;font-weight:700}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status[data-tone="warn"]{color:#92400e}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status[data-tone="error"]{color:#991b1b}',
      '@media print{.' + CONTROL_CLASS + '{display:none!important}}',
    ].join('');
    if (!doc.getElementById(style.id)) doc.head.appendChild(style);

    const applyButton = bar.querySelector('[data-project-meta-apply]');
    const profileSelect = bar.querySelector('[data-project-meta-select]');
    const removeButton = bar.querySelector('[data-project-meta-clear]');
    const exportButton = bar.querySelector('[data-project-meta-export]');
    const importButton = bar.querySelector('[data-project-meta-import]');
    const importInput = bar.querySelector('[data-project-meta-import-file]');
    const confirmation = { signature: '' };
    const importConfirmation = { preview: null };
    const refreshControls = function () {
      const library = refreshLibrarySelect(doc, profileSelect, rootWindow.localStorage);
      exportButton.disabled = !library.profiles.length;
      removeButton.disabled = !library.profiles.length;
      return library;
    };

    bar.querySelector('[data-project-meta-save]').addEventListener('click', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImportConfirmation(importButton, importConfirmation);
        const result = saveToLibrary(collectFromDocument(doc, meta), rootWindow.localStorage);
        refreshControls();
        const action = result.replaced ? '已更新所選案件表頭' : '已新增案件表頭';
        const capacity = result.evictedCount ? `；已移除 ${result.evictedCount} 筆最舊資料以維持 ${MAX_PROFILES} 筆上限` : '';
        setStatus(bar, `${action}；清單共 ${result.library.profiles.length} 筆${capacity}。${describeProfile(result.profile)}`, 'ok');
      } catch (error) {
        setStatus(bar, String(error?.message || error), 'warn');
      }
    });
    profileSelect.addEventListener('change', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImportConfirmation(importButton, importConfirmation);
        const result = selectFromLibrary(profileSelect.value, rootWindow.localStorage);
        setStatus(bar, `已選擇案件表頭，尚未套用至目前頁面。${describeProfile(result.profile)}`, 'ok');
      } catch (error) {
        setStatus(bar, `案件表頭無法選擇：${String(error?.message || error)}`, 'error');
      }
    });
    applyButton.addEventListener('click', function () {
      try {
        const profile = selectedProfile(loadLibrary(rootWindow.localStorage));
        if (!profile) {
          resetApplyConfirmation(applyButton, confirmation);
          setStatus(bar, '尚無共用表頭，畫面維持原值。空白可由主文承接。', 'warn');
          return;
        }
        const signature = applicationSignature(doc, profile);
        const preview = applyToDocument(doc, profile);
        if (preview.requiresConfirmation && confirmation.signature !== signature) {
          confirmation.signature = signature;
          applyButton.textContent = `確認覆寫 ${preview.conflicts.length} 項`;
          applyButton.setAttribute('data-project-meta-confirming', 'true');
          setStatus(
            bar,
            `偵測到 ${preview.conflicts.length} 項既有表頭不同：${conflictLabels(preview.conflicts)}。請確認案件後再按一次「確認覆寫」；目前頁面尚未變更。`,
            'warn'
          );
          return;
        }
        const result = preview.requiresConfirmation
          ? applyToDocument(doc, profile, { allowConflicts: true })
          : preview;
        resetApplyConfirmation(applyButton, confirmation);
        const labels = result.applied.map(item => item.label).join('、');
        setStatus(
          bar,
          result.applied.length ? `已套用 ${result.applied.length} 項：${labels}。請確認後再計算或核可。` : '共用表頭沒有非空白欄位，畫面維持原值。',
          result.applied.length ? 'ok' : 'warn'
        );
      } catch (error) {
        resetApplyConfirmation(applyButton, confirmation);
        setStatus(bar, `共用表頭無法套用：${String(error?.message || error)}`, 'error');
      }
    });
    removeButton.addEventListener('click', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImportConfirmation(importButton, importConfirmation);
        const selectedId = profileSelect.value;
        const result = removeFromLibrary(selectedId, rootWindow.localStorage);
        refreshControls();
        setStatus(
          bar,
          result.removed
            ? `已刪除所選案件表頭；清單尚有 ${result.library.profiles.length} 筆，目前頁面資料未變更。`
            : '尚無可刪除的案件表頭；目前頁面資料未變更。',
          'warn'
        );
      } catch (error) {
        setStatus(bar, `案件表頭無法刪除：${String(error?.message || error)}`, 'error');
      }
    });
    exportButton.addEventListener('click', function () {
      try {
        const library = loadLibrary(rootWindow.localStorage);
        const result = downloadLibraryBackup(rootWindow, library);
        setStatus(bar, `已匯出 ${result.backup.profileCount} 筆案件表頭：${result.fileName}。檔案不含工程輸入或核可狀態。`, 'ok');
      } catch (error) {
        setStatus(bar, `案件表頭無法匯出：${String(error?.message || error)}`, 'error');
      }
    });
    importButton.addEventListener('click', function () {
      if (!importConfirmation.preview) {
        importInput.value = '';
        importInput.click();
        return;
      }
      try {
        resetApplyConfirmation(applyButton, confirmation);
        const preview = importConfirmation.preview;
        const library = commitLibraryImport(preview, rootWindow.localStorage);
        resetImportConfirmation(importButton, importConfirmation);
        refreshControls();
        setStatus(
          bar,
          `已匯入 ${preview.additions.length} 筆案件表頭；${preview.preserved.length} 筆同案保留本機版本。清單共 ${library.profiles.length} 筆，目前頁面資料未變更。`,
          'ok'
        );
      } catch (error) {
        resetImportConfirmation(importButton, importConfirmation);
        setStatus(bar, `案件表頭無法匯入：${String(error?.message || error)}`, 'error');
      }
    });
    importInput.addEventListener('change', async function () {
      resetApplyConfirmation(applyButton, confirmation);
      resetImportConfirmation(importButton, importConfirmation);
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_BACKUP_BYTES) throw new Error('案件表頭備份檔超過 256 KiB 上限。');
        const backup = parseBackupText(await file.text());
        const preview = prepareLibraryImport(backup, rootWindow.localStorage);
        if (preview.status === 'blocked') {
          setStatus(
            bar,
            `匯入後將有 ${preview.projectedCount} 筆，超過 ${MAX_PROFILES} 筆上限；請先刪除不需要的本機案件。清單尚未變更。`,
            'warn'
          );
          return;
        }
        if (preview.status === 'no-change') {
          setStatus(bar, `備份中的 ${preview.preserved.length} 筆案件均已存在；本機版本優先保留，清單未變更。`, 'ok');
          return;
        }
        importConfirmation.preview = preview;
        importButton.textContent = `確認匯入 ${preview.additions.length} 筆`;
        importButton.setAttribute('data-project-meta-import-confirming', 'true');
        setStatus(
          bar,
          `匯入預覽：將新增 ${preview.additions.length} 筆；${preview.preserved.length} 筆同案保留本機版本。請再按一次「確認匯入」；目前清單與頁面尚未變更。`,
          'warn'
        );
      } catch (error) {
        resetImportConfirmation(importButton, importConfirmation);
        setStatus(bar, `案件表頭備份無法讀取：${String(error?.message || error)}`, 'error');
      }
    });

    try {
      const library = refreshControls();
      const profile = selectedProfile(library);
      setStatus(
        bar,
        profile
          ? `已載入 ${library.profiles.length} 筆案件表頭；請選擇後再套用。${describeProfile(profile)}`
          : '尚無已存案件表頭；可先儲存目前非空白表頭。空白仍可由主文承接。',
        'ok'
      );
    } catch (error) {
      setStatus(bar, `既有共用表頭無法讀取：${String(error?.message || error)}`, 'error');
    }
    return bar;
  }

  function autoBind(rootWindow) {
    const doc = rootWindow?.document;
    if (!doc?.body || doc.querySelector('.' + CONTROL_CLASS)) return null;
    if (!FIELD_SPECS.some(spec => doc.getElementById(spec.id))) return null;
    const bar = createBar(rootWindow, getToolMeta(rootWindow, findScript(doc)));
    const target = doc.querySelector('.project-storage-bar') || doc.querySelector('.mode-bar') || doc.querySelector('header');
    if (target?.parentNode) target.insertAdjacentElement('afterend', bar);
    else doc.body.insertAdjacentElement('afterbegin', bar);
    return bar;
  }

  return {
    SCHEMA,
    PROFILE_VERSION,
    STORAGE_KEY,
    LIBRARY_SCHEMA,
    LIBRARY_VERSION,
    LIBRARY_STORAGE_KEY,
    MAX_PROFILES,
    BACKUP_SCHEMA,
    BACKUP_VERSION,
    MAX_BACKUP_BYTES,
    FIELD_SPECS,
    normalizeText,
    buildProfile,
    normalizeProfile,
    hasProjectValues,
    collectFromDocument,
    save,
    load,
    clear,
    profileIdentity,
    profileId,
    buildLibrary,
    normalizeLibrary,
    selectedProfile,
    loadLibrary,
    writeLibrary,
    saveToLibrary,
    selectFromLibrary,
    removeFromLibrary,
    clearLibrary,
    buildBackup,
    normalizeBackup,
    serializeBackup,
    parseBackupText,
    librarySignature,
    prepareLibraryImport,
    commitLibraryImport,
    backupFileName,
    downloadLibraryBackup,
    analyzeApplication,
    applyToDocument,
    applicationSignature,
    describeProfile,
    profileOptionLabel,
    autoBind,
  };
});
