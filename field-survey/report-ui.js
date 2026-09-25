import { openLabelEditor } from './label-editor.js';
import { clone, recordIssues, attachmentObservationText, photoContent, roomKey, photoIncluded, ROLES, assert, syncRooms, photoPlacement, recordDateInfo, reportPreferences, validateReportSettings, COMPANY_REPORT_STYLE } from './model.js';
import { attachmentIndex, defaultPhotoIds, reportPhotos, renderAttachment, moveRoom, REPORT_FORMATS, escapeHTML as e, prepareVolumes, renderPlannedVolume, masterContentsHTML } from './report.js';
import { detailContextHTML } from './detail.js';

export function createReportController(api) {
  const { $, action, commit, getProject, getMedia, mediaURL, openModal, download, busyText, editPhoto, editRecord } = api;
  const settings = { unitId: '', unitIds: null, order: [], breakBefore: [], start: 1, perPage: 2, format: 'standard' };
  let projectId = '', pageNumber = 0, unitPage = 0, observer, generation = 0;
  const photoPages = new Map(); const imageURLs = new Set();
  let settingsDirty = false;
  let settingsWrite = null, settingsEdit = 0, textWrite = null, autoSaves = 0;
  let editQueue = Promise.resolve();
  let fullEditor = !window.matchMedia('(max-width: 760px)').matches;
  function renderMode() {
    const mode = fullEditor ? 'full' : 'simple';
    if ($('#reportView').dataset.mode !== mode) $('#reportSearchAdvanced').open = fullEditor;
    $('#reportView').dataset.mode = mode;
    $('#reportModeToggle').textContent = fullEditor ? '切換簡潔預覽' : '切換完整整理';
    $('#reportModeToggle').setAttribute('aria-pressed', String(fullEditor));
    $('#reportModeHint').textContent = fullEditor ? '整理文字、選片與版面；設定隨案件保存。' : '預覽照片與說明；需要調整時，點選「微調本位置」。';
  }
  const controls = { start: 'reportStart', perPage: 'reportPerPage', format: 'reportFormat', numbering: 'reportNumbering', pageStart: 'reportPageStart', pagePrefix: 'reportPrefix', plansPerPage: 'reportPlans', tableRows: 'reportRows', toc: 'reportToc', includeEmpty: 'reportEmpty', publicByFloor: 'reportPublicFloors', color: 'reportColor', maxPages: 'volumeMaxPages' };
  const numeric = new Set(['start', 'perPage', 'pageStart', 'plansPerPage', 'tableRows', 'maxPages']);
  function loadControls() { for (const [key, id] of Object.entries(controls)) { const el = $('#' + id); if (el.type === 'checkbox') el.checked = settings[key]; else el.value = settings[key]; } }
  function collectSettings() {
    const result = clone(settings);
    for (const [key, id] of Object.entries(controls)) { const el = $('#' + id); result[key] = el.type === 'checkbox' ? el.checked : numeric.has(key) ? Number(el.value) : el.value.trim(); }
    return result;
  }
  function styleSummary() {
    const s = collectSettings();
    $('#reportStyleSummary').textContent = `${s.format === 'standard' ? '標準附件' : '快速預覽'} · ${s.numbering === 'unit' ? '每戶重編' : '全案接續'} · 每頁 ${s.perPage} 張 · ${s.tableRows ? '最多 8 列' : '自動分頁'} · 頁碼 ${s.pagePrefix || '無前綴'}${settingsDirty ? ' · 尚未保存' : ' · 隨案件保存'}`;
    $('#reportFormatHelp').textContent = s.format === 'standard' ? '每戶依序：整體平面圖 → 照片說明表 → 照片。' : '依房間顯示位置圖、現況說明與照片。';
    const p = getProject(); if (p && projectId === p.id) {
      const ids = scopeIds(p), photos = p.records.filter(r => ids.includes(r.unitId)).some(r => reportPhotos(r).length);
      $('#previewReport').disabled = !photos && !(s.format === 'standard' && s.includeEmpty && ids.length);
      $('#planVolumes').disabled = s.format !== 'standard' || !ids.length;
    }
  }
  async function saveSettings() {
    if (settingsWrite) await settingsWrite;
    const p = getProject(); if (!p || projectId !== p.id || !settingsDirty) return;
    const next = collectSettings(), edit = settingsEdit; validateReportSettings(next, p);
    settingsWrite = commit(draft => { draft.reportSettings = clone(next); }).then(() => {
      Object.assign(settings, next); settingsDirty = edit !== settingsEdit; styleSummary();
    });
    try { await settingsWrite; } finally { settingsWrite = null; }
  }
  function clearImages() { observer?.disconnect(); generation++; for (const url of imageURLs) URL.revokeObjectURL(url); imageURLs.clear(); }
  const scopeIds = p => settings.unitId ? [settings.unitId] : settings.unitIds || settings.order;
  function options() { return { ...settings, unitIds: scopeIds(getProject()), start: Number($('#reportStart').value), perPage: Number($('#reportPerPage').value), numbering: $('#reportNumbering').value, pageStart: Number($('#reportPageStart').value), pagePrefix: $('#reportPrefix').value.trim(), plansPerPage: Number($('#reportPlans').value), tableRows: Number($('#reportRows').value), toc: $('#reportToc').checked, includeEmpty: $('#reportEmpty').checked, publicByFloor: $('#reportPublicFloors').checked, color: $('#reportColor').checked, maxPages: Number($('#volumeMaxPages').value) }; }
  async function render(anchorRecordId = '') {
    const p = getProject(); if (!p) return;
    clearImages(); renderMode(); const token = generation;
    if (projectId !== p.id) { projectId = p.id; Object.assign(settings, reportPreferences(p)); settingsDirty = false; loadControls(); pageNumber = 0; unitPage = 0; photoPages.clear(); $('#reportBrowseUnit').value = ''; $('#reportSearch').value = ''; $('#reportFilter').value = ''; }
    settings.order = [...settings.order.filter(id => p.units.some(u => u.id === id)), ...p.units.filter(u => !settings.order.includes(u.id)).map(u => u.id)];
    if (settings.unitIds) settings.unitIds = settings.unitIds.filter(id => p.units.some(u => u.id === id));
    if (settings.unitId && !p.units.some(u => u.id === settings.unitId)) settings.unitId = '';
    $('#reportScope').innerHTML = '<option value="">全案</option><option value="custom">勾選的戶別</option>' + p.units.map(u => `<option value="${u.id}">${e(u.code)}</option>`).join('');
    $('#reportScope').value = settings.unitId || (settings.unitIds ? 'custom' : '');
    const includedUnits = scopeIds(p);
    const unitPages = Math.max(1, Math.ceil(settings.order.length / 10)); unitPage = Math.min(unitPage, unitPages - 1);
    $('#reportUnitsPager').hidden = unitPages <= 1;
    $('#reportUnitsPager').innerHTML = `<button data-unit-page="-1" ${unitPage === 0 ? 'disabled' : ''}>上一頁</button><span>第 ${unitPage + 1}／${unitPages} 頁 · ${settings.order.length} 戶</span><button data-unit-page="1" ${unitPage + 1 === unitPages ? 'disabled' : ''}>下一頁</button>`;
    $('#reportUnits').innerHTML = settings.order.slice(unitPage * 10, unitPage * 10 + 10).map((id, offset) => { const i = unitPage * 10 + offset; const u = p.units.find(u => u.id === id); return `<div class="report-unit-choice" data-report-unit="${id}"><label class="check-label"><input type="checkbox" data-unit-include ${includedUnits.includes(id) ? 'checked' : ''}>${e(u.code)}${u.building ? ' · ' + e(u.building) : ''}</label><div class="choice-chips"><button data-unit-move="-1" ${i === 0 ? 'disabled' : ''}>上移</button><button data-unit-move="1" ${i === settings.order.length - 1 ? 'disabled' : ''}>下移</button><label class="check-label"><input type="checkbox" data-unit-break ${settings.breakBefore.includes(id) ? 'checked' : ''}>本戶另起一冊</label></div></div>`; }).join('');
    $('#reportFormat').value = settings.format;
    styleSummary();
    $('#reportFormatHelp').textContent = settings.format === 'standard' ? '每戶依序：各樓整體平面圖 → 照片說明表 → 照片。同一圖面集中標示跨房間的照片編號。' : '依房間依序顯示位置圖、現況說明與照片，方便現場核對。';
    const groups = new Map();
    for (const r of p.records.filter(r => includedUnits.includes(r.unitId))) {
      const key = r.roomId || roomKey(r); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
    }
    const orderedGroups = [...groups.entries()].sort((a, b) => includedUnits.indexOf(a[1][0].unitId) - includedUnits.indexOf(b[1][0].unitId));
    const browseUnit = $('#reportBrowseUnit').value;
    $('#reportBrowseUnit').innerHTML = '<option value="">匯出範圍內全部戶別</option>' + includedUnits.map(id => { const u = p.units.find(u => u.id === id); return `<option value="${e(id)}">${e(u.code)}${u.building ? ' · ' + e(u.building) : ''}</option>`; }).join('');
    $('#reportBrowseUnit').value = includedUnits.includes(browseUnit) ? browseUnit : '';
    const selected = [...groups.values()].flat().reduce((n, r) => n + reportPhotos(r).length, 0), query = $('#reportSearch').value.trim().toLocaleLowerCase(), filter = $('#reportFilter').value;
    const visible = orderedGroups.flatMap(([key, records]) => records.filter(r => {
      const u = p.units.find(u => u.id === r.unitId), text = [u.code, u.building, r.floor, r.space, r.location].join(' ').toLocaleLowerCase();
      return (!$('#reportBrowseUnit').value || r.unitId === $('#reportBrowseUnit').value) && (!query || text.includes(query)) && (!filter || filter === 'detail' && !r.detail || filter === 'location' && reportPhotos(r).some(photo => !photoPlacement(r, photo) && !r.observationPin) || filter === 'issues' && recordIssues(r).length);
    }).map(r => ({ key, r })));
    const pageSize = Number($('#reportPageSize').value), anchorIndex = visible.findIndex(x => x.r.id === anchorRecordId);
    if (anchorIndex >= 0) pageNumber = Math.floor(anchorIndex / pageSize);
    const pageCount = Math.max(1, Math.ceil(visible.length / pageSize)); pageNumber = Math.max(0, Math.min(pageNumber, pageCount - 1)); const visibleIds = new Set(visible.slice(pageNumber * pageSize, pageNumber * pageSize + pageSize).map(x => x.r.id));
    $('#reportPager').innerHTML = `<button data-report-page="-1" ${pageNumber === 0 ? 'disabled' : ''}>上一頁</button><label><span class="micro">${visible.length} 筆位置 · 跳至</span><select id="reportPageJump" aria-label="跳至位置頁">${Array.from({ length: pageCount }, (_, i) => { const r = visible[i * pageSize]?.r, u = r && p.units.find(u => u.id === r.unitId); return `<option value="${i}" ${i === pageNumber ? 'selected' : ''}>${i + 1}／${pageCount}${r ? ` · ${e(u.code)} · 位置 ${String(r.fieldNumber || p.records.indexOf(r) + 1).padStart(3, '0')}` : ''}</option>`; }).join('')}</select></label><button data-report-page="1" ${pageNumber + 1 === pageCount ? 'disabled' : ''}>下一頁</button>`;
    $('#reportPagerBottom').innerHTML = `<button data-report-bottom-page="-1" ${pageNumber === 0 ? 'disabled' : ''}>上一頁</button><span>第 ${pageNumber + 1}／${pageCount} 頁</span><button data-report-bottom-page="1" ${pageNumber + 1 === pageCount ? 'disabled' : ''}>下一頁</button>`;
    $('#reportPagerBottom').hidden = !visible.length;
    const navStart = Math.floor(pageNumber * pageSize / 50) * 50;
    $('#reportNavigator').innerHTML = '<p class="micro">位置導覽 · ' + (visible.length ? `${navStart + 1}–${Math.min(navStart + 50, visible.length)}／${visible.length}` : '0 筆') + '</p>' + visible.slice(navStart, navStart + 50).map(({ r }) => `<button data-report-goto="${e(r.id)}" ${visibleIds.has(r.id) ? 'aria-current="true"' : ''}>${e(p.units.find(u => u.id === r.unitId).code)} · 位置 ${String(r.fieldNumber || p.records.indexOf(r) + 1).padStart(3, '0')}<span>${e([r.floor, r.space, r.location].filter(Boolean).join(' · '))}</span></button>`).join('');
    $('#reportRooms').innerHTML = orderedGroups.map(([key, records], gi) => {
      if (!records.some(r => visibleIds.has(r.id))) return '';
      const first = records[0], unit = p.units.find(u => u.id === first.unitId);
      return `<section class="panel report-room"><div class="section-heading"><h3>${e(unit.code)} · ${e(first.floor || '未填樓層')} · ${e(first.space || '未填房間')}</h3></div><div class="choice-chips report-edit-only"><button data-room="${e(key)}" data-do="room-up" ${gi === 0 ? 'disabled' : ''}>房間上移</button><button data-room="${e(key)}" data-do="room-down" ${gi === groups.size - 1 ? 'disabled' : ''}>房間下移</button>${first.roomId ? `<button data-room="${e(first.roomId)}" data-do="rename-room">統一房間名稱</button>` : ''}</div>${records.map((r, ri) => {
        if (!visibleIds.has(r.id)) return '';
        const photos = reportPhotos(r), selectedIds = new Set(photos.map(p => p.mediaId));
        const main = r.mainPhotoId || (photos.find(p => p.role === 'close') || photos[0])?.mediaId;
        const photoPageCount = Math.max(1, Math.ceil(r.photos.length / 3)), photoPage = Math.min(photoPages.get(r.id) || 0, photoPageCount - 1); photoPages.set(r.id, photoPage);
        return `<article class="report-record" data-report-record="${r.id}"><h4>位置 ${String(r.fieldNumber || p.records.indexOf(r) + 1).padStart(3, '0')} · ${e(r.location || '位置說明未填')} · ${photos.length} 張納入附件</h4><div class="report-read-only"><p class="description">${e(photoContent(r).text)}</p><button data-do="edit-layout" class="secondary">微調本位置</button></div><div class="choice-chips report-edit-only"><button data-do="record-up" ${ri === 0 ? 'disabled' : ''}>位置上移</button><button data-do="record-down" ${ri === records.length - 1 ? 'disabled' : ''}>位置下移</button><button data-do="edit-record">回到現場紀錄</button><button data-do="edit-detail">${r.detail ? '查看／補畫細圖' : '＋ 畫細部示意圖'}</button><button data-do="preset">選全景＋近照</button><button data-do="main-only">只選主照片</button></div><p class="micro">${e(recordDateInfo(p, r).label)}</p><p class="micro">${e(recordIssues(r).length ? '待核對：' + recordIssues(r).join('、') : '本筆必要紀錄已齊')}</p><div class="report-edit-only"><label>附件現況說明<textarea data-report-text rows="3" maxlength="10000">${e(r.reportText?.trim() || attachmentObservationText(r))}</textarea></label>${detailContextHTML(r, e)}<div class="choice-chips"><button data-do="save-text">保存說明</button><button data-do="generate-text">產生新版說明預覽</button></div><p class="micro">附件只列已填資料；含不確定或待確認字樣的整段說明不列入。原文保留供編輯，請展開下方預覽核對；相同補充不重複列出。</p><details><summary>查看精簡後照片內容</summary><p class="description" data-content-preview>${e(photoContent(r).text)}</p><p class="micro">各張照片另帶入未重複的個別說明。</p></details></div><div class="report-photos">${r.photos.slice(photoPage * 3, photoPage * 3 + 3).map((photo, offset) => { const pi = photoPage * 3 + offset; return `<div class="report-photo" data-report-photo="${photo.mediaId}"><img data-report-image="${photo.mediaId}" alt="${e(photoContent(r, photo).caption || ROLES[photo.role])}"><div><label class="check-label report-edit-only"><input type="checkbox" data-report-include ${selectedIds.has(photo.mediaId) ? 'checked' : ''} ${photo.excluded ? 'disabled' : ''}>${photo.excluded ? '不採用（原檔保留）' : '納入本次附件'}</label><p>${selectedIds.has(photo.mediaId) ? '已選 · ' : '未納入 · '}${e(ROLES[photo.role])}${main === photo.mediaId ? ' · ★ 主照片' : ''}</p><p data-photo-content-caption>${e(photoContent(r, photo).caption)}</p><div class="choice-chips report-edit-only"><button data-do="main" ${photo.excluded ? 'disabled' : ''}>設主照片</button><button data-do="photo-up" ${pi === 0 ? 'disabled' : ''}>前移</button><button data-do="photo-down" ${pi === r.photos.length - 1 ? 'disabled' : ''}>後移</button><button data-do="edit-photo">圈註／拍攝位置</button></div></div></div>`; }).join('') || '<p>尚無照片</p>'}</div>${r.photos.length > 3 ? `<div class="choice-chips report-photo-pager"><button data-do="photos-prev" ${photoPage === 0 ? 'disabled' : ''}>上一批照片</button><span>照片 ${photoPage * 3 + 1}–${Math.min(r.photos.length, photoPage * 3 + 3)}／${r.photos.length}</span><button data-do="photos-next" ${photoPage + 1 === photoPageCount ? 'disabled' : ''}>下一批照片</button></div>` : ''}</article>`;
      }).join('')}</section>`;
    }).join('') || '<p class="panel">此查看條件沒有位置紀錄，可切換戶別或清除篩選。匯出範圍不受影響。</p>';
    $('#reportSummary').textContent = `匯出範圍：${includedUnits.length} 戶 · ${groups.size} 個房間／空間 · ${selected} 張已選照片。未選照片保留在案件備份。`;
    $('#previewReport').disabled = !selected && !(settings.format === 'standard' && $('#reportEmpty').checked && includedUnits.length);
    $('#planVolumes').disabled = settings.format !== 'standard' || !includedUnits.length;
    observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { observer?.unobserve(entry.target); const img = entry.target; getMedia(img.dataset.reportImage).then(asset => { if (token !== generation || !img.isConnected) return; if (!asset?.blob) { img.alt = '找不到原檔，請核對備份'; return; } const url = URL.createObjectURL(asset.thumb || asset.blob); imageURLs.add(url); img.src = url; }).catch(() => { img.alt = '讀取照片失敗'; }); } }, { rootMargin: '300px' });
    for (const img of $('#reportRooms').querySelectorAll('[data-report-image]')) { img.loading = 'lazy'; observer.observe(img); }
  }
  async function mutate(fn, anchorRecordId = '', anchorPhotoId = '') {
    await commit(p => { fn(p); syncRooms(p); });
    const index = getProject().records.find(r => r.id === anchorRecordId)?.photos.findIndex(photo => photo.mediaId === anchorPhotoId);
    if (index >= 0) photoPages.set(anchorRecordId, Math.floor(index / 3));
    await render(anchorRecordId);
  }
  $('#reportModeToggle').onclick = () => action(async () => { fullEditor = !fullEditor; await render(); $('#reportModeToggle').focus({ preventScroll: true }); });
  $('#reportNavigator').onclick = event => { const button = event.target.closest('[data-report-goto]'); if (button) action(async () => { await render(button.dataset.reportGoto); focusPager(); }); };
  $('#reportScope').onchange = () => action(async () => { const value = $('#reportScope').value; settings.unitId = value === 'custom' ? '' : value; settings.unitIds = value === 'custom' ? settings.unitIds || [...settings.order] : null; pageNumber = 0; settingsDirty = true; await saveSettings(); await render(); });
  for (const id of Object.values(controls)) {
    $('#' + id).oninput = () => { settingsDirty = true; settingsEdit++; styleSummary(); };
    // Saving on blur must not make the next field inert or swallow its input/click.
    $('#' + id).onchange = () => {
      settingsDirty = true; settingsEdit++;
      autoSaves++; $('#reportView').setAttribute('aria-busy', 'true');
      saveTextEdits().then(styleSummary).catch(api.fail).finally(() => { autoSaves--; $('#reportView').setAttribute('aria-busy', String(autoSaves > 0)); });
    };
  }
  $('#companyReportStyle').onclick = () => action(async () => { Object.assign(settings, collectSettings(), COMPANY_REPORT_STYLE); loadControls(); settingsDirty = true; await saveSettings(); await render(); });
  for (const selector of ['#reportSearch', '#reportFilter', '#reportBrowseUnit', '#reportPageSize']) $(selector).onchange = () => action(async () => { pageNumber = 0; await render(); });
  function focusPager() { requestAnimationFrame(() => { $('#reportPager').focus({ preventScroll: true }); $('#reportPager').scrollIntoView({ block: 'start' }); }); }
  const turnPage = event => { const b = event.target.closest('[data-report-page],[data-report-bottom-page]'); if (b) action(async () => { pageNumber += Number(b.dataset.reportPage ?? b.dataset.reportBottomPage); await render(); focusPager(); }); };
  $('#reportPager').onclick = $('#reportPagerBottom').onclick = turnPage;
  $('#reportPager').onchange = event => { if (event.target.id === 'reportPageJump') action(async () => { pageNumber = Number(event.target.value); await render(); focusPager(); }); };
  $('#reportUnitsPager').onclick = event => { const b = event.target.closest('[data-unit-page]'); if (b) action(async () => { unitPage += Number(b.dataset.unitPage); await render(); $('#reportUnitPicker').scrollIntoView({ block: 'start' }); }); };
  $('#reportUnits').onchange = event => { const input = event.target.closest('[data-unit-include],[data-unit-break]'); if (!input) return; action(async () => { const id = input.closest('[data-report-unit]').dataset.reportUnit; if (input.hasAttribute('data-unit-break')) settings.breakBefore = input.checked ? [...new Set([...settings.breakBefore, id])] : settings.breakBefore.filter(x => x !== id); else { const selected = new Set(scopeIds(getProject())); if (input.checked) selected.add(id); else selected.delete(id); settings.unitId = ''; settings.unitIds = settings.order.filter(id => selected.has(id)); } pageNumber = 0; settingsDirty = true; await saveSettings(); await render(); }); };
  $('#reportUnits').onclick = event => { const b = event.target.closest('[data-unit-move]'); if (b) action(async () => { const id = b.closest('[data-report-unit]').dataset.reportUnit, i = settings.order.indexOf(id), j = i + Number(b.dataset.unitMove); if (j >= 0 && j < settings.order.length) [settings.order[i], settings.order[j]] = [settings.order[j], settings.order[i]]; if (settings.unitIds) settings.unitIds = settings.order.filter(id => settings.unitIds.includes(id)); settingsDirty = true; await saveSettings(); await render(); }); };
  $('#reportRooms').onchange = event => {
    const input = event.target.closest('[data-report-include]'); if (!input) return;
    const recordId = input.closest('[data-report-record]').dataset.reportRecord, mediaId = input.closest('[data-report-photo]').dataset.reportPhoto, checked = input.checked;
    action(() => mutate(p => { const r = p.records.find(r => r.id === recordId), photo = r.photos.find(x => x.mediaId === mediaId); photo.reportInclude = checked; if (!checked && r.mainPhotoId === mediaId) delete r.mainPhotoId; }));
  };
  // Preserve edits before any rerender (selection, sorting, view changes or preview).
  function saveTextEdits() {
    // Settings and text share one project revision; serialize the entire flush,
    // including blur saves queued while an earlier text write is still pending.
    const operation = editQueue.then(flushEdits);
    editQueue = operation.catch(() => {});
    return operation;
  }
  async function flushEdits() {
    await saveSettings();
    if (textWrite) await textWrite;
    const p = getProject(); if (!p) return;
    const changed = [...$('#reportRooms').querySelectorAll('[data-report-record]')].filter(el => el.querySelector('[data-report-text]').dataset.edited === 'true').map(el => ({ id: el.dataset.reportRecord, text: el.querySelector('[data-report-text]').value })).filter(x => p.records.some(r => r.id === x.id));
    if (changed.length) {
      textWrite = commit(next => { for (const item of changed) next.records.find(r => r.id === item.id).reportText = item.text; });
      try { await textWrite; } finally { textWrite = null; }
      for (const item of changed) { const el = $(`[data-report-record="${item.id}"] [data-report-text]`); if (el?.value === item.text) delete el.dataset.edited; }
    }
  }
  $('#reportRooms').oninput = event => {
    if (!event.target.matches('[data-report-text]')) return;
    event.target.dataset.edited = 'true';
    const card = event.target.closest('[data-report-record]'), record = getProject().records.find(r => r.id === card.dataset.reportRecord), draft = { ...record, reportText: event.target.value };
    card.querySelector('[data-content-preview]').textContent = photoContent(draft).text;
    for (const item of card.querySelectorAll('[data-report-photo]')) {
      const photo = record.photos.find(p => p.mediaId === item.dataset.reportPhoto), caption = photoContent(draft, photo).caption;
      item.querySelector('[data-photo-content-caption]').textContent = caption;
      item.querySelector('img').alt = caption || ROLES[photo.role];
    }
  };

  $('#reportRooms').onclick = event => {
    const button = event.target.closest('[data-do]'); if (!button) return;
    const command = button.dataset.do, rid = button.closest('[data-report-record]')?.dataset.reportRecord, mid = button.closest('[data-report-photo]')?.dataset.reportPhoto;
    const anchor = rid || button.closest('.report-room')?.querySelector('[data-report-record]')?.dataset.reportRecord;
    action(async () => {
      await saveTextEdits();
      if (command === 'photos-prev' || command === 'photos-next') {
        photoPages.set(rid, Math.max(0, (photoPages.get(rid) || 0) + (command === 'photos-next' ? 1 : -1)));
        await render(); const photos = $(`[data-report-record="${rid}"] .report-photos`); photos.scrollIntoView({ block: 'start' }); return;
      }
      if (command === 'edit-layout') { fullEditor = true; await render(rid); const card = $(`[data-report-record="${rid}"]`); card.scrollIntoView({ block: 'start' }); card.querySelector('[data-report-text]').focus({ preventScroll: true }); return; }
      if (command === 'edit-photo') return editPhoto(rid, mid);
      if (command === 'edit-record') return editRecord(rid);
      if (command === 'edit-detail') return api.editDetail(rid);
      if (command === 'rename-room') {
        const room = getProject().rooms.find(x => x.id === button.dataset.room);
        openModal('統一房間名稱', `<form id="renameRoomForm"><label>房間名稱<input id="roomName" maxlength="100" required value="${e(room.name)}"></label><p>同房間的全部紀錄會一起更新；位置圖上的手寫文字請另行核對。</p><button class="primary">保存房間名稱</button></form>`);
        $('#renameRoomForm').onsubmit = ev => { ev.preventDefault(); const name = $('#roomName').value.trim(); action(async () => { assert(name, '請填房間名稱'); await mutate(p => { assert(!p.rooms.some(x => x.id !== room.id && x.unitId === room.unitId && x.floor === room.floor && x.name === name), '已有同名房間，請使用不同名稱'); p.rooms.find(x => x.id === room.id).name = name; for (const r of p.records.filter(r => r.roomId === room.id)) r.space = name; }); api.closeModal(true); }); }; return;
      }
      if (command === 'generate-text') {
        const r = getProject().records.find(r => r.id === rid), text = attachmentObservationText(r);
        openModal('新版說明預覽', `<p class="description">${e(text)}</p><p>確認後才替換此筆附件說明。</p><button id="useGeneratedText" class="primary">採用這段說明</button>`);
        $('#useGeneratedText').onclick = () => action(async () => { await mutate(p => { p.records.find(r => r.id === rid).reportText = text; }); api.closeModal(true); }); return;
      }
      await mutate(p => {
        const r = p.records.find(r => r.id === rid);
        if (command === 'save-text') return;
        if (command === 'main') { r.mainPhotoId = mid; r.photos.find(x => x.mediaId === mid).reportInclude = true; }
        if (command === 'preset') { const ids = defaultPhotoIds({ ...r, mainPhotoId: undefined }); delete r.mainPhotoId; r.photos.forEach(x => { x.reportInclude = ids.has(x.mediaId); }); }
        if (command === 'main-only') { const photos = reportPhotos(r), chosen = r.mainPhotoId || (photos.find(p => p.role === 'close') || photos[0])?.mediaId; assert(chosen, '請先選一張主照片'); r.mainPhotoId = chosen; r.photos.forEach(x => { x.reportInclude = x.mediaId === chosen; }); }
        if (command.startsWith('photo-')) { const a = r.photos.findIndex(x => x.mediaId === mid), b = a + (command === 'photo-up' ? -1 : 1); if (b >= 0 && b < r.photos.length) [r.photos[a], r.photos[b]] = [r.photos[b], r.photos[a]]; }
        if (command.startsWith('record-')) { const records = p.records.filter(x => roomKey(x) === roomKey(r)), a = records.indexOf(r), other = records[a + (command === 'record-up' ? -1 : 1)]; if (other) { const ia = p.records.indexOf(r), ib = p.records.indexOf(other); [p.records[ia], p.records[ib]] = [p.records[ib], p.records[ia]]; } }
        if (command.startsWith('room-')) {
          moveRoom(p, button.dataset.room, command === 'room-up' ? -1 : 1, settings.unitId);
        }
      }, anchor, mid);
    });
  };
  function showResult(result, p, back) {
    const url = URL.createObjectURL(new Blob([result.html], { type: 'text/html;charset=utf-8' }));
    const formatName = REPORT_FORMATS[result.index.format], suffix = result.index.volume ? '-第' + result.index.volume + '冊' : settings.unitId ? '-' + (p.units.find(u => u.id === settings.unitId)?.code || '') : '';
    openModal(formatName + suffix + ' · 預覽與下載', '<p>請核對日期、選片、細圖與文字。列印選 A4、100% 比例，關閉瀏覽器頁首頁尾。</p><div class="choice-chips"><button id="printAttachment" class="secondary">列印／另存 PDF</button><button id="downloadAttachment" class="primary">下載附件 HTML</button><button id="downloadMapping" class="secondary">下載編號對照 JSON</button>' + (back ? '<button id="backToVolumes" class="secondary">返回分冊清單</button>' : '') + '</div><iframe id="attachmentPreview" title="現況照片附件預覽"></iframe>', () => URL.revokeObjectURL(url));
    $('#printAttachment').disabled = true;
    $('#attachmentPreview').onload = () => { if ($('#printAttachment')) $('#printAttachment').disabled = false; };
    $('#attachmentPreview').src = url;
    $('#printAttachment').onclick = () => $('#attachmentPreview').contentWindow.print();
    $('#downloadAttachment').onclick = () => download(new Blob([result.html], { type: 'text/html;charset=utf-8' }), p.code + '-' + formatName + suffix + '-r' + p.revision + '.html');
    $('#downloadMapping').onclick = () => download(new Blob([JSON.stringify({ ...result.index, digest: result.digest }, null, 2)], { type: 'application/json' }), p.code + '-' + formatName + suffix + '-編號對照-r' + p.revision + '.json');
    if (back) $('#backToVolumes').onclick = back;
  }
  $('#editPlanLabels').onclick = () => action(async () => { await saveTextEdits(); await openLabelEditor({ ...api, render }, options()); });
  $('#previewReport').onclick = () => action(async () => {
    await saveTextEdits();
    const p = clone(getProject()), opts = options(); attachmentIndex(p, opts);
    const result = await renderAttachment(p, async mid => (await getMedia(mid))?.blob, opts, (i, n) => busyText('整理附件照片 ' + i + '／' + n));
    showResult(result, p);
  }, '整理照片附件');
  function volumeMenu(p, plan) {
    openModal('標準附件 · 分冊清單', '<p>' + plan.volumes.length + ' 冊 · ' + plan.index.sections.length + ' 頁正文。目錄獨立計頁，各冊正文頁碼接續。</p><label>選擇冊次<select id="volumeSelect">' + plan.volumes.map(v => '<option value="' + v.number + '">第 ' + v.number + ' 冊 · ' + e(plan.index.pagePrefix + v.start) + '～' + e(plan.index.pagePrefix + (v.start + v.pageCount - 1)) + ' · ' + v.unitIds.length + ' 戶' + (v.overLimit ? '（單元超過頁數上限，完整保留）' : '') + '</option>').join('') + '</select></label><div class="choice-chips"><button id="previewVolume" class="primary">開啟本冊／下載</button><button id="downloadContents" class="secondary">下載全案分冊目錄</button><button id="downloadVolumePlan" class="secondary">下載全案編號對照</button></div><p class="micro">逐冊製作影像，減少一次處理的資料量。單冊影像過大時，可返回調整每冊頁數或公設分段。</p>');
    $('#previewVolume').onclick = () => action(async () => { const result = await renderPlannedVolume(p, async mid => (await getMedia(mid))?.blob, plan, Number($('#volumeSelect').value), (i, n) => busyText('整理本冊照片 ' + i + '／' + n)); showResult(result, p, () => volumeMenu(p, plan)); }, '製作本冊附件');
    $('#downloadContents').onclick = () => action(async () => download(new Blob([await masterContentsHTML(plan)], { type: 'text/html;charset=utf-8' }), p.code + '-分冊總目錄-r' + p.revision + '.html'));
    $('#downloadVolumePlan').onclick = () => download(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), p.code + '-全案編號與分冊對照-r' + p.revision + '.json');
  }
  $('#planVolumes').onclick = () => action(async () => {
    await saveTextEdits(); const p = clone(getProject()), plan = await prepareVolumes(p, options()); volumeMenu(p, plan);
  }, '核對各戶頁數與分冊');
  return { render, saveTextEdits, get dirty() { return settingsDirty || !!$('#reportRooms [data-report-text][data-edited="true"]'); } };
}
