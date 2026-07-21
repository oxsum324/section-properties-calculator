import { normalizeReportSettings } from './defaults'
import { normalizeCalcEngineVersion } from './appMeta'
import { evaluateProjectBatch } from './calc'
import type {
  AnchorProduct,
  ProjectCase,
  StoredDocumentFile,
} from './domain'
import { normalizeUnitPreferences } from './units'

export const WORKSPACE_BACKUP_SCHEMA = 'bolt-review-tool-backup' as const
export const WORKSPACE_BACKUP_VERSION = 2 as const
export const LEGACY_UNVERIFIED_CALC_VERSION = 'legacy-backup-v1-unverified'

export interface WorkspaceCaseReplay {
  projectId: string
  selectedProductId: string
  calcEngineVersion: string
  fingerprint: string
}

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
  schema: typeof WORKSPACE_BACKUP_SCHEMA
  version: typeof WORKSPACE_BACKUP_VERSION
  exportedAt: string
  products: AnchorProduct[]
  projects: ProjectCase[]
  files: SerializedDocumentFile[]
  caseReplay: WorkspaceCaseReplay[]
}

export interface WorkspaceBackup {
  schema: typeof WORKSPACE_BACKUP_SCHEMA
  version: 1 | typeof WORKSPACE_BACKUP_VERSION
  exportedAt: string
  products: AnchorProduct[]
  projects: ProjectCase[]
  files: StoredDocumentFile[]
  caseReplay: WorkspaceCaseReplay[]
  legacyUnverified: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => createStableValue(item))
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const nextValue = (value as Record<string, unknown>)[key]
        if (nextValue !== undefined) {
          result[key] = createStableValue(nextValue)
        }
        return result
      }, {})
  }

  return value
}

async function sha256Hex(value: unknown) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(createStableValue(value))),
  )

  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

function stripProjectForReplay(project: ProjectCase) {
  const {
    updatedAt: ignoredUpdatedAt,
    snapshot: ignoredSnapshot,
    auditTrail: ignoredAuditTrail,
    ...calculationInput
  } = cloneBackupProject(project)
  void ignoredUpdatedAt
  void ignoredSnapshot
  void ignoredAuditTrail
  return calculationInput
}

export async function buildWorkspaceCaseReplay(
  products: AnchorProduct[],
  projects: ProjectCase[],
): Promise<WorkspaceCaseReplay[]> {
  return Promise.all(
    projects.map(async (project) => {
      const selectedProduct = products.find(
        (product) => product.id === project.selectedProductId,
      )
      if (!selectedProduct) {
        throw new Error(
          `案例「${project.name || project.id}」找不到目前採用產品，無法建立計算重現指紋。`,
        )
      }

      const calcEngineVersion = normalizeCalcEngineVersion(
        project.calcEngineVersion,
      )
      const fingerprint = await sha256Hex({
        schema: 'bolt-review-tool-case-replay-v1',
        calcEngineVersion,
        project: stripProjectForReplay(project),
        selectedProduct: cloneBackupProduct(selectedProduct),
        calculation: evaluateProjectBatch(project, selectedProduct),
      })

      return {
        projectId: project.id,
        selectedProductId: selectedProduct.id,
        calcEngineVersion,
        fingerprint,
      }
    }),
  )
}

export async function verifyWorkspaceBackupReplay(backup: WorkspaceBackup) {
  if (backup.legacyUnverified) {
    return {
      verifiedProjects: 0,
      legacyProjects: backup.projects.length,
    }
  }

  if (backup.caseReplay.length !== backup.projects.length) {
    throw new Error('備份檔的案例重現資料數量不符，已保留原工作區。')
  }

  const recordByProjectId = new Map<string, WorkspaceCaseReplay>()
  backup.caseReplay.forEach((record) => {
    if (recordByProjectId.has(record.projectId)) {
      throw new Error(
        `案例「${record.projectId}」有重複重現資料，已保留原工作區。`,
      )
    }
    recordByProjectId.set(record.projectId, record)
  })

  const recalculated = await buildWorkspaceCaseReplay(
    backup.products,
    backup.projects,
  )
  recalculated.forEach((record) => {
    const source = recordByProjectId.get(record.projectId)
    if (!source) {
      throw new Error(
        `案例「${record.projectId}」缺少來源重現資料，已保留原工作區。`,
      )
    }
    if (source.selectedProductId !== record.selectedProductId) {
      throw new Error(
        `案例「${record.projectId}」採用產品與來源不符，已保留原工作區。`,
      )
    }
    if (source.calcEngineVersion !== record.calcEngineVersion) {
      throw new Error(
        `案例「${record.projectId}」計算版本與來源不符，已保留原工作區。`,
      )
    }
    if (source.fingerprint !== record.fingerprint) {
      throw new Error(
        `案例「${record.projectId}」重新計算後指紋不符，已保留原工作區。`,
      )
    }
  })

  return {
    verifiedProjects: recalculated.length,
    legacyProjects: 0,
  }
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
    schema: WORKSPACE_BACKUP_SCHEMA,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    products: products.map(cloneBackupProduct),
    projects: projects.map(cloneBackupProject),
    files: await Promise.all(files.map(serializeDocumentFile)),
    caseReplay: await buildWorkspaceCaseReplay(products, projects),
  }
}

/**
 * 嚴謹解析工作區備份檔；除了原本的物件型別檢查，加入：
 * - schema 標記檢查（避免使用者誤匯入其他工具的 JSON）
 * - 必要欄位完整性提示（產品缺直徑 / 案例缺 layout 時抛具名錯誤，幫使用者定位）
 * 失敗時拋擲帶上下文的 Error，由 caller 顯示給使用者。
 */
export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    throw new Error(`JSON 格式錯誤（${message}），請確認檔案完整下載。`)
  }

  if (!isRecord(parsed)) {
    throw new Error('備份檔內容不是有效的 JSON 物件。')
  }

  if (parsed.schema !== WORKSPACE_BACKUP_SCHEMA) {
    throw new Error(
      `備份檔 schema 不符（讀到「${String(parsed.schema)}」，應為「${WORKSPACE_BACKUP_SCHEMA}」）。請確認是本工具匯出的 JSON。`,
    )
  }

  if (parsed.version !== 1 && parsed.version !== WORKSPACE_BACKUP_VERSION) {
    throw new Error(
      `備份檔版本不支援（讀到「${String(parsed.version)}」，目前支援 v1 與 v${WORKSPACE_BACKUP_VERSION}）。`,
    )
  }

  const legacyUnverified = parsed.version === 1
  if (!legacyUnverified && !Array.isArray(parsed.caseReplay)) {
    throw new Error('v2 備份檔缺少 caseReplay 案例重現資料。')
  }

  if (!Array.isArray(parsed.products) || !Array.isArray(parsed.projects)) {
    throw new Error('備份檔缺少 products / projects 陣列。')
  }

  // 至少要有一個 product 與一個 project，否則匯入無意義
  if (parsed.products.length === 0 && parsed.projects.length === 0) {
    throw new Error('備份檔不含任何產品或案例，無資料可匯入。')
  }

  // 對 projects 做基本欄位健檢，有缺直接告訴使用者第幾個案件出問題
  parsed.projects.forEach((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`第 ${index + 1} 個案例不是物件。`)
    }
    if (!isRecord(item.layout)) {
      throw new Error(
        `第 ${index + 1} 個案例「${
          typeof item.name === 'string' ? item.name : 'unnamed'
        }」缺 layout 欄位。`,
      )
    }
    if (!isRecord(item.loads)) {
      throw new Error(
        `第 ${index + 1} 個案例「${
          typeof item.name === 'string' ? item.name : 'unnamed'
        }」缺 loads 欄位。`,
      )
    }
  })

  // 對 products 做基本欄位健檢
  parsed.products.forEach((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`第 ${index + 1} 個產品不是物件。`)
    }
    if (typeof item.diameterMm !== 'number' || item.diameterMm <= 0) {
      throw new Error(
        `第 ${index + 1} 個產品「${
          typeof item.model === 'string' ? item.model : 'unnamed'
        }」缺有效 diameterMm（必須 > 0）。`,
      )
    }
  })

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
    schema: WORKSPACE_BACKUP_SCHEMA,
    version: parsed.version,
    exportedAt:
      typeof parsed.exportedAt === 'string'
        ? parsed.exportedAt
        : new Date().toISOString(),
    products: parsed.products
      .filter((item): item is AnchorProduct => isRecord(item))
      .map((item) => cloneBackupProduct(item)),
    projects: parsed.projects
      .filter((item): item is ProjectCase => isRecord(item))
      .map((item) => {
        const project = cloneBackupProject(item)
        if (!legacyUnverified) return project
        return {
          ...project,
          calcEngineVersion: LEGACY_UNVERIFIED_CALC_VERSION,
          auditTrail: [],
        }
      }),
    files,
    caseReplay: legacyUnverified
      ? []
      : (parsed.caseReplay as unknown[]).map((item, index) => {
          if (!isRecord(item)) {
            throw new Error(`第 ${index + 1} 筆案例重現資料不是物件。`)
          }
          const projectId =
            typeof item.projectId === 'string' ? item.projectId : ''
          const selectedProductId =
            typeof item.selectedProductId === 'string'
              ? item.selectedProductId
              : ''
          const calcEngineVersion =
            typeof item.calcEngineVersion === 'string'
              ? item.calcEngineVersion
              : ''
          const fingerprint =
            typeof item.fingerprint === 'string' ? item.fingerprint : ''
          if (
            !projectId ||
            !selectedProductId ||
            !calcEngineVersion ||
            !/^[a-f0-9]{64}$/.test(fingerprint)
          ) {
            throw new Error(`第 ${index + 1} 筆案例重現資料不完整。`)
          }
          return {
            projectId,
            selectedProductId,
            calcEngineVersion,
            fingerprint,
          }
        }),
    legacyUnverified,
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

    const invalidatedAuditEntries = item.auditTrail?.length ?? 0
    return {
      ...cloneBackupProject(item),
      id: nextId,
      name: nextUniqueProjectName(item.name || '匯入案例', usedProjectNames),
      selectedProductId,
      updatedAt: new Date().toISOString(),
      auditTrail: [],
      documents: (item.documents ?? []).map((document) => ({
        ...document,
        id:
          fileIdMap.get(document.id) ??
          nextUniqueId(document.id || 'imported-document', usedFileIds),
      })),
      invalidatedAuditEntries,
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
    projects: [
      ...currentProjects.map(cloneBackupProject),
      ...importedProjects.map(
        ({ invalidatedAuditEntries: ignoredAuditEntries, ...project }) => {
          void ignoredAuditEntries
          return project
        },
      ),
    ],
    files: [...currentFiles.map(cloneStoredDocumentFile), ...importedFiles],
    importedProducts: importedProducts.length,
    importedProjects: importedProjects.length,
    importedFiles: importedFiles.length,
    invalidatedAuditEntries: importedProjects.reduce(
      (total, project) => total + project.invalidatedAuditEntries,
      0,
    ),
  }
}
