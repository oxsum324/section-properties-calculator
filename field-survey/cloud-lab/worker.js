import { HTML, CLIENT } from './assets.js';
import { FIXTURES } from './fixtures.js';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
const json = (data, status = 200) => Response.json(data, { status, headers });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data))].map(x => x.toString(16).padStart(2, '0')).join('');
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('請使用測試資料包');
  if (!request.body) throw new Error('沒有提交內容');
  const reader = request.body.getReader(), chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 400000) { await reader.cancel(); throw new Error('測試包超過 400 KB'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === 'GET' && path === '/') return new Response(HTML, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    if (request.method === 'GET' && path === '/client.js') return new Response(CLIENT, { headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' } });
    if (request.method === 'GET' && path === '/health') return json({ version: '0.1.0', mode: 'synthetic-only', storage: 'D1-small-demo', driveConnected: false, r2Enabled: false });
    if (request.method === 'GET' && /^\/sample\/(300|600)$/.test(path)) return json(FIXTURES[path.split('/').at(-1)]);
    if (!['GET', 'POST'].includes(request.method)) return json({ error: '不支援此操作' }, 405);
    if (!path.startsWith('/api/')) return json({ error: '找不到頁面' }, 404);
    if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ error: '來源不符' }, 403);
    const token = request.headers.get('X-Test-Room') || '';
    if (!uuid.test(token)) return json({ error: '請先建立或開啟測試空間連結' }, 401);
    const room = await hash(token), since = new Date(Date.now() - 7 * 86400000).toISOString();
    try {
      if (request.method === 'GET' && path === '/api/submissions') {
        const result = await env.DB.prepare('SELECT id, contributor, location, condition, quality, digest, created_at FROM submissions WHERE room = ? AND created_at >= ? ORDER BY created_at, id').bind(room, since).all();
        return json({ items: result.results });
      }
      if (request.method === 'GET' && path.startsWith('/api/submissions/')) {
        const id = path.split('/').at(-1); if (!uuid.test(id)) return json({ error: '提交編號不正確' }, 400);
        const item = await env.DB.prepare('SELECT payload, digest FROM submissions WHERE room = ? AND id = ? AND created_at >= ?').bind(room, id, since).first();
        return item ? json({ package: JSON.parse(item.payload), digest: item.digest }) : json({ error: '找不到此空間的提交或已超過七天' }, 404);
      }
      if (request.method !== 'POST' || path !== '/api/submissions') return json({ error: '找不到操作' }, 404);
      let p; try { p = await body(request); } catch { return json({ error: '測試包格式錯誤或超過 400 KB' }, 400); }
      const keys = ['id', 'contributor', 'location', 'condition', 'quality', 'photo'];
      if (!p || typeof p !== 'object' || Object.keys(p).length !== keys.length || keys.some(k => !Object.hasOwn(p, k)) || !uuid.test(p.id) || !['甲', '乙'].includes(p.contributor) || !['客廳窗角', '浴室牆面'].includes(p.location) || !['滲水痕', '裂隙'].includes(p.condition) || !['300', '600'].includes(p.quality) || typeof p.photo !== 'string') return json({ error: '僅接受頁面產生的合成測試資料' }, 400);
      const fixture = FIXTURES[p.quality];
      // Restrict this public prototype to exact known synthetic bytes. No case
      // photos, arbitrary text, or private project backups can enter this store.
      if (p.photo !== fixture.base64) return json({ error: '只能提交內建合成照片，不能上傳案件照片' }, 400);
      const canonical = JSON.stringify({ contributor: p.contributor, location: p.location, condition: p.condition, quality: p.quality, photo: p.photo }), digest = await hash(canonical);
      const payload = JSON.stringify({ ...JSON.parse(canonical), id: p.id, kind: 'field-survey-cloud-demo', photoSha256: fixture.sha256, baseVersion: 'demo-1' });
      await env.DB.prepare('DELETE FROM submissions WHERE created_at < ?').bind(since).run();
      await env.DB.prepare('INSERT OR IGNORE INTO submissions (room,id,contributor,location,condition,quality,digest,payload,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM submissions) < 300').bind(room, p.id, p.contributor, p.location, p.condition, p.quality, digest, payload, new Date().toISOString()).run();
      const byId = await env.DB.prepare('SELECT id,digest FROM submissions WHERE room=? AND id=?').bind(room, p.id).first();
      if (byId && byId.digest !== digest) return json({ error: '同一提交編號內容不同，原提交已保留' }, 409);
      const match = byId || await env.DB.prepare('SELECT id,digest FROM submissions WHERE room=? AND digest=?').bind(room, digest).first();
      if (!match) return json({ error: '測試站已達 300 筆上限，請稍後再試' }, 429);
      return json({ id: match.id, digest, message: '已保存；重複提交不會另增一筆' });
    } catch (error) { console.error(JSON.stringify({ event: 'cloud-demo-error', message: error.message })); return json({ error: '雲端操作未完成，請重試；原提交不變' }, 503); }
  }
};
