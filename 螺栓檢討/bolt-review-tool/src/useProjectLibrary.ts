import { startTransition, useRef, type ChangeEvent } from 'react'
import type { AnchorProduct, ProjectCase } from './domain'
import { db } from './db'
import { defaultProject } from './defaults'
import {
  applyProjectTemplate,
  findProjectTemplateById,
  type ProjectTemplate,
} from './projectTemplates'
import type { RequestConfirm } from './confirmDialog'

const projectIdSeed = Date.now()
let projectIdSequence = 0

function nextProjectId() {
  projectIdSequence += 1
  return `project-${projectIdSeed}-${projectIdSequence}`
}

function makeUniqueProjectName(baseName: string, projects: ProjectCase[]) {
  const trimmed = baseName.trim() || '新案例'
  if (!projects.some((item) => item.name === trimmed)) {
    return trimmed
  }
  let index = 2
  while (projects.some((item) => item.name === `${trimmed} ${index}`)) {
    index += 1
  }
  return `${trimmed} ${index}`
}

/**
 * 案例庫管理 hook：彙整 11 個案例層動作 + 1 個 input ref。
 *
 * 動作：loadProjectTemplate / select / create / resetToDefaults / duplicate / delete /
 * exportCurrentCase / exportWorkspace / openImportDialog /
 * importWorkspaceFromFile / importWorkspace(event)
 *
 * 從 App.tsx 抽出（~230 行）；nextProjectId / makeUniqueProjectName / projectIdSeed 內部化。
 *
 * 由於 normalizeProjectSelection / replaceProjectInList / cloneProject 仍在 App.tsx 用作其他用途，
 * 這些 helper 透過 deps 傳入而非直接 import；未來可進一步抽至共用模組。
 */
export function useProjectLibrary(deps: {
  project: ProjectCase
  projectLibrary: ProjectCase[]
  products: AnchorProduct[]
  selectedProduct: AnchorProduct
  projectTemplateCatalog: ProjectTemplate[]
  setProject: (project: ProjectCase) => void
  setProjects:
    | ((updater: (current: ProjectCase[]) => ProjectCase[]) => void)
    | ((projects: ProjectCase[]) => void)
  setActiveProjectId: (id: string) => void
  setProducts: (products: AnchorProduct[]) => void
  setSaveMessage: (message: string) => void
  clearPreviewDocument: () => void
  commitProject: (project: ProjectCase) => void
  cloneProject: (project: ProjectCase) => ProjectCase
  normalizeProjectSelection: (
    project: ProjectCase,
    products: AnchorProduct[],
  ) => ProjectCase
  replaceProjectInList: (
    projects: ProjectCase[],
    next: ProjectCase,
  ) => ProjectCase[]
  requestConfirm: RequestConfirm
}) {
  const {
    project,
    projectLibrary,
    products,
    selectedProduct,
    projectTemplateCatalog,
    setProject,
    setProjects,
    setActiveProjectId,
    setProducts,
    setSaveMessage,
    clearPreviewDocument,
    commitProject,
    cloneProject,
    normalizeProjectSelection,
    replaceProjectInList,
    requestConfirm,
  } = deps

  const importInputRef = useRef<HTMLInputElement | null>(null)

  // setProjects 在 React useState setter 是 (updater | newValue) 兩可型別；以下統一使用 cast。
  const setProjectsAny = setProjects as (
    next:
      | ProjectCase[]
      | ((current: ProjectCase[]) => ProjectCase[]),
  ) => void

  async function loadProjectTemplate(templateId: string) {
    const template =
      findProjectTemplateById(templateId) ??
      projectTemplateCatalog.find((item) => item.id === templateId)
    if (!template) {
      return
    }
    clearPreviewDocument()
    commitProject(applyProjectTemplate(template, project))
    setSaveMessage(`已套用案件樣板：${template.name}`)
  }

  function selectProject(projectId: string) {
    const nextProject = projectLibrary.find((item) => item.id === projectId)
    if (!nextProject) {
      return
    }
    clearPreviewDocument()
    startTransition(() => {
      setActiveProjectId(projectId)
      setProject(nextProject)
      setProjectsAny((current) => replaceProjectInList(current, nextProject))
      setSaveMessage(`已切換案例：${nextProject.name}`)
    })
  }

  function createProject() {
    const nextProject = normalizeProjectSelection(
      {
        ...defaultProject,
        id: nextProjectId(),
        name: makeUniqueProjectName('新案例', projectLibrary),
        selectedProductId: selectedProduct.id,
        ui: project.ui,
        report: project.report,
        updatedAt: new Date().toISOString(),
      },
      products,
    )
    clearPreviewDocument()
    startTransition(() => {
      setActiveProjectId(nextProject.id)
      setProject(nextProject)
      setProjectsAny((current) => [...current, nextProject])
      setSaveMessage(`已新增案例：${nextProject.name}`)
    })
  }

  async function resetCurrentProjectToDefaults() {
    const confirmed = await requestConfirm({
      title: '還原案例預設值',
      message: `將把目前案例「${project.name}」的所有輸入還原為預設值，但保留案例 ID、名稱、UI 偏好與報表設定。此操作不可復原（可先匯出 JSON 備份）。確定繼續？`,
      confirmLabel: '還原預設',
      cancelLabel: '取消',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    const preservedId = project.id
    const preservedName = project.name
    const preservedUi = project.ui
    const preservedReport = project.report
    const preservedRuleProfileId = project.ruleProfileId
    const next = normalizeProjectSelection(
      {
        ...cloneProject(defaultProject),
        id: preservedId,
        name: preservedName,
        ui: preservedUi,
        report: preservedReport,
        ruleProfileId: preservedRuleProfileId,
        updatedAt: new Date().toISOString(),
      },
      products,
    )
    clearPreviewDocument()
    startTransition(() => {
      setProject(next)
      setProjectsAny((current) => replaceProjectInList(current, next))
      setSaveMessage(`已將「${preservedName}」還原為預設值`)
    })
  }

  function duplicateProject() {
    const nextProject = cloneProject({
      ...project,
      id: nextProjectId(),
      name: makeUniqueProjectName(
        `${project.name} 副本`,
        projectLibrary,
      ),
      updatedAt: new Date().toISOString(),
    })
    clearPreviewDocument()
    startTransition(() => {
      setActiveProjectId(nextProject.id)
      setProject(nextProject)
      setProjectsAny((current) => [...current, nextProject])
      setSaveMessage(`已複製案例：${nextProject.name}`)
    })
  }

  function deleteCurrentProject() {
    if (projectLibrary.length === 1) {
      return
    }
    const targetIndex = projectLibrary.findIndex(
      (item) => item.id === project.id,
    )
    const remaining = projectLibrary.filter((item) => item.id !== project.id)
    const fallbackProject =
      remaining[targetIndex] ?? remaining[targetIndex - 1] ?? remaining[0]
    if (!fallbackProject) {
      return
    }
    clearPreviewDocument()
    startTransition(() => {
      setProjectsAny(remaining)
      setActiveProjectId(fallbackProject.id)
      setProject(fallbackProject)
      setSaveMessage(`已刪除案例：${project.name}`)
    })
    void db.projects.delete(project.id)
    void db.files.where('projectId').equals(project.id).delete()
  }

  function exportCurrentCase() {
    // 只輸出目前單一案例 + 其使用的產品（以 selectedProductId 與候選）+ 該案件附件
    void (async () => {
      try {
        const { buildWorkspaceBackup } = await import('./backup')
        const caseProject = normalizeProjectSelection(project, products)
        const linkedProductIds = new Set<string>([
          caseProject.selectedProductId,
          ...(caseProject.candidateProductIds ?? []),
        ])
        const linkedProducts = products.filter((item) =>
          linkedProductIds.has(item.id),
        )
        const allFiles = await db.files.toArray()
        const linkedFiles = allFiles.filter(
          (file) => file.projectId === caseProject.id,
        )
        const payload = await buildWorkspaceBackup(
          linkedProducts,
          [caseProject],
          linkedFiles,
        )
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        })
        const objectUrl = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        const safeName =
          (caseProject.name || 'anchor-case')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'anchor-case'
        const exportDate = payload.exportedAt.slice(0, 10)
        link.href = objectUrl
        link.download = `${safeName}-${exportDate}.json`
        link.click()
        window.URL.revokeObjectURL(objectUrl)
        setSaveMessage(
          `已匯出單案 ${linkedProducts.length} 產品 / ${linkedFiles.length} 附件：${safeName}`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : '匯出失敗'
        setSaveMessage(`單案匯出失敗：${message}`)
      }
    })()
  }

  async function exportWorkspace() {
    const { buildWorkspaceBackup } = await import('./backup')
    const files = await db.files.toArray()
    const payload = await buildWorkspaceBackup(products, projectLibrary, files)
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const exportDate = payload.exportedAt.slice(0, 10)
    link.href = objectUrl
    link.download = `bolt-review-backup-${exportDate}.json`
    link.click()
    window.URL.revokeObjectURL(objectUrl)
    setSaveMessage(
      `已匯出 ${payload.projects.length} 個案例 / ${payload.products.length} 個產品 / ${payload.files.length} 份附件`,
    )
  }

  function openImportDialog() {
    importInputRef.current?.click()
  }

  async function importWorkspaceFromFile(file: File) {
    try {
      if (
        !file.type.includes('json') &&
        !file.name.toLowerCase().endsWith('.json')
      ) {
        setSaveMessage(`忽略非 JSON 檔案：${file.name}`)
        return
      }
      const { mergeWorkspaceBackup, parseWorkspaceBackup } = await import(
        './backup'
      )
      const text = await file.text()
      const parsed = parseWorkspaceBackup(text)
      const currentFiles = await db.files.toArray()
      const merged = mergeWorkspaceBackup(
        products,
        projectLibrary,
        currentFiles,
        parsed,
      )
      const nextProject = merged.projects[merged.projects.length - 1] ?? project
      await db.files.bulkPut(merged.files)
      clearPreviewDocument()
      startTransition(() => {
        setProducts(merged.products)
        setProjectsAny(merged.projects)
        setActiveProjectId(nextProject.id)
        setProject(nextProject)
      })
      setSaveMessage(
        `已匯入 ${merged.importedProjects} 個案例 / ${merged.importedProducts} 個產品 / ${merged.importedFiles} 份附件`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '匯入失敗，請確認 JSON 格式。'
      setSaveMessage(`匯入失敗：${message}`)
    }
  }

  async function importWorkspace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    try {
      await importWorkspaceFromFile(file)
    } finally {
      event.target.value = ''
    }
  }

  return {
    importInputRef,
    loadProjectTemplate,
    selectProject,
    createProject,
    resetCurrentProjectToDefaults,
    duplicateProject,
    deleteCurrentProject,
    exportCurrentCase,
    exportWorkspace,
    openImportDialog,
    importWorkspaceFromFile,
    importWorkspace,
  }
}
