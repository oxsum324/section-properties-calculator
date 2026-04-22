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
