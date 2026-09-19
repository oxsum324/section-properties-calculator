// Layout coordinates describe the printed label, never the survey placement.
export const sameLabelTarget = (a, b) => a.kind === b.kind && a.id === b.id && (a.kind !== 'photo' || a.recordId === b.recordId);
export const labelAnchor = entry => [entry.placement.x, entry.placement.y, entry.placement.endX, entry.placement.endY];
const overlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
export function segmentHitsBox(a, b, box, pad = 0) {
  const minX = box.x - pad, maxX = box.x + box.w + pad, minY = box.y - pad, maxY = box.y + box.h + pad;
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, minX, maxX], [a.y, b.y - a.y, minY, maxY]]) {
    if (Math.abs(delta) < 1e-10) { if (origin < min || origin > max) return false; }
    else { const x = (min - origin) / delta, y = (max - origin) / delta; lo = Math.max(lo, Math.min(x, y)); hi = Math.min(hi, Math.max(x, y)); if (lo > hi) return false; }
  }
  return true;
}
export function planLabelLayout(items, width, height, { segments = [], points = items.map(p => ({ x: p.ax, y: p.ay, r: 0 })), strict = true } = {}) {
  const gap = width / 160, placed = [];
  const collides = box => box.x < gap || box.y < gap || box.x + box.w > width - gap || box.y + box.h > height - gap ||
    placed.some(p => overlap(box, p, gap)) || points.some(p => Math.hypot(p.x - Math.max(box.x, Math.min(box.x + box.w, p.x)), p.y - Math.max(box.y, Math.min(box.y + box.h, p.y))) <= p.r + gap) ||
    segments.some(s => segmentHitsBox(s.a, s.b, box, (s.pad || 0) + gap));
  // Reserve locked positions first so automatic labels cannot displace them.
  const order = items.map((item, index) => ({ item, index })).sort((a, b) => Number(!!b.item.preferred?.locked) - Number(!!a.item.preferred?.locked));
  for (const { item, index } of order) {
    const { w, h, ax, ay, preferred } = item; let box, invalid = false;
    if (preferred) {
      const candidate = { x: preferred.x * width, y: preferred.y * height, w, h };
      if (preferred.locked || !collides(candidate)) { box = candidate; invalid = collides(candidate); }
    }
    if (!box) {
      const candidates = [], add = (x, y) => { const b = { x: Math.max(gap, Math.min(width - w - gap, x)), y: Math.max(gap, Math.min(height - h - gap, y)), w, h }; if (!collides(b)) candidates.push(b); };
      for (let ring = 0; ring < 16 && !candidates.length; ring++) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (dx || dy) add(ax + (dx < 0 ? -w - gap : dx > 0 ? gap : -w / 2) + dx * ring * gap * 3, ay + (dy < 0 ? -h - gap : dy > 0 ? gap : -h / 2) + dy * ring * gap * 3);
      if (!candidates.length) for (let y = gap; y + h < height && candidates.length < 40; y += Math.max(gap, h / 2)) for (let x = gap; x + w < width && candidates.length < 40; x += Math.max(gap, w / 2)) add(x, y);
      const score = b => Math.hypot(b.x + w / 2 - ax, b.y + h / 2 - ay) + placed.filter(p => segmentHitsBox({ x: ax, y: ay }, { x: b.x + w / 2, y: b.y + h / 2 }, p)).length * width;
      candidates.sort((a, b) => score(a) - score(b)); box = candidates[0];
      if (!box) { invalid = true; box = { x: Math.max(gap, Math.min(width - w - gap, ax)), y: Math.max(gap, Math.min(height - h - gap, ay)), w, h }; }
    }
    if (invalid && strict) throw new Error('照片編號與箭頭重疊或版面不足，請開啟「調整圖面編號」移位／解鎖，或使用較疏的圖面版型；勿更改真實拍攝點。');
    placed.push({ ...item, ...box, index, invalid });
  }
  return placed.sort((a, b) => a.index - b.index);
}
export function planLabelGeometry(entries, width, height, layouts = [], strict = true) {
  const font = Math.min(width / 42, height / 24), pad = font / 4, ctx = document.createElement('canvas').getContext('2d'); ctx.font = `600 ${font}px sans-serif`;
  const segments = [], points = [];
  for (const e of entries) {
    const q = e.placement, a = { x: q.x * width, y: q.y * height }, b = { x: q.endX * width, y: q.endY * height };
    points.push({ ...a, r: Math.max(width, height) * (e.kind === 'observation' ? .025 : .012) + width / 330 });
    if (e.kind !== 'observation') {
      const angle = Math.atan2(b.y - a.y, b.x - a.x), size = width / 35;
      segments.push({ a, b, pad: width / 330 });
      for (const sign of [-1, 1]) segments.push({ a: b, b: { x: b.x - size * Math.cos(angle + sign * .5), y: b.y - size * Math.sin(angle + sign * .5) }, pad: width / 330 });
    }
  }
  const items = entries.filter(e => e.label).map((entry, index) => {
    const numbers = entry.label.split('、'), lines = []; for (let i = 0; i < numbers.length; i += 4) lines.push(numbers.slice(i, i + 4).join('、'));
    const saved = layouts.filter(p => entry.targets?.some(t => sameLabelTarget(t, p)));
    const matching = saved.filter(p => JSON.stringify(p.anchor) === JSON.stringify(labelAnchor(entry)));
    const preferred = matching.find(p => p.locked) || matching[0];
    const stale = saved.length !== matching.length || matching.some(p => preferred && (p.x !== preferred.x || p.y !== preferred.y));
    if (stale && strict) throw new Error('拍攝定位或共用編號群組已變更，請開啟「調整圖面編號」核對並保存。');
    return { entry, key: index, ax: entry.placement.x * width, ay: entry.placement.y * height, lines, w: Math.max(...lines.map(s => ctx.measureText(s).width)) + pad * 2, h: lines.length * font * 1.2 + pad * 2, preferred: stale ? undefined : preferred, stale };
  });
  return { width, height, font, pad, labels: planLabelLayout(items, width, height, { segments, points, strict }) };
}
const ns = 'http://www.w3.org/2000/svg';
const element = (name, attrs) => { const el = document.createElementNS(ns, name); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; };
export function paintPlanLabels(svg, geometry, color = true) {
  const { font, pad, labels, width } = geometry, ink = color ? '#b82b25' : '#1a1a1a';
  for (const b of labels) {
    const line = element('line', { x1: b.ax, y1: b.ay, x2: Math.max(b.x, Math.min(b.x + b.w, b.ax)), y2: Math.max(b.y, Math.min(b.y + b.h, b.ay)), stroke: ink, 'stroke-width': width / 1000, 'stroke-dasharray': `${font / 5} ${font / 5}`, 'pointer-events': 'none', 'data-leader': b.key }); svg.append(line);
  }
  for (const b of labels) {
    const g = element('g', { transform: `translate(${b.x} ${b.y})`, 'data-plan-label': b.key, role: 'img', 'aria-label': '照片 ' + b.entry.label });
    g.append(element('rect', { width: b.w, height: b.h, fill: '#fff', stroke: b.invalid || b.stale ? '#c00000' : 'none', 'stroke-width': 2 }));
    b.lines.forEach((text, i) => { const t = element('text', { x: pad, y: pad + font * (1 + i * 1.2), fill: ink, 'font-family': 'sans-serif', 'font-size': font, 'font-weight': 600 }); t.textContent = text; g.append(t); }); svg.append(g);
  }
}
