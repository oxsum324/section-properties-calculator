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
  const PROFILE_VERSION = '1.0';
  const STORAGE_KEY = 'toolProjectMetaProfile:latest.v1';
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

  function dispatchFieldEvents(doc, element) {
    const EventCtor = doc?.defaultView?.Event || (typeof Event !== 'undefined' ? Event : null);
    if (!EventCtor) return;
    element.dispatchEvent(new EventCtor('input', { bubbles: true }));
    element.dispatchEvent(new EventCtor('change', { bubbles: true }));
  }

  function applyToDocument(doc, payload) {
    const profile = normalizeProfile(payload);
    const applied = [];
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
      element.value = value;
      dispatchFieldEvents(doc, element);
      applied.push({ id: spec.id, key: spec.key, label: spec.label, value });
    });
    return { profile, applied, skipped };
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
      '<span>選用，不影響計算；空白可由主文承接。</span>',
      '<button type="button" data-project-meta-save>儲存目前表頭</button>',
      '<button type="button" data-project-meta-apply>套用共用表頭</button>',
      '<button type="button" data-project-meta-clear>清除共用表頭</button>',
      '<span class="project-meta-profile-status" data-project-meta-status aria-live="polite"></span>',
    ].join('');

    const style = doc.createElement('style');
    style.id = 'projectMetaProfileStyle';
    style.textContent = [
      '.' + CONTROL_CLASS + '{max-width:1200px;margin:10px auto 0;padding:9px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f0f9ff;border:1px solid #bae6fd;border-left:4px solid #0284c7;border-radius:8px;color:#0c4a6e;font-size:.84em;line-height:1.55}',
      '.' + CONTROL_CLASS + ' strong{font-size:1em}',
      '.' + CONTROL_CLASS + ' button{border:0;border-radius:7px;padding:7px 10px;background:#e0f2fe;color:#075985;font-weight:700;cursor:pointer}',
      '.' + CONTROL_CLASS + ' button:hover{filter:brightness(.96)}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status{flex:1 1 280px;font-weight:700}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status[data-tone="warn"]{color:#92400e}',
      '.' + CONTROL_CLASS + ' .project-meta-profile-status[data-tone="error"]{color:#991b1b}',
      '@media print{.' + CONTROL_CLASS + '{display:none!important}}',
    ].join('');
    if (!doc.getElementById(style.id)) doc.head.appendChild(style);

    bar.querySelector('[data-project-meta-save]').addEventListener('click', function () {
      try {
        const profile = save(collectFromDocument(doc, meta), rootWindow.localStorage);
        setStatus(bar, `已儲存共用表頭；可在其他工具選擇套用。${describeProfile(profile)}`, 'ok');
      } catch (error) {
        setStatus(bar, String(error?.message || error), 'warn');
      }
    });
    bar.querySelector('[data-project-meta-apply]').addEventListener('click', function () {
      try {
        const profile = load(rootWindow.localStorage);
        if (!profile) {
          setStatus(bar, '尚無共用表頭，畫面維持原值。空白可由主文承接。', 'warn');
          return;
        }
        const result = applyToDocument(doc, profile);
        const labels = result.applied.map(item => item.label).join('、');
        setStatus(
          bar,
          result.applied.length ? `已套用 ${result.applied.length} 項：${labels}。請確認後再計算或核可。` : '共用表頭沒有非空白欄位，畫面維持原值。',
          result.applied.length ? 'ok' : 'warn'
        );
      } catch (error) {
        setStatus(bar, `共用表頭無法套用：${String(error?.message || error)}`, 'error');
      }
    });
    bar.querySelector('[data-project-meta-clear]').addEventListener('click', function () {
      try {
        clear(rootWindow.localStorage);
        setStatus(bar, '已清除共用表頭；目前頁面資料未變更。', 'warn');
      } catch (error) {
        setStatus(bar, `共用表頭無法清除：${String(error?.message || error)}`, 'error');
      }
    });

    try {
      setStatus(bar, describeProfile(load(rootWindow.localStorage)), 'ok');
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
    FIELD_SPECS,
    normalizeText,
    buildProfile,
    normalizeProfile,
    hasProjectValues,
    collectFromDocument,
    save,
    load,
    clear,
    applyToDocument,
    describeProfile,
    autoBind,
  };
});
