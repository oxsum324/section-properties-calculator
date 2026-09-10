import { DETAIL_PRESETS, DETAIL_TEXTS, clone, assert, now } from './model.js';
import { createAnnotator, markedImage } from './annotation.js';

// Geometry only. No example damage or inferred measurements enter a record.
export function presetSVG(kind, mirror = false) {
  assert(Object.hasOwn(DETAIL_PRESETS, kind), '細部圖不存在');
  let lines;
  if (kind === 'beam') lines = [[[45,68],[555,68],[555,148],[45,148],[45,68]],[[45,148],[104,210],[496,210],[555,148]],[[45,68],[12,45]],[[555,68],[588,45]]];
  else if (kind === 'frame') lines = [[[45,45],[555,45],[555,105],[45,105],[45,45]],[[135,105],[465,105],[465,264]],[[70,105],[70,264]],[[135,105],[135,264],[70,264]],[[465,264],[530,264],[530,105]],[[135,105],[158,130],[442,130],[465,105]],[[158,130],[158,278],[135,264]],[[442,130],[442,278],[465,264]],[[45,45],[12,25]],[[555,45],[588,25]]];
  else if (kind === 'corner') lines = [[[25,36],[300,83],[575,36]],[[300,83],[300,242]],[[25,285],[300,242],[575,285]]];
  else {
    lines = [[[15,27],[103,75],[497,75],[585,27]],[[103,75],[103,262],[15,302]],[[497,75],[497,262],[585,302]]];
    if (kind === 'door') lines.push([[103,262],[270,262],[270,119],[378,119],[378,262],[497,262]],[[280,262],[280,130],[368,130],[368,262]],[[349,204],[355,204]]);
    else { lines.push([[103,262],[497,262]]); if (kind === 'window') lines.push([[214,122],[386,122],[386,218],[214,218],[214,122]],[[223,132],[377,132],[377,209],[223,209],[223,132]],[[300,132],[300,209]]); }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 600 320"><rect width="600" height="320" fill="white"/><g fill="none" stroke="#242d32" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${mirror ? ' transform="translate(600 0) scale(-1 1)"' : ''}>${lines.map(pts => `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join(' ')}"/>`).join('')}</g></svg>`;
}
export const detailLabel = detail => !detail ? '尚未選擇細圖' : detail.kind === 'text' ? DETAIL_TEXTS[detail.value] : detail.kind === 'image' ? '自訂細圖' : DETAIL_PRESETS[detail.preset];
export async function detailImage(detail, getBlob) {
  assert(detail && detail.kind !== 'text', '請選擇細部底圖');
  const base = detail.kind === 'preset' ? new Blob([presetSVG(detail.preset, detail.mirror)], { type: 'image/svg+xml' }) : await getBlob(detail.mediaId);
  assert(base instanceof Blob, '細部底圖原檔遺失'); return markedImage(base, detail.marks);
}

export async function openDetailEditor(api, recordId) {
  const { $, getProject, getMedia, action, commit, openModal, closeModal, prepareAsset, download, esc: e, setDirty } = api;
  const record = getProject().records.find(r => r.id === recordId); assert(record, '找不到位置紀錄');
  let detail = clone(record.detail || { kind: 'preset', preset: 'beam', mirror: false, marks: [] }), editor, baseURL, prepared, disposed = false;
  const cleanup = () => { disposed = true; editor?.dispose(); if (baseURL) URL.revokeObjectURL(baseURL); };
  openModal('細部示意圖', `<div class="choice-chips"><button id="chooseDetail" aria-expanded="${!record.detail}">更換底圖</button><button id="mirrorDetail">左右鏡射</button><span id="detailName"></span></div><div id="detailChoices" ${record.detail ? 'hidden' : ''}><div class="detail-presets">${Object.entries(DETAIL_PRESETS).map(([key, name]) => `<button data-detail-preset="${key}">${presetSVG(key)}<span>${name}</span></button>`).join('')}</div><div class="choice-chips">${Object.entries(DETAIL_TEXTS).map(([key, name]) => `<button data-detail-text="${key}">${name}</button>`).join('')}</div><label>自訂底圖<input id="detailFile" type="file" accept="image/png,image/jpeg,image/webp"></label></div><div id="detailDrawControls"><div class="annotation-toolbar"><button data-detail-tool="pen" aria-pressed="true">損害線</button><button data-detail-tool="arrow">箭頭</button><button data-detail-tool="circle">圈選</button><button data-detail-tool="text">文字</button><button data-detail-tool="erase">刪除一筆</button><button id="detailUndo">復原</button><button id="detailRedo">重做</button></div><label id="detailTextLabel" hidden>標記文字<input id="detailText" maxlength="120" placeholder="例如裂縫 A"></label><div id="detailStage" class="annotation-stage detail-stage"></div><p class="micro">僅表示觀察位置，未按比例；尺寸以現場量測紀錄為準。</p></div><p id="detailTextPreview" hidden></p><div class="modal-actions"><button id="downloadDetail" class="secondary">下載細圖 PNG</button><button id="saveDetail" class="primary">保存至本位置</button></div>`, cleanup);
  function remember() { if (editor && detail.kind !== 'text') detail.marks = editor.marks; }
  async function paint() {
    editor?.dispose(); editor = null; if (baseURL) URL.revokeObjectURL(baseURL); baseURL = null;
    if (disposed) return;
    $('#detailName').textContent = detailLabel(detail); $('#mirrorDetail').disabled = detail.kind !== 'preset';
    $('#downloadDetail').disabled = detail.kind === 'text'; $('#detailDrawControls').hidden = detail.kind === 'text'; $('#detailTextPreview').hidden = detail.kind !== 'text';
    if (detail.kind === 'text') { $('#detailTextPreview').textContent = DETAIL_TEXTS[detail.value]; return; }
    const blob = detail.kind === 'preset' ? new Blob([presetSVG(detail.preset, detail.mirror)], { type: 'image/svg+xml' }) : prepared?.metadata.id === detail.mediaId ? prepared.asset.blob : (await getMedia(detail.mediaId))?.blob;
    assert(blob, '找不到細部底圖'); if (disposed) return;
    baseURL = URL.createObjectURL(blob); editor = await createAnnotator($('#detailStage'), baseURL, detail.marks, marks => { detail.marks = marks; setDirty(true); });
    editor.setMode('pen'); $('#detailTextLabel').hidden = true; for (const b of $('#modalBody').querySelectorAll('[data-detail-tool]')) b.setAttribute('aria-pressed', String(b.dataset.detailTool === 'pen'));
  }
  function confirmReplace() { remember(); return !detail.marks?.length || confirm('更換底圖會清除目前損害標註。繼續更換？取消此視窗仍可保留原已存紀錄。'); }
  $('#chooseDetail').onclick = () => { const show = $('#detailChoices').hidden; $('#detailChoices').hidden = !show; $('#chooseDetail').setAttribute('aria-expanded', String(show)); };
  $('#detailChoices').onclick = ev => { const b = ev.target.closest('[data-detail-preset],[data-detail-text]'); if (!b) return; action(async () => { if (!confirmReplace()) return; detail = b.dataset.detailPreset ? { kind: 'preset', preset: b.dataset.detailPreset, mirror: false, marks: [] } : { kind: 'text', value: b.dataset.detailText }; $('#detailChoices').hidden = true; $('#chooseDetail').setAttribute('aria-expanded', 'false'); setDirty(true); await paint(); }); };
  $('#detailFile').onchange = () => { const file = $('#detailFile').files[0]; if (file) action(async () => { if (!confirmReplace()) return; prepared = await prepareAsset(file, 'detail', 'detail-import'); assert(!prepared.metadata.previewUnavailable, '此底圖無法顯示，請改用 JPG、PNG 或 WebP'); detail = { kind: 'image', mediaId: prepared.metadata.id, marks: [] }; $('#detailChoices').hidden = true; $('#chooseDetail').setAttribute('aria-expanded', 'false'); setDirty(true); await paint(); }); };
  for (const b of $('#modalBody').querySelectorAll('[data-detail-tool]')) b.onclick = () => { editor?.setMode(b.dataset.detailTool); $('#detailTextLabel').hidden = b.dataset.detailTool !== 'text'; for (const el of $('#modalBody').querySelectorAll('[data-detail-tool]')) el.setAttribute('aria-pressed', String(el === b)); };
  $('#detailText').oninput = () => editor?.setText($('#detailText').value);
  $('#detailUndo').onclick = () => editor?.undo(); $('#detailRedo').onclick = () => editor?.redo();
  $('#mirrorDetail').onclick = () => action(async () => { remember(); if (detail.kind !== 'preset') return; detail.mirror = !detail.mirror; detail.marks.forEach(m => m.points.forEach(p => { p.x = 1 - p.x; })); setDirty(true); await paint(); });
  const getBlob = async mid => prepared?.metadata.id === mid ? prepared.asset.blob : (await getMedia(mid))?.blob;
  $('#downloadDetail').onclick = () => action(async () => { remember(); assert(!editor?.pending, '請先完成目前筆畫'); const jpg = await detailImage(detail, getBlob), url = URL.createObjectURL(jpg); try { const img = new Image(); img.src = url; await img.decode(); const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; canvas.getContext('2d').drawImage(img, 0, 0); const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); assert(png, '細圖匯出失敗'); download(png, `${getProject().code}-細部圖-${record.fieldNumber || '位置'}.png`); } finally { URL.revokeObjectURL(url); } });
  $('#saveDetail').onclick = () => action(async () => { remember(); assert(!editor?.pending, '請先完成目前筆畫'); const imported = detail.kind === 'image' && prepared?.metadata.id === detail.mediaId; await commit(p => { const r = p.records.find(r => r.id === recordId); assert(r, '位置已變更'); if (imported) p.media.push(prepared.metadata); r.detail = clone(detail); r.updatedAt = now(); }, imported ? [prepared.asset] : []); closeModal(true); await api.render(); });
  await paint();
}
