import { drawMarks, TONES } from './annotation.js';
import { symbolArtwork, symbolBox, DETAIL_SYMBOLS, REGION_TYPES } from './detail-geometry.js';
export const ns = 'http://www.w3.org/2000/svg';
export function svgNode(tag, attrs = {}) { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; }
// Cracks are red, water and other damage blue on screen; exports default to black line art
// where weight, dashes, stipple and hatching carry the same distinction on a photocopy.
const BASE = '#1a1a1a';
export const symbolTone = symbol => symbol === 'network' ? 'red' : 'blue';
const waterRegion = condition => condition === 'damp' || condition === 'salt';
function ensurePatterns(root) {
  if (!root || root.querySelector('#detail-hatch')) return;
  const defs = svgNode('defs');
  const hatch = svgNode('pattern', { id: 'detail-hatch', patternUnits: 'userSpaceOnUse', width: 14, height: 14, patternTransform: 'rotate(45)' }); hatch.append(svgNode('line', { x1: 0, y1: 0, x2: 0, y2: 14, stroke: BASE, 'stroke-width': 1.6 }));
  const stipple = svgNode('pattern', { id: 'detail-stipple', patternUnits: 'userSpaceOnUse', width: 10, height: 10 }); stipple.append(svgNode('circle', { cx: 3, cy: 3, r: 1.3, fill: BASE }), svgNode('circle', { cx: 8, cy: 8, r: 1.3, fill: BASE }));
  defs.append(hatch, stipple); root.prepend(defs);
}
export function drawDetailMark(g, mark, width, height, options = {}) {
  const color = options.color !== false;
  g.replaceChildren();
  if (mark.type === 'opening') {
    if (mark.points.length === 4) {
      const P = mark.points.map(p => ({ x: p.x * width, y: p.y * height })), c = { x: P.reduce((s, p) => s + p.x, 0) / 4, y: P.reduce((s, p) => s + p.y, 0) / 4 };
      const inner = P.map(p => ({ x: p.x + (c.x - p.x) * .1, y: p.y + (c.y - p.y) * .1 })), pts = q => q.map(p => `${p.x},${p.y}`).join(' '), mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      g.append(svgNode('polygon', { points: pts(P), fill: 'white', stroke: BASE, 'stroke-width': width / 650 }), svgNode('polygon', { points: pts(inner), fill: 'none', stroke: BASE, 'stroke-width': width / 800 }));
      if (mark.kind === 'window') { const a = mid(inner[0], inner[1]), b = mid(inner[2], inner[3]); g.append(svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: BASE, 'stroke-width': width / 800 })); }
      else { const m = mid(P[1], P[2]), d = { x: c.x + (m.x - c.x) * .72, y: c.y + (m.y - c.y) * .72 }; g.append(svgNode('circle', { cx: d.x, cy: d.y, r: Math.max(2, Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y) * .025), fill: BASE })); }
      return;
    }
    const [a, b] = mark.points, x = Math.min(a.x, b.x) * width, y = Math.min(a.y, b.y) * height, w = Math.abs(a.x - b.x) * width, h = Math.abs(a.y - b.y) * height, inset = Math.min(w, h) * .07;
    g.append(svgNode('rect', { x, y, width: w, height: h, fill: 'white', stroke: BASE, 'stroke-width': width / 650 }));
    g.append(svgNode('rect', { x: x + inset, y: y + inset, width: w - inset * 2, height: h - inset * 2, fill: 'none', stroke: BASE, 'stroke-width': width / 800 }));
    if (mark.kind === 'window') g.append(svgNode('line', { x1: x + w / 2, y1: y + inset, x2: x + w / 2, y2: y + h - inset, stroke: BASE, 'stroke-width': width / 800 }));
    else g.append(svgNode('circle', { cx: x + w * .82, cy: y + h * .58, r: Math.min(w, h) * .025, fill: BASE }));
  } else if (mark.type === 'symbol') {
    const p = mark.points[0], scale = mark.size * Math.min(width, height) / 100;
    const shape = svgNode('g', { transform: `translate(${p.x * width} ${p.y * height}) rotate(${mark.rotation}) scale(${mark.mirror ? -scale : scale} ${scale})`, fill: 'none', stroke: color ? TONES[symbolTone(mark.symbol)] : BASE, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    symbolArtwork(mark.symbol, mark.size <= .14).forEach(attributes => shape.append(svgNode('path', attributes))); g.append(shape);
    // The name belongs to this mark, so selecting/moving/copying it keeps the
    // explanation attached. Keep text upright even when the artwork is rotated.
    const name = DETAIL_SYMBOLS[mark.symbol], box = symbolBox(mark, width, height);
    const fontSize = Math.min(width / 40, height / 22), pad = fontSize * .22, halfLabel = name.length * fontSize / 2;
    const x = Math.max(halfLabel + pad, Math.min(width - halfLabel - pad, p.x * width));
    const below = (box.y + box.h) * height + fontSize + pad;
    const y = Math.max(fontSize + pad, Math.min(height - pad, below <= height - pad ? below : box.y * height - pad));
    const label = svgNode('text', { x, y, 'text-anchor': 'middle', 'font-size': fontSize, 'font-family': 'sans-serif', 'font-weight': 500, fill: BASE, stroke: 'white', 'stroke-width': fontSize * .2, 'stroke-linejoin': 'round', 'paint-order': 'stroke', 'data-detail-symbol-label': mark.symbol });
    label.textContent = name; g.append(label);
  } else if (mark.type === 'region') {
    const water = waterRegion(mark.condition), dash = water ? { 'stroke-dasharray': `${width / 100} ${width / 180}` } : {};
    if (color) g.append(svgNode('polygon', { points: mark.points.map(p => `${p.x * width},${p.y * height}`).join(' '), fill: TONES.blue, 'fill-opacity': .12, stroke: TONES.blue, 'stroke-width': width / 330, ...dash }));
    else g.append(svgNode('polygon', { points: mark.points.map(p => `${p.x * width},${p.y * height}`).join(' '), fill: water ? 'url(#detail-stipple)' : 'url(#detail-hatch)', stroke: BASE, 'stroke-width': width / 330, ...dash }));
    const p = mark.points[0], label = svgNode('text', { x: p.x * width, y: p.y * height, fill: BASE, stroke: 'white', 'stroke-width': width / 500, 'paint-order': 'stroke', 'font-size': width / 45, 'font-family': 'sans-serif' }); label.textContent = REGION_TYPES[mark.condition]; g.append(label);
  } else drawMarks(g, [mark], width, height, { color });
}
export function drawDetailMarks(g, marks, width, height, options = {}) {
  g.replaceChildren();
  ensurePatterns(g.tagName === 'svg' ? g : g.ownerSVGElement);
  // Openings cover base lines only; observation marks remain visible above them.
  for (const opening of [true, false]) marks.forEach((mark, i) => { if ((mark.type === 'opening') !== opening) return; const item = svgNode('g', { 'data-detail-index': i }); drawDetailMark(item, mark, width, height, options); g.append(item); });
}
export const usedSymbols = marks => [...new Set(marks.filter(m => m.type === 'symbol').map(m => m.symbol))];
export async function renderDetailImage(blob, marks, options = {}) {
  const url = URL.createObjectURL(blob), color = options.color === true;
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 4094 / img.naturalWidth, 4094 / img.naturalHeight), w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    const svg = svgNode('svg', { xmlns: ns, width: w, height: h, viewBox: `0 0 ${w} ${h}` }); drawDetailMarks(svg, marks, w, h, { color });
    const overlay = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try { const picture = new Image(); picture.src = overlay; await picture.decode(); ctx.drawImage(picture, 0, 0); } finally { URL.revokeObjectURL(overlay); }
    return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('細圖匯出失敗')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
