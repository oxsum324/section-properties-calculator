import Dexie, { type EntityTable } from 'dexie'
import {
  defaultProducts,
  defaultProject,
} from './defaults'
import type {
  AnchorProduct,
  ProjectCase,
  StoredDocumentFile,
} from './domain'

class BoltReviewDatabase extends Dexie {
  products!: EntityTable<AnchorProduct, 'id'>
  projects!: EntityTable<ProjectCase, 'id'>
  files!: EntityTable<StoredDocumentFile, 'id'>

  constructor() {
    super('bolt-review-tool')
    this.version(1).stores({
      products: 'id,family,brand,model',
      projects: 'id,updatedAt,name,selectedProductId',
    })
    this.version(2).stores({
      products: 'id,family,brand,model',
      projects: 'id,updatedAt,name,selectedProductId',
      files: 'id,projectId,fileName,updatedAt',
    })
  }
}

export const db = new BoltReviewDatabase()

export async function ensureSeedData() {
  const productCount = await db.products.count()
  if (productCount === 0) {
    await db.products.bulkPut(defaultProducts)
  }

  const projectCount = await db.projects.count()
  if (projectCount === 0) {
    await db.projects.put(defaultProject)
  }
}

/**
 * 清空本機資料庫並重建 seed；用於啟動時讀取失敗後的「重置」選項。
 * 會關閉並刪除 IndexedDB，重新 open 後寫入 seed 資料。
 */
export async function resetLocalDatabase() {
  try {
    db.close()
  } catch {
    // close 失敗可忽略，delete 會強制移除
  }
  await Dexie.delete('bolt-review-tool')
  await db.open()
  await ensureSeedData()
}
