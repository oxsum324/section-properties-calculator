import { DETAIL_PRESETS, DETAIL_PRESET_GROUPS, DETAIL_TEXTS, CONDITIONS, MARK_TONES, detailAnnotationText, detailComparison, clone, assert, now } from './model.js';
import { createDetailCanvas } from './detail-canvas.js';
import { renderDetailImage, usedSymbols } from './detail-render.js';
import { DETAIL_SYMBOLS, REGION_TYPES, symbolPreview, mirrorDetailMarks, detailMarkName, openingOnPlane } from './detail-geometry.js';

// Geometry only. No example damage or inferred measurements enter a record.
export function presetSVG(kind, mirror = false) {
  assert(Object.hasOwn(DETAIL_PRESETS, kind), '細部圖不存在');
  let lines;
  if (kind === 'beam') lines = [[[45,68],[555,68],[555,148],[45,148],[45,68]],[[45,148],[104,210],[496,210],[555,148]],[[45,68],[12,45]],[[555,68],[588,45]]];
  else if (kind === 'frame') lines = [[[45,45],[555,45],[555,105],[45,105],[45,45]],[[135,105],[465,105],[465,264]],[[70,105],[70,264]],[[135,105],[135,264],[70,264]],[[465,264],[530,264],[530,105]],[[135,105],[158,130],[442,130],[465,105]],[[158,130],[158,278],[135,264]],[[442,130],[442,278],[465,264]],[[45,45],[12,25]],[[555,45],[588,25]]];
  else if (kind === 'corner') lines = [[[25,36],[300,83],[575,36]],[[300,83],[300,242]],[[25,285],[300,242],[575,285]]];
  // Unfolded elevations: plain orthographic faces, so two-corner openings are exact.
  else if (['flatWall', 'flatWindow', 'flatDoor'].includes(kind)) {
    lines = [[[40,30],[560,30],[560,290],[40,290],[40,30]],[[15,290],[585,290]]];
    if (kind === 'flatWindow') lines.push([[210,90],[390,90],[390,200],[210,200],[210,90]],[[220,100],[380,100],[380,190],[220,190],[220,100]],[[300,100],[300,190]]);
    if (kind === 'flatDoor') lines.push([[255,290],[255,110],[345,110],[345,290]],[[265,290],[265,120],[335,120],[335,290]],[[326,200],[332,200]]);
  }
  else if (kind === 'flatCorner') lines = [[[30,30],[300,30],[300,290],[30,290],[30,30]],[[300,30],[570,30],[570,290],[300,290]],[[297,30],[297,290]],[[303,30],[303,290]],[[15,290],[585,290]]];
  else if (kind === 'flatFrame') lines = [[[250,30],[350,30],[350,290],[250,290],[250,30]],[[30,100],[250,100]],[[350,100],[570,100]],[[30,170],[250,170]],[[350,170],[570,170]],[[30,100],[30,170]],[[570,100],[570,170]]];
  else if (kind === 'flatBeam') lines = [[[30,120],[570,120],[570,200],[30,200],[30,120]],[[30,90],[110,90],[110,230],[30,230],[30,90]],[[490,90],[570,90],[570,230],[490,230],[490,90]]];
  else {
    lines = [[[15,27],[103,75],[497,75],[585,27]],[[103,75],[103,262],[15,302]],[[497,75],[497,262],[585,302]]];
    if (kind === 'door') lines.push([[103,262],[270,262],[270,119],[378,119],[378,262],[497,262]],[[280,262],[280,130],[368,130],[368,262]],[[349,204],[355,204]]);
    else { lines.push([[103,262],[497,262]]); if (kind === 'window') lines.push([[214,122],[386,122],[386,218],[214,218],[214,122]],[[223,132],[377,132],[377,209],[223,209],[223,132]],[[300,132],[300,209]]); }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 600 320"><rect width="600" height="320" fill="white"/><g fill="none" stroke="#303030" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${mirror ? ' transform="translate(600 0) scale(-1 1)"' : ''}>${lines.map((pts, index) => `<path stroke-width="${index === 0 ? 1.8 : 1.2}" d="${pts.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join(' ')}"/>`).join('')}</g></svg>`;
}
export const detailLabel = detail => !detail ? '尚未選擇細圖' : detail.kind === 'text' ? DETAIL_TEXTS[detail.value] : detail.kind === 'image' ? '自訂細圖' : DETAIL_PRESETS[detail.preset];
export const detailLegend = detail => detail?.marks ? usedSymbols(detail.marks).map(s => DETAIL_SYMBOLS[s]).join('／') : '';
export function detailContextHTML(record, e) {
  const comparison = detailComparison(record), text = detailAnnotationText(record.detail);
  return `<div class="detail-comparison"><p class="micro">本位置現況：${e(comparison.conditions.map(c => CONDITIONS[c]).join('、') || '尚未分類')}</p>${text ? `<p class="micro detail-summary">${e(text)}</p>` : ''}${comparison.hints.map(hint => `<p class="micro detail-reminder">對照提醒：${e(hint)}</p>`).join('')}</div>`;
}
export async function detailImage(detail, getBlob, options = {}) {
  assert(detail && detail.kind !== 'text', '請選擇細部底圖');
  const base = detail.kind === 'preset' ? new Blob([presetSVG(detail.preset, detail.mirror)], { type: 'image/svg+xml' }) : await getBlob(detail.mediaId);
  assert(base instanceof Blob, '細部底圖原檔遺失'); return renderDetailImage(base, detail.marks, options);
}

// The base geometry is shared with saved marks. Keep its coordinates stable;
// simplify the controls and line hierarchy without moving existing observations.
const TOOL_ICONS = {
  line: 'M3 19 8 14 6 10 13 7 16 3 M8 14 15 17 20 12',
  region: 'M4 6 17 3 21 15 11 21 3 15Z',
  symbol: 'M5 8 9 4 14 7 20 5 18 12 21 17 14 20 8 17 3 19 5 12Z M9 10 14 13 11 17',
  text: 'M4 5H20 M12 5V20 M8 20H16',
  door: 'M6 21V3H18V21 M9 21V6H15V21 M12 13H13',
  window: 'M3 5H21V19H3Z M6 8H18V16H6Z M12 8V16',
  select: 'M6 3 19 13 13 14 10 21Z',
  pan: 'M12 3V21 M3 12H21 M8 7 12 3 16 7 M8 17 12 21 16 17 M7 8 3 12 7 16 M17 8 21 12 17 16'
};
function detailEditorHTML(record, detail, context, e) {
  const tools = [['line','裂隙'],['symbol','圖示'],['region','範圍'],['text','文字'],['door','門框'],['window','窗框'],['select','選取'],['pan','移動']];
  return `<div class="detail-controls">
    <p class="detail-context micro" title="${e(context || '')}">${e(context || '本筆位置的照片共用細圖')}</p>
    <div class="detail-utilities">
      <button id="chooseDetail" aria-controls="detailChoices" aria-expanded="${!record.detail}">底圖</button><button id="mirrorDetail">鏡射</button>
      <details id="detailLinkage" class="detail-menu"><summary title="照片內容與細圖對照">對照<span id="detailCompareCount"></span></summary><div class="detail-sheet">
        <div class="detail-sheet-heading"><strong>照片內容與細圖對照</strong><button data-close-detail-panel>收起</button></div>
        <div id="detailComparison"></div><div id="detailSuggested" class="choice-chips">${detailComparison(record).conditions.filter(c=>!['normal','other'].includes(c)).map(c=>`<button data-detail-suggest="${c}">補畫${e(CONDITIONS[c])}</button>`).join('')}</div>
        <label>細圖補充說明<textarea id="detailNote" rows="2" maxlength="2000" placeholder="例如：裂縫 A 位於窗角，詳本位置近照。">${e(detail.note || '')}</textarea></label><p class="micro">保存後列於照片內容下方，同位置照片共用。</p>
      </div></details>
      <details id="detailMore" class="detail-menu"><summary>更多</summary><div class="detail-sheet">
        <div class="detail-sheet-heading"><strong>其他畫法與輸出</strong><button data-close-detail-panel>收起</button></div>
        <div class="choice-chips">${[['pen','自由手繪'],['arrow','兩點箭頭'],['circle','兩點圈選'],['rect','兩點範圍框'],['erase','快速刪除']].map(([key,name])=>`<button data-detail-tool="${key}">${name}</button>`).join('')}</div>
        <button id="downloadDetail" class="secondary">下載 PNG</button>
        <p class="micro">斜視底圖：兩點門窗框自動貼合牆面。2D 底圖：兩點形成正矩形。自訂照片或特殊角度可選四點框，再拖動角點調整。</p>
        <p class="micro">圖示大小為示意比例；範圍請用逐點圈選。紅線表示裂縫，藍線表示其他現況，黑線補畫底圖。PNG 與附件預設黑白線稿，原照片與量測不變。</p>
      </div></details>
    </div>
    <div id="detailChoices" class="detail-sheet" ${record.detail ? 'hidden' : ''}>
      <div class="detail-sheet-heading"><strong>選擇底圖</strong><button data-close-detail-panel>收起</button></div>
      <p class="micro">2D 適合快速標位置；斜視適合表達轉角與梁底。</p>
      ${DETAIL_PRESET_GROUPS.map(([group, keys]) => `<p class="micro detail-preset-group">${e(group)}</p><div class="detail-presets">${keys.map(key => `<button data-detail-preset="${key}">${presetSVG(key)}<span>${e(DETAIL_PRESETS[key])}</span></button>`).join('')}</div>`).join('')}
      <div class="choice-chips">${Object.entries(DETAIL_TEXTS).map(([key, name]) => `<button data-detail-text="${key}">${name}</button>`).join('')}</div><label>自訂底圖<input id="detailFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
    </div>
    <div id="detailDrawControls">
      <div class="detail-tools">${tools.map(([key,name])=>`<button data-detail-tool="${key}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${TOOL_ICONS[key]}"/></svg><span>${name}</span></button>`).join('')}</div>
      <div class="detail-options">
        <label id="detailToneLabel">線色<select id="detailTone">${Object.entries(MARK_TONES).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></label>
        <label id="detailQuadLabel" hidden><input id="detailQuad" type="checkbox">四點開口框</label>
        <div id="detailSymbolOptions" hidden><button id="detailPickSymbol" aria-controls="detailSymbols" aria-expanded="false">網裂 ▾</button><label>大小<select id="detailSymbolSize"><option value="0.14">小</option><option value="0.24" selected>中</option><option value="0.36">大</option></select></label></div>
        <label id="detailRegionLabel" hidden>範圍<select id="detailRegion">${Object.entries(REGION_TYPES).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></label>
        <label id="detailTextLabel" hidden><span class="sr-only">標記文字</span><input id="detailText" maxlength="120" placeholder="輸入標記文字"></label>
        <div id="detailSelection" hidden><label><span class="sr-only">選取標記</span><select id="detailObject"></select></label><button id="detailDelete">刪除</button><button id="detailCopy">複製</button>
          <details id="detailSelectionMore" class="detail-menu"><summary>調整</summary><div class="detail-sheet">
            <div class="detail-sheet-heading"><strong>調整選取標記</strong><button data-close-detail-panel>收起</button></div>
            <div class="choice-chips"><button id="detailDeleteSegment">刪除這段</button><button id="detailDeletePoint">刪除端點</button></div>
            <div id="detailSymbolActions" class="choice-chips"><button id="detailShrink">圖示縮小</button><button id="detailGrow">圖示放大</button><button id="detailRotate">旋轉 15°</button></div>
            <p class="micro">位置微調，也可收起後直接拖動標記或端點。</p><div class="choice-chips">${[['-1,0','←'],['1,0','→'],['0,-1','↑'],['0,1','↓']].map(([dir,name])=>`<button data-detail-nudge="${dir}" aria-label="位置微調 ${name}">${name}</button>`).join('')}</div>
          </div></details>
        </div>
      </div>
      <div id="detailSymbols" class="detail-sheet" hidden><div class="detail-sheet-heading"><strong>現況圖示</strong><button data-close-detail-panel>收起</button></div><div class="detail-symbol-grid">${Object.entries(DETAIL_SYMBOLS).map(([key,name])=>`<button data-detail-symbol="${key}">${symbolPreview(key)}<span>${name}</span></button>`).join('')}</div><p class="micro">選圖示 → 選大小 → 點圖面放置；繼續點可重複放置。</p></div>
    </div>
  </div>
  <div class="detail-workspace"><div id="detailNavigation" class="choice-chips"><button id="detailZoomOut" aria-label="縮小圖面">−</button><button id="detailZoomIn" aria-label="放大圖面">＋</button><button id="detailFit">全圖</button><span id="detailLegend" class="micro"></span></div><div id="detailStage"></div><p id="detailTextPreview" hidden></p><p id="detailHint" class="micro" role="status"></p></div>
  <div class="detail-dock"><button id="detailUndo">復原</button><button id="detailRedo">重做</button><button id="detailFinish" aria-label="完成筆畫">完成</button><button id="detailCancel" aria-label="取消筆畫">取消</button><button id="saveDetail" class="primary">保存</button></div>`;
}

export async function openDetailEditor(api, recordId) {
  const { $, getProject, getMedia, action, commit, openModal, closeModal, prepareAsset, download, esc: e, setDirty } = api;
  const record = getProject().records.find(r => r.id === recordId); assert(record, '找不到位置紀錄');
  let detail = clone(record.detail || { kind: 'preset', preset: 'beam', mirror: false, marks: [] }), editor, baseURL, prepared, disposed = false, selectedSymbol = 'network';
  const cleanup = () => { disposed = true; editor?.dispose(); if (baseURL) URL.revokeObjectURL(baseURL); };
  openModal('細部示意圖', detailEditorHTML(record, detail, api.contextLabel, e), cleanup);
  $('#modal').dataset.mode = 'detail';
  function closePanels(except) {
    for (const id of ['detailChoices', 'detailSymbols']) if (id !== except) $('#' + id).hidden = true;
    for (const id of ['detailLinkage', 'detailMore', 'detailSelectionMore']) if (id !== except) $('#' + id).open = false;
    $('#chooseDetail').setAttribute('aria-expanded', String(!$('#detailChoices').hidden));
    $('#detailPickSymbol').setAttribute('aria-expanded', String(!$('#detailSymbols').hidden));
  }
  function showSymbols(show) {
    closePanels(); $('#detailSymbols').hidden = !show; $('#detailPickSymbol').setAttribute('aria-expanded', String(show));
  }
  for (const menu of $('#modalBody').querySelectorAll('.detail-menu')) menu.querySelector('summary').onclick = () => closePanels(menu.id);
  for (const button of $('#modalBody').querySelectorAll('[data-close-detail-panel]')) button.onclick = () => {
    const menu = button.closest('details'), sheet = button.closest('.detail-sheet');
    closePanels(); (menu?.querySelector('summary') || (sheet.id === 'detailSymbols' ? $('#detailPickSymbol') : $('#chooseDetail'))).focus({ preventScroll: true });
  };
  function remember() { if (editor && detail.kind !== 'text') detail.marks = editor.marks; }
  function updateComparison(d = detail) {
    const r = { ...record, detail: d }, hints = detailComparison(r).hints;
    $('#detailComparison').innerHTML = detailContextHTML(r, e);
    $('#detailCompareCount').textContent = hints.length ? ` · ${hints.length}` : '';
    $('#detailCompareCount').title = hints.length ? `${hints.length} 項待核對` : '對照完成';
  }
  function state(st) {
    updateComparison({ ...detail, marks: st.marks });
    $('#detailUndo').disabled = !st.canUndo; $('#detailRedo').disabled = !st.canRedo;
    $('#detailFinish').hidden = $('#detailCancel').hidden = false; $('#detailFinish').disabled = !st.pending || !['line','region'].includes(st.mode); $('#detailCancel').disabled = !st.pending; $('#saveDetail').disabled = $('#downloadDetail').disabled = st.pending;
    $('#detailTextLabel').hidden = st.mode !== 'text'; $('#detailRegionLabel').hidden = !['region','rect'].includes(st.mode); $('#detailSelection').hidden = st.mode !== 'select';
    $('#detailToneLabel').hidden = !['line','pen','arrow','circle','text'].includes(st.mode);
    $('#detailQuadLabel').hidden = !['door','window'].includes(st.mode);
    $('#detailSymbolOptions').hidden = st.mode !== 'symbol';
    if (st.mode !== 'select') $('#detailSelectionMore').open = false;
    $('#detailObject').innerHTML = '<option value="-1">選擇標記</option>' + st.marks.map((m,i)=>`<option value="${i}">${i+1} · ${e(detailMarkName(m))}</option>`).join(''); $('#detailObject').value = String(st.selected);
    const m = st.marks[st.selected]; $('#detailDelete').disabled = $('#detailCopy').disabled = !m; $('#detailDeleteSegment').hidden = m?.type !== 'pen' || st.segment < 0; $('#detailDeletePoint').hidden = st.vertex < 0 || !m || m.points.length <= (m.type === 'region' ? 3 : 2); $('#detailSymbolActions').hidden = m?.type !== 'symbol';
    for (const b of $('#modalBody').querySelectorAll('[data-detail-tool]')) b.setAttribute('aria-pressed', String(b.dataset.detailTool === st.mode));
    const symbols = usedSymbols(st.marks), names = symbols.map(s=>DETAIL_SYMBOLS[s]).join('／');
    $('#detailLegend').textContent = symbols.length ? `本圖 ${symbols.length} 種圖示` : '';
    $('#detailLegend').title = names;
    const openingHint = st.openingPoints === 4 ? '依序點四個角；完成後可選取調整。' : '點兩個對角；斜視自動貼牆，2D 為矩形。';
    $('#detailHint').textContent = st.message || (st.pending ? (['door','window'].includes(st.mode) ? (st.openingPoints === 4 ? `已點 ${st.count} 個角，點滿四角完成；或按取消。` : '再點另一個對角；或按取消筆畫。') : `已點 ${st.count} 點；完成或取消目前筆畫。`) : ({door: openingHint,window: openingHint,line:'依序點起點與轉折點，再按完成。',region:'點選範圍角點，再按完成。',symbol:'選大小後點圖面；選取可移動、縮放及旋轉。',select:'點標記選取，拖動整筆或端點；更多操作在「調整」。',pan:'單指移動；雙指縮放。',pen:'按住拖曳手繪；雙指可縮放。',arrow:'依序點起點與箭頭終點。',circle:'點兩個對角畫圈。',rect:'點兩個對角畫範圍。',text:'填文字後，點圖面放置。',erase:'點線條附近刪除一筆，可復原。'}[st.mode] || ''));
    if(st.pending) setDirty(true);
  }
  async function paint() {
    editor?.dispose(); editor = null; if (baseURL) URL.revokeObjectURL(baseURL); baseURL = null;
    if (disposed) return;
    updateComparison(); $('#mirrorDetail').disabled = detail.kind !== 'preset';
    $('#downloadDetail').disabled = detail.kind === 'text'; $('#saveDetail').disabled = false;
    $('#detailDrawControls').hidden = $('#detailStage').hidden = $('#detailNavigation').hidden = detail.kind === 'text'; $('#detailTextPreview').hidden = detail.kind !== 'text';
    if (detail.kind === 'text') { $('#detailTextPreview').textContent = DETAIL_TEXTS[detail.value]; $('#detailHint').textContent = ''; $('#detailUndo').disabled = $('#detailRedo').disabled = true; $('#detailFinish').hidden = $('#detailCancel').hidden = true; return; }
    const blob = detail.kind === 'preset' ? new Blob([presetSVG(detail.preset, detail.mirror)], { type: 'image/svg+xml' }) : prepared?.metadata.id === detail.mediaId ? prepared.asset.blob : (await getMedia(detail.mediaId))?.blob;
    assert(blob, '找不到細部底圖'); if (disposed) return;
    baseURL = URL.createObjectURL(blob); const next = await createDetailCanvas($('#detailStage'), baseURL, detail.marks, marks => { detail.marks = marks; setDirty(true); }, state, { snapOpening: detail.kind === 'preset' ? (a, b) => openingOnPlane(detail.preset, detail.mirror, a, b) : null });
    if(disposed) { next.dispose(); return; } editor = next; editor.setText($('#detailText').value); editor.setCondition($('#detailRegion').value); editor.setTone($('#detailTone').value); editor.setOpeningPoints($('#detailQuad').checked ? 4 : 2); editor.setSymbolSize($('#detailSymbolSize').value); editor.setSymbol(selectedSymbol); $('#detailSymbols').hidden = true;
  }
  function confirmReplace() { assert(!editor?.pending, '請先完成或取消目前筆畫'); remember(); return !detail.marks?.length || confirm('更換底圖會清除補畫的門窗與損害標註。繼續更換？取消此視窗仍可保留原已存紀錄。'); }
  $('#chooseDetail').onclick = () => { const show = $('#detailChoices').hidden; closePanels(); $('#detailChoices').hidden = !show; $('#chooseDetail').setAttribute('aria-expanded', String(show)); };
  $('#detailChoices').onclick = ev => { const b = ev.target.closest('[data-detail-preset],[data-detail-text]'); if (!b) return; action(async () => { if (!confirmReplace()) return; detail = b.dataset.detailPreset ? { kind: 'preset', preset: b.dataset.detailPreset, mirror: false, marks: [] } : { kind: 'text', value: b.dataset.detailText }; if ($('#detailNote').value) detail.note = $('#detailNote').value; $('#detailChoices').hidden = true; $('#chooseDetail').setAttribute('aria-expanded', 'false'); setDirty(true); await paint(); }); };
  $('#detailFile').onchange = () => { const file = $('#detailFile').files[0]; if (file) action(async () => { if (!confirmReplace()) return; prepared = await prepareAsset(file, 'detail', 'detail-import'); assert(!prepared.metadata.previewUnavailable, '此底圖無法顯示，請改用 JPG、PNG 或 WebP'); detail = { kind: 'image', mediaId: prepared.metadata.id, marks: [], note: $('#detailNote').value }; $('#detailChoices').hidden = true; $('#chooseDetail').setAttribute('aria-expanded', 'false'); setDirty(true); await paint(); }); };
  for(const b of $('#modalBody').querySelectorAll('[data-detail-tool]')) b.onclick = () => { if(editor?.setMode(b.dataset.detailTool)) showSymbols(b.dataset.detailTool === 'symbol'); };
  for(const b of $('#modalBody').querySelectorAll('[data-detail-symbol]')) b.onclick = () => { selectedSymbol = b.dataset.detailSymbol; editor?.setSymbol(selectedSymbol); showSymbols(false); $('#detailPickSymbol').textContent = DETAIL_SYMBOLS[selectedSymbol] + ' ▾'; $('#detailHint').textContent = DETAIL_SYMBOLS[selectedSymbol] + '：選大小，再點圖面放置。'; };
  $('#detailPickSymbol').onclick = () => showSymbols($('#detailSymbols').hidden);
  $('#detailSymbolSize').onchange = () => editor?.setSymbolSize($('#detailSymbolSize').value);
  $('#detailNote').oninput = () => { detail.note = $('#detailNote').value; setDirty(true); updateComparison(); };
  $('#detailSuggested').onclick = event => { const b = event.target.closest('[data-detail-suggest]'); if (!b || !editor) return; const c = b.dataset.detailSuggest; const symbol = c === 'crack' ? 'network' : c, mode = c === 'crack' && record.crackPattern !== 'network' ? 'line' : Object.hasOwn(DETAIL_SYMBOLS, symbol) ? 'symbol' : 'text'; if (!editor.setMode(mode)) return; if (mode === 'symbol') { selectedSymbol = symbol; editor.setSymbol(symbol); $('#detailPickSymbol').textContent = DETAIL_SYMBOLS[symbol] + ' ▾'; } if (mode === 'text') { $('#detailText').value = CONDITIONS[c]; editor.setText(CONDITIONS[c]); } showSymbols(false); };
  $('#detailText').oninput = () => editor?.setText($('#detailText').value); $('#detailRegion').onchange = () => editor?.setCondition($('#detailRegion').value);
  $('#detailTone').onchange = () => editor?.setTone($('#detailTone').value); $('#detailQuad').onchange = () => editor?.setOpeningPoints($('#detailQuad').checked ? 4 : 2);
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
