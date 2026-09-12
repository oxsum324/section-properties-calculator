import { id, WIDTH_MODES, CRACK_PATTERNS, CRACK_LAYERS, assert } from './model.js';

export const crackLabel = i => String.fromCharCode(65 + i);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const options = (items, value) => Object.entries(items).map(([k, v]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(v)}</option>`).join('');
export function createCrackFields(root, changed, legacyValues, onError) {
  let cracks, legacy;
  function read() {
    if (!cracks) return {};
    const result = [...root.querySelectorAll('[data-crack-id]')].map(card => {
      const get = key => card.querySelector(`[data-key="${key}"]`), measured = get('measured').checked, mode = get('widthMode').value;
      const numeric = key => {
        const el = get(key); assert(!el.validity.badInput, '裂縫尺寸格式不正確');
        const n = el.value === '' ? null : Number(el.value); assert(n === null || Number.isFinite(n) && n >= 0, '裂縫尺寸須為非負數值'); return n;
      };
      return { id: card.dataset.crackId, measured, widthMode: mode, width: measured && mode === 'exact' ? numeric('width') : null, length: measured ? numeric('length') : null, pattern: get('pattern').value, layer: get('layer').value, notes: get('notes').value };
    });
    return { cracks: result, ...(legacy ? { legacyCrack: legacy } : {}) };
  }
  function state() {
    for (const [i, card] of [...root.querySelectorAll('[data-crack-id]')].entries()) {
      const get = key => card.querySelector(`[data-key="${key}"]`), measured = get('measured').checked;
      get('width').disabled = !measured || get('widthMode').value !== 'exact'; get('length').disabled = !measured;
      const w = measured && get('widthMode').value === 'exact' && get('width').value !== '' ? `${get('width').value} mm` : WIDTH_MODES[get('widthMode').value];
      card.querySelector('summary').textContent = `裂縫 ${crackLabel(i)} · ${w}${measured && get('length').value !== '' ? ` · ${get('length').value} m` : ''}${measured ? '' : ' · 未量測'}`;
    }
  }
  function render() {
    root.innerHTML = `<div class="choice-chips"><button type="button" data-count="1">1 條</button><button type="button" data-count="2">2 條</button><button type="button" data-count="3">3 條</button><button type="button" data-add>＋一條</button></div><p class="micro">每條分別記寬度 mm、長度 m；A、B、C 可標在同一張照片。</p>${legacy ? '<p class="micro">原有整組尺寸已保留供核對，未自動分配至任何單條裂縫。</p>' : ''}<div class="crack-cards">${(cracks || []).map((c, i) => `<details data-crack-id="${esc(c.id)}" ${i === (cracks.length - 1) ? 'open' : ''}><summary>裂縫 ${crackLabel(i)}</summary><fieldset class="component-field"><legend>本條觀察層位</legend><select data-key="layer" aria-label="本條觀察層位">${options(CRACK_LAYERS, c.layer || 'unknown')}</select></fieldset><label>型態<select data-key="pattern">${options(Object.fromEntries(Object.entries(CRACK_PATTERNS).filter(([k]) => !['network', 'u'].includes(k))), c.pattern)}</select></label><label>寬度記法<select data-key="widthMode">${options(WIDTH_MODES, c.widthMode)}</select></label><button type="button" data-narrow>≤0.3 mm 以下</button><label class="check-label"><input data-key="measured" type="checkbox" ${c.measured ? 'checked' : ''}>本條已實際量測</label><div class="two-col"><label>寬度（mm）<input data-key="width" type="number" min="0" step="any" inputmode="decimal" value="${c.width ?? ''}"></label><label>長度（m）<input data-key="length" type="number" min="0" step="any" inputmode="decimal" value="${c.length ?? ''}"></label></div><label>本條說明<input data-key="notes" maxlength="1000" value="${esc(c.notes)}" placeholder="例如窗角向下延伸；尚未量測"></label><button type="button" data-remove>移除本條</button></details>`).join('')}</div>`;
    state();
  }
  root.addEventListener('input', state);
  root.addEventListener('change', state);
  const handleClick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-narrow')) { const card = b.closest('[data-crack-id]'); card.querySelector('[data-key="widthMode"]').value = 'le03'; card.querySelector('[data-key="width"]').value = ''; state(); changed(); return; }
    const current = read(); if (cracks) cracks = current.cracks; else legacy ??= legacyValues();
    if (b.hasAttribute('data-remove')) {
      if (!confirm('移除此條裂縫及尺寸？照片上的文字圈註仍保留，請一併核對。')) return;
      cracks = cracks.filter(c => c.id !== b.closest('[data-crack-id]').dataset.crackId);
    } else {
      const count = b.hasAttribute('data-add') ? (cracks?.length || 0) + 1 : Number(b.dataset.count);
      if (count < (cracks?.length || 0) && !confirm('減少條數會移除末尾裂縫的尺寸，照片標記請一併核對。')) return;
      if (count > 26) return;
      cracks ??= [];
      while (cracks.length < count) cracks.push({ id: id(), measured: false, widthMode: 'unknown', width: null, length: null, pattern: '', layer: 'unknown', notes: '' });
      cracks.length = count;
    }
    render(); changed();
  };
  root.onclick = e => { try { handleClick(e); } catch (error) { onError(error); } };
  return {
    get active() { return Array.isArray(cracks); },
    read,
    load(r) {
      cracks = r.cracks ? structuredClone(r.cracks) : undefined;
      legacy = r.legacyCrack ? structuredClone(r.legacyCrack) : undefined;
      render();
    }
  };
}
