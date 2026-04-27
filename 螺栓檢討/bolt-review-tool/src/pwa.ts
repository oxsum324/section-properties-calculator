// __APP_BASE_PATH__ 由 vite.config 的 define 注入；單一來源避免多處硬寫
declare const __APP_BASE_PATH__: string

/**
 * 偵測新版 SW 安裝完成後通知 caller（通常用於顯示 toast / banner）。
 * 預設行為：第一次註冊時不算「更新」；只有當有舊 controller 又安裝了新 worker 才算。
 */
export function registerServiceWorker(options?: {
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void
}) {
  if (!import.meta.env.PROD) {
    return
  }

  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    const base = __APP_BASE_PATH__
    void navigator.serviceWorker
      .register(`${base}service-worker.js`, { scope: base })
      .then((registration) => {
        // 新 SW 安裝中 → 安裝完成 → 仍有舊 controller 表示是版本更新
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) {
            return
          }
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              options?.onUpdateAvailable?.(registration)
            }
          })
        })
      })
      .catch(() => {
        /* 註冊失敗（離線 / CSP）忽略 */
      })
  })
}

