import { validateProject, now, assert } from './model.js';
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const completion = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('儲存交易已取消')); tx.onerror = () => {}; });
let database;
export async function openStore() {
  if (database) return database;
  // Close older writers before expanded conditions and observation layers are saved.
  const req = indexedDB.open('condition-survey-v1', 6);
  req.onupgradeneeded = () => { for (const name of ['projects', 'blobs', 'backups']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' }); };
  database = await request(req);
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
    const saved = { ...project, revision: expectedRevision + 1, updatedAt: now() };
    projects.put(saved); await done; return saved;
  } catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
}
export async function backupState(projectId) { const db = await openStore(); return await request(db.transaction('backups').objectStore('backups').get(projectId)) || { id: projectId, entries: {} }; }
export async function saveBackupState(state) { const db = await openStore(), tx = db.transaction('backups', 'readwrite'), done = completion(tx); tx.objectStore('backups').put(state); await done; }
