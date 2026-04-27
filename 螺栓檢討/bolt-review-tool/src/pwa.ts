// __APP_BASE_PATH__ 由 vite.config 的 define 注入；單一來源避免多處硬寫
declare const __APP_BASE_PATH__: string

export function registerServiceWorker() {
  if (!import.meta.env.PROD) {
    return
  }

  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    const base = __APP_BASE_PATH__
    void navigator.serviceWorker.register(`${base}service-worker.js`, {
      scope: base,
    })
  })
}

