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
  const PROFILE_VERSION = '1.7';
  const STORAGE_KEY = 'toolProjectMetaProfile:latest.v1';
  const LIBRARY_SCHEMA = 'tool-project-meta-profile-library.v1';
  const LIBRARY_VERSION = '1.0';
  const LIBRARY_STORAGE_KEY = 'toolProjectMetaProfile:library.v1';
  const MAX_PROFILES = 20;
  const VIEW_SCHEMA = 'tool-project-meta-profile-view.v1';
  const VIEW_VERSION = '1.0';
  const VIEW_STORAGE_KEY = 'toolProjectMetaProfile:view.v1';
  const BACKUP_SCHEMA = 'tool-project-meta-profile-backup.v1';
  const BACKUP_VERSION = '1.0';
  const MAX_BACKUP_BYTES = 256 * 1024;
  const CONTROL_CLASS = 'project-meta-profile-bar';
  // Reuse frequent property-key strings without changing API/schema names.
  // Keep these constants inside the factory; the outer UMD wrapper cannot read them.
  const PROFILE_LENGTH_KEY = 'length';
  const PROFILE_PROFILES_KEY = 'profiles';
  const PROFILE_LOCAL_STORAGE_KEY = 'localStorage';
  const PROFILE_TEXT_CONTENT_KEY = 'textContent';
  const PROFILE_CREATE_ELEMENT_KEY = 'createElement';
  const PROFILE_QUERY_SELECTOR_KEY = 'querySelector';
  const PROFILE_ADD_EVENT_LISTENER_KEY = 'addEventListener';
  const PROFILE_APPEND_CHILD_KEY = 'appendChild';
  const PROFILE_PROJECT_KEY = 'project';
  const PROFILE_LIBRARY_KEY = 'library';
  const PROFILE_SELECTED_ID_KEY = 'selectedId';
  const PROFILE_SCHEMA_KEY = 'schema';
  const PROFILE_ID_KEY = 'id';
  const PROFILE_STRINGIFY_KEY = 'stringify';
  const PROFILE_VALUE_KEY = 'value';
  const PROFILE_TO_ISO_STRING_KEY = 'toISOString';
  const PROFILE_ARCHIVED_IDS_KEY = 'archivedIds';
  const PROFILE_CONFLICTS_KEY = 'conflicts';
  const PROFILE_REPLACEMENTS_KEY = 'replacements';
  const PROFILE_SET_ATTRIBUTE_KEY = 'setAttribute';
  const PROFILE_MESSAGE_KEY = 'message';
  const PROFILE_FILTER_KEY = 'filter';
  const PROFILE_FOR_EACH_KEY = 'forEach';
  const PROFILE_MAP_KEY = 'map';
  const PROFILE_JOIN_KEY = 'join';
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
    const project = input[PROFILE_PROJECT_KEY] || input;
    const sourceMeta = meta || input.source || {};
    return {
      schema: SCHEMA,
      profileVersion: PROFILE_VERSION,
      savedAt: normalizeText(input.savedAt) || new Date()[PROFILE_TO_ISO_STRING_KEY](),
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
    if (payload[PROFILE_SCHEMA_KEY] !== SCHEMA) throw new Error(`不支援的共用表頭格式：${payload[PROFILE_SCHEMA_KEY] || '未標示'}`);
    return buildProfile({
      savedAt: payload.savedAt,
      source: payload.source,
      project: payload[PROFILE_PROJECT_KEY],
    });
  }

  function hasProjectValues(payload) {
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    return FIELD_SPECS.some(spec => !!profile[PROFILE_PROJECT_KEY][spec.key]);
  }

  function collectFromDocument(doc, meta) {
    const project = {};
    FIELD_SPECS[PROFILE_FOR_EACH_KEY](spec => {
      project[spec.key] = normalizeText(doc?.getElementById?.(spec[PROFILE_ID_KEY])?.[PROFILE_VALUE_KEY]);
    });
    return buildProfile({ project }, meta);
  }

  function save(payload, storage) {
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    if (!hasProjectValues(profile)) throw new Error('目前三個表頭欄位皆為空白，沒有可帶入其他工具的資料。');
    target.setItem(STORAGE_KEY, JSON[PROFILE_STRINGIFY_KEY](profile));
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
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    if (profile[PROFILE_PROJECT_KEY].no) return `no:${identityText(profile[PROFILE_PROJECT_KEY].no)}`;
    if (profile[PROFILE_PROJECT_KEY].name) return `name:${identityText(profile[PROFILE_PROJECT_KEY].name)}`;
    if (profile[PROFILE_PROJECT_KEY].designer) return `designer:${identityText(profile[PROFILE_PROJECT_KEY].designer)}`;
    throw new Error('空白表頭不能建立案件識別。');
  }

  function profileId(payload) {
    return `project:${profileIdentity(payload)}`;
  }

  function profileRecord(payload) {
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    return { id: profileId(profile), ...profile };
  }

  function buildLibrary(profiles, selectedId, updatedAt) {
    const records = [];
    const seen = new Set();
    for (const payload of Array.isArray(profiles) ? profiles : []) {
      const record = profileRecord(payload);
      if (!hasProjectValues(record) || seen.has(record[PROFILE_ID_KEY])) continue;
      seen.add(record[PROFILE_ID_KEY]);
      records.push(record);
      if (records[PROFILE_LENGTH_KEY] >= MAX_PROFILES) break;
    }
    const requestedId = normalizeText(selectedId);
    return {
      schema: LIBRARY_SCHEMA,
      libraryVersion: LIBRARY_VERSION,
      updatedAt: normalizeText(updatedAt) || new Date()[PROFILE_TO_ISO_STRING_KEY](),
      selectedId: records.some(record => record[PROFILE_ID_KEY] === requestedId) ? requestedId : (records[0]?.[PROFILE_ID_KEY] || ''),
      profiles: records,
    };
  }

  function normalizeLibrary(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('案件表頭清單格式不正確。');
    if (payload[PROFILE_SCHEMA_KEY] !== LIBRARY_SCHEMA) throw new Error(`不支援的案件表頭清單格式：${payload[PROFILE_SCHEMA_KEY] || '未標示'}`);
    return buildLibrary(payload[PROFILE_PROFILES_KEY], payload[PROFILE_SELECTED_ID_KEY], payload.updatedAt);
  }

  function selectedProfile(library) {
    const normalized = library?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(library) : buildLibrary([]);
    const record = normalized[PROFILE_PROFILES_KEY].find(item => item[PROFILE_ID_KEY] === normalized[PROFILE_SELECTED_ID_KEY]);
    return record ? normalizeProfile(record) : null;
  }

  function profileById(library, id) {
    const normalized = library?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(library) : buildLibrary([]);
    const selectedId = normalizeText(id);
    const record = normalized[PROFILE_PROFILES_KEY].find(item => item[PROFILE_ID_KEY] === selectedId);
    return record ? normalizeProfile(record) : null;
  }

  function validIsoTimestamp(value) {
    const text = normalizeText(value);
    return text && Number.isFinite(Date.parse(text)) ? new Date(text)[PROFILE_TO_ISO_STRING_KEY]() : '';
  }

  function buildViewState(payload, library) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const normalizedLibrary = library?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(library) : buildLibrary([]);
    const availableIds = new Set(normalizedLibrary[PROFILE_PROFILES_KEY][PROFILE_MAP_KEY](record => record[PROFILE_ID_KEY]));
    const archivedIds = [];
    const seen = new Set();
    for (const value of Array.isArray(input[PROFILE_ARCHIVED_IDS_KEY]) ? input[PROFILE_ARCHIVED_IDS_KEY] : []) {
      const id = normalizeText(value);
      if (!id || !availableIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      archivedIds.push(id);
    }
    const lastUsedAt = {};
    const activity = input.lastUsedAt && typeof input.lastUsedAt === 'object' && !Array.isArray(input.lastUsedAt)
      ? input.lastUsedAt
      : {};
    for (const [rawId, rawTimestamp] of Object.entries(activity)) {
      const id = normalizeText(rawId);
      const timestamp = validIsoTimestamp(rawTimestamp);
      if (availableIds.has(id) && timestamp) lastUsedAt[id] = timestamp;
    }
    return {
      schema: VIEW_SCHEMA,
      viewVersion: VIEW_VERSION,
      updatedAt: validIsoTimestamp(input.updatedAt) || new Date()[PROFILE_TO_ISO_STRING_KEY](),
      archivedIds,
      lastUsedAt,
    };
  }

  function loadViewState(storage, library) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const normalizedLibrary = library?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(library) : loadLibrary(target);
    if (!target) return buildViewState({}, normalizedLibrary);
    const raw = target.getItem(VIEW_STORAGE_KEY);
    if (!raw) return buildViewState({}, normalizedLibrary);
    try {
      const payload = JSON.parse(raw);
      if (payload?.[PROFILE_SCHEMA_KEY] !== VIEW_SCHEMA) return buildViewState({}, normalizedLibrary);
      return buildViewState(payload, normalizedLibrary);
    } catch (_) {
      return buildViewState({}, normalizedLibrary);
    }
  }

  function writeViewState(payload, storage, library) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    const normalizedLibrary = library?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(library) : loadLibrary(target);
    const view = buildViewState({ ...payload, updatedAt: new Date()[PROFILE_TO_ISO_STRING_KEY]() }, normalizedLibrary);
    target.setItem(VIEW_STORAGE_KEY, JSON[PROFILE_STRINGIFY_KEY](view));
    return view;
  }

  function isProfileArchived(view, id) {
    return Array.isArray(view?.[PROFILE_ARCHIVED_IDS_KEY]) && view[PROFILE_ARCHIVED_IDS_KEY].includes(normalizeText(id));
  }

  function updateProfileView(id, changes, storage, usedAt) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    const library = loadLibrary(target);
    const profileIdValue = normalizeText(id);
    if (!library[PROFILE_PROFILES_KEY].some(record => record[PROFILE_ID_KEY] === profileIdValue)) throw new Error('找不到所選案件表頭。');
    const current = loadViewState(target, library);
    const archived = new Set(current[PROFILE_ARCHIVED_IDS_KEY]);
    if (changes?.archived === true) archived.add(profileIdValue);
    if (changes?.archived === false) archived.delete(profileIdValue);
    const lastUsedAt = { ...current.lastUsedAt };
    if (changes?.used) lastUsedAt[profileIdValue] = validIsoTimestamp(usedAt) || new Date()[PROFILE_TO_ISO_STRING_KEY]();
    return writeViewState({ archivedIds: [...archived], lastUsedAt }, target, library);
  }

  function markProfileUsed(id, storage, usedAt) {
    return updateProfileView(id, { used: true, archived: false }, storage, usedAt);
  }

  function archiveProfile(id, storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const view = updateProfileView(id, { archived: true }, target);
    const library = loadLibrary(target);
    const archivedId = normalizeText(id);
    if (library[PROFILE_SELECTED_ID_KEY] === archivedId) {
      const nextActive = listLibraryProfiles(library, view)[0];
      if (nextActive) selectFromLibrary(nextActive[PROFILE_ID_KEY], target);
    }
    return view;
  }

  function restoreProfile(id, storage) {
    return updateProfileView(id, { archived: false }, storage);
  }

  function profileSearchText(payload) {
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    return FIELD_SPECS[PROFILE_MAP_KEY](spec => profile[PROFILE_PROJECT_KEY][spec.key])[PROFILE_JOIN_KEY](' ').normalize('NFKC').toLowerCase();
  }

  function listLibraryProfiles(library, view, options) {
    const normalizedLibrary = library?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(library) : buildLibrary([]);
    const normalizedView = buildViewState(view, normalizedLibrary);
    const query = normalizeText(options?.query).normalize('NFKC').toLowerCase();
    const includeArchived = options?.includeArchived === true;
    return normalizedLibrary[PROFILE_PROFILES_KEY]
      [PROFILE_MAP_KEY]((record, index) => ({
        record,
        index,
        archived: isProfileArchived(normalizedView, record[PROFILE_ID_KEY]),
        activity: Date.parse(normalizedView.lastUsedAt[record[PROFILE_ID_KEY]] || record.savedAt) || 0,
      }))
      [PROFILE_FILTER_KEY](item => (includeArchived || !item.archived) && (!query || profileSearchText(item.record).includes(query)))
      .sort((left, right) => right.activity - left.activity || left.index - right.index)
      [PROFILE_MAP_KEY](item => ({ ...item.record, archived: item.archived }));
  }

  function mergeLegacyProfile(library, legacyProfile) {
    if (!legacyProfile || !hasProjectValues(legacyProfile)) return library;
    const legacyRecord = profileRecord(legacyProfile);
    const selectedRecord = library[PROFILE_PROFILES_KEY].find(record => record[PROFILE_ID_KEY] === library[PROFILE_SELECTED_ID_KEY]);
    const selectedMatches = selectedRecord
      && selectedRecord[PROFILE_ID_KEY] === legacyRecord[PROFILE_ID_KEY]
      && selectedRecord.savedAt === legacyRecord.savedAt
      && JSON[PROFILE_STRINGIFY_KEY](selectedRecord[PROFILE_PROJECT_KEY]) === JSON[PROFILE_STRINGIFY_KEY](legacyRecord[PROFILE_PROJECT_KEY]);
    if (selectedMatches) return library;
    return buildLibrary(
      [legacyRecord, ...library[PROFILE_PROFILES_KEY][PROFILE_FILTER_KEY](record => record[PROFILE_ID_KEY] !== legacyRecord[PROFILE_ID_KEY])],
      legacyRecord[PROFILE_ID_KEY],
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
    const library = payload?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(payload) : buildLibrary([]);
    target.setItem(LIBRARY_STORAGE_KEY, JSON[PROFILE_STRINGIFY_KEY](library));
    const selected = selectedProfile(library);
    if (selected) target.setItem(STORAGE_KEY, JSON[PROFILE_STRINGIFY_KEY](selected));
    else target.removeItem(STORAGE_KEY);
    return library;
  }

  function saveToLibrary(payload, storage) {
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    if (!hasProjectValues(profile)) throw new Error('目前三個表頭欄位皆為空白，沒有可儲存的案件表頭。');
    const current = loadLibrary(storage);
    const record = profileRecord(profile);
    const replaced = current[PROFILE_PROFILES_KEY].some(item => item[PROFILE_ID_KEY] === record[PROFILE_ID_KEY]);
    const candidates = [record, ...current[PROFILE_PROFILES_KEY][PROFILE_FILTER_KEY](item => item[PROFILE_ID_KEY] !== record[PROFILE_ID_KEY])];
    const evictedCount = Math.max(0, candidates[PROFILE_LENGTH_KEY] - MAX_PROFILES);
    const library = writeLibrary(buildLibrary(candidates, record[PROFILE_ID_KEY]), storage);
    restoreProfile(record[PROFILE_ID_KEY], storage);
    return { library, profile: selectedProfile(library), id: record[PROFILE_ID_KEY], replaced, evictedCount };
  }

  function identityUpdatePageSignature(selectedId, payload) {
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    return JSON[PROFILE_STRINGIFY_KEY]({
      selectedId: normalizeText(selectedId),
      project: profile[PROFILE_PROJECT_KEY],
    });
  }

  function normalizeIdentityMergeChoice(choice, hasCollision) {
    const normalized = normalizeText(choice) || 'target';
    if (!hasCollision) return 'current';
    if (normalized !== 'target' && normalized !== 'current') throw new Error('案件合併選擇無效。');
    return normalized;
  }

  function prepareIdentityUpdate(selectedId, payload, storage, mergeChoice, expectedCurrentSignature) {
    const current = loadLibrary(storage);
    const currentSignature = librarySignature(current);
    if (expectedCurrentSignature && expectedCurrentSignature !== currentSignature) {
      throw new Error('案件表頭清單已變更，請重新預覽識別更新。');
    }
    const sourceId = normalizeText(selectedId || current[PROFILE_SELECTED_ID_KEY]);
    const source = current[PROFILE_PROFILES_KEY].find(record => record[PROFILE_ID_KEY] === sourceId);
    if (!source) throw new Error('找不到要更新識別的案件表頭。');
    const profile = payload?.[PROFILE_SCHEMA_KEY] === SCHEMA ? normalizeProfile(payload) : buildProfile(payload);
    if (!hasProjectValues(profile)) throw new Error('目前三個表頭欄位皆為空白，不能更新案件識別。');
    const proposed = profileRecord(profile);
    const differences = compareProfileProjects(source, proposed);
    if (proposed[PROFILE_ID_KEY] === sourceId) {
      return {
        status: 'no-change',
        reason: differences[PROFILE_LENGTH_KEY] ? 'identity-unchanged' : 'profile-identical',
        mode: 'same-identity',
        currentSignature,
        pageSignature: identityUpdatePageSignature(sourceId, profile),
        sourceId,
        targetId: proposed[PROFILE_ID_KEY],
        source,
        target: source,
        proposed,
        differences,
        targetDifferences: differences,
        mergeChoice: 'current',
        library: current,
      };
    }
    const target = current[PROFILE_PROFILES_KEY].find(record => record[PROFILE_ID_KEY] === proposed[PROFILE_ID_KEY]) || null;
    const hasCollision = !!target;
    const normalizedChoice = normalizeIdentityMergeChoice(mergeChoice, hasCollision);
    const chosen = hasCollision && normalizedChoice === 'target' ? target : proposed;
    const profiles = [];
    current[PROFILE_PROFILES_KEY][PROFILE_FOR_EACH_KEY](record => {
      if (record[PROFILE_ID_KEY] === sourceId) profiles.push(chosen);
      else if (record[PROFILE_ID_KEY] !== proposed[PROFILE_ID_KEY]) profiles.push(record);
    });
    return {
      status: 'ready',
      reason: '',
      mode: hasCollision ? 'merge' : 'rename',
      currentSignature,
      pageSignature: identityUpdatePageSignature(sourceId, profile),
      sourceId,
      targetId: proposed[PROFILE_ID_KEY],
      source,
      target,
      proposed,
      differences,
      targetDifferences: target ? compareProfileProjects(target, proposed) : [],
      mergeChoice: normalizedChoice,
      library: buildLibrary(profiles, proposed[PROFILE_ID_KEY]),
    };
  }

  function laterTimestamp(left, right) {
    const leftValue = validIsoTimestamp(left);
    const rightValue = validIsoTimestamp(right);
    if (!leftValue) return rightValue;
    if (!rightValue) return leftValue;
    return Date.parse(leftValue) >= Date.parse(rightValue) ? leftValue : rightValue;
  }

  function commitIdentityUpdate(preview, storage) {
    if (!preview || preview.status !== 'ready' || !preview[PROFILE_LIBRARY_KEY]) throw new Error('案件識別更新預覽尚未可執行。');
    const current = loadLibrary(storage);
    if (librarySignature(current) !== preview.currentSignature) {
      throw new Error('案件表頭清單已變更，請重新預覽識別更新。');
    }
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    const currentView = loadViewState(target, current);
    const sourceArchived = isProfileArchived(currentView, preview.sourceId);
    const targetArchived = isProfileArchived(currentView, preview.targetId);
    const archived = new Set(currentView[PROFILE_ARCHIVED_IDS_KEY]);
    archived.delete(preview.sourceId);
    archived.delete(preview.targetId);
    if (preview.mode === 'rename' ? sourceArchived : (sourceArchived && targetArchived)) archived.add(preview.targetId);
    const lastUsedAt = { ...currentView.lastUsedAt };
    const mergedLastUsedAt = laterTimestamp(lastUsedAt[preview.sourceId], lastUsedAt[preview.targetId]);
    delete lastUsedAt[preview.sourceId];
    delete lastUsedAt[preview.targetId];
    if (mergedLastUsedAt) lastUsedAt[preview.targetId] = mergedLastUsedAt;
    const library = writeLibrary(preview[PROFILE_LIBRARY_KEY], target);
    const view = writeViewState({ archivedIds: [...archived], lastUsedAt }, target, library);
    return {
      library,
      view,
      profile: selectedProfile(library),
      id: preview.targetId,
      mode: preview.mode,
      mergeChoice: preview.mergeChoice,
    };
  }

  function selectFromLibrary(id, storage) {
    const current = loadLibrary(storage);
    const selectedId = normalizeText(id);
    if (!current[PROFILE_PROFILES_KEY].some(record => record[PROFILE_ID_KEY] === selectedId)) throw new Error('找不到所選案件表頭。');
    const library = writeLibrary(buildLibrary(current[PROFILE_PROFILES_KEY], selectedId), storage);
    return { library, profile: selectedProfile(library) };
  }

  function removeFromLibrary(id, storage) {
    const current = loadLibrary(storage);
    const currentView = loadViewState(storage, current);
    const removedId = normalizeText(id || current[PROFILE_SELECTED_ID_KEY]);
    const removed = current[PROFILE_PROFILES_KEY].find(record => record[PROFILE_ID_KEY] === removedId) || null;
    if (!removed) return { library: current, removed: null, profile: selectedProfile(current) };
    const profiles = current[PROFILE_PROFILES_KEY][PROFILE_FILTER_KEY](record => record[PROFILE_ID_KEY] !== removedId);
    const candidateLibrary = buildLibrary(profiles, '');
    const nextActive = listLibraryProfiles(candidateLibrary, currentView)[0];
    const library = writeLibrary(buildLibrary(profiles, nextActive?.[PROFILE_ID_KEY] || profiles[0]?.[PROFILE_ID_KEY] || ''), storage);
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (target) writeViewState(currentView, target, library);
    return { library, removed: normalizeProfile(removed), profile: selectedProfile(library) };
  }

  function clearLibrary(storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return false;
    target.removeItem(LIBRARY_STORAGE_KEY);
    target.removeItem(STORAGE_KEY);
    target.removeItem(VIEW_STORAGE_KEY);
    return true;
  }

  function assertExactKeys(value, expectedKeys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正確。`);
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    if (JSON[PROFILE_STRINGIFY_KEY](actual) !== JSON[PROFILE_STRINGIFY_KEY](expected)) throw new Error(`${label}欄位不符合備份格式。`);
  }

  function assertPortableProfileRecord(record) {
    assertExactKeys(record, ['id', 'schema', 'profileVersion', 'savedAt', 'source', 'project'], '案件表頭');
    assertExactKeys(record.source, ['toolId', 'toolName', 'toolVersion'], '案件表頭來源');
    assertExactKeys(record[PROFILE_PROJECT_KEY], ['name', 'no', 'designer'], '案件表頭內容');
    const normalized = profileRecord(record);
    if (record[PROFILE_ID_KEY] !== normalized[PROFILE_ID_KEY]) throw new Error('案件表頭識別與內容不一致。');
    if (!hasProjectValues(normalized)) throw new Error('備份不得包含全空白案件表頭。');
    return normalized;
  }

  function buildBackup(libraryPayload, exportedAt) {
    const library = libraryPayload?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA
      ? normalizeLibrary(libraryPayload)
      : buildLibrary([]);
    return {
      schema: BACKUP_SCHEMA,
      backupVersion: BACKUP_VERSION,
      exportedAt: normalizeText(exportedAt) || new Date()[PROFILE_TO_ISO_STRING_KEY](),
      profileCount: library[PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY],
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
    if (payload[PROFILE_SCHEMA_KEY] !== BACKUP_SCHEMA) throw new Error(`不支援的案件表頭備份格式：${payload[PROFILE_SCHEMA_KEY] || '未標示'}`);
    if (payload.backupVersion !== BACKUP_VERSION) throw new Error(`不支援的案件表頭備份版本：${payload.backupVersion || '未標示'}`);
    const exportedAt = normalizeText(payload.exportedAt);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(exportedAt) || !Number.isFinite(Date.parse(exportedAt))) {
      throw new Error('案件表頭備份時間無效。');
    }
    assertExactKeys(payload.boundary, ['fields', 'includesEngineeringInputs', 'includesApprovalState'], '案件表頭備份邊界');
    if (JSON[PROFILE_STRINGIFY_KEY](payload.boundary.fields) !== JSON[PROFILE_STRINGIFY_KEY](['name', 'no', 'designer'])
      || payload.boundary.includesEngineeringInputs !== false
      || payload.boundary.includesApprovalState !== false) {
      throw new Error('案件表頭備份超出允許欄位或包含禁止資料。');
    }
    assertExactKeys(payload[PROFILE_LIBRARY_KEY], ['schema', 'libraryVersion', 'updatedAt', 'selectedId', 'profiles'], '案件表頭清單');
    if (!Array.isArray(payload[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY])) throw new Error('案件表頭清單內容格式不正確。');
    if (payload[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY] > MAX_PROFILES) throw new Error(`案件表頭備份超過 ${MAX_PROFILES} 筆上限。`);
    const records = payload[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_MAP_KEY](assertPortableProfileRecord);
    const library = buildLibrary(records, payload[PROFILE_LIBRARY_KEY][PROFILE_SELECTED_ID_KEY], payload[PROFILE_LIBRARY_KEY].updatedAt);
    if (library[PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY] !== records[PROFILE_LENGTH_KEY]) throw new Error('案件表頭備份包含重複案件識別。');
    if (!Number.isInteger(payload.profileCount) || payload.profileCount !== library[PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]) {
      throw new Error('案件表頭備份筆數與內容不一致。');
    }
    return buildBackup(library, exportedAt);
  }

  function utf8ByteLength(value) {
    const text = String(value == null ? '' : value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text)[PROFILE_LENGTH_KEY];
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
    if (typeof Blob !== 'undefined') return new Blob([text]).size;
    return text[PROFILE_LENGTH_KEY];
  }

  function serializeBackup(library, exportedAt) {
    return `${JSON[PROFILE_STRINGIFY_KEY](buildBackup(library, exportedAt), null, 2)}\n`;
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
    const library = libraryPayload?.[PROFILE_SCHEMA_KEY] === LIBRARY_SCHEMA ? normalizeLibrary(libraryPayload) : buildLibrary([]);
    return JSON[PROFILE_STRINGIFY_KEY]({
      selectedId: library[PROFILE_SELECTED_ID_KEY],
      profiles: library[PROFILE_PROFILES_KEY][PROFILE_MAP_KEY](record => ({
        id: record[PROFILE_ID_KEY],
        savedAt: record.savedAt,
        source: record.source,
        project: record[PROFILE_PROJECT_KEY],
      })),
    });
  }

  function compareProfileProjects(localPayload, backupPayload) {
    const localProfile = normalizeProfile(localPayload);
    const backupProfile = normalizeProfile(backupPayload);
    return FIELD_SPECS
      [PROFILE_FILTER_KEY](spec => localProfile[PROFILE_PROJECT_KEY][spec.key] !== backupProfile[PROFILE_PROJECT_KEY][spec.key])
      [PROFILE_MAP_KEY](spec => ({
        key: spec.key,
        label: spec.label,
        localValue: localProfile[PROFILE_PROJECT_KEY][spec.key],
        backupValue: backupProfile[PROFILE_PROJECT_KEY][spec.key],
      }));
  }

  function normalizeImportResolutions(conflicts, resolutions) {
    const allowedIds = new Set(conflicts[PROFILE_MAP_KEY](conflict => conflict[PROFILE_ID_KEY]));
    const normalized = {};
    const input = resolutions && typeof resolutions === 'object' && !Array.isArray(resolutions) ? resolutions : {};
    for (const [rawId, rawChoice] of Object.entries(input)) {
      const id = normalizeText(rawId);
      if (!allowedIds.has(id)) throw new Error('匯入差異選擇包含未知案件。');
      if (rawChoice !== 'local' && rawChoice !== 'backup') throw new Error('匯入差異選擇無效。');
      normalized[id] = rawChoice;
    }
    conflicts[PROFILE_FOR_EACH_KEY](conflict => {
      if (!normalized[conflict[PROFILE_ID_KEY]]) normalized[conflict[PROFILE_ID_KEY]] = 'local';
    });
    return normalized;
  }

  function prepareLibraryImport(backupPayload, storage, resolutions, expectedCurrentSignature) {
    const backup = normalizeBackup(backupPayload);
    const current = loadLibrary(storage);
    const currentSignature = librarySignature(current);
    if (expectedCurrentSignature && expectedCurrentSignature !== currentSignature) {
      throw new Error('本機案件表頭清單已變更，請重新選擇匯入檔。');
    }
    const currentById = new Map(current[PROFILE_PROFILES_KEY][PROFILE_MAP_KEY](record => [record[PROFILE_ID_KEY], record]));
    const additions = backup[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_FILTER_KEY](record => !currentById.has(record[PROFILE_ID_KEY]));
    const matched = backup[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_FILTER_KEY](record => currentById.has(record[PROFILE_ID_KEY]));
    const conflicts = matched
      [PROFILE_MAP_KEY](backupRecord => {
        const localRecord = currentById.get(backupRecord[PROFILE_ID_KEY]);
        return {
          id: backupRecord[PROFILE_ID_KEY],
          local: localRecord,
          backup: backupRecord,
          differences: compareProfileProjects(localRecord, backupRecord),
        };
      })
      [PROFILE_FILTER_KEY](conflict => conflict.differences[PROFILE_LENGTH_KEY]);
    const conflictIds = new Set(conflicts[PROFILE_MAP_KEY](conflict => conflict[PROFILE_ID_KEY]));
    const identical = matched[PROFILE_FILTER_KEY](record => !conflictIds.has(record[PROFILE_ID_KEY]));
    const normalizedResolutions = normalizeImportResolutions(conflicts, resolutions);
    const replacements = conflicts[PROFILE_FILTER_KEY](conflict => normalizedResolutions[conflict[PROFILE_ID_KEY]] === 'backup');
    const replacementById = new Map(replacements[PROFILE_MAP_KEY](conflict => [conflict[PROFILE_ID_KEY], conflict.backup]));
    const preserved = matched[PROFILE_FILTER_KEY](record => !replacementById.has(record[PROFILE_ID_KEY]));
    const projectedCount = current[PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY] + additions[PROFILE_LENGTH_KEY];
    if (projectedCount > MAX_PROFILES) {
      return {
        status: 'blocked',
        reason: 'capacity-exceeded',
        backup,
        currentSignature,
        additions,
        preserved,
        identical,
        conflicts,
        resolutions: normalizedResolutions,
        replacements,
        projectedCount,
        library: null,
      };
    }
    const selectedId = current[PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY] ? current[PROFILE_SELECTED_ID_KEY] : backup[PROFILE_LIBRARY_KEY][PROFILE_SELECTED_ID_KEY];
    const library = buildLibrary([
      ...current[PROFILE_PROFILES_KEY][PROFILE_MAP_KEY](record => replacementById.get(record[PROFILE_ID_KEY]) || record),
      ...additions,
    ], selectedId);
    const hasReview = conflicts[PROFILE_LENGTH_KEY] > 0;
    const hasChanges = additions[PROFILE_LENGTH_KEY] > 0 || replacements[PROFILE_LENGTH_KEY] > 0;
    return {
      status: hasChanges || hasReview ? 'ready' : 'no-change',
      reason: hasChanges || hasReview ? '' : 'all-projects-identical',
      backup,
      currentSignature,
      additions,
      preserved,
      identical,
      conflicts,
      resolutions: normalizedResolutions,
      replacements,
      projectedCount,
      library,
    };
  }

  function commitLibraryImport(preview, storage) {
    if (!preview || preview.status !== 'ready' || !preview[PROFILE_LIBRARY_KEY]) throw new Error('案件表頭匯入預覽尚未可執行。');
    const current = loadLibrary(storage);
    if (librarySignature(current) !== preview.currentSignature) throw new Error('本機案件表頭清單已變更，請重新選擇匯入檔。');
    if (!preview.additions[PROFILE_LENGTH_KEY] && !preview[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY]) return current;
    return writeLibrary(preview[PROFILE_LIBRARY_KEY], storage);
  }

  function backupFileName(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    const iso = Number.isFinite(date.getTime()) ? date[PROFILE_TO_ISO_STRING_KEY]() : new Date()[PROFILE_TO_ISO_STRING_KEY]();
    return `project-header-library-${iso.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}.json`;
  }

  function downloadLibraryBackup(rootWindow, library) {
    const doc = rootWindow?.document;
    const URLApi = rootWindow?.URL;
    const BlobCtor = rootWindow?.Blob;
    if (!doc || !URLApi?.createObjectURL || !BlobCtor) throw new Error('目前瀏覽器不支援案件表頭備份下載。');
    const backup = buildBackup(library);
    if (!backup.profileCount) throw new Error('尚無案件表頭可供匯出。');
    const blob = new BlobCtor([`${JSON[PROFILE_STRINGIFY_KEY](backup, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URLApi.createObjectURL(blob);
    const anchor = doc[PROFILE_CREATE_ELEMENT_KEY]('a');
    anchor.href = url;
    anchor.download = backupFileName(backup.exportedAt);
    anchor.style.display = 'none';
    doc.body[PROFILE_APPEND_CHILD_KEY](anchor);
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
    FIELD_SPECS[PROFILE_FOR_EACH_KEY](spec => {
      const element = doc?.getElementById?.(spec[PROFILE_ID_KEY]);
      const value = profile[PROFILE_PROJECT_KEY][spec.key];
      if (!element) {
        skipped.push({ ...spec, reason: 'target-missing' });
        return;
      }
      if (!value) {
        skipped.push({ ...spec, reason: 'value-blank' });
        return;
      }
      const currentValue = normalizeText(element[PROFILE_VALUE_KEY]);
      const item = { id: spec[PROFILE_ID_KEY], key: spec.key, label: spec.label, value, currentValue };
      applicable.push(item);
      if (currentValue && currentValue !== value) conflicts.push(item);
    });
    return { profile, applicable, conflicts, skipped };
  }

  function applyToDocument(doc, payload, options) {
    const analysis = analyzeApplication(doc, payload);
    const allowConflicts = options?.allowConflicts === true;
    if (analysis[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY] && !allowConflicts) {
      return { ...analysis, applied: [], requiresConfirmation: true };
    }
    const applied = [];
    analysis.applicable[PROFILE_FOR_EACH_KEY](item => {
      const element = doc?.getElementById?.(item[PROFILE_ID_KEY]);
      if (!element) return;
      element[PROFILE_VALUE_KEY] = item[PROFILE_VALUE_KEY];
      dispatchFieldEvents(doc, element);
      applied.push(item);
    });
    return { ...analysis, applied, requiresConfirmation: false };
  }

  function applicationSignature(doc, payload) {
    const analysis = analyzeApplication(doc, payload);
    return JSON[PROFILE_STRINGIFY_KEY]({
      savedAt: analysis.profile.savedAt,
      project: analysis.profile[PROFILE_PROJECT_KEY],
      target: FIELD_SPECS[PROFILE_MAP_KEY](spec => normalizeText(doc?.getElementById?.(spec[PROFILE_ID_KEY])?.[PROFILE_VALUE_KEY])),
    });
  }

  function deleteConfirmationSignature(id, library) {
    return JSON[PROFILE_STRINGIFY_KEY]({
      selectedId: normalizeText(id),
      library: librarySignature(library),
    });
  }

  function resetApplyConfirmation(button, state) {
    state.signature = '';
    button[PROFILE_TEXT_CONTENT_KEY] = '套用共用表頭';
    button.removeAttribute('data-project-meta-confirming');
  }

  function resetImportConfirmation(button, state, panel) {
    state.preview = null;
    state.backup = null;
    state.resolutions = {};
    state.baseSignature = '';
    button[PROFILE_TEXT_CONTENT_KEY] = '匯入清單';
    button.removeAttribute('data-project-meta-import-confirming');
    if (panel) {
      panel.hidden = true;
      panel[PROFILE_TEXT_CONTENT_KEY] = '';
    }
  }

  function resetDeleteConfirmation(button, state) {
    state.signature = '';
    button[PROFILE_TEXT_CONTENT_KEY] = '永久刪除';
    button.removeAttribute('data-project-meta-delete-confirming');
  }

  function resetIdentityConfirmation(button, state, panel) {
    state.preview = null;
    state.pageSignature = '';
    button[PROFILE_TEXT_CONTENT_KEY] = '更新所選識別';
    button.removeAttribute('data-project-meta-identity-confirming');
    if (panel) {
      panel.hidden = true;
      panel[PROFILE_TEXT_CONTENT_KEY] = '';
    }
  }

  function conflictLabels(conflicts) {
    return conflicts[PROFILE_MAP_KEY](item => item.label)[PROFILE_JOIN_KEY]('、');
  }

  function importButtonLabel(preview) {
    if (!preview) return '匯入清單';
    const parts = [];
    if (preview.additions[PROFILE_LENGTH_KEY]) parts.push(`新增 ${preview.additions[PROFILE_LENGTH_KEY]}`);
    if (preview[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY]) parts.push(`更新 ${preview[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY]}`);
    return parts[PROFILE_LENGTH_KEY] ? `確認${parts[PROFILE_JOIN_KEY]('／')}` : '確認差異選擇';
  }

  function renderImportConflicts(doc, panel, preview, onChoice) {
    panel[PROFILE_TEXT_CONTENT_KEY] = '';
    const conflicts = Array.isArray(preview?.[PROFILE_CONFLICTS_KEY]) ? preview[PROFILE_CONFLICTS_KEY] : [];
    panel.hidden = !conflicts[PROFILE_LENGTH_KEY];
    if (!conflicts[PROFILE_LENGTH_KEY]) return;
    const heading = doc[PROFILE_CREATE_ELEMENT_KEY]('strong');
    heading[PROFILE_TEXT_CONTENT_KEY] = `同案差異 ${conflicts[PROFILE_LENGTH_KEY]} 筆（逐案選擇）`;
    panel[PROFILE_APPEND_CHILD_KEY](heading);
    conflicts[PROFILE_FOR_EACH_KEY]((conflict, index) => {
      const row = doc[PROFILE_CREATE_ELEMENT_KEY]('div');
      row.className = 'project-meta-import-conflict';
      row[PROFILE_SET_ATTRIBUTE_KEY]('data-project-meta-import-conflict', conflict[PROFILE_ID_KEY]);
      row[PROFILE_SET_ATTRIBUTE_KEY]('role', 'group');
      row[PROFILE_SET_ATTRIBUTE_KEY]('aria-label', `匯入差異：${profileOptionLabel(conflict.local)}`);
      const title = doc[PROFILE_CREATE_ELEMENT_KEY]('strong');
      title[PROFILE_TEXT_CONTENT_KEY] = profileOptionLabel(conflict.local);
      row[PROFILE_APPEND_CHILD_KEY](title);
      const differences = doc[PROFILE_CREATE_ELEMENT_KEY]('span');
      differences[PROFILE_TEXT_CONTENT_KEY] = conflict.differences
        [PROFILE_MAP_KEY](item => `${item.label}：本機「${item.localValue || '空白'}」／備份「${item.backupValue || '空白'}」`)
        [PROFILE_JOIN_KEY]('；');
      row[PROFILE_APPEND_CHILD_KEY](differences);
      const choices = doc[PROFILE_CREATE_ELEMENT_KEY]('span');
      choices.className = 'project-meta-import-choices';
      [['local', '保留本機'], ['backup', '採用備份']][PROFILE_FOR_EACH_KEY](([value, labelText]) => {
        const label = doc[PROFILE_CREATE_ELEMENT_KEY]('label');
        const input = doc[PROFILE_CREATE_ELEMENT_KEY]('input');
        input.type = 'radio';
        input.name = `project-meta-import-${index}`;
        input[PROFILE_VALUE_KEY] = value;
        input.checked = preview.resolutions[conflict[PROFILE_ID_KEY]] === value;
        input[PROFILE_ADD_EVENT_LISTENER_KEY]('change', function () {
          if (input.checked) onChoice(conflict[PROFILE_ID_KEY], value);
        });
        label[PROFILE_APPEND_CHILD_KEY](input);
        label[PROFILE_APPEND_CHILD_KEY](doc.createTextNode(labelText));
        choices[PROFILE_APPEND_CHILD_KEY](label);
      });
      row[PROFILE_APPEND_CHILD_KEY](choices);
      panel[PROFILE_APPEND_CHILD_KEY](row);
    });
  }

  function renderIdentityUpdatePreview(doc, panel, preview, onChoice) {
    panel[PROFILE_TEXT_CONTENT_KEY] = '';
    panel.hidden = false;
    const heading = doc[PROFILE_CREATE_ELEMENT_KEY]('strong');
    heading[PROFILE_TEXT_CONTENT_KEY] = preview.mode === 'merge' ? '案件識別衝突：請選擇合併內容' : '案件識別更新預覽';
    panel[PROFILE_APPEND_CHILD_KEY](heading);
    const identity = doc[PROFILE_CREATE_ELEMENT_KEY]('div');
    identity[PROFILE_TEXT_CONTENT_KEY] = `原案件：${profileOptionLabel(preview.source)} → 新識別：${profileOptionLabel(preview.proposed)}`;
    panel[PROFILE_APPEND_CHILD_KEY](identity);
    if (preview.differences[PROFILE_LENGTH_KEY]) {
      const changes = doc[PROFILE_CREATE_ELEMENT_KEY]('div');
      changes[PROFILE_TEXT_CONTENT_KEY] = preview.differences
        [PROFILE_MAP_KEY](item => `${item.label}「${item.localValue || '空白'}」→「${item.backupValue || '空白'}」`)
        [PROFILE_JOIN_KEY]('；');
      panel[PROFILE_APPEND_CHILD_KEY](changes);
    }
    if (preview.mode !== 'merge') return;
    const collision = doc[PROFILE_CREATE_ELEMENT_KEY]('div');
    collision[PROFILE_TEXT_CONTENT_KEY] = `新識別已屬於另一案件：${profileOptionLabel(preview.target)}。確認後兩筆將合併為一筆。`;
    panel[PROFILE_APPEND_CHILD_KEY](collision);
    const choices = doc[PROFILE_CREATE_ELEMENT_KEY]('div');
    choices.className = 'project-meta-identity-choices';
    [
      { value: 'target', label: '保留既有目標案件（預設）' },
      { value: 'current', label: '採用目前頁面表頭' },
    ][PROFILE_FOR_EACH_KEY](item => {
      const label = doc[PROFILE_CREATE_ELEMENT_KEY]('label');
      const input = doc[PROFILE_CREATE_ELEMENT_KEY]('input');
      input.type = 'radio';
      input.name = 'project-meta-identity-choice';
      input[PROFILE_VALUE_KEY] = item[PROFILE_VALUE_KEY];
      input.checked = preview.mergeChoice === item[PROFILE_VALUE_KEY];
      input[PROFILE_ADD_EVENT_LISTENER_KEY]('change', function () {
        if (input.checked) onChoice(item[PROFILE_VALUE_KEY]);
      });
      label[PROFILE_APPEND_CHILD_KEY](input);
      label[PROFILE_APPEND_CHILD_KEY](doc.createTextNode(item.label));
      choices[PROFILE_APPEND_CHILD_KEY](label);
    });
    panel[PROFILE_APPEND_CHILD_KEY](choices);
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
      [PROFILE_FILTER_KEY](spec => !!profile[PROFILE_PROJECT_KEY][spec.key])
      [PROFILE_MAP_KEY](spec => `${spec.label}：${profile[PROFILE_PROJECT_KEY][spec.key]}`);
    return values[PROFILE_LENGTH_KEY] ? `已有共用表頭（${values[PROFILE_JOIN_KEY]('；')}）。` : '共用表頭沒有可套用的內容。';
  }

  function formatProfileSavedAt(value) {
    const date = new Date(normalizeText(value));
    if (!Number.isFinite(date.getTime())) return '時間未標示';
    try {
      return new Intl.DateTimeFormat('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(date);
    } catch (_) {
      return date[PROFILE_TO_ISO_STRING_KEY]().replace('T', ' ').slice(0, 16) + ' UTC';
    }
  }

  function describeProfileSource(profile) {
    if (!profile) return '';
    const normalized = normalizeProfile(profile);
    const sourceName = normalized.source.toolName || normalized.source.toolId || '來源未標示';
    const sourceVersion = normalized.source.toolVersion ? ` ${normalized.source.toolVersion}` : '';
    return `儲存：${formatProfileSavedAt(normalized.savedAt)}；來源：${sourceName}${sourceVersion}`;
  }

  function profileOptionLabel(payload) {
    const profile = normalizeProfile(payload);
    const parts = [profile[PROFILE_PROJECT_KEY].no, profile[PROFILE_PROJECT_KEY].name, profile[PROFILE_PROJECT_KEY].designer][PROFILE_FILTER_KEY](Boolean);
    const label = parts[PROFILE_JOIN_KEY]('｜') || '未命名案件';
    return label[PROFILE_LENGTH_KEY] > 80 ? `${label.slice(0, 79)}…` : label;
  }

  function refreshLibrarySelect(doc, select, storage, options) {
    const library = loadLibrary(storage);
    const view = loadViewState(storage, library);
    const visibleProfiles = listLibraryProfiles(library, view, options);
    const preferredId = normalizeText(options?.preferredId || select[PROFILE_VALUE_KEY] || library[PROFILE_SELECTED_ID_KEY]);
    while (select.firstChild) select.removeChild(select.firstChild);
    if (!visibleProfiles[PROFILE_LENGTH_KEY]) {
      const option = doc[PROFILE_CREATE_ELEMENT_KEY]('option');
      option[PROFILE_VALUE_KEY] = '';
      option[PROFILE_TEXT_CONTENT_KEY] = library[PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]
        ? (normalizeText(options?.query) ? '找不到符合的案件' : '無作用中案件（可顯示封存）')
        : '尚無已存案件';
      select[PROFILE_APPEND_CHILD_KEY](option);
      select.disabled = true;
      return { library, view, visibleProfiles, selectedId: '' };
    }
    visibleProfiles[PROFILE_FOR_EACH_KEY](record => {
      const option = doc[PROFILE_CREATE_ELEMENT_KEY]('option');
      option[PROFILE_VALUE_KEY] = record[PROFILE_ID_KEY];
      option[PROFILE_TEXT_CONTENT_KEY] = `${record.archived ? '[封存] ' : ''}${profileOptionLabel(record)}`;
      select[PROFILE_APPEND_CHILD_KEY](option);
    });
    select.disabled = false;
    const selectedId = visibleProfiles.some(record => record[PROFILE_ID_KEY] === preferredId) ? preferredId : visibleProfiles[0][PROFILE_ID_KEY];
    select[PROFILE_VALUE_KEY] = selectedId;
    return { library, view, visibleProfiles, selectedId };
  }

  function profileAttributeSelector(name) {
    return '[data-project-meta-' + name + ']';
  }

  function setStatus(bar, message, tone) {
    const node = bar?.[PROFILE_QUERY_SELECTOR_KEY]?.(profileAttributeSelector('status'));
    if (!node) return;
    node[PROFILE_TEXT_CONTENT_KEY] = message || '';
    node.dataset.tone = tone || 'ok';
  }

  function setProfileDetail(bar, profile, archived) {
    const node = bar?.[PROFILE_QUERY_SELECTOR_KEY]?.(profileAttributeSelector('detail'));
    if (!node) return;
    node[PROFILE_TEXT_CONTENT_KEY] = profile ? `${archived ? '封存案件；' : ''}${describeProfileSource(profile)}` : '';
  }

  function createBar(rootWindow, meta) {
    const doc = rootWindow.document;
    const bar = doc[PROFILE_CREATE_ELEMENT_KEY]('section');
    bar[PROFILE_SET_ATTRIBUTE_KEY]('aria-label', '跨工具共用表頭');
    bar.className = CONTROL_CLASS;
    bar.innerHTML = [
      '<strong>跨工具共用表頭</strong>',
      '<span>可保存多個案件；選用，不影響計算。</span>',
      '<input type="search" data-project-meta-search aria-label="搜尋案件表頭" placeholder="搜尋案名、編號或設計者">',
      '<select data-project-meta-select aria-label="選擇已儲存的案件表頭"></select>',
      '<button type="button" data-project-meta-save>儲存目前表頭</button>',
      '<button type="button" data-project-meta-identity-update>更新所選識別</button>',
      '<button type="button" data-project-meta-apply>套用共用表頭</button>',
      '<button type="button" data-project-meta-archive>封存所選</button>',
      '<label class="project-meta-profile-toggle"><input type="checkbox" data-project-meta-show-archived>顯示封存</label>',
      '<button type="button" data-project-meta-clear>永久刪除</button>',
      '<button type="button" data-project-meta-export>匯出清單</button>',
      '<button type="button" data-project-meta-import>匯入清單</button>',
      '<input type="file" accept="application/json,.json" data-project-meta-import-file hidden>',
      '<div class="project-meta-import-conflicts" data-project-meta-import-conflicts hidden></div>',
      '<div class="project-meta-identity-preview" data-project-meta-identity-preview hidden></div>',
      '<span class="project-meta-profile-detail" data-project-meta-detail></span>',
      '<span class="project-meta-profile-status" data-project-meta-status aria-live="polite"></span>',
    ][PROFILE_JOIN_KEY]('');

    const style = doc[PROFILE_CREATE_ELEMENT_KEY]('style');
    style[PROFILE_ID_KEY] = 'projectMetaProfileStyle';
    style[PROFILE_TEXT_CONTENT_KEY] = [
      '.' + CONTROL_CLASS + '{max-width:1200px;margin:10px auto 0;padding:9px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f0f9ff;border:1px solid #bae6fd;border-left:4px solid #0284c7;border-radius:8px;color:#0c4a6e;font-size:.84em;line-height:1.55}',
      '.' + CONTROL_CLASS + ' strong{font-size:1em}',
      '.' + CONTROL_CLASS + ' button,.' + CONTROL_CLASS + ' select,.' + CONTROL_CLASS + ' input[type="search"]{border:0;border-radius:7px;padding:7px 10px;background:#e0f2fe;color:#075985;font-weight:700}',
      '.' + CONTROL_CLASS + ' select{max-width:min(100%,360px)}',
      '.' + CONTROL_CLASS + ' input[type="search"]{width:min(100%,220px);background:#fff}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-toggle{display:inline-flex;gap:5px;align-items:center;font-weight:700;white-space:nowrap}',
      '.' + CONTROL_CLASS + ' button{cursor:pointer}',
      '.' + CONTROL_CLASS + ' button:hover{filter:brightness(.96)}',
      '.' + CONTROL_CLASS + ' button[data-project-meta-delete-confirming]{background:#fee2e2;color:#991b1b}',
      '.' + CONTROL_CLASS + ' button[data-project-meta-identity-confirming]{background:#fef3c7;color:#92400e}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-detail{flex:1 1 280px;color:#475569}',
      '.' + CONTROL_CLASS + ' .project-meta-import-conflicts{flex:1 1 100%;display:grid;gap:7px;padding:8px;background:#fff;border:1px solid #f59e0b;border-radius:7px;color:#78350f}',
      '.' + CONTROL_CLASS + ' .project-meta-import-conflicts[hidden]{display:none}',
      '.' + CONTROL_CLASS + ' .project-meta-import-conflict{display:grid;gap:4px;padding-top:6px;border-top:1px solid #fde68a;overflow-wrap:anywhere}',
      '.' + CONTROL_CLASS + ' .project-meta-import-choices{display:flex;flex-wrap:wrap;gap:12px}',
      '.' + CONTROL_CLASS + ' .project-meta-import-choices label{display:inline-flex;align-items:center;gap:4px;font-weight:700}',
      '.' + CONTROL_CLASS + ' .project-meta-identity-preview{flex:1 1 100%;display:grid;gap:7px;padding:8px;background:#fff;border:1px solid #f59e0b;border-radius:7px;color:#78350f;overflow-wrap:anywhere}',
      '.' + CONTROL_CLASS + ' .project-meta-identity-preview[hidden]{display:none}',
      '.' + CONTROL_CLASS + ' .project-meta-identity-choices{display:flex;flex-wrap:wrap;gap:12px}',
      '.' + CONTROL_CLASS + ' .project-meta-identity-choices label{display:inline-flex;align-items:center;gap:4px;font-weight:700}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status{flex:1 1 280px;font-weight:700}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status[data-tone="warn"]{color:#92400e}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status[data-tone="error"]{color:#991b1b}',
      '@media print{.' + CONTROL_CLASS + '{display:none!important}}',
    ][PROFILE_JOIN_KEY]('');
    if (!doc.getElementById(style[PROFILE_ID_KEY])) doc.head[PROFILE_APPEND_CHILD_KEY](style);

    const applyButton = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('apply'));
    const identityButton = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('identity-update'));
    const profileSelect = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('select'));
    const searchInput = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('search'));
    const archiveButton = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('archive'));
    const showArchivedInput = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('show-archived'));
    const removeButton = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('clear'));
    const exportButton = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('export'));
    const importButton = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('import'));
    const importInput = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('import-file'));
    const importConflictPanel = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('import-conflicts'));
    const identityPreviewPanel = bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('identity-preview'));
    const confirmation = { signature: '' };
    const importConfirmation = { preview: null, backup: null, resolutions: {}, baseSignature: '' };
    const deleteConfirmation = { signature: '' };
    const identityConfirmation = { preview: null, pageSignature: '' };
    const refreshControls = function (preferredId) {
      const result = refreshLibrarySelect(doc, profileSelect, rootWindow[PROFILE_LOCAL_STORAGE_KEY], {
        query: searchInput[PROFILE_VALUE_KEY],
        includeArchived: showArchivedInput.checked,
        preferredId,
      });
      const hasSelection = !!result[PROFILE_SELECTED_ID_KEY];
      const selectedArchived = hasSelection && isProfileArchived(result.view, result[PROFILE_SELECTED_ID_KEY]);
      exportButton.disabled = !result[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY];
      removeButton.disabled = !hasSelection;
      archiveButton.disabled = !hasSelection;
      identityButton.disabled = !hasSelection;
      archiveButton[PROFILE_TEXT_CONTENT_KEY] = selectedArchived ? '解除封存' : '封存所選';
      applyButton.disabled = !hasSelection || selectedArchived;
      setProfileDetail(bar, profileById(result[PROFILE_LIBRARY_KEY], result[PROFILE_SELECTED_ID_KEY]), selectedArchived);
      return result;
    };
    const resetImport = function () {
      resetImportConfirmation(importButton, importConfirmation, importConflictPanel);
    };
    const resetIdentity = function () {
      resetIdentityConfirmation(identityButton, identityConfirmation, identityPreviewPanel);
    };
    const updateIdentityPreview = function (preview) {
      identityConfirmation.preview = preview;
      identityConfirmation.pageSignature = preview.pageSignature;
      identityButton[PROFILE_TEXT_CONTENT_KEY] = preview.mode === 'merge' ? '確認合併案件' : '確認更新識別';
      identityButton[PROFILE_SET_ATTRIBUTE_KEY]('data-project-meta-identity-confirming', 'true');
      renderIdentityUpdatePreview(doc, identityPreviewPanel, preview, function (choice) {
        try {
          const updated = prepareIdentityUpdate(
            preview.sourceId,
            collectFromDocument(doc, meta),
            rootWindow[PROFILE_LOCAL_STORAGE_KEY],
            choice,
            preview.currentSignature
          );
          updateIdentityPreview(updated);
          setStatus(
            bar,
            choice === 'target'
              ? '合併選擇：保留既有目標案件；目前清單與頁面尚未變更。'
              : '合併選擇：採用目前頁面表頭；目前清單與頁面尚未變更。',
            'warn'
          );
        } catch (error) {
          resetIdentity();
          setStatus(bar, `案件識別預覽無法更新：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
        }
      });
    };
    const updateImportPreview = function (preview) {
      importConfirmation.preview = preview;
      importConfirmation.resolutions = { ...preview.resolutions };
      importButton[PROFILE_TEXT_CONTENT_KEY] = importButtonLabel(preview);
      importButton[PROFILE_SET_ATTRIBUTE_KEY]('data-project-meta-import-confirming', 'true');
      renderImportConflicts(doc, importConflictPanel, preview, function (id, choice) {
        try {
          importConfirmation.resolutions[id] = choice;
          const updated = prepareLibraryImport(
            importConfirmation.backup,
            rootWindow[PROFILE_LOCAL_STORAGE_KEY],
            importConfirmation.resolutions,
            importConfirmation.baseSignature
          );
          updateImportPreview(updated);
          const localCount = updated[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY] - updated[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY];
          setStatus(
            bar,
            `匯入差異選擇：採用備份 ${updated[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY]} 筆、保留本機 ${localCount} 筆；目前清單與頁面尚未變更。`,
            'warn'
          );
        } catch (error) {
          resetImport();
          setStatus(bar, `匯入差異無法更新：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
        }
      });
    };

    identityButton[PROFILE_ADD_EVENT_LISTENER_KEY]('click', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImport();
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        const selectedId = profileSelect[PROFILE_VALUE_KEY];
        const pageProfile = collectFromDocument(doc, meta);
        const pageSignature = identityUpdatePageSignature(selectedId, pageProfile);
        const pending = identityConfirmation.preview;
        if (pending && identityConfirmation.pageSignature === pageSignature) {
          const verified = prepareIdentityUpdate(
            selectedId,
            pageProfile,
            rootWindow[PROFILE_LOCAL_STORAGE_KEY],
            pending.mergeChoice,
            pending.currentSignature
          );
          const result = commitIdentityUpdate(verified, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
          resetIdentity();
          searchInput[PROFILE_VALUE_KEY] = '';
          refreshControls(result[PROFILE_ID_KEY]);
          setStatus(
            bar,
            result.mode === 'merge'
              ? `已合併為單一案件並更新識別；清單共 ${result[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]} 筆，目前頁面資料未變更。`
              : `已更新所選案件識別；清單共 ${result[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]} 筆，目前頁面資料未變更。`,
            'ok'
          );
          return;
        }
        const preview = prepareIdentityUpdate(selectedId, pageProfile, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        if (preview.status === 'no-change') {
          resetIdentity();
          setStatus(
            bar,
            preview.reason === 'identity-unchanged'
              ? '目前頁面與所選案件的識別相同；若只要更新案名或設計者，請使用「儲存目前表頭」。'
              : '目前頁面表頭與所選案件相同，無須更新識別。',
            'warn'
          );
          return;
        }
        updateIdentityPreview(preview);
        setStatus(
          bar,
          preview.mode === 'merge'
            ? '新識別已存在；請比較兩案並選擇保留內容，再按一次「確認合併案件」。目前清單與頁面尚未變更。'
            : '請確認原案件與新識別，再按一次「確認更新識別」。目前清單與頁面尚未變更。',
          'warn'
        );
      } catch (error) {
        resetIdentity();
        setStatus(bar, `案件識別無法更新：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });

    bar[PROFILE_QUERY_SELECTOR_KEY](profileAttributeSelector('save'))[PROFILE_ADD_EVENT_LISTENER_KEY]('click', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImport();
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        resetIdentity();
        const result = saveToLibrary(collectFromDocument(doc, meta), rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        searchInput[PROFILE_VALUE_KEY] = '';
        refreshControls(result[PROFILE_ID_KEY]);
        const action = result.replaced ? '已更新所選案件表頭' : '已新增案件表頭';
        const capacity = result.evictedCount ? `；已移除 ${result.evictedCount} 筆最舊資料以維持 ${MAX_PROFILES} 筆上限` : '';
        setStatus(bar, `${action}；清單共 ${result[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]} 筆${capacity}。${describeProfile(result.profile)}`, 'ok');
      } catch (error) {
        setStatus(bar, String(error?.[PROFILE_MESSAGE_KEY] || error), 'warn');
      }
    });
    profileSelect[PROFILE_ADD_EVENT_LISTENER_KEY]('change', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImport();
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        resetIdentity();
        const library = loadLibrary(rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        const view = loadViewState(rootWindow[PROFILE_LOCAL_STORAGE_KEY], library);
        if (isProfileArchived(view, profileSelect[PROFILE_VALUE_KEY])) {
          const archivedProfile = profileById(library, profileSelect[PROFILE_VALUE_KEY]);
          refreshControls(profileSelect[PROFILE_VALUE_KEY]);
          setStatus(bar, `此案件已封存；解除封存後才可套用。目前頁面資料未變更。${describeProfile(archivedProfile)}`, 'warn');
          return;
        }
        const result = selectFromLibrary(profileSelect[PROFILE_VALUE_KEY], rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        refreshControls(profileSelect[PROFILE_VALUE_KEY]);
        setStatus(bar, `已選擇案件表頭，尚未套用至目前頁面。${describeProfile(result.profile)}`, 'ok');
      } catch (error) {
        setStatus(bar, `案件表頭無法選擇：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });
    applyButton[PROFILE_ADD_EVENT_LISTENER_KEY]('click', function () {
      try {
        resetImport();
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        resetIdentity();
        const library = loadLibrary(rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        const view = loadViewState(rootWindow[PROFILE_LOCAL_STORAGE_KEY], library);
        const selectedId = profileSelect[PROFILE_VALUE_KEY];
        if (isProfileArchived(view, selectedId)) {
          resetApplyConfirmation(applyButton, confirmation);
          setStatus(bar, '此案件已封存；解除封存後才可套用。目前頁面資料未變更。', 'warn');
          return;
        }
        const profile = profileById(library, selectedId);
        if (!profile) {
          resetApplyConfirmation(applyButton, confirmation);
          setStatus(bar, '尚無共用表頭，畫面維持原值。空白可由主文承接。', 'warn');
          return;
        }
        const signature = applicationSignature(doc, profile);
        const preview = applyToDocument(doc, profile);
        if (preview.requiresConfirmation && confirmation.signature !== signature) {
          confirmation.signature = signature;
          applyButton[PROFILE_TEXT_CONTENT_KEY] = `確認覆寫 ${preview[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY]} 項`;
          applyButton[PROFILE_SET_ATTRIBUTE_KEY]('data-project-meta-confirming', 'true');
          setStatus(
            bar,
            `偵測到 ${preview[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY]} 項既有表頭不同：${conflictLabels(preview[PROFILE_CONFLICTS_KEY])}。請確認案件後再按一次「確認覆寫」；目前頁面尚未變更。`,
            'warn'
          );
          return;
        }
        const result = preview.requiresConfirmation
          ? applyToDocument(doc, profile, { allowConflicts: true })
          : preview;
        resetApplyConfirmation(applyButton, confirmation);
        const labels = result.applied[PROFILE_MAP_KEY](item => item.label)[PROFILE_JOIN_KEY]('、');
        if (result.applied[PROFILE_LENGTH_KEY]) {
          markProfileUsed(selectedId, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
          refreshControls(selectedId);
        }
        setStatus(
          bar,
          result.applied[PROFILE_LENGTH_KEY] ? `已套用 ${result.applied[PROFILE_LENGTH_KEY]} 項：${labels}。請確認後再計算或核可。` : '共用表頭沒有非空白欄位，畫面維持原值。',
          result.applied[PROFILE_LENGTH_KEY] ? 'ok' : 'warn'
        );
      } catch (error) {
        resetApplyConfirmation(applyButton, confirmation);
        setStatus(bar, `共用表頭無法套用：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });
    archiveButton[PROFILE_ADD_EVENT_LISTENER_KEY]('click', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImport();
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        resetIdentity();
        const selectedId = profileSelect[PROFILE_VALUE_KEY];
        const library = loadLibrary(rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        const view = loadViewState(rootWindow[PROFILE_LOCAL_STORAGE_KEY], library);
        const wasArchived = isProfileArchived(view, selectedId);
        if (wasArchived) {
          restoreProfile(selectedId, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
          selectFromLibrary(selectedId, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        } else {
          archiveProfile(selectedId, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        }
        const refreshed = refreshControls(wasArchived ? selectedId : '');
        const archivedCount = refreshed.view[PROFILE_ARCHIVED_IDS_KEY][PROFILE_LENGTH_KEY];
        setStatus(
          bar,
          wasArchived
            ? `已解除封存；清單共 ${refreshed[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]} 筆，目前頁面資料未變更。`
            : `已封存所選案件；目前有 ${archivedCount} 筆封存資料，可勾選「顯示封存」復原。頁面資料未變更。`,
          'ok'
        );
      } catch (error) {
        setStatus(bar, `案件表頭無法封存：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });
    searchInput[PROFILE_ADD_EVENT_LISTENER_KEY]('input', function () {
      resetApplyConfirmation(applyButton, confirmation);
      resetImport();
      resetDeleteConfirmation(removeButton, deleteConfirmation);
      resetIdentity();
      const result = refreshControls();
      setStatus(
        bar,
        normalizeText(searchInput[PROFILE_VALUE_KEY])
          ? `搜尋結果 ${result.visibleProfiles[PROFILE_LENGTH_KEY]} 筆；只篩選清單，目前頁面資料未變更。`
          : `已清除搜尋；顯示 ${result.visibleProfiles[PROFILE_LENGTH_KEY]} 筆案件。`,
        'ok'
      );
    });
    showArchivedInput[PROFILE_ADD_EVENT_LISTENER_KEY]('change', function () {
      resetApplyConfirmation(applyButton, confirmation);
      resetImport();
      resetDeleteConfirmation(removeButton, deleteConfirmation);
      resetIdentity();
      const result = refreshControls();
      setStatus(
        bar,
        showArchivedInput.checked
          ? `已顯示封存案件；共 ${result.view[PROFILE_ARCHIVED_IDS_KEY][PROFILE_LENGTH_KEY]} 筆。封存案件須先解除封存才可套用。`
          : `已隱藏封存案件；作用中案件 ${result[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY] - result.view[PROFILE_ARCHIVED_IDS_KEY][PROFILE_LENGTH_KEY]} 筆。`,
        'ok'
      );
    });
    removeButton[PROFILE_ADD_EVENT_LISTENER_KEY]('click', function () {
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetImport();
        resetIdentity();
        const selectedId = profileSelect[PROFILE_VALUE_KEY];
        const library = loadLibrary(rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        const signature = deleteConfirmationSignature(selectedId, library);
        if (!selectedId || deleteConfirmation.signature !== signature) {
          deleteConfirmation.signature = signature;
          removeButton[PROFILE_TEXT_CONTENT_KEY] = '確認永久刪除';
          removeButton[PROFILE_SET_ATTRIBUTE_KEY]('data-project-meta-delete-confirming', 'true');
          setStatus(bar, '永久刪除後無法復原；建議不再使用但仍需保留的案件改用封存。請確認案件後再按一次「確認永久刪除」；目前清單與頁面尚未變更。', 'warn');
          return;
        }
        const result = removeFromLibrary(selectedId, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        refreshControls();
        setStatus(
          bar,
          result.removed
            ? `已刪除所選案件表頭；清單尚有 ${result[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]} 筆，目前頁面資料未變更。`
            : '尚無可刪除的案件表頭；目前頁面資料未變更。',
          'warn'
        );
      } catch (error) {
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        setStatus(bar, `案件表頭無法刪除：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });
    exportButton[PROFILE_ADD_EVENT_LISTENER_KEY]('click', function () {
      try {
        resetImport();
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        resetIdentity();
        const library = loadLibrary(rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        const result = downloadLibraryBackup(rootWindow, library);
        setStatus(bar, `已匯出 ${result.backup.profileCount} 筆案件表頭：${result.fileName}。檔案不含工程輸入或核可狀態。`, 'ok');
      } catch (error) {
        setStatus(bar, `案件表頭無法匯出：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });
    importButton[PROFILE_ADD_EVENT_LISTENER_KEY]('click', function () {
      resetDeleteConfirmation(removeButton, deleteConfirmation);
      resetIdentity();
      if (!importConfirmation.preview) {
        importInput[PROFILE_VALUE_KEY] = '';
        importInput.click();
        return;
      }
      try {
        resetApplyConfirmation(applyButton, confirmation);
        resetDeleteConfirmation(removeButton, deleteConfirmation);
        const preview = importConfirmation.preview;
        const library = commitLibraryImport(preview, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        resetImport();
        refreshControls();
        const localConflictCount = preview[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY] - preview[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY];
        const changed = preview.additions[PROFILE_LENGTH_KEY] || preview[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY];
        setStatus(
          bar,
          changed
            ? `已匯入 ${preview.additions[PROFILE_LENGTH_KEY]} 筆、更新 ${preview[PROFILE_REPLACEMENTS_KEY][PROFILE_LENGTH_KEY]} 筆案件表頭；同案差異另有 ${localConflictCount} 筆保留本機。清單共 ${library[PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]} 筆，目前頁面資料未變更。`
            : `已完成 ${preview[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY]} 筆同案差異確認，全部保留本機；清單與頁面未變更。`,
          'ok'
        );
      } catch (error) {
        resetImport();
        setStatus(bar, `案件表頭無法匯入：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });
    importInput[PROFILE_ADD_EVENT_LISTENER_KEY]('change', async function () {
      resetApplyConfirmation(applyButton, confirmation);
      resetImport();
      resetDeleteConfirmation(removeButton, deleteConfirmation);
      resetIdentity();
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_BACKUP_BYTES) throw new Error('案件表頭備份檔超過 256 KiB 上限。');
        const backup = parseBackupText(await file.text());
        const preview = prepareLibraryImport(backup, rootWindow[PROFILE_LOCAL_STORAGE_KEY]);
        if (preview.status === 'blocked') {
          setStatus(
            bar,
            `匯入後將有 ${preview.projectedCount} 筆，超過 ${MAX_PROFILES} 筆上限；請先刪除不需要的本機案件。清單尚未變更。`,
            'warn'
          );
          return;
        }
        if (preview.status === 'no-change') {
          setStatus(bar, `備份中的 ${preview.identical[PROFILE_LENGTH_KEY]} 筆案件內容均與本機相同；清單未變更。`, 'ok');
          return;
        }
        importConfirmation.backup = backup;
        importConfirmation.baseSignature = preview.currentSignature;
        updateImportPreview(preview);
        setStatus(
          bar,
          preview[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY]
            ? `匯入預覽：將新增 ${preview.additions[PROFILE_LENGTH_KEY]} 筆；另有 ${preview[PROFILE_CONFLICTS_KEY][PROFILE_LENGTH_KEY]} 筆同案三欄內容不同，預設保留本機。請逐案選擇後再確認；目前清單與頁面尚未變更。`
            : `匯入預覽：將新增 ${preview.additions[PROFILE_LENGTH_KEY]} 筆。請再按一次確認；目前清單與頁面尚未變更。`,
          'warn'
        );
      } catch (error) {
        resetImport();
        setStatus(bar, `案件表頭備份無法讀取：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
      }
    });

    try {
      const result = refreshControls();
      const profile = profileById(result[PROFILE_LIBRARY_KEY], result[PROFILE_SELECTED_ID_KEY]);
      setStatus(
        bar,
        profile
          ? `已載入 ${result[PROFILE_LIBRARY_KEY][PROFILE_PROFILES_KEY][PROFILE_LENGTH_KEY]} 筆案件表頭；依最近使用排序，請選擇後再套用。${describeProfile(profile)}`
          : '尚無已存案件表頭；可先儲存目前非空白表頭。空白仍可由主文承接。',
        'ok'
      );
    } catch (error) {
      setStatus(bar, `既有共用表頭無法讀取：${String(error?.[PROFILE_MESSAGE_KEY] || error)}`, 'error');
    }
    return bar;
  }

  function autoBind(rootWindow) {
    const doc = rootWindow?.document;
    if (!doc?.body || doc[PROFILE_QUERY_SELECTOR_KEY]('.' + CONTROL_CLASS)) return null;
    if (!FIELD_SPECS.some(spec => doc.getElementById(spec[PROFILE_ID_KEY]))) return null;
    const bar = createBar(rootWindow, getToolMeta(rootWindow, findScript(doc)));
    const target = doc[PROFILE_QUERY_SELECTOR_KEY]('.project-storage-bar') || doc[PROFILE_QUERY_SELECTOR_KEY]('.mode-bar') || doc[PROFILE_QUERY_SELECTOR_KEY]('header');
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
    VIEW_SCHEMA,
    VIEW_VERSION,
    VIEW_STORAGE_KEY,
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
    profileById,
    loadLibrary,
    writeLibrary,
    buildViewState,
    loadViewState,
    writeViewState,
    isProfileArchived,
    markProfileUsed,
    archiveProfile,
    restoreProfile,
    profileSearchText,
    listLibraryProfiles,
    saveToLibrary,
    identityUpdatePageSignature,
    prepareIdentityUpdate,
    commitIdentityUpdate,
    selectFromLibrary,
    removeFromLibrary,
    clearLibrary,
    buildBackup,
    normalizeBackup,
    serializeBackup,
    parseBackupText,
    librarySignature,
    compareProfileProjects,
    normalizeImportResolutions,
    prepareLibraryImport,
    commitLibraryImport,
    backupFileName,
    downloadLibraryBackup,
    analyzeApplication,
    applyToDocument,
    applicationSignature,
    deleteConfirmationSignature,
    describeProfile,
    formatProfileSavedAt,
    describeProfileSource,
    profileOptionLabel,
    autoBind,
  };
});
