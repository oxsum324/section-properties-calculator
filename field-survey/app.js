import { VERSION, id, now, clone, newProject, newUnit, newRecord, CONDITIONS, COMPONENTS, UNIT_STATES, ROLES, recordIssues, unitIssues, sha256, restoredCopy, assert } from './model.js';
import { openStore, allProjects, getProject, getMedia, saveProject, backupState, saveBackupState } from './store.js';
import { makeBundle, readBundle, makeReceipt, checkReceipt } from './bundle.js';
import { createAnnotator, markedImage } from './annotation.js';

const $ = selector => document.querySelector(selector), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = object => Object.entries(object).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
const size = bytes => bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const localDate = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
let project = null, unitId = '', recordId = '', activeView = 'work', dirty = false, editGeneration = 0, saveTimer, formSaving = null, working = false, renderToken = 0;
let pendingCapture = null, pendingPlan = null, modalCleanup = () => {}, modalDirty = false, recording = null, toastTimer;
const urls = new Map();
const currentRecord = () => project?.records.find(r => r.id === recordId);
const currentUnit = () => project?.units.find(u => u.id === unitId);
const recordNumber = r => `R-${String(project.records.indexOf(r) + 1).padStart(3, '0')}`;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500); }
function fail(error) { console.error(error); $('#recoverCopy').hidden = error?.name !== 'RevisionConflictError'; $('#errorText').textContent = error?.name === 'QuotaExceededError' ? '此裝置儲存空間不足，這次操作未完成。請先匯出已有案件；原有資料不會自動刪除。' : error.message || String(error); $('#errorBar').hidden = false; if ($('#modal').open) { $('#modalError').textContent = $('#errorText').textContent; $('#modalError').hidden = false; $('#modalError').scrollIntoView({ block: 'nearest' }); } $('#saveStatus').textContent = dirty ? '有尚未保存的變更' : '請確認上方提示'; }
function busyText(text) { $('#busyText').textContent = text; }
async function action(fn, label = '處理中') {
  if (working) return;
  working = true; $('#busy').hidden = false; busyText(label); $('#app').inert = true; $('#modal').inert = true;
  try { await saveForm(); await fn(); } catch (e) { fail(e); } finally { working = false; $('#busy').hidden = true; $('#app').inert = false; $('#modal').inert = false; }
}
function requireNoRecording() { assert(!recording, '請先停止並保存目前錄音，再切換位置或案件。'); }
function openModal(title, body, cleanup = () => {}) {
  modalCleanup(); modalCleanup = cleanup; modalDirty = false; $('#modalError').hidden = true; $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal(force = false) { if (!force && modalDirty && !confirm('圈註尚未保存，確定放棄這次修改？')) return; modalCleanup(); modalCleanup = () => {}; modalDirty = false; $('#modal').close(); }
function revokeURLs() { for (const value of urls.values()) URL.revokeObjectURL(value); urls.clear(); }
async function mediaURL(mediaId, original = false) {
  const key = mediaId + (original ? '-original' : '');
  if (urls.has(key)) return urls.get(key);
  const asset = await getMedia(mediaId); assert(asset?.blob, '找不到媒體原檔，請從備份還原');
  const url = URL.createObjectURL(original ? asset.blob : asset.thumb || asset.blob); urls.set(key, url); return url;
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000);
}
async function commit(mutator, assets = []) {
  const next = clone(project); mutator(next); project = await saveProject(next, project.revision, assets); $('#saveStatus').textContent = '已保存於本機';
}
function markUnitOpen(next, record) { const u = next.units.find(x => x.id === record.unitId); if (u?.status === 'complete') u.status = 'open'; record.updatedAt = now(); }
function formValues() {
  const values = {};
  for (const key of ['floor', 'space', 'location', 'component', 'condition', 'visibility', 'notes', 'resident']) values[key] = $('#' + key).value;
  values.measured = values.condition === 'crack' && $('#measured').checked;
  for (const key of ['width', 'length']) { const el = $('#' + key); assert(!values.measured || !el.validity.badInput, '量測尺寸格式不正確'); values[key] = values.measured && el.value !== '' ? Number(el.value) : null; assert(values[key] === null || (Number.isFinite(values[key]) && values[key] >= 0), '量測尺寸須為非負數值'); }
  return values;
}
async function saveForm() {
  clearTimeout(saveTimer);
  if (formSaving) { await formSaving; if (dirty) return saveForm(); return; }
  if (!dirty || !currentRecord() || $('#recordEditor').hidden) return;
  const generation = editGeneration, target = recordId, values = formValues(), beforeFloor = currentRecord().floor;
  formSaving = commit(next => {
    const r = next.records.find(x => x.id === target); Object.assign(r, values); markUnitOpen(next, r);
    if (r.placement && next.plans.find(p => p.id === r.placement.planId)?.floor !== r.floor) r.placement = null;
  }).then(() => {
    if (generation === editGeneration) dirty = false;
    $('#saveStatus').textContent = dirty ? '尚未保存新變更' : '已保存於本機';
    renderRecordList(); renderRecordIssues();
    if (beforeFloor !== values.floor && currentRecord()?.placement === null) $('#recordTime').textContent = '樓層變更後請核對位置圖';
  }).finally(() => { formSaving = null; });
  await formSaving;
}
function changed() {
  if (!currentRecord()) return; dirty = true; editGeneration++; $('#saveStatus').textContent = '尚未保存'; clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveForm().catch(fail); }, 500);
  $('#measurement').hidden = $('#condition').value !== 'crack';
  for (const k of ['width', 'length']) $('#' + k).disabled = !$('#measured').checked;
}
async function projectOptions() {
  const projects = (await allProjects()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('#caseSelect').innerHTML = projects.length ? projects.map(p => `<option value="${esc(p.id)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('') : '<option value="">尚無案件</option>';
  if (project) $('#caseSelect').value = project.id;
}
async function selectProject(projectId) {
  requireNoRecording(); revokeURLs(); project = projectId ? await getProject(projectId) : null; dirty = false;
  unitId = project?.units[0]?.id || ''; recordId = project?.records.find(r => r.unitId === unitId)?.id || ''; activeView = 'work'; await render();
}
function renderRecordList() {
  const records = project?.records.filter(r => r.unitId === unitId) || [];
  $('#recordCount').textContent = records.length;
  $('#recordList').innerHTML = records.length ? records.map(r => `<button class="record-item ${r.id === recordId ? 'active' : ''}" data-record="${esc(r.id)}"><strong>${esc(recordNumber(r))} · ${esc(r.space || '未填空間')}</strong><small>${esc(r.floor || '未填樓層')} · ${r.photos.filter(p => !p.excluded).length} 張照片${recordIssues(r).length ? ' · 待補' : ''}</small></button>`).join('') : '<p class="micro">這一戶尚無位置紀錄</p>';
  $('#addRecord').disabled = !unitId; $('#editUnit').disabled = !unitId;
}
function renderRecordIssues() {
  const r = currentRecord(); if (!r) return;
  const issues = recordIssues(r); $('#recordIssues').textContent = issues.length ? `待補：${issues.join('、')}` : '本筆必要紀錄已齊';
}
async function renderMedia() {
  const token = ++renderToken, r = currentRecord();
  if (!r) return;
  $('#photoGrid').innerHTML = r.photos.length ? r.photos.map((p, i) => `<button type="button" class="photo-card" data-photo="${esc(p.mediaId)}" aria-label="照片 ${i + 1} 圈註"><span class="photo-placeholder">讀取照片…</span>${p.marks.length ? '<span class="mark-badge">已圈註</span>' : ''}<span class="photo-label"><span>${i + 1} · ${esc(p.excluded ? '不採用' : ROLES[p.role])}</span><span>編輯 ↗</span></span></button>`).join('') : '<div class="photo-empty">先拍一張位置全景，再加入近照或量尺照。</div>';
  $('#audioList').replaceChildren();
  for (const photo of r.photos) {
    const url = await mediaURL(photo.mediaId); if (token !== renderToken) return;
    const card = $(`[data-photo="${photo.mediaId}"]`), image = new Image(); image.alt = photo.caption || ROLES[photo.role]; image.loading = 'lazy'; image.src = url;
    image.onerror = () => { if (token === renderToken) { const span = document.createElement('span'); span.className = 'photo-placeholder'; span.textContent = '原檔已存・此裝置無法預覽'; image.replaceWith(span); } };
    card.querySelector('.photo-placeholder').replaceWith(image); if (photo.excluded) card.style.opacity = '.55';
  }
  for (const audioId of r.audioIds) {
    const url = await mediaURL(audioId, true); if (token !== renderToken) return;
    const div = document.createElement('div'); div.className = 'audio-item'; const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = url;
    const label = document.createElement('span'); label.textContent = project.media.find(m => m.id === audioId)?.name || '現場錄音'; div.append(label, audio); $('#audioList').append(div);
  }
}
async function renderEditor() {
  renderToken++;
  const r = currentRecord(); $('#recordEditor').hidden = !r; $('#recordEmpty').hidden = !!r; if (!r) return;
  $('#recordCode').textContent = recordNumber(r); $('#recordTime').textContent = new Date(r.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  for (const key of ['floor', 'space', 'location', 'component', 'condition', 'visibility', 'notes', 'resident']) $('#' + key).value = r[key];
  $('#measured').checked = r.measured;
  for (const k of ['width', 'length']) { $('#' + k).value = r[k] ?? ''; $('#' + k).disabled = !r.measured; }
  $('#measurement').hidden = r.condition !== 'crack'; renderRecordIssues(); await renderMedia();
}
async function render() {
  await projectOptions(); $('#welcome').hidden = !!project; $('#workspace').hidden = !project; $('#bottomNav').hidden = !project;
  if (!project) return;
  $('#unitSelect').innerHTML = project.units.length ? project.units.map(u => `<option value="${esc(u.id)}">${esc(u.code)}${u.address ? ' · ' + esc(u.address) : ''}</option>`).join('') : '<option value="">請先新增戶別</option>';
  $('#unitSelect').value = unitId; renderRecordList(); await renderEditor(); await showView(activeView);
}
async function showView(view) {
  activeView = view;
  for (const key of ['work', 'review', 'backup']) $('#' + key + 'View').hidden = key !== view;
  for (const b of document.querySelectorAll('[data-view]')) { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  if (view === 'review') renderReview(); if (view === 'backup') await renderBackup();
}
function renderReview() {
  const totalIssues = project.units.reduce((sum, u) => sum + unitIssues(project, u).length, 0);
  $('#reviewSummary').innerHTML = [[project.units.length, '鑑定戶'], [project.records.length, '位置紀錄'], [totalIssues, '待補項目']].map(([n, label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
  $('#reviewList').innerHTML = project.units.length ? project.units.map(u => {
    const issues = unitIssues(project, u);
    return `<section class="panel review-unit"><div class="section-heading"><div><h3>${esc(u.code)}</h3><span class="micro">${esc(u.address)}</span></div><button class="secondary" data-unit-state="${esc(u.id)}">${esc(UNIT_STATES[u.status])}</button></div>${u.reason ? `<p class="modal-note">${esc(u.reason)}</p>` : ''}${issues.length ? issues.map(issue => `<div class="issue-row"><p>${issue.recordId ? esc(recordNumber(project.records.find(r => r.id === issue.recordId))) + ' · ' : ''}${esc(issue.text)}</p><button class="quiet" data-review-record="${esc(issue.recordId || '')}" data-unit="${esc(u.id)}">前往 →</button></div>`).join('') : '<p class="micro">目前未列出待補項目；離開前請人工核對本戶範圍與照片。</p>'}</section>`;
  }).join('') : '<p>尚未新增鑑定戶。</p>';
}
async function renderBackup() {
  const oldScope = $('#exportScope').value;
  $('#exportScope').innerHTML = '<option value="">全案</option>' + project.units.map(u => `<option value="${esc(u.id)}">單戶：${esc(u.code)}</option>`).join('');
  if (project.units.some(u => u.id === oldScope)) $('#exportScope').value = oldScope;
  const bytes = project.media.reduce((s, m) => s + m.size, 0); $('#backupSummary').textContent = `${project.units.length} 戶 · ${project.records.length} 筆紀錄 · ${project.media.length} 個原始媒體 · ${size(bytes)}`;
  const state = await backupState(project.id), entry = state.entries[$('#exportScope').value || 'all'];
  $('#exportState').textContent = !entry ? '尚未匯出此範圍。' : entry.revision !== project.revision ? '匯出後案件已有修改，請重新備份。' : entry.verifiedAt ? '已匯入本版本的接收端核對收據。' : '已產生備份檔；待接收端開啟核對。';
  const estimate = await navigator.storage?.estimate?.();
  $('#storageInfo').textContent = estimate ? `此網站已用 ${size(estimate.usage || 0)}，估計配額 ${size(estimate.quota || 0)}。${await navigator.storage?.persisted?.() ? '已取得持續保存。' : '尚未取得持續保存。'}` : '此瀏覽器無法提供空間估計；請定期匯出備份。';
}

function caseDialog() {
  requireNoRecording();
  openModal('建立案件', `<form id="caseForm"><label>案號<input name="code" required maxlength="100" placeholder="公司或公會案號"></label><label>案件名稱<input name="name" required maxlength="180" placeholder="本次現況鑑定名稱"></label><label>本次會勘日期<input name="date" type="date" required value="${localDate()}"></label><p class="modal-note">只在此裝置建立案件，不會上傳照片或住戶資料。</p><div class="modal-actions"><button class="primary" type="submit">建立案件</button></div></form>`);
  $('#caseForm').onsubmit = e => { e.preventDefault(); const data = new FormData(e.target); action(async () => { const created = newProject(data.get('code'), data.get('name'), data.get('date')); await saveProject(created, 0); closeModal(true); await selectProject(created.id); toast('案件已建立，請新增第一戶'); }); };
}
function unitDialog(editId = '') {
  requireNoRecording(); assert(project, '請先建立案件');
  const u = project.units.find(x => x.id === editId);
  openModal(u ? '戶別與本次進場情形' : '新增鑑定戶', `<form id="unitForm"><label>鑑定戶編號／名稱<input name="code" required maxlength="150" value="${esc(u?.code || '')}" placeholder="例如 001、A 棟公設"></label><label>地址<input name="address" maxlength="500" value="${esc(u?.address || '')}" placeholder="可於此核對實際門牌"></label>${u ? `<label>本次狀態<select name="status">${opts(UNIT_STATES)}</select></label><label>未完成範圍／無法入內原因<textarea name="reason" maxlength="10000" rows="3">${esc(u.reason)}</textarea></label><p class="micro">部分完成或無法入內請留下原因；完成狀態只表示本次紀錄進度。</p>` : ''}<div class="modal-actions"><button class="primary" type="submit">${u ? '保存戶況' : '新增戶別'}</button></div></form>`);
  if (u) $('#unitForm [name=status]').value = u.status;
  $('#unitForm').onsubmit = e => {
    e.preventDefault(); const data = new FormData(e.target), code = data.get('code').trim();
    action(async () => {
      assert(!project.units.some(x => x.id !== editId && x.code === code), '此案件已有相同戶別編號');
      let chosen = u?.id;
      await commit(next => {
        if (!u) { const item = newUnit(code, data.get('address')); chosen = item.id; next.units.push(item); }
        else {
          const item = next.units.find(x => x.id === editId); item.code = code; item.address = data.get('address').trim(); item.status = data.get('status'); item.reason = data.get('reason').trim();
          assert(!['partial', 'inaccessible'].includes(item.status) || item.reason, '請補上未完成／無法入內原因');
          if (item.status === 'complete') assert(unitIssues(next, item).length === 0, '本戶仍有待補項目。請補齊，或選擇部分完成並記錄範圍。');
        }
      });
      unitId = chosen; if (!u) recordId = ''; closeModal(true); await render(); toast('戶別已保存');
    });
  };
}
async function addRecord() {
  requireNoRecording(); assert(unitId, '請先新增或選擇鑑定戶');
  const previous = currentRecord(), r = newRecord(unitId, previous?.floor || '', previous?.space || '');
  await commit(next => { next.records.push(r); markUnitOpen(next, r); }); recordId = r.id; await render(); $('#location').focus();
}
async function prepareAsset(file, kind, source) {
  assert(file.size > 0 && file.size <= 60 * 1024 * 1024, `${file.name || '媒體'}：單一檔案須小於 60 MB`);
  const ext = (file.name || '').split('.').at(-1).toLowerCase();
  const imageTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  let type = file.type || imageTypes[ext];
  if (kind !== 'audio') assert(Object.values(imageTypes).includes(type), '照片支援 JPEG、PNG、WebP、HEIC／HEIF；位置圖請使用可預覽的圖片');
  else assert(/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;|$)/.test(type), '不支援此錄音格式');
  const mediaId = id(), metadata = { id: mediaId, name: file.name || `現場錄音-${Date.now()}`, type, size: file.size, sha256: await sha256(file), kind, source, importedAt: now(), fileModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null };
  const asset = { id: mediaId, blob: file.slice(0, file.size, type) };
  if (kind !== 'audio') {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
      metadata.width = img.naturalWidth; metadata.height = img.naturalHeight;
      const canvas = document.createElement('canvas'), scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight)); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); asset.thumb = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
    } catch { metadata.previewUnavailable = true; } finally { URL.revokeObjectURL(url); }
  }
  return { metadata, asset };
}
function capture(source) {
  requireNoRecording(); assert(currentRecord(), '請先新增位置紀錄');
  pendingCapture = { projectId: project.id, recordId, source };
  $(source === 'camera' ? '#cameraInput' : '#galleryInput').click();
}
async function addPhotos(files, context) {
  assert(context && project?.id === context.projectId && project.records.some(r => r.id === context.recordId), '拍照時的案件或位置已改變，照片尚未歸戶，請回原位置重新選取');
  const errors = []; let saved = 0;
  for (const [i, file] of files.entries()) {
    busyText(`保存原始照片 ${i + 1} / ${files.length}`);
    try {
      const { metadata, asset } = await prepareAsset(file, 'image', context.source);
      const existing = project.media.find(m => m.sha256 === metadata.sha256 && project.records.find(r => r.id === context.recordId).photos.some(p => p.mediaId === m.id));
      if (existing) { errors.push(`${file.name}：此位置已有相同檔案`); continue; }
      await commit(next => { next.media.push(metadata); const r = next.records.find(x => x.id === context.recordId); r.photos.push({ mediaId: metadata.id, role: r.photos.length ? 'close' : 'overview', caption: '', marks: [], excluded: false, excludedReason: '' }); markUnitOpen(next, r); }, [asset]); saved++;
    } catch (e) { errors.push(`${file.name}：${e.message || '儲存失敗'}`); }
  }
  await render(); if (saved) toast(`${saved} 張原始照片已保存於本機`);
  if (errors.length) throw new Error(`已保存 ${saved} 張；其餘 ${errors.length} 張未新增：${errors.slice(0, 5).join('；')}`);
}
async function photoDialog(mediaId) {
  const targetRecord = recordId, photo = currentRecord().photos.find(p => p.mediaId === mediaId), metadata = project.media.find(m => m.id === mediaId), asset = await getMedia(mediaId);
  let annotator = null;
  openModal('照片圈註', `<div class="annotation-tools"><label>照片用途<select id="photoRole">${opts(ROLES)}</select></label><label>標記文字<input id="markText" maxlength="120" placeholder="選文字工具後點圖面"></label></div><div class="annotation-toolbar" id="photoTools"><button data-mode="circle" class="selected">圈選</button><button data-mode="arrow">箭頭</button><button data-mode="pen">畫線</button><button data-mode="text">文字</button><button data-mode="view">查看</button><button id="undoMark">復原</button></div><div id="photoStage" class="annotation-stage"></div><label>照片說明<input id="photoCaption" maxlength="1000" value="${esc(photo.caption)}" placeholder="可補充拍攝細節"></label><div class="two-col" style="margin-top:12px"><label class="check-label"><input id="photoExcluded" type="checkbox" ${photo.excluded ? 'checked' : ''}>不採用此照片（保留原檔）</label><label>不採用原因<input id="excludedReason" maxlength="500" value="${esc(photo.excludedReason || '')}" placeholder="例如 模糊、重拍"></label></div><p class="micro">${esc(metadata.name)} · ${size(metadata.size)} · 取得於 ${esc(new Date(metadata.importedAt).toLocaleString('zh-TW'))}<br>此時間為工具取得時間；不替代原始拍攝資訊。</p><div class="modal-actions"><button id="downloadOriginal" class="quiet">下載原圖</button><button id="downloadMarked" class="secondary">註記副本</button><button id="savePhoto" class="primary">保存圈註</button></div>`, () => annotator?.dispose());
  $('#photoRole').value = photo.role;
  try { annotator = await createAnnotator($('#photoStage'), await mediaURL(mediaId, true), photo.marks, () => { modalDirty = true; }); }
  catch (e) { $('#photoStage').textContent = e.message; $('#photoTools').hidden = true; $('#downloadMarked').disabled = true; }
  $('#markText').oninput = e => annotator?.setText(e.target.value);
  $('#photoTools').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { annotator?.setMode(b.dataset.mode); for (const x of $('#photoTools').querySelectorAll('[data-mode]')) x.classList.toggle('selected', x === b); } };
  $('#undoMark').onclick = () => annotator?.undo();
  for (const selector of ['#photoRole', '#photoCaption', '#photoExcluded', '#excludedReason']) $(selector).oninput = () => { modalDirty = true; };
  $('#downloadOriginal').onclick = () => download(asset.blob, metadata.name);
  $('#downloadMarked').onclick = () => action(async () => { download(await markedImage(asset.blob, annotator.marks), metadata.name.replace(/\.[^.]+$/, '') + '-註記.jpg'); toast('已產生註記副本；原圖不變'); });
  $('#savePhoto').onclick = () => action(async () => {
    const values = { role: $('#photoRole').value, caption: $('#photoCaption').value, marks: annotator?.marks || photo.marks, excluded: $('#photoExcluded').checked, excludedReason: $('#excludedReason').value.trim() };
    assert(!values.excluded || values.excludedReason, '請填寫不採用原因');
    await commit(next => { const r = next.records.find(x => x.id === targetRecord); Object.assign(r.photos.find(x => x.mediaId === mediaId), values); markUnitOpen(next, r); });
    closeModal(true); await render(); toast('圈註已另存，原圖保留');
  });
}
async function planDialog() {
  assert(currentRecord(), '請先新增位置紀錄'); const r = currentRecord(); assert(r.floor.trim(), '請先填寫樓層，再加入位置圖');
  const plans = project.plans.filter(p => p.unitId === r.unitId && p.floor === r.floor), initial = plans.find(p => p.id === r.placement?.planId) || plans.at(-1);
  let annotator = null, selected = initial?.id || '', point = null;
  openModal('平面圖上的位置與方向', `<p class="micro">${esc(currentUnit().code)} · ${esc(r.floor)}。由拍攝點拉向拍攝方向；沒有圖時，可先填位置參照物，稍後補圖。</p><div class="annotation-tools"><label>位置圖<select id="planSelect">${plans.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('') || '<option value="">尚無位置圖</option>'}</select></label><button id="addPlanImage" class="secondary">加入圖面</button></div><div id="planStage" class="annotation-stage"></div><p class="micro">加入 JPG、PNG、WebP 圖面或手繪草圖照片；本版尚不直接讀取 PDF／CAD。</p><div class="modal-actions"><button id="clearPlacement" class="quiet">移除本筆定位</button><button id="savePlacement" class="primary" ${initial ? '' : 'disabled'}>保存位置</button></div>`, () => annotator?.dispose());
  if (initial) $('#planSelect').value = initial.id;
  async function loadPlan(planId) {
    annotator?.dispose(); selected = planId; point = null;
    const plan = plans.find(x => x.id === planId); const q = r.placement?.planId === planId ? r.placement : null;
    const marks = q ? [{ type: 'arrow', points: [{ x: q.x, y: q.y }, { x: q.endX, y: q.endY }] }] : [];
    point = q;
    annotator = await createAnnotator($('#planStage'), await mediaURL(plan.mediaId, true), marks, values => {
      const arrow = values.at(-1); if (arrow) { point = { planId: selected, x: arrow.points[0].x, y: arrow.points[0].y, endX: arrow.points.at(-1).x, endY: arrow.points.at(-1).y }; annotator.replace([arrow]); modalDirty = true; }
    }); annotator.setMode('arrow');
  }
  $('#planSelect').onchange = e => action(() => loadPlan(e.target.value));
  $('#addPlanImage').onclick = () => { pendingPlan = { projectId: project.id, recordId, unitId, floor: r.floor }; $('#planInput').click(); };
  $('#clearPlacement').onclick = () => action(async () => { await commit(next => { const target = next.records.find(x => x.id === r.id); target.placement = null; markUnitOpen(next, target); }); closeModal(true); toast('已移除本筆定位，原圖保留'); });
  $('#savePlacement').onclick = () => action(async () => { assert(point, '請在圖上拉出拍攝方向箭頭'); await commit(next => { const target = next.records.find(x => x.id === r.id); target.placement = point; markUnitOpen(next, target); }); closeModal(true); renderRecordIssues(); toast('位置與方向已保存'); });
  if (initial) await loadPlan(initial.id);
}
async function addPlan(file, context) {
  assert(project.id === context.projectId && recordId === context.recordId && currentRecord().floor === context.floor, '位置圖原先的戶別或樓層已變更，請重新選取');
  const { metadata, asset } = await prepareAsset(file, 'plan', 'plan'); assert(!metadata.previewUnavailable, '此圖面無法預覽，請改用 JPG 或 PNG');
  const plan = { id: id(), unitId: context.unitId, floor: context.floor, title: file.name, mediaId: metadata.id };
  await commit(next => { next.media.push(metadata); next.plans.push(plan); }, [asset]); closeModal(true); await planDialog();
}
async function audioToggle() {
  if (recording) return stopAudio();
  assert(currentRecord(), '請先新增位置紀錄'); assert(navigator.mediaDevices?.getUserMedia && window.MediaRecorder, '此瀏覽器不支援錄音，請使用文字紀錄');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)); recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = []; let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => resolveDone(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    recorder.onerror = () => { if (recorder.state !== 'inactive') recorder.stop(); toast('錄音中斷，請停止並確認已保存內容'); };
    recorder.start(1000); recording = { recorder, stream, done, projectId: project.id, recordId, startedAt: Date.now(), timer: setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
      $('#audioStatus').textContent = '已達 5 分鐘，正在保存';
      const finish = () => { if (!recording || recording.recorder !== recorder) return; if (working) setTimeout(finish, 250); else action(stopAudio, '保存錄音'); }; finish();
    }, 300000) };
    $('#recordAudio').textContent = '■ 停止並保存錄音'; $('#audioStatus').textContent = '錄音中 · 最長 5 分鐘';
  } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e; }
}
async function stopAudio() {
  const context = recording; if (!context) return;
  clearTimeout(context.timer); if (context.recorder.state !== 'inactive') context.recorder.stop();
  const blob = await context.done; context.stream.getTracks().forEach(t => t.stop());
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([blob], `現場錄音-${new Date(context.startedAt).toISOString().replace(/[:.]/g, '-')}.${ext}`, { type: blob.type });
  try {
    const { metadata, asset } = await prepareAsset(file, 'audio', 'microphone');
    assert(project.id === context.projectId, '錄音案件已變更');
    await commit(next => { next.media.push(metadata); const r = next.records.find(x => x.id === context.recordId); r.audioIds.push(metadata.id); markUnitOpen(next, r); }, [asset]); toast('錄音已保存');
  } catch (error) { download(file, file.name); throw new Error(`錄音未寫入案件，已另產生下載檔，請保存並補記對應位置。${error.message}`); }
  finally { recording = null; $('#recordAudio').textContent = '開始錄音'; $('#audioStatus').textContent = ''; await renderMedia(); }
}
async function exportBackup() {
  requireNoRecording();
  const scope = $('#exportScope').value;
  const { blob, manifest } = await makeBundle(project, async mediaId => (await getMedia(mediaId))?.blob, scope, (i, n) => busyText(`核對原始檔 ${i} / ${n}`));
  const unit = project.units.find(u => u.id === scope), name = `${project.code}${unit ? '-' + unit.code : ''}-${localDate()}-r${project.revision}.csurvey`;
  download(blob, name);
  const state = await backupState(project.id); state.entries[scope || 'all'] = { digest: manifest.digest, revision: project.revision, exportedAt: now(), verifiedAt: null }; await saveBackupState(state); await renderBackup(); toast('備份檔已產生，請在接收端開啟核對');
}
async function inspectBackup(file) {
  requireNoRecording(); const result = await readBundle(file, (i, n) => busyText(`核對備份原始檔 ${i} / ${n}`));
  const source = result.project, receipt = makeReceipt(result.manifest);
  openModal('備份核對完成', `<p class="eyebrow">${esc(source.code)}</p><h3>${esc(source.name)}</h3><p>${source.units.length} 戶 · ${source.records.length} 筆紀錄 · ${result.media.length} 個原始媒體</p><p class="modal-note">紀錄與全部媒體已通過檔案指紋核對。可下載收據帶回原裝置，或在此建立還原副本。</p><p class="micro">本次確認的是檔案完整性；不驗證拍攝現場、填寫者身分或鑑定結論。請在另一裝置實際開啟副本後，再確認備份可用。</p><div class="modal-actions"><button id="downloadReceipt" class="secondary">下載核對收據</button><button id="restoreBundle" class="primary">建立還原副本</button></div>`);
  $('#downloadReceipt').onclick = () => download(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }), `${source.code}-核對收據.json`);
  $('#restoreBundle').onclick = () => action(async () => {
    const copy = restoredCopy(source), assets = result.media.map(a => ({ ...a, id: copy.remap.get(a.id) }));
    await saveProject(copy.project, 0, assets); closeModal(true); await selectProject(copy.project.id); toast('已建立還原副本，原案保留');
  }, '還原原始照片與紀錄');
}
async function receiveReceipt(file) {
  assert(file.size < 65536, '核對收據檔案過大'); const receipt = JSON.parse(await file.text()), state = await backupState(project.id);
  state.entries[receipt.scope || 'all'] = await checkReceipt(receipt, project, state); await saveBackupState(state); await renderBackup(); toast('核對收據已記錄');
}
function helpDialog() {
  openModal('手機使用與保存', `<ol class="help-list"><li>新增案件及戶別。進入每個空間後新增位置，拍全景、近照或量尺照。</li><li>點照片可圈選、畫箭頭與文字；圈註另存，原圖保留。位置圖可加入圖面或草圖照片。</li><li>現況欄位會自動保存。切換位置前會先保存；上方有錯誤時請先處理。</li><li>離開一戶前查看「待補檢查」，無法入內或部分完成請記原因。</li><li>從「備份還原」匯出全案或單戶。在電腦開啟同一工具、核對備份及建立還原副本。</li><li>iPhone 可從瀏覽器分享選單加入主畫面；Android 可從瀏覽器選單安裝。需先在線開啟，等上方顯示「離線已就緒」。手機使用需 HTTPS。</li></ol><p class="modal-note">資料只保存在此瀏覽器及你匯出的備份檔，不自動上傳。換瀏覽器、清除網站資料或移除應用程式前，請先完成外部備份。勿以無痕模式保存工作。</p><p>本工具記錄現場可見情形，不自動判定損害原因、結構安全或責任歸屬。尚須在實際手機上確認相機、容量及中斷操作。</p><p class="help-version">版本 ${VERSION} · 純本機資料 · 現況紀錄工作稿</p><button id="applyUpdate" class="secondary" hidden>保存後套用離線更新</button>`);
  navigator.serviceWorker?.getRegistration().then(reg => { if (reg?.waiting && $('#applyUpdate')) { $('#applyUpdate').hidden = false; $('#applyUpdate').onclick = () => action(async () => { requireNoRecording(); closeModal(true); reg.waiting.postMessage('ACTIVATE_UPDATE'); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); }); } });
}
async function initOffline() {
  if (!('serviceWorker' in navigator) || !isSecureContext) { $('#offlineStatus').textContent = '需 HTTPS 才能離線安裝'; return; }
  const registration = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: new URL('./', import.meta.url).pathname });
  const updateLabel = () => { $('#offlineStatus').textContent = registration.waiting ? '有新版 · 使用說明中更新' : navigator.serviceWorker.controller || registration.active ? navigator.onLine ? '離線已就緒' : '離線紀錄中' : '離線資源下載中'; };
  updateLabel(); window.addEventListener('online', updateLabel); window.addEventListener('offline', updateLabel);
  navigator.serviceWorker.addEventListener('controllerchange', updateLabel);
  registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { updateLabel(); if (worker.state === 'redundant') $('#offlineStatus').textContent = '離線準備失敗，請連線重開'; }); });
  navigator.serviceWorker.ready.then(updateLabel);
}

async function recoverCopy() {
  if (working) return;
  requireNoRecording(); clearTimeout(saveTimer);
  working = true; $('#busy').hidden = false; busyText('另存本視窗紀錄');
  try {
    if (formSaving) await formSaving.catch(() => {});
    const candidate = clone(project);
    if (dirty && currentRecord()) {
      const r = candidate.records.find(x => x.id === recordId); Object.assign(r, formValues());
      if (r.placement && candidate.plans.find(p => p.id === r.placement.planId)?.floor !== r.floor) r.placement = null;
    }
    const copy = restoredCopy(candidate), assets = [];
    copy.project.name = candidate.name.slice(0, 200) + '（視窗副本）';
    for (const m of candidate.media) { const asset = await getMedia(m.id); assets.push({ ...asset, id: copy.remap.get(m.id) }); }
    await saveProject(copy.project, 0, assets); dirty = false; $('#errorBar').hidden = true;
    await selectProject(copy.project.id); toast('已另存副本，請核對兩個視窗的內容');
  } catch (e) { fail(e); } finally { working = false; $('#busy').hidden = true; }
}
$('#recoverCopy').onclick = () => recoverCopy().catch(fail);
$('#component').innerHTML = opts(Object.fromEntries(COMPONENTS.map(x => [x, x || '請選部位']))); $('#condition').innerHTML = opts(CONDITIONS);
$('#recordForm').addEventListener('submit', e => e.preventDefault()); $('#recordForm').addEventListener('input', changed); $('#recordForm').addEventListener('change', changed);
$('#newCase').onclick = $('#startCase').onclick = () => action(caseDialog);
$('#addUnit').onclick = () => action(() => unitDialog()); $('#editUnit').onclick = () => action(() => unitDialog(unitId));
$('#caseSelect').onchange = e => { const selected = e.target.value; action(() => selectProject(selected)).finally(() => { $('#caseSelect').value = project?.id || ''; }); };
$('#unitSelect').onchange = e => { const selected = e.target.value; action(async () => { requireNoRecording(); unitId = selected; recordId = project.records.find(r => r.unitId === unitId)?.id || ''; await render(); }).finally(() => { $('#unitSelect').value = unitId; }); };
$('#addRecord').onclick = $('#nextRecord').onclick = () => action(addRecord);
$('#saveRecord').onclick = () => action(async () => toast('目前紀錄已保存'));
$('#recordList').onclick = e => { const b = e.target.closest('[data-record]'); if (b) action(async () => { requireNoRecording(); recordId = b.dataset.record; renderRecordList(); await renderEditor(); }); };
$('#takePhoto').onclick = () => { try { capture('camera'); } catch (e) { fail(e); } }; $('#pickPhotos').onclick = () => { try { capture('gallery'); } catch (e) { fail(e); } };
for (const selector of ['#cameraInput', '#galleryInput']) $(selector).onchange = e => { const files = [...e.target.files], context = pendingCapture; e.target.value = ''; if (files.length) action(() => addPhotos(files, context), '保存原始照片'); };
$('#photoGrid').onclick = e => { const b = e.target.closest('[data-photo]'); if (b) action(() => photoDialog(b.dataset.photo)); };
$('#showPlan').onclick = () => action(planDialog); $('#planInput').onchange = e => { const file = e.target.files[0], context = pendingPlan; e.target.value = ''; if (file) action(() => addPlan(file, context)); };
$('#recordAudio').onclick = () => action(audioToggle, '準備錄音');
$('#bottomNav').onclick = e => { const b = e.target.closest('[data-view]'); if (b && project) action(async () => { requireNoRecording(); await showView(b.dataset.view); window.scrollTo(0, 0); }); };
$('#reviewList').onclick = e => { const status = e.target.closest('[data-unit-state]'), record = e.target.closest('[data-review-record]'); if (status) action(() => unitDialog(status.dataset.unitState)); if (record) action(async () => { unitId = record.dataset.unit; recordId = record.dataset.reviewRecord; activeView = 'work'; await render(); }); };
$('#exportScope').onchange = () => action(renderBackup); $('#exportBackup').onclick = () => action(exportBackup, '核對備份資料');
$('#readBackup').onclick = $('#welcomeImport').onclick = () => { try { requireNoRecording(); $('#bundleInput').click(); } catch (e) { fail(e); } };
$('#bundleInput').onchange = e => { const file = e.target.files[0]; e.target.value = ''; if (file) action(() => inspectBackup(file), '核對備份'); };
$('#importReceipt').onclick = () => $('#receiptInput').click(); $('#receiptInput').onchange = e => { const file = e.target.files[0]; e.target.value = ''; if (file) action(() => receiveReceipt(file)); };
$('#persistStorage').onclick = () => action(async () => { const granted = await navigator.storage?.persist?.(); toast(granted ? '已取得持續保存，仍請定期備份' : '瀏覽器未授予持續保存，請完成外部備份'); await renderBackup(); });
$('#help').onclick = () => action(helpDialog); $('#closeModal').onclick = () => closeModal(); $('#modal').addEventListener('cancel', e => { e.preventDefault(); closeModal(); }); $('#dismissError').onclick = () => { $('#errorBar').hidden = true; };
window.addEventListener('beforeunload', e => { if (dirty || formSaving || recording) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) saveForm().catch(fail); });
window.addEventListener('unhandledrejection', e => { e.preventDefault(); fail(e.reason); });
async function init() {
  assert(isSecureContext && crypto.subtle && crypto.randomUUID, '請以 HTTPS 或本機 localhost 開啟。手機不能透過一般 HTTP 網址使用此工具。');
  await openStore(); const existing = (await allProjects()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); await selectProject(existing[0]?.id || '');
  initOffline().catch(e => { $('#offlineStatus').textContent = '離線資源尚未就緒'; fail(e); });
}
init().catch(fail);
