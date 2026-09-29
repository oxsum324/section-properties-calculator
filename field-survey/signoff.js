import { clone, id, now, sha256, recordsDigest, signoffHash, photoIncluded, unitIssues, latestUnitHistory, DEFAULT_SIGNING_STATEMENTS, UNIT_STATES, SIGNER_GROUPS, SIGNER_ROLES, assert } from './model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function proposedSignoff(p, unitId, visitId) {
  const unit = p.units.find(u => u.id === unitId), visit = p.visits.find(v => v.id === visitId);
  assert(unit && visit, '請先選擇戶別與會勘批次');
  const records = p.records.filter(r => r.unitId === unitId && r.visitId === visitId);
  const history = unit.visitHistory?.find(h => h.visitId === visitId) || latestUnitHistory(p, unit);
  const confirmed = records.map(r => r.observedOn).filter(Boolean);
  const commonDate = [...new Set(confirmed)].sort((a, b) => confirmed.filter(v => v === b).length - confirmed.filter(v => v === a).length)[0];
  const today = localDate();
  const date = history?.visitId === visitId && history.date || commonDate || today;
  return {
    id: id(), level: 'unit', unitId, visitId, date, weather: (p.signoffs || []).findLast(x => x.date === date && x.weather)?.weather || '', status: history?.status || unit.status,
    reason: history?.reason || unit.reason || '', scope: history?.scope || '',
    statement: { text: `住戶側：${p.signingSettings?.statement?.resident || DEFAULT_SIGNING_STATEMENTS.resident}\n會同人員：${p.signingSettings?.statement?.attendee || DEFAULT_SIGNING_STATEMENTS.attendee}`, revision: '1' },
    summary: {
      records: records.length, photos: records.flatMap(r => r.photos.filter(photoIncluded)).length,
      spaces: [...new Set(records.map(r => r.space.trim()).filter(Boolean))],
      inaccessible: records.filter(r => r.visibility === 'inaccessible').length,
      pending: unitIssues(p, unit).length
    },
    recordsDigest: '0'.repeat(64), snapshotHash: '0'.repeat(64), signers: [], createdAt: now(), updatedAt: now()
  };
}
export async function sealSignoff(p, x) {
  if (!x.recordsDigest || /^0+$/.test(x.recordsDigest)) x.recordsDigest = x.level === 'unit' ? await recordsDigest(p, x.unitId, x.visitId) : await sha256(new TextEncoder().encode('visit:' + x.visitId));
  x.snapshotHash = await signoffHash(p, x); x.updatedAt = now(); return x;
}
export function signoffStatus(p, unitId, visitId) {
  const records = (p.signoffs || []).filter(x => x.level === 'unit' && x.unitId === unitId && x.visitId === visitId);
  const current = records.at(-1); if (!current) return '未簽';
  const active = current.signers.filter(y => !y.voided);
  if (active.some(y => y.status === 'refused')) return '拒簽';
  if (active.some(y => y.status === 'absent')) return '不在場';
  const count = active.filter(y => ['signed', 'paper'].includes(y.status)).length;
  return count ? `已簽 ${count} 位` : '未簽';
}
export async function signoffChanged(p, x) {
  return x.level === 'unit' && x.signers.some(y => !y.voided) && (x.sourceChanged || x.recordsDigest !== await recordsDigest(p, x.unitId, x.visitId));
}
export function signoffFields(p, x) {
  const unit = p.units.find(u => u.id === x.unitId), visit = p.visits.find(v => v.id === x.visitId);
  const fields = {
    'project.code': p.code, 'project.name': p.name, 'unit.code': unit?.code || '',
    'unit.address': unit?.address || '', 'unit.building': unit?.building || '', 'unit.floor': unit?.floor || '',
    'unit.kind': unit?.kind === 'public' ? '公設' : '住戶', 'visit.name': visit?.name || '',
    'signoff.date': x.date, 'signoff.weather': x.weather, 'signoff.status': UNIT_STATES[x.status],
    'signoff.reason': x.reason, 'signoff.scope': x.scope, 'summary.records': String(x.summary.records),
    'summary.photos': String(x.summary.photos), 'summary.spaces': x.summary.spaces.join('、'),
    'summary.pending': String(x.summary.pending), statement: x.statement.text, 'signoff.code': x.snapshotHash.slice(0, 8)
  };
  for (const group of Object.keys(SIGNER_GROUPS)) {
    let n = 0;
    for (const y of x.signers.filter(y => y.group === group && !y.voided)) {
      n++; const key = `sig.${group}.${n}`;
      Object.assign(fields, { [`${key}.image`]: y.mediaId || '', [`${key}.name`]: y.name, [`${key}.role`]: SIGNER_ROLES[y.role],
        [`${key}.relation`]: y.relation, [`${key}.signedAt`]: y.signedAt, [`${key}.note`]: y.status === 'refused' ? y.reason : y.status === 'absent' ? '不在場' : y.status === 'paper' ? '紙本簽章' : '',
        [`${key}.org`]: y.org, [`${key}.title`]: y.title });
    }
  }
  return fields;
}
async function signoffHTMLPage(p, x, getMedia, { blank = false, changed = false, page = 1 } = {}) {
  const fields = signoffFields(p, x);
  const entries = ['unit.code', 'unit.address', 'unit.building', 'unit.floor', 'unit.kind', 'visit.name', 'signoff.date', 'signoff.weather', 'signoff.status', 'signoff.reason', 'signoff.scope', 'summary.records', 'summary.photos', 'summary.spaces']
    .map(key => `<tr><th>${esc(({ 'unit.code': '戶別', 'unit.address': '地址', 'unit.building': '棟別', 'unit.floor': '樓層', 'unit.kind': '單元種類', 'visit.name': '會勘批次', 'signoff.date': '會勘日期', 'signoff.weather': '天氣', 'signoff.status': '本次狀態', 'signoff.reason': '未完成／無法入內原因', 'signoff.scope': '會勘範圍', 'summary.records': '紀錄處數', 'summary.photos': '採用照片張數', 'summary.spaces': '紀錄空間' })[key])}</th><td>${esc(fields[key])}</td></tr>`).join('');
  const signerHTML = async group => {
    const signers = x.signers.filter(y => y.group === group && !y.voided);
    const cells = [];
    for (const y of signers) {
      let image = '';
      if (!blank && ['signed', 'paper'].includes(y.status)) {
        const asset = await getMedia(y.mediaId); assert(asset?.blob, '簽名或紙本影像遺失');
        const bytes = new Uint8Array(await asset.blob.arrayBuffer());
        let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        image = `<img src="data:${asset.blob.type};base64,${btoa(binary)}" alt="${esc(y.name)}${y.status === 'paper' ? '紙本簽章照片' : '簽名'}">`;
      }
      const note = y.status === 'refused' ? `住戶當場表示不願簽名，由鑑定人員記載如上。原因：${y.reason}` : y.status === 'absent' ? '本次會勘住戶未在場或未能簽名，由鑑定人員記載如上。' : y.status === 'paper' ? '紙本簽章，原件照片存於案件備份。' : y.source === 'profile' ? '（預存簽名）' : '';
      cells.push(`<div class="signer"><div class="ink">${image}</div><div>${esc(y.name)}　${esc(SIGNER_ROLES[y.role])}${y.relation ? '（' + esc(y.relation) + '）' : ''}</div><small>${esc([y.org, y.title, y.signedAt].filter(Boolean).join(' · '))}</small><small>${esc(note)}</small></div>`);
    }
    if (blank || !cells.length) cells.push('<div class="signer"><div class="ink"></div><div>姓名：＿＿＿＿＿＿　簽名／蓋章：＿＿＿＿＿＿</div></div>');
    return `<section class="signer-group"><h2>${SIGNER_GROUPS[group]}</h2><div class="signers">${cells.join('')}</div></section>`;
  };
  const groups = await Promise.all(Object.keys(SIGNER_GROUPS).map(signerHTML));
  const visitAttendees = (p.signoffs || []).filter(v => v.level === 'visit' && v.visitId === x.visitId && v.date === x.date).flatMap(v => v.signers.filter(y => y.group === 'attendee' && !y.voided && y.status === 'signed').map(y => y.name));
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="condition-survey-private" content="signoff"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'"><title>${esc(p.code)} ${esc(fields['unit.code'])} 會勘簽認單</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif;color:#111;margin:0;background:#eee}.sheet{width:210mm;min-height:297mm;margin:auto;background:white;padding:10mm;page-break-after:always;display:flex;flex-direction:column}h1{text-align:center;font-size:18pt;margin:2mm 0 4mm}h2{font-size:11pt;margin:2mm 0 1mm}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:1mm;text-align:left;font-size:9pt}th{width:34mm;background:#f5f5f5}.statement{border:1px solid #555;padding:2mm;margin:2mm 0;white-space:pre-wrap;font-size:9pt}.signers{display:flex;flex-wrap:wrap;gap:3mm}.signer{border:1px solid #888;width:48%;min-height:22mm;padding:1.5mm;font-size:8pt}.ink{height:12mm}.ink img{max-width:100%;max-height:100%;object-fit:contain}.signer small{display:block}footer{margin-top:auto;padding-top:2mm;font-size:8pt;color:#555}@media print{body{background:white}.sheet{margin:0;padding:0;width:auto;min-height:273mm}}</style></head><body><article class="sheet"><h1>建築物現況會勘簽認單</h1><p>案號：${esc(p.code)}　案名：${esc(p.name)}</p><table>${entries}</table><p>簽署時本戶待補 ${x.summary.pending} 項${x.summary.inaccessible ? `；無法觀察位置 ${x.summary.inaccessible} 處` : ''}。</p><div class="statement">${esc(x.statement.text)}</div>${groups.join('')}${visitAttendees.length ? `<p>當日會同人員：${esc(visitAttendees.join('、'))}；詳 ${esc(x.date)} 簽到表。</p>` : ''}${changed ? '<p>簽署後紀錄有更動，請核對案件紀錄。</p>' : ''}<footer>簽認識別短碼：${esc(fields['signoff.code'])}　｜　觸控簽名，非數位簽章　｜　第 ${page} 頁</footer></article></body></html>`;
}
export async function signoffHTML(p, x, getMedia, options = {}) {
  const active = x.signers.filter(y => !y.voided);
  if (options.blank || active.length <= 2) return signoffHTMLPage(p, x, getMedia, options);
  const chunks = Array.from({ length: Math.ceil(active.length / 2) }, (_, i) => active.slice(i * 2, i * 2 + 2));
  const parser = new DOMParser();
  const doc = parser.parseFromString(await signoffHTMLPage(p, { ...x, signers: chunks[0] }, getMedia, options), 'text/html');
  for (let i = 1; i < chunks.length; i++) {
    const other = parser.parseFromString(await signoffHTMLPage(p, { ...x, signers: chunks[i] }, getMedia, { ...options, page: (options.page || 1) + i }), 'text/html');
    doc.body.append(other.querySelector('.sheet'));
  }
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
export async function signoffPNG(p, x, getMedia, { blank = false, changed = false, page = 1 } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext('2d'), left = 78, right = 1162, line = 36;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#111';
  const font = (size, bold = false) => { ctx.font = `${bold ? 'bold ' : ''}${size}px 'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif`; };
  function wrap(value, maxWidth) {
    const rows = []; let row = '';
    for (const char of String(value ?? '')) {
      if (char === '\n') { rows.push(row); row = ''; continue; }
      if (ctx.measureText(row + char).width > maxWidth && row) { rows.push(row); row = char; } else row += char;
    }
    rows.push(row); return rows;
  }
  let y = 96; font(40, true); ctx.textAlign = 'center'; ctx.fillText('建築物現況會勘簽認單', 620, y); ctx.textAlign = 'left'; y += 72;
  font(23); for (const row of wrap(`案號：${p.code}　案名：${p.name}`, right - left)) { ctx.fillText(row, left, y); y += line; }
  const f = signoffFields(p, x), rows = [['戶別', f['unit.code']], ['地址', f['unit.address']], ['棟別／樓層', `${f['unit.building']} ${f['unit.floor']}`], ['會勘日期／天氣', `${x.date}　${x.weather}`], ['會勘批次', f['visit.name']], ['本次狀態', f['signoff.status']], ['原因／範圍', `${x.reason} ${x.scope}`], ['紀錄摘要', `${x.summary.records} 處、${x.summary.photos} 張、待補 ${x.summary.pending} 項`], ['空間', f['summary.spaces']]];
  for (const [label, value] of rows) {
    const height = Math.max(50, wrap(value, 770).length * 30 + 14);
    ctx.strokeStyle = '#777'; ctx.strokeRect(left, y - 29, right - left, height); ctx.beginPath(); ctx.moveTo(340, y - 29); ctx.lineTo(340, y - 29 + height); ctx.stroke();
    font(22, true); ctx.fillText(label, left + 12, y); font(22);
    for (const part of wrap(value, right - 355)) { ctx.fillText(part, 355, y); y += 30; }
    y += height - Math.max(1, wrap(value, right - 355).length) * 30;
  }
  y += 25; font(21); for (const part of wrap(x.statement.text, right - left)) { ctx.fillText(part, left, y); y += 30; }
  y += 24;
  for (const group of Object.keys(SIGNER_GROUPS)) {
    font(25, true); ctx.fillText(SIGNER_GROUPS[group], left, y); y += 16;
    const signers = x.signers.filter(s => s.group === group && !s.voided);
    for (const signer of signers.length ? signers : [{ name: '＿＿＿＿＿＿', role: group, status: 'paper' }]) {
      assert(y + 124 <= 1660, '簽認單 PNG 內容超過一頁，請縮短聲明或改用 HTML 列印');
      ctx.strokeStyle = '#777'; ctx.strokeRect(left, y, right - left, 114);
      if (!blank && signer.mediaId && ['signed', 'paper'].includes(signer.status)) {
        const asset = await getMedia(signer.mediaId); assert(asset?.blob, '簽名影像遺失');
        const bitmap = await createImageBitmap(asset.blob);
        const scale = Math.min(390 / bitmap.width, 86 / bitmap.height);
        ctx.drawImage(bitmap, left + 12, y + 5 + (86 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
        bitmap.close();
      }
      font(21); ctx.fillText(`${signer.name}　${SIGNER_ROLES[signer.role] || ''}　${signer.relation || ''}`, 520, y + 38);
      font(17); for (const part of wrap(`${signer.signedAt || ''}　${signer.status === 'refused' ? '拒簽：' + signer.reason : signer.status === 'absent' ? '不在場' : signer.status === 'paper' ? '紙本簽章' : ''}`, 625)) ctx.fillText(part, 520, y + 73);
      y += 124;
    }
    y += 15;
  }
  if (changed) { font(21, true); ctx.fillText('簽署後紀錄有更動，請核對案件紀錄。', left, Math.min(y + 10, 1665)); }
  ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(left, 1680); ctx.lineTo(right, 1680); ctx.stroke();
  font(18); ctx.fillText(`簽認識別短碼：${x.snapshotHash.slice(0, 8)}　｜　觸控簽名，非數位簽章　｜　第 ${page} 頁`, left, 1712);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
export async function signoffPNGs(p, x, getMedia, options = {}) {
  const active = x.signers.filter(y => !y.voided);
  const chunks = options.blank || active.length <= 2 ? [x.signers] : Array.from({ length: Math.ceil(active.length / 2) }, (_, i) => active.slice(i * 2, i * 2 + 2));
  const images = [];
  for (const [i, signers] of chunks.entries()) images.push(await signoffPNG(p, { ...x, signers }, getMedia, { ...options, page: (options.page || 1) + i }));
  return images;
}
