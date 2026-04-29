import { useEffect, useRef, useState } from 'react'
import { db } from './db'
import { evaluateProjectBatch } from './calc'
import type { AnchorProduct, ProjectCase, ReviewResult } from './domain'
import { getGoverningDcr } from './formatHelpers'
import { getRuleProfileById } from './ruleProfiles'

interface ToastEntry {
  id: number
  message: string
}

function buildProjectSnapshot(
  summary: ReviewResult['summary'],
  controllingLoadCaseName?: string,
) {
  return {
    overallStatus: summary.overallStatus,
    governingMode: summary.governingMode,
    governingDcr: getGoverningDcr(summary),
    maxDcr: summary.maxDcr,
    controllingLoadCaseName,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 自動儲存 + saveMessage toast hook：
 *   1. 任何 project / products / projects 變動 → 標記為 dirty
 *   2. 450ms debounce → 寫入 IndexedDB（含 snapshot 同步）
 *   3. saveMessage 變動 → 浮現 3.5 秒 toast
 *
 * 從 App.tsx 抽出（~95 行 hook 邏輯）；對外 export `dismissToast` 供使用者
 * 點 toast 時關閉。
 */
export function useAutoSave(deps: {
  hydrated: boolean
  project: ProjectCase
  products: AnchorProduct[]
  projects: ProjectCase[]
  saveMessage: string
  setSaveMessage: (message: string) => void
  cloneProject: (project: ProjectCase) => ProjectCase
  normalizeProjectSelection: (
    project: ProjectCase,
    products: AnchorProduct[],
  ) => ProjectCase
}) {
  const {
    hydrated,
    project,
    products,
    projects,
    saveMessage,
    setSaveMessage,
    cloneProject,
    normalizeProjectSelection,
  } = deps

  const [isDirty, setIsDirty] = useState(false)
  const [toast, setToast] = useState<ToastEntry | null>(null)

  // Step 1：變動 → dirty。useEffect 內 setState 屬於刻意觸發 UI（未儲存徽章）
  useEffect(() => {
    if (!hydrated) {
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDirty(true)
  }, [hydrated, products, project, projects])

  // Step 2：450ms debounce 後寫 IndexedDB
  useEffect(() => {
    if (!hydrated) {
      return
    }
    const timeout = window.setTimeout(() => {
      const activeProject = normalizeProjectSelection(project, products)
      const activeProduct =
        products.find((item) => item.id === activeProject.selectedProductId) ??
        products[0]
      const activeBatchReview = evaluateProjectBatch(
        activeProject,
        activeProduct,
        getRuleProfileById(activeProject.ruleProfileId),
      )
      const nextProjectsToPersist = projects.map((item) =>
        item.id === activeProject.id
          ? cloneProject({
              ...activeProject,
              snapshot: buildProjectSnapshot(
                activeBatchReview.summary,
                activeBatchReview.controllingLoadCaseName,
              ),
            })
          : normalizeProjectSelection(item, products),
      )

      Promise.all([
        db.products.bulkPut(products),
        db.projects.bulkPut(nextProjectsToPersist),
      ])
        .then(() => {
          setSaveMessage(
            `已離線儲存 ${new Date().toLocaleTimeString('zh-TW')}`,
          )
          setIsDirty(false)
        })
        .catch((error) => {
          console.warn('[bolt-review] 自動儲存失敗', error)
          const message =
            error instanceof Error ? error.message : String(error ?? '未知錯誤')
          setSaveMessage(`自動儲存失敗：${message}`)
          // 保留 isDirty=true，提示使用者需人工留意
        })
    }, 450)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [
    hydrated,
    products,
    project,
    projects,
    setSaveMessage,
    cloneProject,
    normalizeProjectSelection,
  ])

  // Step 3：saveMessage 變動 → 3.5 秒 toast
  const savedMessageRef = useRef(saveMessage)
  useEffect(() => {
    if (!hydrated) {
      savedMessageRef.current = saveMessage
      return
    }
    if (savedMessageRef.current === saveMessage) {
      return
    }
    savedMessageRef.current = saveMessage
    const id = Date.now() + Math.random()
    setToast({ id, message: saveMessage })
    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, 3500)
    return () => window.clearTimeout(timeout)
  }, [saveMessage, hydrated])

  return {
    isDirty,
    toast,
    dismissToast: () => setToast(null),
  }
}
