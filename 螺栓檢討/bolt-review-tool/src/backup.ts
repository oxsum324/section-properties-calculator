import { normalizeReportSettings } from './defaults'
import type {
  AnchorProduct,
  ProjectCase,
  StoredDocumentFile,
} from './domain'
import { normalizeUnitPreferences } from './units'

export interface SerializedDocumentFile {
  id: string
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  updatedAt: string
  dataBase64: string
}

export interface WorkspaceBackupPayload {
  schema: 'bolt-review-tool-backup'
  version: 1
  exportedAt: string
  products: AnchorProduct[]
  projects: ProjectCase[]
  files: SerializedDocumentFile[]
}

export interface WorkspaceBackup {
  schema: 'bolt-review-tool-backup'
  version: 1
  exportedAt: string
  products: AnchorProduct[]
  projects: ProjectCase[]
  files: StoredDocumentFile[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function cloneEvidenceMap(product: AnchorProduct) {
  if (!product.evidence) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(product.evidence).map(([key, entry]) => [
      key,
      entry ? { ...entry } : entry,
    ]),
  )
}

export function cloneBackupProduct(product: AnchorProduct): AnchorProduct {
  return {
    ...product,
    evaluation: { ...product.evaluation },
    evidence: cloneEvidenceMap(product),
  }
}

export function cloneBackupProject(project: ProjectCase): ProjectCase {
  return {
    ...project,
    layout: { ...project.layout },
    loads: { ...project.loads },
    candidateLayoutVariants: (project.candidateLayoutVariants ?? []).map(
      (item) => ({
        ...item,
        layout: { ...item.layout },
      }),
    ),
    ui: normalizeUnitPreferences(project.ui),
    report: normalizeReportSettings(project.report),
    documents: (project.documents ?? []).map((item) => ({ ...item })),
    snapshot: project.snapshot ? { ...project.snapshot } : undefined,
    auditTrail: (project.auditTrail ?? []).map((item) => ({
      ...item,
      summary: { ...item.summary },
    })),
  }
}

export function cloneStoredDocumentFile(
  file: StoredDocumentFile,
): StoredDocumentFile {
  return {
    ...file,
    blob: file.blob.slice(0, file.blob.size, file.blob.type),
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

async function serializeDocumentFile(
  file: StoredDocumentFile,
): Promise<SerializedDocumentFile> {
  return {
    id: file.id,
    projectId: file.projectId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    updatedAt: file.updatedAt,
    dataBase64: arrayBufferToBase64(await file.blob.arrayBuffer()),
  }
}

function deserializeDocumentFile(file: SerializedDocumentFile): StoredDocumentFile {
  return {
    id: file.id,
    projectId: file.projectId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    updatedAt: file.updatedAt,
    blob: base64ToBlob(file.dataBase64, file.mimeType),
  }
}

function nextUniqueId(baseId: string, usedIds: Set<string>) {
  const normalizedBase = baseId.trim() || 'imported-item'

  if (!usedIds.has(normalizedBase)) {
    usedIds.add(normalizedBase)
    return normalizedBase
  }

  let index = 1
  let candidate = `${normalizedBase}-import-${index}`
  while (usedIds.has(candidate)) {
    index += 1
    candidate = `${normalizedBase}-import-${index}`
  }

  usedIds.add(candidate)
  return candidate
}

function nextUniqueProjectName(baseName: string, usedNames: Set<string>) {
  const normalizedBase = baseName.trim() || '匯入案例'

  if (!usedNames.has(normalizedBase)) {
    usedNames.add(normalizedBase)
    return normalizedBase
  }

  let index = 2
  let candidate = `${normalizedBase} ${index}`
  while (usedNames.has(candidate)) {
    index += 1
    candidate = `${normalizedBase} ${index}`
  }

  usedNames.add(candidate)
  return candidate
}

export async function buildWorkspaceBackup(
  products: AnchorProduct[],
  projects: ProjectCase[],
  files: StoredDocumentFile[],
): Promise<WorkspaceBackupPayload> {
  return {
    schema: 'bolt-review-tool-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    products: products.map(cloneBackupProduct),
    projects: projects.map(cloneBackupProject),
    files: await Promise.all(files.map(serializeDocumentFile)),
  }
}

export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  const parsed = JSON.parse(text) as unknown

  if (!isRecord(parsed)) {
    throw new Error('備份檔內容不是有效的 JSON 物件。')
  }

  if (!Array.isArray(parsed.products) || !Array.isArray(parsed.projects)) {
    throw new Error('備份檔缺少 products / projects 陣列。')
  }

  const files = Array.isArray(parsed.files)
    ? parsed.files
        .filter((item): item is SerializedDocumentFile => isRecord(item))
        .map((item) =>
          deserializeDocumentFile({
            id: typeof item.id === 'string' ? item.id : 'imported-file',
            projectId:
              typeof item.projectId === 'string' ? item.projectId : 'imported-project',
            fileName: typeof item.fileName === 'string' ? item.fileName : 'document',
            mimeType:
              typeof item.mimeType === 'string'
                ? item.mimeType
                : 'application/octet-stream',
            sizeBytes:
              typeof item.sizeBytes === 'number' ? item.sizeBytes : 0,
            updatedAt:
              typeof item.updatedAt === 'string'
                ? item.updatedAt
                : new Date().toISOString(),
            dataBase64: typeof item.dataBase64 === 'string' ? item.dataBase64 : '',
          }),
        )
    : []

  return {
    schema: 'bolt-review-tool-backup',
    version: 1,
    exportedAt:
      typeof parsed.exportedAt === 'string'
        ? parsed.exportedAt
        : new Date().toISOString(),
    products: parsed.products
      .filter((item): item is AnchorProduct => isRecord(item))
      .map((item) => cloneBackupProduct(item)),
    projects: parsed.projects
      .filter((item): item is ProjectCase => isRecord(item))
      .map((item) => cloneBackupProject(item)),
    files,
  }
}

export function mergeWorkspaceBackup(
  currentProducts: AnchorProduct[],
  currentProjects: ProjectCase[],
  currentFiles: StoredDocumentFile[],
  backup: WorkspaceBackup,
) {
  const usedProductIds = new Set(currentProducts.map((item) => item.id))
  const usedProjectIds = new Set(currentProjects.map((item) => item.id))
  const usedProjectNames = new Set(currentProjects.map((item) => item.name))
  const productIdMap = new Map<string, string>()
  const projectIdMap = new Map<string, string>()
  const usedFileIds = new Set(currentFiles.map((item) => item.id))
  const fileIdMap = new Map<string, string>()

  const importedProducts = backup.products.map((item) => {
    const sourceId = item.id || 'imported-product'
    const nextId = nextUniqueId(sourceId, usedProductIds)
    productIdMap.set(sourceId, nextId)

    return {
      ...cloneBackupProduct(item),
      id: nextId,
    }
  })

  const fallbackProductId =
    importedProducts[0]?.id ??
    currentProducts[0]?.id ??
    backup.projects[0]?.selectedProductId ??
    ''

  backup.files.forEach((item) => {
    const sourceId = item.id || 'imported-file'
    fileIdMap.set(sourceId, nextUniqueId(sourceId, usedFileIds))
  })

  const importedProjects = backup.projects.map((item) => {
    const nextId = nextUniqueId(item.id || 'imported-project', usedProjectIds)
    projectIdMap.set(item.id || 'imported-project', nextId)
    const selectedProductId =
      productIdMap.get(item.selectedProductId) ??
      (usedProductIds.has(item.selectedProductId)
        ? item.selectedProductId
        : fallbackProductId)

    return {
      ...cloneBackupProject(item),
      id: nextId,
      name: nextUniqueProjectName(item.name || '匯入案例', usedProjectNames),
      selectedProductId,
      updatedAt: new Date().toISOString(),
      documents: (item.documents ?? []).map((document) => ({
        ...document,
        id:
          fileIdMap.get(document.id) ??
          nextUniqueId(document.id || 'imported-document', usedFileIds),
      })),
    }
  })

  const importedFiles = backup.files.map((item) => {
    const nextId =
      fileIdMap.get(item.id || 'imported-file') ??
      nextUniqueId(item.id || 'imported-file', usedFileIds)
    const nextProjectId =
      projectIdMap.get(item.projectId) ?? item.projectId

    return {
      ...cloneStoredDocumentFile(item),
      id: nextId,
      projectId: nextProjectId,
    }
  })

  return {
    products: [...currentProducts.map(cloneBackupProduct), ...importedProducts],
    projects: [...currentProjects.map(cloneBackupProject), ...importedProjects],
    files: [...currentFiles.map(cloneStoredDocumentFile), ...importedFiles],
    importedProducts: importedProducts.length,
    importedProjects: importedProjects.length,
    importedFiles: importedFiles.length,
  }
}
