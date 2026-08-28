/* core/loads/project-location.js — v1.0
 * 跨工具共用工址設定檔：只保存行政區與地盤分類；規範值每次由目前主庫重新解析。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProjectLocation = api;
  if (root && root.document) {
    const bind = function () { api.autoBind(root); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCHEMA = 'structural-project-location.v1';
  const VERSION = '1.0.0';
  const STORAGE_KEY = 'structuralProjectLocation:latest.v1';
  const CONTROL_CLASS = 'project-location-bar';
  const FIELD_MAPS = Object.freeze([
    Object.freeze({ kind: 'stone', city: 'c_city', district: 'c_dist', siteClass: 's_site_class' }),
    Object.freeze({ kind: 'seismic', city: 'zoneCity', district: 'zoneDist', siteClass: 'siteClass' }),
    Object.freeze({ kind: 'wind', windKey: 'city' }),
  ]);

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function siteClassValue(value) {
    const number = Number(value);
    return [1, 2, 3].includes(number) ? number : null;
  }

  function dependencies(overrides, rootWindow) {
    const source = overrides || {};
    const host = rootWindow || (typeof window !== 'undefined' ? window : globalThis);
    return {
      locations: source.locations || host?.RegulatoryLocations,
      zones: source.zones || host?.SeismicZones,
      seismic: source.seismic || host?.Seismic,
      wind: source.wind || host?.Wind,
    };
  }

  function normalizedZoneTable(deps) {
    const locations = deps.locations;
    const raw = deps.zones?.ZONES;
    if (!locations?.normalizeZones || !raw) throw new Error('工址服務缺少行政區或耐震主庫。');
    return locations.normalizeZones(raw);
  }

  function resolve(input, overrides) {
    const deps = dependencies(overrides);
    const locations = deps.locations;
    const zones = normalizedZoneTable(deps);
    const city = text(input?.location?.city ?? input?.city);
    const district = locations.normalizeDistrict(city, input?.location?.district ?? input?.district);
    const siteClass = siteClassValue(input?.site?.class ?? input?.siteClass);
    if (!city || !district) throw new Error('請先選擇縣市與鄉鎮市區。');
    const row = zones[city]?.[district];
    if (!row) throw new Error(`耐震主庫找不到工址：${city}${district}。`);

    const windResolution = locations.resolveWindKey(city, district, deps.wind?.CITY_QUICK);
    const windValue = windResolution.key ? Number(deps.wind.CITY_QUICK[windResolution.key]) : null;
    const seismicValues = {
      SsD: Number(row[0]),
      S1D: Number(row[1]),
      SsM: Number(row[2]),
      S1M: Number(row[3]),
    };
    let siteValues = null;
    if (siteClass != null) {
      if (!deps.seismic?.getFa || !deps.seismic?.getFv) throw new Error('工址服務缺少地盤係數主庫。');
      const Fa = Number(deps.seismic.getFa(siteClass, seismicValues.SsD));
      const Fv = Number(deps.seismic.getFv(siteClass, seismicValues.S1D));
      siteValues = Object.freeze({
        class: siteClass,
        Fa,
        Fv,
        SDS: Fa * seismicValues.SsD,
        SD1: Fv * seismicValues.S1D,
      });
    }

    return Object.freeze({
      location: Object.freeze({ city, district, label: `${city}${district}` }),
      site: siteValues,
      regulatory: Object.freeze({
        seismic: Object.freeze(seismicValues),
        wind: Object.freeze({
          key: windResolution.key,
          V10C: Number.isFinite(windValue) ? windValue : null,
          explicitException: windResolution.explicitException,
        }),
      }),
    });
  }

  function buildProfile(input, overrides) {
    const resolved = resolve(input, overrides);
    const source = input?.source || {};
    return {
      schema: SCHEMA,
      version: VERSION,
      savedAt: text(input?.savedAt) || new Date().toISOString(),
      source: {
        toolId: text(source.toolId),
        toolName: text(source.toolName),
        toolVersion: text(source.toolVersion),
      },
      location: {
        city: resolved.location.city,
        district: resolved.location.district,
      },
      site: {
        class: resolved.site?.class ?? null,
      },
    };
  }

  function normalizeProfile(payload, overrides) {
    if (!payload || typeof payload !== 'object') throw new Error('共用工址設定檔格式不正確。');
    if (payload.schema !== SCHEMA) throw new Error(`不支援的共用工址格式：${payload.schema || '未標示'}。`);
    return buildProfile(payload, overrides);
  }

  function save(payload, storage, overrides) {
    const profile = payload?.schema === SCHEMA ? normalizeProfile(payload, overrides) : buildProfile(payload, overrides);
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) throw new Error('瀏覽器儲存空間不可用。');
    target.setItem(STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  function load(storage, overrides) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return null;
    const raw = target.getItem(STORAGE_KEY);
    return raw ? normalizeProfile(JSON.parse(raw), overrides) : null;
  }

  function detectFieldMap(doc) {
    return FIELD_MAPS.find(map => (map.city && doc?.getElementById?.(map.city)) || (map.windKey && doc?.getElementById?.(map.windKey))) || null;
  }

  function scriptMeta(doc) {
    const script = doc?.currentScript
      || Array.from(doc?.scripts || []).find(item => /project-location\.js(?:\?|$)/.test(item.src || ''));
    return {
      toolId: text(script?.dataset?.locationToolId),
      toolName: text(script?.dataset?.locationToolName) || text(doc?.title),
      toolVersion: text(script?.dataset?.locationToolVersion),
    };
  }

  function captureFromDocument(doc, overrides) {
    const map = detectFieldMap(doc);
    if (!map || !map.city || !map.district) throw new Error('本頁只能套用共用工址，請由耐震或石材工具儲存縣市／鄉鎮。');
    return buildProfile({
      city: doc.getElementById(map.city)?.value,
      district: doc.getElementById(map.district)?.value,
      siteClass: map.siteClass ? doc.getElementById(map.siteClass)?.value : null,
      source: scriptMeta(doc),
    }, overrides);
  }

  function dispatch(doc, element, eventName) {
    const EventCtor = doc?.defaultView?.Event || (typeof Event !== 'undefined' ? Event : null);
    if (element && EventCtor) element.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
  }

  function setSelect(doc, id, value) {
    const element = doc?.getElementById?.(id);
    if (!element) return false;
    const found = Array.from(element.options || []).some(option => String(option.value) === String(value));
    if (!found) return false;
    element.value = String(value);
    dispatch(doc, element, 'input');
    dispatch(doc, element, 'change');
    return true;
  }

  function applyToDocument(doc, payload, overrides) {
    const profile = payload?.schema === SCHEMA ? normalizeProfile(payload, overrides) : buildProfile(payload, overrides);
    const resolved = resolve(profile, overrides);
    const map = detectFieldMap(doc);
    if (!map) throw new Error('本頁沒有可套用的工址欄位。');
    const applied = [];
    if (map.kind === 'wind') {
      if (!resolved.regulatory.wind.key) {
        throw new Error(resolved.regulatory.wind.explicitException || '耐風主庫找不到此工址。');
      }
      if (!setSelect(doc, map.windKey, resolved.regulatory.wind.key)) {
        throw new Error(`本頁耐風地點選單沒有 ${resolved.regulatory.wind.key}。`);
      }
      applied.push('耐風地點');
    } else {
      if (!setSelect(doc, map.city, resolved.location.city)) throw new Error(`本頁縣市選單沒有 ${resolved.location.city}。`);
      if (!setSelect(doc, map.district, resolved.location.district)) throw new Error(`本頁鄉鎮選單沒有 ${resolved.location.district}。`);
      applied.push('縣市', '鄉鎮市區');
      if (profile.site.class != null && map.siteClass) {
        if (!setSelect(doc, map.siteClass, profile.site.class)) throw new Error(`本頁地盤分類無法套用第 ${profile.site.class} 類。`);
        applied.push('地盤分類');
      }
    }
    return { profile, resolved, kind: map.kind, applied };
  }

  function addStyles(doc) {
    if (!doc?.head || doc.getElementById('projectLocationStyle')) return;
    const style = doc.createElement('style');
    style.id = 'projectLocationStyle';
    style.textContent = `.${CONTROL_CLASS}{max-width:1200px;margin:10px auto;padding:9px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid #bae6fd;border-left:4px solid #0284c7;border-radius:8px;background:#f0f9ff;color:#0c4a6e;font-size:.84em;line-height:1.55}.${CONTROL_CLASS} button{width:auto;margin:0;padding:5px 10px;border:1px solid #0284c7;border-radius:6px;background:#fff;color:#075985;font-weight:700;cursor:pointer}.${CONTROL_CLASS} [data-location-status]{flex:1 1 260px}.${CONTROL_CLASS}[data-tone="warn"]{border-left-color:#d97706;background:#fffbeb;color:#92400e}@media print{.${CONTROL_CLASS}{display:none!important}}`;
    doc.head.appendChild(style);
  }

  function statusText(profile, overrides) {
    const resolved = resolve(profile, overrides);
    const site = resolved.site ? `／地盤第 ${resolved.site.class} 類／SDS=${resolved.site.SDS.toFixed(3)}` : '';
    const wind = resolved.regulatory.wind.V10C != null ? `／V₁₀(C)=${resolved.regulatory.wind.V10C} m/s` : '／耐風值需專案確認';
    return `${resolved.location.label}${site}${wind}`;
  }

  function autoBind(rootWindow) {
    const doc = rootWindow?.document;
    const map = detectFieldMap(doc);
    if (!doc?.body || !map || doc.querySelector(`.${CONTROL_CLASS}`)) return null;
    addStyles(doc);
    const bar = doc.createElement('div');
    bar.className = `${CONTROL_CLASS} page-only-report-status`;
    bar.innerHTML = `<strong>共用工址：</strong><button type="button" data-location-apply>套用已存工址</button>${map.kind === 'wind' ? '' : '<button type="button" data-location-save>儲存目前工址</button>'}<span data-location-status>尚未儲存工址。</span>`;
    const anchor = doc.querySelector('.project-meta-profile-bar') || doc.querySelector('.mode-bar') || doc.querySelector('header');
    if (anchor?.parentNode) anchor.insertAdjacentElement('afterend', bar);
    else doc.body.insertAdjacentElement('afterbegin', bar);
    const status = bar.querySelector('[data-location-status]');
    const setStatus = (message, tone) => {
      status.textContent = message;
      bar.dataset.tone = tone || 'ok';
    };
    try {
      const existing = load(rootWindow.localStorage, dependencies(null, rootWindow));
      if (existing) setStatus(`已存：${statusText(existing, dependencies(null, rootWindow))}。套用後仍須確認專案指定條件。`, 'ok');
    } catch (error) {
      setStatus(`既有工址無法讀取：${String(error?.message || error)}`, 'warn');
    }
    bar.querySelector('[data-location-save]')?.addEventListener('click', function () {
      try {
        const profile = captureFromDocument(doc, dependencies(null, rootWindow));
        save(profile, rootWindow.localStorage, dependencies(null, rootWindow));
        setStatus(`已儲存：${statusText(profile, dependencies(null, rootWindow))}。`, 'ok');
      } catch (error) {
        setStatus(`無法儲存：${String(error?.message || error)}`, 'warn');
      }
    });
    bar.querySelector('[data-location-apply]')?.addEventListener('click', function () {
      try {
        const profile = load(rootWindow.localStorage, dependencies(null, rootWindow));
        if (!profile) throw new Error('尚未儲存共用工址。');
        const result = applyToDocument(doc, profile, dependencies(null, rootWindow));
        setStatus(`已套用 ${result.applied.join('、')}：${statusText(profile, dependencies(null, rootWindow))}。`, 'ok');
      } catch (error) {
        setStatus(`無法套用：${String(error?.message || error)}`, 'warn');
      }
    });
    return bar;
  }

  return Object.freeze({
    SCHEMA,
    VERSION,
    STORAGE_KEY,
    FIELD_MAPS,
    resolve,
    buildProfile,
    normalizeProfile,
    save,
    load,
    detectFieldMap,
    captureFromDocument,
    applyToDocument,
    statusText,
    autoBind,
  });
});
