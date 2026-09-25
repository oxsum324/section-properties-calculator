import { validateProject, now, assert } from './model.js';
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const completion = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('儲存交易已取消')); tx.onerror = () => {}; });
let database;
export async function openStore() {
  if (database) return database;
  // Close older writers that do not recognize the approximate 0.1–0.3 mm width range.
  const req = indexedDB.open('condition-survey-v1', 15);
  req.onupgradeneeded = () => { for (const name of ['projects', 'blobs', 'backups']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' }); };
  // Another window (a background tab or the home-screen app) can keep the old database open and block
  // the version upgrade; never hang silently, say what to close.
  let blocked = false, timer; req.onblocked = () => { blocked = true; };
  const opening = request(req);
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(blocked ? '資料庫正被另一個開著「現況鑑定紀錄」的視窗占用，無法完成更新。請關閉其他分頁與主畫面視窗（含背景），再重新整理本頁；案件資料不會遺失。' : '資料庫開啟逾時，請重新整理本頁；若持續發生，請關閉其他開著本工具的視窗後再試。案件資料不會遺失。')), 8000); });
  try { database = await Promise.race([opening, timeout]); }
  catch (error) { opening.then(db => { if (database !== db) db.close(); }).catch(() => {}); throw error; }
  finally { clearTimeout(timer); }
  database.onversionchange = () => { database.close(); database = null; };
  return database;
}
export async function allProjects() { const db = await openStore(); return request(db.transaction('projects').objectStore('projects').getAll()); }
export async function getProject(id) { const db = await openStore(); return request(db.transaction('projects').objectStore('projects').get(id)); }
export async function getMedia(id) { const db = await openStore(); return request(db.transaction('blobs').objectStore('blobs').get(id)); }
export async function saveProject(project, expectedRevision, media = []) {
  validateProject(project);
  const db = await openStore(), tx = db.transaction(['projects', 'blobs'], 'readwrite'), done = completion(tx);
  const projects = tx.objectStore('projects'), blobs = tx.objectStore('blobs');
  try {
    const existing = await request(projects.get(project.id));
    if ((existing?.revision ?? 0) !== expectedRevision) { const error = new Error('另一個視窗已修改此案件。請按「另存目前副本」保留這個視窗的紀錄，再核對兩份案件。'); error.name = 'RevisionConflictError'; throw error; }
    const incoming = new Map(media.map(m => [m.id, m]));
    for (const metadata of project.media) {
      const asset = incoming.get(metadata.id) || await request(blobs.get(metadata.id));
      assert(asset?.blob instanceof Blob && asset.blob.size === metadata.size, `原始檔遺失：${metadata.name}`);
    }
    for (const asset of media) blobs.put(asset);
    const retained = new Set(project.media.map(m => m.id));
    const removed = (existing?.media || []).filter(m => !retained.has(m.id));
    if (removed.length) {
      const others = await request(projects.getAll());
      for (const m of removed) if (!others.some(p => p.id !== project.id && p.media.some(other => other.id === m.id))) blobs.delete(m.id);
    }
    const saved = { ...project, revision: expectedRevision + 1, updatedAt: now() };
    projects.put(saved); await done; return saved;
  } catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
}
export async function backupState(projectId) { const db = await openStore(); return await request(db.transaction('backups').objectStore('backups').get(projectId)) || { id: projectId, entries: {} }; }
export async function saveBackupState(state) { const db = await openStore(), tx = db.transaction('backups', 'readwrite'), done = completion(tx); tx.objectStore('backups').put(state); await done; }
