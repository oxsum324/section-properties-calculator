const NS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; };
export function drawMarks(svg, marks, width, height) {
  svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  for (const mark of marks) {
    const pts = mark.points.map(p => ({ x: p.x * width, y: p.y * height })), a = pts[0], b = pts.at(-1);
    const attrs = { fill: 'none', stroke: '#df443a', 'stroke-width': width / 165, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (mark.type === 'circle') svg.append(node('ellipse', { ...attrs, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 }));
    if (mark.type === 'pen') svg.append(node('polyline', { ...attrs, points: pts.map(p => `${p.x},${p.y}`).join(' ') }));
    if (mark.type === 'arrow') {
      const angle = Math.atan2(b.y - a.y, b.x - a.x), size = width / 35;
      svg.append(node('path', { ...attrs, d: `M${a.x} ${a.y}L${b.x} ${b.y}M${b.x - size * Math.cos(angle - .5)} ${b.y - size * Math.sin(angle - .5)}L${b.x} ${b.y}L${b.x - size * Math.cos(angle + .5)} ${b.y - size * Math.sin(angle + .5)}` }));
    }
    if (mark.type === 'text') { const t = node('text', { x: a.x, y: a.y, fill: '#c42e27', stroke: '#fff', 'stroke-width': width / 600, 'paint-order': 'stroke', 'font-family': 'sans-serif', 'font-size': width / 27, 'font-weight': '700' }); t.textContent = mark.text; svg.append(t); }
  }
}
function loadImage(url) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('此裝置無法預覽此影像格式；原檔仍可備份。')); img.src = url; }); }
export function placementMarks(q, title = '') {
  return q ? [{ type: 'arrow', points: [{ x: q.x, y: q.y }, { x: q.endX, y: q.endY }] },
    { type: 'circle', points: [{ x: q.x - .012, y: q.y - .012 }, { x: q.x + .012, y: q.y + .012 }] },
    ...(title ? [{ type: 'text', text: title, points: [{ x: Math.min(.75, q.x + .02), y: Math.max(.05, q.y - .02) }] }] : [])] : [];
}
export async function planPreview(stage, url, entries = []) {
  const img = await loadImage(url), svg = node('svg', { role: 'img', 'aria-label': '拍攝點、紀錄編號與方向' });
  img.alt = '平面位置圖'; drawMarks(svg, entries.flatMap(e => placementMarks(e.placement, e.label)), img.naturalWidth, img.naturalHeight);
  stage.classList.add('plan-preview'); stage.replaceChildren(img, svg);
}
export async function photoLocationImage(photoBlob, marks, planBlob, placement, labels) {
  const blobs = [await markedImage(photoBlob, marks), await markedImage(planBlob, placementMarks(placement, labels.record))], urls = blobs.map(b => URL.createObjectURL(b));
  try {
    const images = await Promise.all(urls.map(loadImage)), canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1900;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const text = (value, y, font = 32) => { ctx.font = `${font}px sans-serif`; ctx.fillStyle = '#244644'; let display = String(value); while (display.length && ctx.measureText(display).width > 1500) display = display.slice(0, -1); ctx.fillText(display.length < String(value).length ? display.slice(0, -1) + '…' : display, 50, y); };
    const contain = (img, y, height) => { const scale = Math.min(1500 / img.naturalWidth, height / img.naturalHeight); ctx.drawImage(img, (1600 - img.naturalWidth * scale) / 2, y, img.naturalWidth * scale, img.naturalHeight * scale); };
    text(labels.heading, 55, 36); text(labels.location, 100, 28); contain(images[0], 125, 900);
    text('位置圖：' + labels.plan, 1080); contain(images[1], 1100, 650);
    text('圓點＝拍攝點；箭頭＝拍攝方向。同筆照片共用本定位。', 1800, 28);
    text('照片與位置圖對照副本 · 圖面比例各自獨立 · 原始照片另行保存', 1850, 25);
    return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('位置對照副本產生失敗')), 'image/jpeg', .94));
  } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
}
export async function createAnnotator(stage, url, initial = [], onChange = () => {}) {
  const img = await loadImage(url), svg = node('svg', { 'aria-label': '圖面圈註區', role: 'img' });
  let marks = structuredClone(initial), mode = 'circle', text = '', draft = null, start = null, gesture = 'drag', anchor = null, pointerId = null;
  const history = [], w = img.naturalWidth, h = img.naturalHeight;
  stage.replaceChildren(img, svg);
  const resize = () => { stage.style.width = Math.min(stage.parentElement.clientWidth, innerHeight * .43 * w / h) + 'px'; };
  const observer = new ResizeObserver(resize); observer.observe(stage.parentElement); resize();
  const draw = () => drawMarks(svg, draft ? [...marks, draft] : marks, w, h);
  const point = event => { const r = svg.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) }; };
  svg.addEventListener('pointerdown', e => {
    if (mode === 'view' || e.button > 0 || e.isPrimary === false || pointerId !== null || marks.length >= 500) return;
    if (mode === 'text' && !text.trim()) return;
    e.preventDefault(); pointerId = e.pointerId;
    if (gesture === 'tap' && mode === 'arrow') { svg.setPointerCapture(e.pointerId); return; }
    svg.setPointerCapture(e.pointerId); start = point(e); draft = { type: mode, points: [start, start] };
    if (mode === 'text') { draft.points = [start]; draft.text = text.slice(0, 120); } draw();
  });
  svg.addEventListener('pointermove', e => { if (e.pointerId !== pointerId || !draft || (gesture === 'tap' && mode === 'arrow')) return; if (mode === 'pen') { if (draft.points.length < 1500) draft.points.push(point(e)); } else if (mode !== 'text') draft.points[1] = point(e); draw(); });
  const finish = e => {
    if (e.pointerId !== pointerId) return; pointerId = null;
    if (e.type === 'pointercancel') { draft = anchor = null; draw(); return; }
    if (gesture === 'tap' && mode === 'arrow') {
      const p = point(e);
      if (!anchor) { anchor = p; draw(); svg.append(node('circle', { cx: p.x * w, cy: p.y * h, r: w / 70, fill: '#df443a' })); return; }
      if (Math.hypot(anchor.x - p.x, anchor.y - p.y) < .006) return;
      history.push(structuredClone(marks)); marks.push({ type: 'arrow', points: [anchor, p] }); anchor = null; draw(); onChange(structuredClone(marks)); return;
    }
    if (!draft) return;
    if (e.type === 'pointercancel') { draft = null; draw(); return; }
    if (mode !== 'text' && mode !== 'pen') draft.points[1] = point(e);
    if (mode === 'circle' && Math.abs(draft.points[1].x - start.x) < .005) { draft.points = [{ x: Math.max(0, start.x - .03), y: Math.max(0, start.y - .03) }, { x: Math.min(1, start.x + .03), y: Math.min(1, start.y + .03) }]; }
    history.push(structuredClone(marks)); marks.push(draft); draft = null; draw(); onChange(structuredClone(marks));
  };
  svg.addEventListener('pointerup', finish); svg.addEventListener('pointercancel', finish); draw();
  return { get pending() { return !!(draft || anchor); }, get marks() { return structuredClone(marks); }, replace(value) { marks = structuredClone(value); draw(); }, setGesture(value) { gesture = value; draft = anchor = null; pointerId = null; draw(); }, setMode(value) { mode = value; draft = anchor = null; pointerId = null; stage.classList.toggle('view', value === 'view'); draw(); }, setText(value) { text = value; }, undo() { if (history.length) { marks = history.pop(); draw(); onChange(structuredClone(marks)); } }, clear() { history.push(structuredClone(marks)); marks = []; draw(); onChange([]); }, dispose() { observer.disconnect(); } };
}
export async function markedImage(blob, marks) {
  const source = URL.createObjectURL(blob);
  try {
    const img = await loadImage(source), canvas = document.createElement('canvas');
    const scale = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const svg = node('svg', { xmlns: NS, width: canvas.width, height: canvas.height }); drawMarks(svg, marks, canvas.width, canvas.height);
    const overlayURL = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try { ctx.drawImage(await loadImage(overlayURL), 0, 0); } finally { URL.revokeObjectURL(overlayURL); }
    return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('註記副本產生失敗')), 'image/jpeg', .94));
  } finally { URL.revokeObjectURL(source); }
}
