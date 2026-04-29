import { useCallback, useEffect, useState } from 'react'
import { db, ensureSeedData, resetLocalDatabase } from './db'
import { defaultProducts, defaultProject } from './defaults'
import type { AnchorProduct, ProjectCase } from './domain'

/**
 * 工作區水合（hydration）hook：應用啟動時從 IndexedDB 讀取產品 / 案例 / 附件，
 * 失敗時 fallback 至預設值；提供「重試」與「清空本機資料後重建」兩個動作。
 *
 * 從 App.tsx 抽出（~95 行）；包含 5 個 state（hydrated / loading / hydrationError /
 * hydrationRetryCount / isResetting）+ 1 個 useEffect + 2 個 callback。
 */
export function useWorkspaceHydration(deps: {
  setProducts: (products: AnchorProduct[]) => void
  setProjects: (projects: ProjectCase[]) => void
  setActiveProjectId: (id: string) => void
  setProject: (project: ProjectCase) => void
  cloneProject: (project: ProjectCase) => ProjectCase
  normalizeProjectSelection: (
    project: ProjectCase,
    products: AnchorProduct[],
  ) => ProjectCase
}) {
  const {
    setProducts,
    setProjects,
    setActiveProjectId,
    setProject,
    cloneProject,
    normalizeProjectSelection,
  } = deps

  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hydrationError, setHydrationError] = useState<string | null>(null)
  const [hydrationRetryCount, setHydrationRetryCount] = useState(0)
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadAppState() {
      setLoading(true)
      setHydrationError(null)
      try {
        await ensureSeedData()
        const storedProducts = await db.products.toArray()
        const storedProjects = await db.projects.toArray()
        const nextProducts =
          storedProducts.length > 0 ? storedProducts : defaultProducts
        const nextProjects = (
          storedProjects.length > 0 ? storedProjects : [defaultProject]
        ).map((item) => normalizeProjectSelection(item, nextProducts))
        const initialProject =
          [...nextProjects].sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime(),
          )[0] ?? cloneProject(defaultProject)

        if (!mounted) {
          return
        }

        setProducts(nextProducts)
        setProjects(nextProjects)
        setActiveProjectId(initialProject.id)
        setProject(initialProject)
        setHydrated(true)
      } catch (error) {
        if (!mounted) {
          return
        }
        console.error('[bolt-review] 啟動載入失敗', error)
        const message =
          error instanceof Error ? error.message : String(error ?? '未知錯誤')
        setHydrationError(message)
        // fallback：以 defaults 讓使用者至少能操作，但不 setHydrated 以避免覆寫 DB
        setProducts(defaultProducts)
        setProjects([cloneProject(defaultProject)])
        setActiveProjectId(defaultProject.id)
        setProject(cloneProject(defaultProject))
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadAppState()

    return () => {
      mounted = false
    }
  }, [
    hydrationRetryCount,
    setProducts,
    setProjects,
    setActiveProjectId,
    setProject,
    cloneProject,
    normalizeProjectSelection,
  ])

  const retryHydration = useCallback(() => {
    setHydrationRetryCount((count) => count + 1)
  }, [])

  const resetLocalDatabaseAndReload = useCallback(async () => {
    if (isResetting) {
      return
    }
    const confirmed = window.confirm(
      '將清除本機所有案例、產品與文件附件並重建預設資料。此操作不可復原，是否繼續？',
    )
    if (!confirmed) {
      return
    }
    setIsResetting(true)
    try {
      await resetLocalDatabase()
      setHydrationRetryCount((count) => count + 1)
    } catch (error) {
      console.error('[bolt-review] 清空本機資料失敗', error)
      const message =
        error instanceof Error ? error.message : String(error ?? '未知錯誤')
      setHydrationError(`清空本機資料失敗：${message}`)
    } finally {
      setIsResetting(false)
    }
  }, [isResetting])

  return {
    hydrated,
    loading,
    hydrationError,
    isResetting,
    retryHydration,
    resetLocalDatabaseAndReload,
  }
}
