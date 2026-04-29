import { useEffect, useRef, useState } from 'react'

interface PwaInstallPromptEvent {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const SW_UPDATE_EVENT = 'bolt-review-tool:sw-update-available'

/**
 * PWA 可安裝事件 hook：攔截 beforeinstallprompt + appinstalled，
 * 提供 ref + flag 給 LandingHubGrid 的「安裝為桌面 App」按鈕使用。
 */
export function usePwaInstallPrompt() {
  const installPromptRef = useRef<PwaInstallPromptEvent | null>(null)
  const [canInstallPwa, setCanInstallPwa] = useState(false)

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      // BeforeInstallPromptEvent 不在標準 lib.dom，cast 為 unknown 後當作物件用
      installPromptRef.current = event as unknown as PwaInstallPromptEvent
      setCanInstallPwa(true)
    }
    const onInstalled = () => {
      installPromptRef.current = null
      setCanInstallPwa(false)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return {
    installPromptRef,
    canInstallPwa,
    setCanInstallPwa,
  }
}

/**
 * Service Worker 升級提示 hook：監聽由 main.tsx dispatch 的 CustomEvent，
 * 顯示「工具有新版本可用」橫幅。
 */
export function useServiceWorkerUpdate() {
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false)

  useEffect(() => {
    const handler = () => setSwUpdateAvailable(true)
    window.addEventListener(SW_UPDATE_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(SW_UPDATE_EVENT, handler as EventListener)
    }
  }, [])

  return {
    swUpdateAvailable,
    setSwUpdateAvailable,
  }
}

/**
 * 把 active tab 寫入 localStorage 的 hook：在 hydration 完成後，每次 tab 變動都同步。
 * SSR / 隱私模式失敗時靜默忽略，不影響主流程。
 */
export function useActiveTabPersistence(deps: {
  activeTab: string
  hydrated: boolean
  storageKey?: string
}) {
  const {
    activeTab,
    hydrated,
    storageKey = 'bolt-review-tool:lastActiveTab',
  } = deps

  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) {
      return
    }
    try {
      window.localStorage.setItem(storageKey, activeTab)
    } catch {
      // 隱私模式 / quota 等情境忽略
    }
  }, [activeTab, hydrated, storageKey])
}
