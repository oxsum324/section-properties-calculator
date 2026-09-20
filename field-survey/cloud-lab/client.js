const $ = s => document.querySelector(s), uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
let room = location.hash.slice(1), previous, items = [], localBlob, localURL;
const say = text => { $('#status').textContent = text; };
const size = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' MB' : (n / 1000).toFixed(1) + ' KB';
const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data))].map(x => x.toString(16).padStart(2, '0')).join('');
function save(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
async function api(path, options = {}) {
  const r = await fetch(path, { ...options, headers: { 'X-Test-Room': room, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(30000) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || '連線未完成'); return data;
}
async function act(fn) {
  const buttons = [...document.querySelectorAll('button')], states = buttons.map(b => b.disabled); buttons.forEach(b => b.disabled = true);
  try { await fn(); } catch (e) { say('未完成：' + e.message); }
  finally { buttons.forEach((b, i) => b.disabled = states[i]); $('#retry').disabled = !previous; $('#saveLocal').disabled = !localBlob; }
}
function setRoom(value) { room = uuid.test(value) ? value : crypto.randomUUID(); history.replaceState(null, '', '#' + room); $('#roomLink').value = location.href; previous = null; items = []; $('#retry').disabled = true; }
function grouped() { const map = new Map(); for (const item of items) { const group = map.get(item.location) || []; group.push(item); map.set(item.location, group); } return map; }
async function refresh() {
  const data = await api('/api/submissions'); items = data.items; $('#items').replaceChildren(); $('#count').textContent = items.length + ' 筆雲端提交';
  for (const [location, group] of grouped()) {
    const el = document.createElement('article'), title = document.createElement('strong'); title.textContent = location; el.append(title);
    for (const item of group) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = `同事${item.contributor} · ${item.condition} · ${item.quality} PPI`; el.append(p); }
    const conditions = [...new Set(group.map(x => x.condition))];
    if (conditions.length > 1) { const label = document.createElement('label'); label.className = 'conflict'; label.textContent = '內容不同，請決定：'; const select = document.createElement('select'); select.dataset.resolve = location;
      for (const [value, text] of [['', '尚未選擇'], ['all', '兩種狀況都保留'], ...conditions.map(c => [c, '保留：' + c])]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); } label.append(select); el.append(label);
    } else { const p = document.createElement('p'); p.className = 'muted'; p.textContent = group.length > 1 ? '相同狀況：整合為一筆，保留全部照片與採集來源。' : '新增位置：可整合。'; el.append(p); }
    $('#items').append(el);
  }
  if (!items.length) $('#items').textContent = '還沒有提交，請先模擬同事甲上傳。';
}
async function submit(p) { say('正在上傳合成照片並核對…'); const data = await api('/api/submissions', { method: 'POST', body: JSON.stringify(p) }); await refresh(); say(data.message + '。可在另一個瀏覽器開啟同一空間連結。'); }
$('#newRoom').onclick = () => act(async () => { setRoom(crypto.randomUUID()); await refresh(); say('已建立新的測試空間，原空間資料保留。'); });
$('#copyRoom').onclick = () => act(async () => { await navigator.clipboard.writeText(location.href); say('已複製，可傳給同事或在另一台裝置開啟。'); });
$('#refresh').onclick = () => act(async () => { await refresh(); say('已取得最新提交。'); });
$('#submit').onclick = () => act(async () => {
  const quality = $('#quality').value, fixture = await api('/sample/' + quality);
  previous = { id: crypto.randomUUID(), contributor: $('#contributor').value, location: $('#location').value, condition: $('#condition').value, quality, photo: fixture.base64 };
  await submit(previous);
});
$('#retry').onclick = () => act(() => submit(previous));
$('#merge').onclick = () => act(async () => {
  if (!items.length) throw new Error('尚無提交可整合');
  for (const select of document.querySelectorAll('[data-resolve]')) if (!select.value) throw new Error('請先核對 ' + select.dataset.resolve + ' 的不同狀況');
  const output = [];
  for (const [location, group] of grouped()) {
    const decision = [...document.querySelectorAll('[data-resolve]')].find(s => s.dataset.resolve === location)?.value || 'all';
    const sources = [];
    for (const item of group) {
      const { package: p, digest } = await api('/api/submissions/' + item.id);
      const canonical = JSON.stringify({ contributor: p.contributor, location: p.location, condition: p.condition, quality: p.quality, photo: p.photo });
      const photo = Uint8Array.from(atob(p.photo), c => c.charCodeAt(0));
      if (await hash(canonical) !== digest || digest !== item.digest || await hash(photo) !== p.photoSha256) throw new Error('內容核對不符，請重新取得提交');
      sources.push({ ...p, adopted: decision === 'all' || decision === p.condition });
    }
    output.push({ location, decision, conditions: [...new Set(sources.filter(s => s.adopted).map(s => s.condition))], sources });
  }
  save(new Blob([JSON.stringify({ kind: 'field-survey-cloud-lab-merged', version: 1, syntheticOnly: true, createdAt: new Date().toISOString(), records: output }, null, 2)], { type: 'application/json' }), '雲端整合-合成測試包.json');
  say('下載前已核對全部照片及紀錄指紋；採用與未採用來源都保留在測試包。');
});
$('#file').onchange = () => { localBlob = null; $('#saveLocal').disabled = true; if (localURL) URL.revokeObjectURL(localURL); $('#localPreview').hidden = true; $('#localStats').textContent = '選好列印寬度與品質後，按「試算壓縮」。'; };
$('#compress').onclick = () => act(async () => {
  const file = $('#file').files[0], cm = Number($('#width').value), ppi = Number($('#ppi').value);
  if (!file || !['image/jpeg', 'image/png'].includes(file.type)) throw new Error('請選取 JPEG 或 PNG 照片');
  if (file.size > 20 * 1024 * 1024 || !(cm >= 5 && cm <= 20)) throw new Error('測試限 20 MB 以下照片、列印寬度 5～20 公分');
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (img.width * img.height > 60000000) throw new Error('照片超過測試像素上限');
    const ratio = Math.min(1, Math.round(cm / 2.54 * ppi) / img.width), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * ratio)); canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    localBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86)); if (!localBlob) throw new Error('無法產生壓縮照片');
    if (localURL) URL.revokeObjectURL(localURL); localURL = URL.createObjectURL(localBlob); $('#localPreview').src = localURL; $('#localPreview').hidden = false;
    const change = (1 - localBlob.size / file.size) * 100;
    $('#localStats').textContent = `原檔 ${size(file.size)} → 副本 ${size(localBlob.size)}（${change >= 0 ? '減少' : '增加'} ${Math.abs(change).toFixed(1)}%）\n${canvas.width} × ${canvas.height} 像素；以 ${cm} 公分寬列印，實際約 ${Math.round(canvas.width / (cm / 2.54))} PPI。\n請放大檢查裂縫、量尺與文字；原始照片保留，未上傳。`;
    say('本機照片試算完成。');
  } finally { img.close(); }
});
$('#saveLocal').onclick = () => { if (localBlob) save(localBlob, '報告照片-壓縮副本.jpg'); };
// Following another space link in the same tab must replace all in-memory state.
window.addEventListener('hashchange', () => location.reload());
setRoom(room); act(refresh);
