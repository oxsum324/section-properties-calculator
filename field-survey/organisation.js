import { id, assert, newUnit, UNIT_KINDS, UNIT_STATES, latestUnitHistory } from './model.js';

export function parseRoster(input, project) {
  assert(typeof input === 'string' && input.length <= 2 * 1024 * 1024, '戶別名冊過大');
  const source = input.replace(/^\uFEFF/, ''), delimiter = source.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else { assert(quoted || !cell, 'CSV 引號位置不正確'); quoted = !quoted; } }
    else if (!quoted && (ch === delimiter || ch === '\n' || ch === '\r')) {
      row.push(cell.trim()); cell = '';
      if (ch !== delimiter) { if (row.some(Boolean)) rows.push(row); row = []; if (ch === '\r' && source[i + 1] === '\n') i++; }
    } else cell += ch;
  }
  assert(!quoted, 'CSV 引號未關閉'); row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  assert(rows.length > 1 && rows.length <= 1001, '每次請匯入 1 至 1000 戶，並保留標題列');
  const aliases = { '戶別': 'code', '戶號': 'code', '鑑定戶編號': 'code', code: 'code', '地址': 'address', address: 'address', '棟別': 'building', '群組': 'building', building: 'building', '種類': 'kind', kind: 'kind' };
  const columns = rows.shift().map(v => Object.hasOwn(aliases, v) ? aliases[v] : undefined);
  assert(columns.includes('code') && columns.every(Boolean) && new Set(columns).size === columns.length, '標題請使用：戶別、地址、棟別、種類；戶別必填');
  const seen = new Set(project.units.map(u => u.code.trim())), entries = [], errors = [];
  rows.forEach((row, i) => {
    const data = Object.fromEntries(columns.map((key, index) => [key, row[index] || '']));
    if (row.length > columns.length || !data.code || data.code.length > 150 || (data.address || '').length > 500 || (data.building || '').length > 100) { errors.push(`第 ${i + 2} 列：戶別或欄位內容不正確`); return; }
    if (seen.has(data.code)) { errors.push(`第 ${i + 2} 列：戶別 ${data.code} 重複，未自動覆蓋`); return; }
    const kinds = { '': 'residence', '住戶': 'residence', residence: 'residence', '公設': 'public', public: 'public' }, kind = Object.hasOwn(kinds, data.kind || '') ? kinds[data.kind || ''] : '';
    if (!kind) { errors.push(`第 ${i + 2} 列：種類限住戶或公設`); return; }
    seen.add(data.code); entries.push({ ...newUnit(data.code, data.address || ''), building: data.building || '', kind });
  });
  return { entries, errors };
}

export function createOrganisationController(api) {
  const { $, getProject, action, commit, openModal, closeModal, render, requireNoRecording, esc: e } = api;
  let currentProject = '', visitId = '';
  function renderVisits() {
    const p = getProject(); if (!p) return;
    if (p.id !== currentProject) { currentProject = p.id; visitId = p.visits?.at(-1)?.id || ''; }
    if (visitId && !p.visits?.some(v => v.id === visitId)) visitId = '';
    $('#visitSelect').innerHTML = '<option value="">尚未指定批次</option>' + (p.visits || []).map(v => `<option value="${e(v.id)}">${e(v.name)} · ${e(v.start)}${v.end !== v.start ? '～' + e(v.end) : ''}</option>`).join('');
    $('#visitSelect').value = visitId;
  }
  function dialog(editId = '') {
    requireNoRecording(); const p = getProject(), v = p.visits?.find(v => v.id === editId);
    openModal('會勘批次', `<div class="choice-chips">${(p.visits || []).map(v => `<button data-edit-visit="${e(v.id)}">${e(v.name)}</button>`).join('')}<button id="newVisitBatch">＋ 新批次</button></div><form id="visitForm"><label>批次名稱<input name="name" maxlength="100" required value="${e(v?.name || '第 ' + ((p.visits?.length || 0) + 1) + ' 次會勘')}"></label><div class="two-col"><label>開始日期<input name="start" type="date" required value="${e(v?.start || '')}"></label><label>結束日期<input name="end" type="date" required value="${e(v?.end || '')}"></label></div><p class="micro">單日會勘填同一天。每筆現況仍可確認實際日期；修改批次不改寫既有紀錄日期。</p><button class="primary">${v ? '保存批次' : '新增批次'}</button></form>`);
    $('#modalBody').onclick = ev => { const b = ev.target.closest('[data-edit-visit],#newVisitBatch'); if (b) dialog(b.dataset.editVisit || ''); };
    $('#visitForm').onsubmit = ev => { ev.preventDefault(); const data = new FormData(ev.target); action(async () => { const item = { id: v?.id || id(), name: data.get('name').trim(), start: data.get('start'), end: data.get('end') }; await commit(next => { next.visits ??= []; const index = next.visits.findIndex(x => x.id === item.id); if (index < 0) next.visits.push(item); else next.visits[index] = item; for (const u of next.units) { const latest = latestUnitHistory(next, u); if (latest) { u.status = latest.status; u.reason = latest.reason; } } }); visitId = item.id; closeModal(true); await render(); }); };
  }
  function rosterDialog() {
    requireNoRecording();
    openModal('批次新增戶別／公設', '<p>從 Excel 複製表格貼入，或讀取 UTF-8 CSV。標題列：戶別、地址、棟別、種類；種類填住戶或公設。</p><label>名冊內容<textarea id="rosterText" rows="7" maxlength="2097152" placeholder="戶別,地址,棟別,種類"></textarea></label><input id="rosterFile" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values"><button id="reviewRoster" class="primary">檢查名冊</button><div id="rosterPreview"></div>');
    $('#rosterFile').onchange = () => action(async () => { const file = $('#rosterFile').files[0]; if (!file) return; assert(file.size <= 2 * 1024 * 1024, '名冊請小於 2 MB'); $('#rosterText').value = await file.text(); $('#rosterPreview').replaceChildren(); });
    $('#rosterText').oninput = () => $('#rosterPreview').replaceChildren();
    $('#reviewRoster').onclick = () => action(async () => {
      const source = $('#rosterText').value, result = parseRoster(source, getProject());
      $('#rosterPreview').innerHTML = `<p>${result.entries.length} 戶可新增；${result.errors.length} 筆需修正。</p>${result.errors.slice(0, 20).map(x => `<p class="danger-text">${e(x)}</p>`).join('')}<div class="roster-scroll"><table><thead><tr><th>戶別</th><th>棟別</th><th>種類</th><th>地址</th></tr></thead><tbody>${result.entries.slice(0, 100).map(u => `<tr><td>${e(u.code)}</td><td>${e(u.building)}</td><td>${UNIT_KINDS[u.kind]}</td><td>${e(u.address)}</td></tr>`).join('')}</tbody></table></div>${result.entries.length > 100 ? '<p>預覽前 100 戶，保存時納入全部通過的戶別。</p>' : ''}<button id="applyRoster" class="primary" ${result.errors.length || !result.entries.length ? 'disabled' : ''}>新增 ${result.entries.length} 戶</button>`;
      $('#applyRoster').onclick = () => action(async () => { const checked = parseRoster(source, getProject()); assert(!checked.errors.length, '名冊已變更或戶號重複，請重新檢查'); await commit(p => p.units.push(...checked.entries)); closeModal(true); await render(); });
    });
  }
  $('#visitSelect').onchange = () => action(async () => { visitId = $('#visitSelect').value; });
  $('#manageVisits').onclick = () => action(() => dialog(visitId));
  $('#importRoster').onclick = () => action(rosterDialog);
  return { render: renderVisits, get visitId() { return visitId; }, get visit() { return getProject()?.visits?.find(v => v.id === visitId); } };
}

export function unitHistoryLabel(p, u) {
  return (u.visitHistory || []).map(h => `${p.visits?.find(v => v.id === h.visitId)?.name || ''} ${h.date || '日期未確認'} · ${UNIT_STATES[h.status]}${h.scope ? ' · ' + h.scope : ''}${h.reason ? ' · ' + h.reason : ''}`).join('\n');
}
