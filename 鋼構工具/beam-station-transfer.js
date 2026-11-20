import { validBrace, sameBraceStation } from './beam-brace-segment.js';
// 同源視窗交換站位與側撐段候選。保留既有站位鍵，並依同一分析來源核對修次。
const prefix = 'structToolbox.beamStation.v1.';
const units = {
  'kN-m': { m: 'kN·m', v: 'kN', l: 'm', moment: 1 / 9.80665, force: 1 / 9.80665, length: 100 },
  'tf-m': { m: 'tf·m', v: 'tf', l: 'm', moment: 1, force: 1, length: 100 },
  'kgf-cm': { m: 'kgf·cm', v: 'kgf', l: 'cm', moment: 1 / 100000, force: 1 / 1000, length: 1 },
};
const basisLabels = { factored: '已因數化', unfactored: '未因數化', unconfirmed: '未確認' };
const sideLabels = { left: '左側', right: '右側', continuous: '連續截面' };
const analysisUnits = {
  'kN-m': ['kN/m²', 'm⁴'],
  'tf-m': ['tf/m²', 'm⁴'],
  'kgf-cm': ['kgf/cm²', 'cm⁴'],
};
const materialLabels = { steel: '鋼材', concrete: '混凝土', custom: '自訂' };
const digest = value => globalThis.StructReportUtils.sha256Text(JSON.stringify(value));
export const scopeOf = p => digest([p.project, p.member]);
const display = n => String(Number(n.toPrecision(8)));
const cleanText = value => typeof value === 'string' && value.length <= 100 && value.trim() === value;

function analysisFields(source) {
  const fields = [source.pageVersion, source.engine, source.material, source.elasticModulus,
    source.elasticModulusUnit, source.elasticModulusBasis, source.inertia, source.inertiaUnit,
    source.inertiaBasis, source.sectionBasis];
  if (source.frame) {
    const f = source.frame;
    fields.push([f.i, f.j, f.cosine, f.sine, f.releaseI, f.releaseJ, f.maxAbsAxialTf]);
  }
  return fields;
}

function validFrameSource(frame, unitKey) {
  return frame && unitKey === 'tf-m' && [frame.i, frame.j].every(id => Number.isSafeInteger(id) && id > 0)
    && frame.i !== frame.j && [frame.cosine, frame.sine, frame.maxAbsAxialTf].every(Number.isFinite)
    && Math.abs(Math.hypot(frame.cosine, frame.sine) - 1) < 1e-8
    && frame.maxAbsAxialTf >= 0 && frame.maxAbsAxialTf <= 1e-8
    && [frame.releaseI, frame.releaseJ].every(value => typeof value === 'boolean');
}

function validAnalysis(source, unitKey) {
  if (!source || typeof source !== 'object') return false;
  const [eUnit, iUnit] = analysisUnits[unitKey];
  const cleanBasis = text => typeof text === 'string' && text.length <= 160 && text.trim() === text;
  return cleanText(source.pageVersion) && !!source.pageVersion && cleanText(source.engine) && !!source.engine
    && Object.hasOwn(materialLabels, source.material)
    && [source.elasticModulus, source.inertia].every(value => Number.isFinite(value) && value > 0)
    && source.elasticModulusUnit === eUnit && source.inertiaUnit === iUnit
    && (!Object.hasOwn(source, 'frame') || validFrameSource(source.frame, unitKey))
    && [source.elasticModulusBasis, source.inertiaBasis, source.sectionBasis].every(cleanBasis);
}

function packetId(p) {
  const fields = [p.project, p.member, p.revision, p.caseName, p.combination, p.basis, p.fingerprint,
    p.units, p.span, p.x, p.side, p.length, p.moment, p.shear];
  if (p.analysis) fields.push(analysisFields(p.analysis));
  return digest(fields);
}

export function validPacket(p) {
  return Boolean(p && typeof p === 'object' && p.kind === 'beam-station-v1' && !('P' in p)
    && [p.project, p.member, p.caseName, p.combination].every(cleanText)
    && p.project && p.member && p.caseName && /^[a-f0-9]{64}$/i.test(p.fingerprint)
    && Object.hasOwn(units, p.units) && Object.hasOwn(basisLabels, p.basis) && Object.hasOwn(sideLabels, p.side)
    && Number.isSafeInteger(p.revision) && p.revision > 0 && Number.isSafeInteger(p.span) && p.span > 0
    && [p.x, p.length, p.moment, p.shear].every(Number.isFinite) && p.length > 0 && p.x >= 0 && p.x <= p.length
    && (!Object.hasOwn(p, 'analysis') || validAnalysis(p.analysis, p.units))
    && p.id === packetId(p));
}

function designValues(p) {
  const u = units[p.units];
  return { moment: Math.abs(p.moment) * u.moment, shear: Math.abs(p.shear) * u.force, spanCm: p.length * u.length };
}

function identity(p) {
  return [p.project, p.member, p.caseName, p.combination, 'R' + p.revision].filter(Boolean).join(' ／ ');
}

export function stationText(p) {
  const u = units[p.units];
  const anchor = p.analysis?.frame ? '桿件 i 端起算' : `第 ${p.span} 跨`;
  const station = `${identity(p)}｜${anchor} x = ${display(p.x)} ${u.l}（${sideLabels[p.side]}）｜M = ${display(p.moment)} ${u.m}、V = ${display(p.shear)} ${u.v}｜${basisLabels[p.basis]}｜來源指紋 ${p.fingerprint}`;
  if (!p.analysis) return station;
  const a = p.analysis;
  const inertiaBasis = [a.sectionBasis, a.inertiaBasis].filter(Boolean).join('／') || '依據待補';
  const tool = a.frame ? '平面剛架' : '連續梁';
  const frameDetails = a.frame ? `｜局部正 x：N${a.frame.i} → N${a.frame.j}（cos θ=${display(a.frame.cosine)}，sin θ=${display(a.frame.sine)}）`
    + `｜端部彎矩釋放 i=${a.frame.releaseI ? '有' : '無'}、j=${a.frame.releaseJ ? '有' : '無'}｜桿件 |N| 最大 ${display(a.frame.maxAbsAxialTf)} tf` : '';
  return station + `｜${tool} ${a.pageVersion}（${a.engine}）｜${materialLabels[a.material]} E = ${display(a.elasticModulus)} ${a.elasticModulusUnit}`
    + `（${a.elasticModulusBasis || '依據待補'}）｜基準 I = ${display(a.inertia)} ${a.inertiaUnit}（${inertiaBasis}）` + frameDetails;
}

function station(span, index) {
  const x = span.xs[index];
  const adjacent = j => Math.abs(span.xs[j] - x) < 1e-9;
  const side = adjacent(index + 1) ? 'left' : adjacent(index - 1) ? 'right'
    : index === 0 ? 'right' : index === span.xs.length - 1 ? 'left' : 'continuous';
  return { x: Math.min(span.L, Math.max(0, x - span.xStart)), side, length: span.L,
    moment: span.ms[index], shear: span.vs[index] };
}

export function showSender(host, model) {
  if (!host.querySelector('form')) {
    host.innerHTML = `<form>
      <div class="form-group form-row3"><label>案號 <input name="project" maxlength="100" required></label>
      <label>構件編號 <input name="member" maxlength="100" required></label>
      <label>修次 <input name="revision" type="number" min="1" step="1" value="1" required></label></div>
      <div class="form-group form-row3"><label>載重案例 <input name="caseName" maxlength="100" required></label>
      <label>實際組合識別（選填） <input name="combination" maxlength="100"></label>
      <label>載重基準 <select name="basis"><option value="unconfirmed">未確認</option><option value="factored">已因數化</option><option value="unfactored">未因數化</option></select></label></div>
      <div class="form-group form-row"><label>跨別 <select name="span"></select></label>
      <label>距跨左端站位 <select name="section"></select></label></div>
      <button type="submit" class="btn btn-sm">送出站位候選</button>
      <a target="_blank" rel="noopener" hidden>開啟此構件的鋼梁核對視窗</a>
      <p role="status"></p></form>`;
  }
  const form = host.querySelector('form');
  const f = form.elements;
  const status = form.querySelector('[role=status]');
  const link = form.querySelector('a');
  if (form.dataset.project !== model.project) {
    form.reset();
    f.project.value = model.project;
    form.dataset.project = model.project;
  }
  if (model.member) {
    f.member.value = model.member;
    f.member.readOnly = true;
  }
  if (model.combination) {
    f.caseName.value = model.combination.name;
    f.combination.value = model.combination.id;
    f.caseName.readOnly = f.combination.readOnly = true;
  }
  function resetReceipt() { link.hidden = true; status.textContent = ''; }
  form.oninput = resetReceipt;
  resetReceipt();
  const oldSpan = f.span.selectedIndex;
  f.span.replaceChildren(...model.spans.map((_, i) => new Option(model.member || ('第 ' + (i + 1) + ' 跨'), i)));
  f.span.selectedIndex = oldSpan >= 0 && oldSpan < model.spans.length ? oldSpan : 0;
  function sections() {
    const sp = model.spans[f.span.selectedIndex];
    const u = units[model.units];
    f.section.replaceChildren(...sp.xs.map((_, i) => {
      const s = station(sp, i);
      return new Option(`${display(s.x)} ${u.l}・${sideLabels[s.side]}　M ${display(s.moment)} ${u.m}　V ${display(s.shear)} ${u.v}`, i);
    }));
  }
  sections();
  let panel = host.querySelector('.brace-panel');
  if (!panel && !model.analysis?.frame) {
    panel = document.createElement('details'); panel.className = 'brace-panel';
    panel.innerHTML = '<summary>選取未側撐段與 Cb 計算方法</summary><div class="brace-sender"></div>';
    host.append(panel);
  }
  const setupBrace = async () => {
    if(!panel.open)return;
    const transfer = await import('./beam-brace-transfer.js');
    if(model.isCurrent() && panel.open) transfer.showBraceSender(panel.lastElementChild,model,form);
  };
  if (panel) {
    panel.ontoggle = setupBrace;
    if(panel.open)setupBrace();
  }
  f.span.onchange = sections;
  form.onsubmit = e => {
    e.preventDefault();
    resetReceipt();
    if (!model.isCurrent()) { status.textContent = '來源輸入已變動，請重新分析。'; return; }
    const spanIndex = f.span.selectedIndex;
    const p = { kind: 'beam-station-v1', project: f.project.value.trim(), member: f.member.value.trim(),
      caseName: f.caseName.value.trim(), combination: f.combination.value.trim(), revision: Number(f.revision.value),
      basis: f.basis.value, units: model.units, fingerprint: model.fingerprint, span: spanIndex + 1,
      analysis: model.analysis,
      ...station(model.spans[spanIndex], f.section.selectedIndex) };
    p.id = packetId(p);
    if (!validPacket(p)) { status.textContent = '請確認案號、構件、修次、案例、站位數值與正值 E、I。'; return; }
    const scope = scopeOf(p);
    try { localStorage.setItem(prefix + scope + '.' + p.id, JSON.stringify(p)); }
    catch { status.textContent = '瀏覽器無法儲存候選。請確認同源儲存空間或容量。'; return; }
    link.href = model.route + '?stations=' + scope;
    link.hidden = false;
    status.textContent = '已送出 ' + identity(p) + '。已開啟的核對視窗會同步收到。';
  };
}

export function readPackets(scope) {
  const groupPrefix = prefix + scope + '.';
  const rows = [];
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(groupPrefix)) continue;
    try {
      const p = JSON.parse(localStorage.getItem(key));
      if ((validPacket(p) || validBrace(p)) && scopeOf(p) === scope && key === groupPrefix + p.id) rows.push(p);
    } catch { /* 不完整的單筆紀錄不影響其他站位。 */ }
  }
  return rows.sort((a, b) => b.revision - a.revision || a.caseName.localeCompare(b.caseName)
    || a.kind.localeCompare(b.kind) || (a.span || 0) - (b.span || 0)
    || (a.x ?? a.selection.start) - (b.x ?? b.selection.start) || (a.side || '').localeCompare(b.side || '') || a.id.localeCompare(b.id));
}

export function revisionStatus(p, rows) {
  const series = rows.filter(r => r.caseName === p.caseName && r.combination === p.combination);
  if (series.some(r => r.revision > p.revision)) return '舊修次';
  const analysis = p.analysis && digest(analysisFields(p.analysis));
  if (series.some(r => r.revision === p.revision && (r.fingerprint !== p.fingerprint || r.basis !== p.basis
      || (analysis && r.analysis && analysis !== digest(analysisFields(r.analysis)))))) return '同修次來源衝突，請增加修次重送';
  return '有效修次';
}

export function openReceiver(host, scope, api) {
  host.hidden = false;
  host.innerHTML = `<h2>同站內力核對</h2>
    <label class="form-group">案號、構件與站位候選 <select id="stationCandidate" style="max-width:100%"></select></label>
    <p id="stationIncoming" class="candidate-review__source"></p><p id="stationCurrent" class="candidate-review__source"></p>
    <label class="candidate-review__confirm"><input type="checkbox" id="stationConfirm"> 我已核對案號、構件、載重基準及同站內力，採用此列的需求絕對值與跨長。</label>
    <button type="button" class="btn-calc" id="stationApply" disabled>套用此站位</button><p role="status" id="stationStatus"></p>`;
  const el = id => host.querySelector('#' + id);
  const list = el('stationCandidate'), confirm = el('stationConfirm'), apply = el('stationApply');
  const status = el('stationStatus');
  let reviewed = '';
  function refresh() {
    const previousId = list.value;
    const rows = readPackets(scope);
    host.hidden = !!rows.length && rows.every(p=>p.kind!=='beam-station-v1');
    list.replaceChildren(...rows.filter(p=>p.kind==='beam-station-v1').map(p => new Option(`${identity(p)}｜跨 ${p.span}・${display(p.x)} ${units[p.units].l}・${sideLabels[p.side]}｜${revisionStatus(p, rows)}`, p.id)));
    if (rows.some(p => p.id === previousId)) list.value = previousId;
    const p = rows.find(r => r.id === list.value);
    const current = api.current();
    const demandText = v => `|M| ${display(v.moment)} tf·m，|V| ${display(v.shear)} tf，L ${display(v.spanCm)} cm`;
    el('stationCurrent').textContent = '正式輸入　' + demandText(current) + '｜' + current.source;
    el('stationIncoming').textContent = p ? '候選　' + stationText(p) + '｜' + demandText(designValues(p))
      + (p.analysis?.frame ? '｜接收 M/V' : '｜P 未提供') : '';
    let message = p ? revisionStatus(p, rows) : '目前沒有此構件的站位候選。';
    if (message === '有效修次') {
      if (current.project && current.project !== p.project) message = '正式案號與候選案號不同。';
      else if (current.brace && !sameBraceStation(p,current.brace)) message = '站位與已採用未側撐段的來源或段界不符，請先解除段採用。';
      else if (p.basis !== (current.method === 'LRFD' ? 'factored' : 'unfactored')) message = '請核對載重基準與目前設計方法 ' + current.method + '。';
    }
    const token = JSON.stringify([p?.id, current, message]);
    if (reviewed !== token) confirm.checked = false;
    reviewed = token;
    confirm.disabled = message !== '有效修次';
    apply.disabled = confirm.disabled || !confirm.checked;
    status.textContent = message;
    return p;
  }
  list.onchange = refresh;
  confirm.onchange = refresh;
  apply.onclick = () => {
    const p = refresh();
    if (!p || apply.disabled) return;
    api.adopt(p, designValues(p), stationText(p));
    confirm.checked = false;
    refresh();
    status.textContent = '已套用此站位。請核對其餘設計條件並重新執行檢核。';
  };
  window.addEventListener('storage', e => { if (!e.key || e.key.startsWith(prefix + scope + '.')) refresh(); });
  window.addEventListener('steel-beam-source-restored', refresh);
  document.addEventListener('change', e => { if (!host.contains(e.target)) refresh(); });
  document.addEventListener('click', e => { if (e.target.closest('#btnLRFD,#btnASD,#beamUnitModeSiBtn,#beamUnitModeLegacyBtn')) refresh(); });
  refresh();
}

export function saveBrace(p) {
  if(!validBrace(p))throw new Error('未側撐段未通過資料核對。');
  const scope=scopeOf(p);
  localStorage.setItem(prefix+scope+'.'+p.id,JSON.stringify(p));
  return scope;
}
