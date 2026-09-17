import { DETAIL_PRESETS, DETAIL_TEXTS, clone, assert, now } from './model.js';
import { createDetailCanvas } from './detail-canvas.js';
import { renderDetailImage, usedSymbols } from './detail-render.js';
import { DETAIL_SYMBOLS, REGION_TYPES, symbolPreview, mirrorDetailMarks, detailMarkName } from './detail-geometry.js';

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
export const detailLegend = detail => detail?.marks ? usedSymbols(detail.marks).map(s => DETAIL_SYMBOLS[s]).join('／') : '';
export async function detailImage(detail, getBlob) {
  assert(detail && detail.kind !== 'text', '請選擇細部底圖');
  const base = detail.kind === 'preset' ? new Blob([presetSVG(detail.preset, detail.mirror)], { type: 'image/svg+xml' }) : await getBlob(detail.mediaId);
  assert(base instanceof Blob, '細部底圖原檔遺失'); return renderDetailImage(base, detail.marks);
}

export async function openDetailEditor(api, recordId) {
  const { $, getProject, getMedia, action, commit, openModal, closeModal, prepareAsset, download, esc: e, setDirty } = api;
  const record = getProject().records.find(r => r.id === recordId); assert(record, '找不到位置紀錄');
  let detail = clone(record.detail || { kind: 'preset', preset: 'beam', mirror: false, marks: [] }), editor, baseURL, prepared, disposed = false;
  const cleanup = () => { disposed = true; editor?.dispose(); if (baseURL) URL.revokeObjectURL(baseURL); };
  openModal('細部示意圖', `<div class="detail-controls"><p class="detail-context micro" title="${e(api.contextLabel || '')}">${e(api.contextLabel || '本筆位置的照片共用細圖')}</p><div class="choice-chips"><button id="chooseDetail" aria-expanded="${!record.detail}">底圖</button><button id="mirrorDetail">左右鏡射</button><span id="detailName"></span></div><div id="detailChoices" ${record.detail ? 'hidden' : ''}><div class="detail-presets">${Object.entries(DETAIL_PRESETS).map(([key, name]) => `<button data-detail-preset="${key}">${presetSVG(key)}<span>${name}</span></button>`).join('')}</div><div class="choice-chips">${Object.entries(DETAIL_TEXTS).map(([key, name]) => `<button data-detail-text="${key}">${name}</button>`).join('')}</div><label>自訂底圖<input id="detailFile" type="file" accept="image/png,image/jpeg,image/webp"></label></div><div id="detailDrawControls"><div class="detail-tools">${[['door','＋ 門框'],['window','＋ 窗框'],['line','裂隙'],['region','範圍'],['symbol','圖示'],['text','文字'],['select','選取'],['pan','移動']].map(([key,name])=>`<button data-detail-tool="${key}">${name}</button>`).join('')}</div><div id="detailSymbols" hidden>${Object.entries(DETAIL_SYMBOLS).map(([key,name])=>`<button data-detail-symbol="${key}">${symbolPreview(key)}<span>${name}</span></button>`).join('')}</div><label id="detailRegionLabel" hidden>範圍類型<select id="detailRegion">${Object.entries(REGION_TYPES).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></label><label id="detailTextLabel" hidden>標記文字<input id="detailText" maxlength="120" placeholder="例如裂縫 A"></label><div id="detailSelection" hidden><label>選取標記<select id="detailObject"></select></label><div class="choice-chips"><button id="detailDelete">刪除這筆</button><button id="detailDeleteSegment">刪除這段</button><button id="detailDeletePoint">刪除端點</button><button id="detailCopy">複製</button></div><div id="detailSymbolActions" class="choice-chips"><button id="detailShrink">圖示縮小</button><button id="detailGrow">圖示放大</button><button id="detailRotate">旋轉 15°</button></div><details><summary>位置微調</summary><div class="choice-chips">${[['-1,0','←'],['1,0','→'],['0,-1','↑'],['0,1','↓']].map(([dir,name])=>`<button data-detail-nudge="${dir}">${name}</button>`).join('')}</div></details></div><details id="detailMore"><summary>其他畫法／說明</summary><div class="choice-chips">${[['pen','自由手繪'],['arrow','兩點箭頭'],['circle','兩點圈選'],['rect','兩點範圍框'],['erase','快速刪除']].map(([key,name])=>`<button data-detail-tool="${key}">${name}</button>`).join('')}</div><p class="micro">門窗以立面開口框表示，可在預設或自訂底圖補畫多個；兩個對角調整寬高，不代表實測尺寸。裂隙逐點連線，範圍至少三點後完成；雙指縮放，移動模式可單指平移。圖示僅示意，不代表實測範圍或量測值。</p></details></div></div><div class="detail-workspace"><div id="detailNavigation" class="choice-chips"><button id="detailZoomOut" aria-label="縮小圖面">−</button><button id="detailZoomIn" aria-label="放大圖面">＋</button><button id="detailFit">全圖</button><span id="detailLegend" class="micro"></span></div><div id="detailStage"></div><p id="detailTextPreview" hidden></p><p id="detailHint" class="micro" role="status"></p></div><div class="detail-dock"><button id="detailUndo">復原</button><button id="detailRedo">重做</button><button id="detailFinish">完成筆畫</button><button id="detailCancel">取消筆畫</button><button id="downloadDetail" class="secondary">下載 PNG</button><button id="saveDetail" class="primary">保存</button></div>`, cleanup);
  $('#modal').dataset.mode = 'detail';
  function remember() { if (editor && detail.kind !== 'text') detail.marks = editor.marks; }
  function state(st) {
    $('#detailUndo').disabled = !st.canUndo; $('#detailRedo').disabled = !st.canRedo;
    $('#detailFinish').hidden = $('#detailCancel').hidden = false; $('#detailFinish').disabled = !st.pending || !['line','region'].includes(st.mode); $('#detailCancel').disabled = !st.pending; $('#saveDetail').disabled = $('#downloadDetail').disabled = st.pending;
    $('#detailTextLabel').hidden = st.mode !== 'text'; $('#detailRegionLabel').hidden = !['region','rect'].includes(st.mode); $('#detailSelection').hidden = st.mode !== 'select';
    $('#detailObject').innerHTML = '<option value="-1">選擇標記</option>' + st.marks.map((m,i)=>`<option value="${i}">${i+1} · ${e(detailMarkName(m))}</option>`).join(''); $('#detailObject').value = String(st.selected);
    const m = st.marks[st.selected]; $('#detailDelete').disabled = $('#detailCopy').disabled = !m; $('#detailDeleteSegment').hidden = m?.type !== 'pen' || st.segment < 0; $('#detailDeletePoint').hidden = st.vertex < 0 || !m || m.points.length <= (m.type === 'region' ? 3 : 2); $('#detailSymbolActions').hidden = m?.type !== 'symbol';
    for (const b of $('#modalBody').querySelectorAll('[data-detail-tool]')) b.setAttribute('aria-pressed', String(b.dataset.detailTool === st.mode));
    const symbols = usedSymbols(st.marks), names = symbols.map(s=>DETAIL_SYMBOLS[s]).join('／');
    $('#detailLegend').textContent = symbols.length > 4 ? `本圖 ${symbols.length} 種圖示` : names;
    $('#detailLegend').title = names;
    $('#detailHint').textContent = st.message || (st.pending ? (['door','window'].includes(st.mode) ? '再點另一個對角完成開口框；或按取消筆畫。' : `已點 ${st.count} 點；完成或取消目前筆畫。`) : ({door:'點開口的兩個對角放置門框；選取後拖動或調整藍色對角。',window:'點開口的兩個對角放置窗框；選取後拖動或調整藍色對角。',line:'依序點起點與轉折點，再按完成。',region:'點選範圍角點，再按完成。',symbol:'點圖面放置圖示；選取後可移動及縮放。',select:'點標記附近選取；可拖動整筆或藍色端點。',pan:'單指移動；雙指縮放。',pen:'按住拖曳手繪；雙指可縮放。',arrow:'依序點起點與箭頭終點。',circle:'點兩個對角畫圈。',rect:'點兩個對角畫範圍。',text:'填文字後，點圖面放置。',erase:'點線條附近刪除一筆，可復原。'}[st.mode] || ''));
    if(st.pending) setDirty(true);
  }
  async function paint() {
    editor?.dispose(); editor = null; if (baseURL) URL.revokeObjectURL(baseURL); baseURL = null;
    if (disposed) return;
    $('#detailName').textContent = detailLabel(detail); $('#mirrorDetail').disabled = detail.kind !== 'preset';
    $('#downloadDetail').disabled = detail.kind === 'text'; $('#saveDetail').disabled = false;
    $('#detailDrawControls').hidden = $('#detailStage').hidden = $('#detailNavigation').hidden = detail.kind === 'text'; $('#detailTextPreview').hidden = detail.kind !== 'text';
    if (detail.kind === 'text') { $('#detailTextPreview').textContent = DETAIL_TEXTS[detail.value]; $('#detailHint').textContent = ''; $('#detailUndo').disabled = $('#detailRedo').disabled = true; $('#detailFinish').hidden = $('#detailCancel').hidden = true; return; }
    const blob = detail.kind === 'preset' ? new Blob([presetSVG(detail.preset, detail.mirror)], { type: 'image/svg+xml' }) : prepared?.metadata.id === detail.mediaId ? prepared.asset.blob : (await getMedia(detail.mediaId))?.blob;
    assert(blob, '找不到細部底圖'); if (disposed) return;
    baseURL = URL.createObjectURL(blob); const next = await createDetailCanvas($('#detailStage'), baseURL, detail.marks, marks => { detail.marks = marks; setDirty(true); }, state);
    if(disposed) { next.dispose(); return; } editor = next; editor.setText($('#detailText').value); editor.setCondition($('#detailRegion').value); $('#detailSymbols').hidden = true;
  }
  function confirmReplace() { assert(!editor?.pending, '請先完成或取消目前筆畫'); remember(); return !detail.marks?.length || confirm('更換底圖會清除補畫的門窗與損害標註。繼續更換？取消此視窗仍可保留原已存紀錄。'); }
  $('#chooseDetail').onclick = () => { const show = $('#detailChoices').hidden; $('#detailChoices').hidden = !show; $('#chooseDetail').setAttribute('aria-expanded', String(show)); };
  $('#detailChoices').onclick = ev => { const b = ev.target.closest('[data-detail-preset],[data-detail-text]'); if (!b) return; action(async () => { if (!confirmReplace()) return; detail = b.dataset.detailPreset ? { kind: 'preset', preset: b.dataset.detailPreset, mirror: false, marks: [] } : { kind: 'text', value: b.dataset.detailText }; $('#detailChoices').hidden = true; $('#chooseDetail').setAttribute('aria-expanded', 'false'); setDirty(true); await paint(); }); };
  $('#detailFile').onchange = () => { const file = $('#detailFile').files[0]; if (file) action(async () => { if (!confirmReplace()) return; prepared = await prepareAsset(file, 'detail', 'detail-import'); assert(!prepared.metadata.previewUnavailable, '此底圖無法顯示，請改用 JPG、PNG 或 WebP'); detail = { kind: 'image', mediaId: prepared.metadata.id, marks: [] }; $('#detailChoices').hidden = true; $('#chooseDetail').setAttribute('aria-expanded', 'false'); setDirty(true); await paint(); }); };
  for(const b of $('#modalBody').querySelectorAll('[data-detail-tool]')) b.onclick = () => { if(editor?.setMode(b.dataset.detailTool)) { $('#detailSymbols').hidden = b.dataset.detailTool !== 'symbol'; if(b.closest('#detailMore')) $('#detailMore').open = false; } };
  for(const b of $('#modalBody').querySelectorAll('[data-detail-symbol]')) b.onclick = () => { editor?.setSymbol(b.dataset.detailSymbol); $('#detailSymbols').hidden = true; $('#detailHint').textContent = DETAIL_SYMBOLS[b.dataset.detailSymbol] + '：點牆面放置。'; };
  $('#detailText').oninput = () => editor?.setText($('#detailText').value); $('#detailRegion').onchange = () => editor?.setCondition($('#detailRegion').value);
  $('#detailObject').onchange = () => editor?.select(Number($('#detailObject').value));
  $('#detailUndo').onclick = () => editor?.undo(); $('#detailRedo').onclick = () => editor?.redo(); $('#detailFinish').onclick = () => editor?.finish(); $('#detailCancel').onclick = () => editor?.cancel();
  $('#detailDelete').onclick = () => editor?.remove(); $('#detailDeleteSegment').onclick = () => editor?.remove('segment'); $('#detailDeletePoint').onclick = () => editor?.remove('point'); $('#detailCopy').onclick = () => editor?.duplicate();
  $('#detailShrink').onclick = () => editor?.changeSymbol(.8); $('#detailGrow').onclick = () => editor?.changeSymbol(1.25); $('#detailRotate').onclick = () => editor?.changeSymbol(1,15);
  for(const b of $('#modalBody').querySelectorAll('[data-detail-nudge]')) b.onclick = () => editor?.nudge(...b.dataset.detailNudge.split(',').map(Number));
  $('#detailZoomIn').onclick = () => editor?.zoom(.8); $('#detailZoomOut').onclick = () => editor?.zoom(1.25); $('#detailFit').onclick = () => editor?.fit();
  $('#mirrorDetail').onclick = () => action(async () => { assert(!editor?.pending, '請先完成或取消目前筆畫'); remember(); if(detail.kind !== 'preset') return; detail.mirror = !detail.mirror; detail.marks = mirrorDetailMarks(detail.marks); setDirty(true); await paint(); });
  const getBlob = async mid => prepared?.metadata.id === mid ? prepared.asset.blob : (await getMedia(mid))?.blob;
  $('#downloadDetail').onclick = () => action(async () => { remember(); assert(!editor?.pending, '請先完成目前筆畫'); download(await detailImage(detail,getBlob), `${getProject().code}-細部圖-${record.fieldNumber || '位置'}.png`); });
  $('#saveDetail').onclick = () => action(async () => { remember(); assert(!editor?.pending, '請先完成目前筆畫'); const imported = detail.kind === 'image' && prepared?.metadata.id === detail.mediaId; await commit(p => { const r = p.records.find(r => r.id === recordId); assert(r, '位置已變更'); if(imported) p.media.push(prepared.metadata); r.detail = clone(detail); r.updatedAt = now(); }, imported ? [prepared.asset] : []); closeModal(true); await api.render(); });
  await paint();
}
