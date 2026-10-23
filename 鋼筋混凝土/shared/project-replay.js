/* RC 板、牆舊版專案 JSON 重算比對（於 report.js 之後載入；指紋一律呼叫 RCReportFingerprint） */
(function initProjectReplay(globalScope) {
  'use strict';
  const IDENTITY_FIELDS = ['projName', 'projNo', 'projDesigner'];
  const fp = () => globalScope.RCReportFingerprint;
  const has = (object, key) => !!object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
  const same = (a, b, options) => fp().buildProjectCalculationFingerprint(a, options) === fp().buildProjectCalculationFingerprint(b, options);
  const fieldText = value => globalScope.RCUI.normalizeProjectFieldValue(value);

  // 與 report.js normalizeProjectToolVersion 等價（contract 比對）
  function normalizeVersion(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^v?(\d+(?:\.\d+)*(?:[-+.\w]*)?)$/i);
    return match ? `V${match[1]}` : raw;
  }
  const versionList = list => (list || []).map(normalizeVersion);

  function resolveProjectToolVersion(payload) {
    return payload && typeof payload === 'object'
      ? normalizeVersion(payload.appVersion || payload.tool?.pageVersion || payload.pageVersion)
      : '';
  }

  // 舊版以原版本號交 report.js 驗證 schema、工具與存檔指紋
  function validateLegacyProjectSource(raw, options) {
    let parsed = raw;
    try { if (typeof raw === 'string') parsed = JSON.parse(raw); } catch (_) { /* report.js 回報 */ }
    const { legacyVersions, ...validation } = options;
    const sourceVersion = resolveProjectToolVersion(parsed);
    if (versionList(legacyVersions).includes(sourceVersion)) validation.expectedVersion = sourceVersion;
    return fp().validateProjectCalculationSource(parsed, validation);
  }

  // 逐欄比對存檔與重算後輸入；summary 除外，其他頂層鍵依指紋忽略規則
  function diffProjectCalculationInputs(source, replayed, options = {}) {
    const sourceKey = options.sourceKey || 'fields';
    const ignored = { ignoredKeys: options.fingerprintOptions?.ignoredKeys };
    const out = [];
    const compare = (a, b, key, wrap, wrapOptions) => {
      if (!same(wrap(key, a?.[key]), wrap(key, b?.[key]), wrapOptions)) {
        out.push({ type: !has(a, key) ? 'added' : (!has(b, key) ? 'missing' : 'changed'), key, saved: a?.[key], replayed: b?.[key] });
      }
    };
    const saved = source?.[sourceKey] || {};
    const current = replayed?.[sourceKey] || {};
    new Set([...Object.keys(saved), ...Object.keys(current)]).forEach(id => compare(saved, current, id, (key, entry) => ({
      v: IDENTITY_FIELDS.includes(key) && has(entry, 'value') ? { ...entry, value: fieldText(entry.value) } : entry,
    })));
    new Set([...Object.keys(source || {}), ...Object.keys(replayed || {})]).forEach(key => {
      if (key !== sourceKey && key !== 'summary') compare(source, replayed, key, (k, value) => ({ [k]: value }), ignored);
    });
    return out;
  }

  const show = value => (has(value, 'checked') ? (value.checked ? '勾選' : '未勾選')
    : has(value, 'value') ? `「${value.value ?? ''}」` : JSON.stringify(value));
  const GROUPS = [
    ['missing', '目前版本無此欄位', item => `存檔 ${show(item.saved)}`],
    ['changed', '套用並重算後值不同', item => `存檔 ${show(item.saved)}，套用後 ${show(item.replayed)}`],
    ['added', '目前版本新增、存檔未記錄', item => `目前頁面 ${show(item.replayed)}`],
  ];
  const describeInputs = list => GROUPS.map(([type, label, detail]) => {
    const items = list.filter(item => item.type === type);
    return items.length ? `${label}：${items.map(item => `${item.key}（${detail(item)}）`).join('、')}` : '';
  }).filter(Boolean).join('；');

  function compareResult(saved, current) {
    const changedKeys = [...new Set([...Object.keys(saved), ...Object.keys(current)])].filter(key => !same({ v: saved[key] }, { v: current[key] }));
    return { changedKeys, saved, current };
  }
  function describeResult({ changedKeys, saved, current }) {
    const banner = summary => String(summary.banner ?? '').trim() || '（未記錄）';
    const count = summary => (Number.isFinite(summary.reviewWarningCount) ? summary.reviewWarningCount : null);
    const [before, after] = [count(saved), count(current)];
    return (changedKeys.includes('banner') ? `判定由「${banner(saved)}」改為「${banner(current)}」` : `判定維持「${banner(current)}」`)
      + (before === null || after === null ? '' : `（審查警示 ${before === after ? after : `${before}→${after}`} 項）`);
  }

  // 現行版沿用 assertProjectCalculationReplay；舊版須輸入逐欄重現，僅結果不同時回傳 recalculated
  function reconcileProjectCalculationReplay(source, replayed, options = {}) {
    const sourceVersion = resolveProjectToolVersion(source);
    const currentVersion = resolveProjectToolVersion(replayed);
    const legacy = !!sourceVersion && sourceVersion !== currentVersion && versionList(options.legacyVersions).includes(sourceVersion);
    const metadata = source?.metadata || {};
    const outcome = {
      status: 'reproduced', legacy, sourceVersion, currentVersion,
      sourceFingerprint: String(source?.calculationFingerprint || ''),
      replayedFingerprint: String(replayed?.calculationFingerprint || ''),
      projectName: fieldText(metadata.projectName) || fieldText(metadata.projectNo) || '未命名專案',
    };
    const inputs = () => diffProjectCalculationInputs(source, replayed, options);
    const change = () => compareResult(source?.summary || {}, replayed?.summary || {});
    if (!legacy) {
      try {
        fp().assertProjectCalculationReplay(source, replayed);
        return outcome;
      } catch (error) {
        const diff = inputs();
        const result = change();
        throw new Error(error.message + (diff.length ? `輸入無法逐欄重現：${describeInputs(diff)}。`
          : result.changedKeys.length ? `存檔結果與重算結果不同：${describeResult(result)}。` : ''));
      }
    }
    const failure = `專案 JSON 重現失敗：來源 ${outcome.sourceFingerprint || '未提供'}，重算 ${outcome.replayedFingerprint || '無法計算'}。`;
    if (!outcome.sourceFingerprint || !outcome.replayedFingerprint) throw new Error(failure);
    const diff = inputs();
    if (diff.length) throw new Error(`${failure}原為 ${sourceVersion} 專案檔，下列輸入無法於 ${currentVersion} 逐欄重現，未載入：${describeInputs(diff)}。`);
    if (outcome.sourceFingerprint === outcome.replayedFingerprint) return outcome;
    const result = change();
    if (!result.changedKeys.length) throw new Error(failure);
    return { ...outcome, status: 'recalculated', resultChange: result };
  }

  // 回傳 { status: 'ok'|'warn', message }
  function describeProjectCalculationReplay(outcome, options = {}) {
    const o = outcome || {};
    const subject = `${o.projectName}，套用 ${Number(options.applied) || 0} 個欄位`;
    const migrated = `原為 ${o.sourceVersion} 專案檔，已依 ${o.currentVersion} 重新計算`;
    const lead = `已讀取${options.sourceLabel || '專案檔'}`;
    return o.status === 'recalculated'
      ? { status: 'warn', message: `${lead}並依 ${o.currentVersion} 重新計算：${subject}，輸入逐欄重現｜${migrated}；${describeResult(o.resultChange)}，請另存 ${o.currentVersion} 專案檔｜計算指紋 ${o.sourceFingerprint}（${o.sourceVersion} 存檔）→ ${o.replayedFingerprint}（${o.currentVersion} 重算）` }
      : { status: 'ok', message: `${lead}並重現計算：${subject}｜計算指紋 ${o.sourceFingerprint}${o.legacy ? `｜${migrated}，請另存 ${o.currentVersion} 專案檔` : ''}` };
  }

  globalScope.RCProjectReplay = Object.freeze({
    resolveProjectToolVersion,
    validateLegacyProjectSource,
    diffProjectCalculationInputs,
    reconcileProjectCalculationReplay,
    describeProjectCalculationReplay,
  });
})(typeof window !== 'undefined' ? window : globalThis);
