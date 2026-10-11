(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WindSharedProfile = api;
  if (root && root.document) api.autoApply(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCHEMA = 'wind-shared-profile.v1';
  const PROFILE_VERSION = '1.0';
  const STORAGE_KEY = 'windSharedProfile:latest.v1';
  const QUERY_KEY = 'windProfile';
  const QUERY_VALUE = 'latest';

  const COMMON_MAPPING = Object.freeze([
    { path: 'project.name', target: 'projName', label: '計畫名稱' },
    { path: 'project.no', target: 'projNo', label: '計畫編號' },
    { path: 'project.designer', target: 'projDesigner', label: '設計人員' },
    { path: 'site.city', target: 'city', label: '地點' },
    { path: 'site.terrain', target: 'terrain', label: '地況分類' },
    { path: 'site.importanceClass', target: 'impClass', label: '用途類別' },
    { path: 'site.Kzt', target: 'Kzt', label: 'Kzt' },
  ]);

  const TOOL_MAPPING = Object.freeze({
    'wind-force': [
      { path: 'building.widthX', target: 'B', label: 'X 向迎風寬／Y 向順風長 B' },
      { path: 'building.widthY', target: 'L', label: 'Y 向迎風寬／X 向順風長 L' },
      { path: 'building.floors', target: 'N', label: '樓層數 N' },
      {
        path: 'building.height',
        target: 'h',
        label: '初始樓高 h',
        transform: (height, profile) => {
          const normalizedHeight = finiteNumber(height);
          const floors = Number(profile?.building?.floors);
          return normalizedHeight != null && floors > 0 ? normalizedHeight / floors : null;
        },
      },
    ],
    'wind-kzt': [
      {
        path: 'site.terrain',
        target: 'terrainGrp',
        label: 'Kzt 地況群組',
        transform: terrain => terrain === 'C' ? 'C' : (terrain === 'A' || terrain === 'B' ? 'AB' : null),
      },
    ],
  });

  const SUPPORTED_TOOL_IDS = Object.freeze([
    'wind-kzt',
    'wind-force',
    'wind-cc',
    'wind-parapet',
    'wind-open-roof',
    'wind-object-solid',
    'wind-object-frame',
    'wind-lattice-tower',
    'wind-object-tower',
    'wind-fence-sign',
    'wind-sign-pole',
  ]);

  function normalizeText(value) {
    const text = String(value == null ? '' : value).trim();
    return text === '未填' ? '' : text;
  }

  function finiteNumber(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positiveInteger(value) {
    const number = finiteNumber(value);
    return number != null && Number.isInteger(number) && number > 0 ? number : null;
  }

  function positiveNumber(value) {
    const number = finiteNumber(value);
    return number != null && number > 0 ? number : null;
  }

  function buildProfile(params) {
    const source = params || {};
    const savedAt = normalizeText(source.savedAt) || new Date().toISOString();
    return {
      schema: SCHEMA,
      profileVersion: PROFILE_VERSION,
      source: {
        toolId: 'wind-overview',
        toolVersion: normalizeText(source.toolVersion) || 'V1',
        savedAt,
      },
      project: {
        name: normalizeText(source.projName ?? source.project?.name),
        no: normalizeText(source.projNo ?? source.project?.no),
        designer: normalizeText(source.projDesigner ?? source.project?.designer),
      },
      site: {
        city: normalizeText(source.city ?? source.site?.city),
        terrain: normalizeText(source.terrain ?? source.site?.terrain),
        importanceClass: normalizeText(source.impClass ?? source.site?.importanceClass),
        Kzt: positiveNumber(source.Kzt ?? source.site?.Kzt),
      },
      building: {
        height: positiveNumber(source.H ?? source.building?.height),
        floors: positiveInteger(source.floors ?? source.building?.floors),
        widthX: positiveNumber(source.Bx ?? source.building?.widthX),
        widthY: positiveNumber(source.By ?? source.building?.widthY),
      },
    };
  }

  function normalizeProfile(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('耐風共用案件資料格式不正確。');
    if (payload.schema && payload.schema !== SCHEMA) throw new Error(`不支援的耐風案件格式：${payload.schema}`);
    return buildProfile(payload.schema === SCHEMA ? {
      savedAt: payload.source?.savedAt,
      toolVersion: payload.source?.toolVersion,
      project: payload.project,
      site: payload.site,
      building: payload.building,
    } : payload);
  }

  function toOverviewParams(payload) {
    const profile = normalizeProfile(payload);
    return {
      city: profile.site.city,
      terrain: profile.site.terrain,
      impClass: profile.site.importanceClass,
      Kzt: profile.site.Kzt,
      H: profile.building.height,
      floors: profile.building.floors,
      Bx: profile.building.widthX,
      By: profile.building.widthY,
      projName: profile.project.name,
      projNo: profile.project.no,
      projDesigner: profile.project.designer,
      savedAt: profile.source.savedAt,
    };
  }

  function save(payload, storage) {
    const profile = normalizeProfile(payload);
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    target.setItem(STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  function load(storage) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return null;
    const raw = target.getItem(STORAGE_KEY);
    return raw ? normalizeProfile(JSON.parse(raw)) : null;
  }

  function readPath(object, path) {
    return String(path || '').split('.').reduce((value, key) => value == null ? undefined : value[key], object);
  }

  function mappingForTool(toolId) {
    const commonMapping = toolId === 'wind-kzt'
      ? COMMON_MAPPING.filter(spec => spec.path.startsWith('project.'))
      : COMMON_MAPPING;
    return commonMapping.concat(TOOL_MAPPING[toolId] || []);
  }

  function resolveMapping(profile, toolId) {
    return mappingForTool(toolId).map(spec => {
      const raw = readPath(profile, spec.path);
      return { ...spec, value: spec.transform ? spec.transform(raw, profile) : raw };
    });
  }

  function hasUsableValue(value) {
    return value != null && (typeof value !== 'string' || value.trim() !== '');
  }

  function setElementValue(element, value) {
    if (!element || !hasUsableValue(value)) return false;
    if (element.tagName === 'SELECT') {
      const optionExists = Array.from(element.options || []).some(option => String(option.value) === String(value));
      if (!optionExists) return false;
    }
    if (element.type === 'checkbox') element.checked = !!value;
    else element.value = String(value);
    return true;
  }

  function dispatchFieldEvents(doc, element) {
    const EventCtor = doc?.defaultView?.Event || (typeof Event !== 'undefined' ? Event : null);
    if (!EventCtor) return;
    element.dispatchEvent(new EventCtor('input', { bubbles: true }));
    element.dispatchEvent(new EventCtor('change', { bubbles: true }));
  }

  function applyToDocument(doc, payload, toolId) {
    const profile = normalizeProfile(payload);
    const applied = [];
    const skipped = [];
    const pendingEvents = [];
    resolveMapping(profile, toolId).forEach(spec => {
      const element = doc?.getElementById?.(spec.target);
      if (!element) {
        skipped.push({ ...spec, reason: 'target-missing' });
        return;
      }
      if (!setElementValue(element, spec.value)) {
        skipped.push({ ...spec, reason: !hasUsableValue(spec.value) ? 'value-missing' : 'option-unavailable' });
        return;
      }
      applied.push({ target: spec.target, label: spec.label, value: spec.value });
      pendingEvents.push(element);
    });
    pendingEvents.forEach(element => dispatchFieldEvents(doc, element));
    return { toolId, profile, applied, skipped };
  }

  function profileStatusStyle(doc) {
    if (!doc?.head || doc.getElementById('windSharedProfileStyle')) return;
    const style = doc.createElement('style');
    style.id = 'windSharedProfileStyle';
    style.textContent = '.wind-shared-profile-status{max-width:1200px;margin:10px auto 0;padding:10px 14px;border-left:4px solid #059669;border-radius:8px;background:#f0fdf4;color:#166534;font-size:.86em;line-height:1.65}.wind-shared-profile-status[data-tone="warn"]{border-left-color:#d97706;background:#fffbeb;color:#92400e}.wind-shared-profile-status a{color:inherit;font-weight:700}@media print{.wind-shared-profile-status{display:none!important}}';
    doc.head.appendChild(style);
  }

  function announce(rootWindow, message, tone) {
    const doc = rootWindow?.document;
    if (!doc?.body) return;
    profileStatusStyle(doc);
    let node = doc.querySelector('[data-wind-shared-profile-status]');
    if (!node) {
      node = doc.createElement('div');
      node.className = 'wind-shared-profile-status page-only-report-status';
      node.dataset.windSharedProfileStatus = '';
      const header = doc.querySelector('header');
      if (header?.parentNode) header.insertAdjacentElement('afterend', node);
      else doc.body.insertAdjacentElement('afterbegin', node);
    }
    node.dataset.tone = tone || 'ok';
    node.replaceChildren();
    node.appendChild(doc.createTextNode(`${message}　`));
    const returnLink = doc.createElement('a');
    returnLink.href = 'wind-overview.html';
    returnLink.textContent = '返回耐風案件總覽';
    node.appendChild(returnLink);
  }

  function detectToolId(rootWindow, scriptElement) {
    const fromDataset = normalizeText(scriptElement?.dataset?.windToolId);
    if (fromDataset) return fromDataset;
    const filename = String(rootWindow?.location?.pathname || '').split('/').pop() || '';
    return filename.replace(/\.html$/i, '');
  }

  function hasAutoApplyQuery(rootWindow) {
    try {
      return new URLSearchParams(rootWindow.location.search || '').get(QUERY_KEY) === QUERY_VALUE;
    } catch (error) {
      return false;
    }
  }

  function autoApply(rootWindow) {
    if (!rootWindow?.document || !hasAutoApplyQuery(rootWindow)) return null;
    const scriptElement = rootWindow.document.currentScript
      || Array.from(rootWindow.document.scripts || []).find(script => /wind-shared-profile\.js(?:\?|$)/.test(script.src || ''));
    const toolId = detectToolId(rootWindow, scriptElement);
    try {
      const profile = load(rootWindow.localStorage);
      if (!profile) {
        announce(rootWindow, '尚未找到耐風案件總覽的共用資料，畫面維持原值。', 'warn');
        return null;
      }
      const result = applyToDocument(rootWindow.document, profile, toolId);
      rootWindow.__windSharedProfileApply = result;
      rootWindow.document.documentElement.dataset.windProfileApplied = 'true';
      const labels = result.applied.map(item => item.label).join('、');
      const suffix = labels ? `：${labels}` : '';
      announce(rootWindow, `已從耐風案件總覽自動預填 ${result.applied.length} 項${suffix}。請確認本工具專用幾何與規範路線。`, result.applied.length ? 'ok' : 'warn');
      return result;
    } catch (error) {
      rootWindow.__windSharedProfileApply = { toolId, error: String(error?.message || error) };
      announce(rootWindow, `共用案件資料無法套用：${String(error?.message || error)}`, 'warn');
      return null;
    }
  }

  function buildDispatchUrl(href) {
    const text = String(href || '');
    const hashIndex = text.indexOf('#');
    const hash = hashIndex >= 0 ? text.slice(hashIndex) : '';
    const base = hashIndex >= 0 ? text.slice(0, hashIndex) : text;
    const cleaned = base
      .replace(new RegExp(`([?&])${QUERY_KEY}=[^&#]*&?`, 'g'), '$1')
      .replace(/[?&]$/, '');
    return `${cleaned}${cleaned.includes('?') ? '&' : '?'}${QUERY_KEY}=${QUERY_VALUE}${hash}`;
  }

  function toolIdFromHref(href) {
    const filename = String(href || '').split(/[?#]/)[0].split('/').pop() || '';
    return filename.replace(/\.html$/i, '');
  }

  function decorateDispatchLinks(doc, payload) {
    const profile = normalizeProfile(payload);
    const decorated = [];
    Array.from(doc?.querySelectorAll?.('a.tool-link[href]') || []).forEach(link => {
      const toolId = toolIdFromHref(link.getAttribute('href'));
      if (!SUPPORTED_TOOL_IDS.includes(toolId)) return;
      link.setAttribute('href', buildDispatchUrl(link.getAttribute('href')));
      link.dataset.windProfileDispatch = 'true';
      let note = link.querySelector('[data-wind-profile-dispatch-note]');
      if (!note) {
        note = doc.createElement('span');
        note.className = 'dispatch-note';
        note.dataset.windProfileDispatchNote = '';
        link.appendChild(note);
      }
      const valueCount = resolveMapping(profile, toolId).filter(item => hasUsableValue(item.value)).length;
      note.textContent = `開啟後自動預填 ${valueCount} 項共用資料`;
      decorated.push({ toolId, href: link.getAttribute('href'), valueCount });
    });
    return decorated;
  }

  return Object.freeze({
    SCHEMA,
    PROFILE_VERSION,
    STORAGE_KEY,
    QUERY_KEY,
    QUERY_VALUE,
    SUPPORTED_TOOL_IDS,
    buildProfile,
    normalizeProfile,
    toOverviewParams,
    save,
    load,
    mappingForTool,
    resolveMapping,
    applyToDocument,
    autoApply,
    buildDispatchUrl,
    decorateDispatchLinks,
  });
});
