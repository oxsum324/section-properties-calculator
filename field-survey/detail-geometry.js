// Preset signs describe an observation, not its measured extent or severity.
export const DETAIL_SYMBOLS = { network: '網裂', damp: '滲水痕', salt: '白華', spall: '剝落' };
export const REGION_TYPES = { damp: '滲水痕', salt: '白華', spall: '剝落' };
export function symbolPaths(kind) {
  if (kind === 'network') return ['M-45,-22 L-25,-12 -8,-26 10,-12 34,-24 48,-5', 'M-45,9 L-25,-12 -19,12 3,21 10,-12', 'M-19,12 L-33,29 M3,21 L23,6 48,15 M23,6 L34,-24 M3,21 L16,32', 'M-45,9 L-51,27 M-8,-26 L-7,-34 M48,-5 L23,6'];
  const border = 'M-49,-8 L-37,-25 -12,-29 4,-23 31,-29 48,-11 42,11 21,28 -5,22 -30,29 -49,12 Z';
  if (kind === 'damp') return [border, 'M-32,-6 Q-24,-14 -16,-6 T0,-6 T16,-6 T32,-6 M-24,8 Q-16,0 -8,8 T8,8 T24,8'];
  if (kind === 'salt') return [border, 'M-27,-12 h2 M-8,-18 h2 M17,-13 h2 M31,5 h2 M-32,9 h2 M-12,15 h2 M9,18 h2', 'M0,-6 v16 M-8,2 h16 M-5,-3 l10,10 M-5,7 l10,-10'];
  return [border, 'M-35,-18 L-21,-9 -27,4 -10,8 -14,19 M15,-20 L8,-8 24,-1 17,14 29,22', 'M-43,1 l8,5 M-18,-24 l8,5 M30,-20 l8,5 M-4,16 l8,5'];
}
export function symbolPreview(kind) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -40 120 80" aria-hidden="true"><g fill="none" stroke="#263932" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbolPaths(kind).map(d => `<path d="${d}"/>`).join('')}</g></svg>`;
}
export function symbolBox(mark, width, height) {
  const size = mark.size * Math.min(width, height), a = mark.rotation * Math.PI / 180;
  const rx = (Math.abs(Math.cos(a)) * .54 + Math.abs(Math.sin(a)) * .38) * size;
  const ry = (Math.abs(Math.sin(a)) * .54 + Math.abs(Math.cos(a)) * .38) * size;
  return { x: mark.points[0].x - rx / width, y: mark.points[0].y - ry / height, w: rx * 2 / width, h: ry * 2 / height };
}
export function moveDetailMark(mark, dx, dy, width, height) {
  const result = structuredClone(mark), box = mark.type === 'symbol' ? symbolBox(mark, width, height) : { x: Math.min(...mark.points.map(p => p.x)), y: Math.min(...mark.points.map(p => p.y)), w: Math.max(...mark.points.map(p => p.x)) - Math.min(...mark.points.map(p => p.x)), h: Math.max(...mark.points.map(p => p.y)) - Math.min(...mark.points.map(p => p.y)) };
  dx = Math.max(-box.x, Math.min(1 - box.x - box.w, dx)); dy = Math.max(-box.y, Math.min(1 - box.y - box.h, dy));
  result.points.forEach(p => { p.x = Math.max(0, Math.min(1, p.x + dx)); p.y = Math.max(0, Math.min(1, p.y + dy)); }); return result;
}
export function mirrorDetailMarks(marks) {
  return marks.map(mark => { const m = structuredClone(mark); m.points.forEach(p => { p.x = 1 - p.x; }); if (m.type === 'symbol') { m.rotation = (360 - m.rotation) % 360; m.mirror = !m.mirror; } return m; });
}
export function splitDetailLine(mark, segment) {
  if (mark.type !== 'pen' || segment < 0 || segment >= mark.points.length - 1) return [structuredClone(mark)];
  return [mark.points.slice(0, segment + 1), mark.points.slice(segment + 1)].filter(p => p.length >= 2).map(points => ({ ...structuredClone(mark), points: structuredClone(points) }));
}
export const detailMarkName = mark => mark.type === 'symbol' ? DETAIL_SYMBOLS[mark.symbol] : mark.type === 'region' ? REGION_TYPES[mark.condition] + '範圍' : ({ pen: '裂隙線', arrow: '箭頭', circle: '圈選', text: '文字' }[mark.type]);

export const regionArea = points => Math.abs(points.reduce((sum,a,i) => { const b = points[(i+1)%points.length]; return sum + a.x*b.y - b.x*a.y; },0))/2;
